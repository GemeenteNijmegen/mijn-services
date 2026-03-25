import { RemoteParameters } from '@gemeentenijmegen/cross-region-parameters';
import { Duration, Token } from 'aws-cdk-lib';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { ISecurityGroup, Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { AwsLogDriver, ContainerImage, Protocol, Secret } from 'aws-cdk-lib/aws-ecs';
import { IRole } from 'aws-cdk-lib/aws-iam';
import { Key } from 'aws-cdk-lib/aws-kms';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { IHostedZone } from 'aws-cdk-lib/aws-route53';
import { ISecret, Secret as SecretParameter } from 'aws-cdk-lib/aws-secretsmanager';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { VtbConfiguration } from '../ConfigurationInterfaces';
import { EcsServiceFactory, EcsServiceFactoryProps } from '../constructs/EcsServiceFactory';
import { CacheDatabase } from '../constructs/Redis';
import { SubdomainCloudfront } from '../constructs/SubdomainCloudfront';
import { Statics } from '../Statics';
import { Utils } from '../Utils';

export interface VtbServiceProps {
  readonly cache: CacheDatabase;
  readonly cacheDatabaseIndex: number;
  readonly cacheDatabaseIndexCelery: number;
  readonly service: EcsServiceFactoryProps;
  readonly hostedzone: IHostedZone;
  readonly alternativeDomainNames?: string[];
  readonly key: Key;
  readonly serviceConfiguration: VtbConfiguration;
}

export class VtbService extends Construct {

  private readonly logs: LogGroup;
  private readonly props: VtbServiceProps;
  private readonly serviceFactory: EcsServiceFactory;
  private readonly distribution: SubdomainCloudfront;
  private readonly databaseCredentials: ISecret;
  private readonly superuserCredentials: ISecret;
  private readonly secretKey: ISecret;

  constructor(scope: Construct, id: string, props: VtbServiceProps) {
    super(scope, id);
    this.props = props;
    this.serviceFactory = new EcsServiceFactory(this, props.service);
    this.logs = this.logGroup();

    this.distribution = new SubdomainCloudfront(this, 'subdomain-cloudfront', {
      certificate: this.certificate(),
      hostedZone: this.props.hostedzone,
      loadbalancer: this.props.service.loadbalancer.alb,
      subdomain: this.props.serviceConfiguration.subdomain,
    });

    this.databaseCredentials = SecretParameter.fromSecretNameV2(this, 'database-credentials', Statics._ssmDatabaseCredentials);
    this.superuserCredentials = new SecretParameter(this, 'superuser-credentials', {
      description: `VTB superuser credentials for instance ${id}`,
      secretName: Statics.vtbCredentialsSecretName(id),
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'admin', email: 'admin@example.com' }),
        generateStringKey: 'password',
        excludePunctuation: true,
      },
    });
    this.secretKey = new SecretParameter(this, 'secret-key', {
      description: `VTB secret key for instance ${id}`,
      generateSecretString: {
        excludePunctuation: true,
      },
    });

    // this.setupConfigurationService();
    this.setupService();
    // this.setupCeleryService(); // TODO enable when this is used by the image (currently its not)
  }

  private getEnvironmentConfiguration() {
    const cacheHost = this.props.cache.db.attrRedisEndpointAddress + ':' + this.props.cache.db.attrRedisEndpointPort + '/';
    const trustedDomains = this.props.alternativeDomainNames?.map(a => a) ?? [];
    trustedDomains.push(this.props.hostedzone.zoneName);

    return {
      DJANGO_SETTINGS_MODULE: 'openvtb.conf.docker',
      DB_NAME: this.props.serviceConfiguration.databaseName,
      DB_HOST: StringParameter.valueForStringParameter(this, Statics._ssmDatabaseHostname),
      DB_PORT: StringParameter.valueForStringParameter(this, Statics._ssmDatabasePort),
      ALLOWED_HOSTS: '*',
      CACHE_DEFAULT: cacheHost + this.props.cacheDatabaseIndex,
      CACHE_AXES: cacheHost + this.props.cacheDatabaseIndex,
      IS_HTTPS: 'True',
      USE_X_FORWARDED_HOST: 'True',

      LOG_LEVEL: this.props.serviceConfiguration.logLevel,
      LOG_REQUESTS: Utils.toPythonBooleanString(this.props.serviceConfiguration.debug, false),
      LOG_OUTGOING_REQUESTS_DB_SAVE: Utils.toPythonBooleanString(this.props.serviceConfiguration.debug, false),
      LOG_QUERIES: 'False',
      DEBUG: Utils.toPythonBooleanString(this.props.serviceConfiguration.debug, false),
      SESSION_COOKIE_AGE: Statics.sessionTimeoutDefaultSeconds.toString(),

      // Celery
      CELERY_BROKER_URL: 'redis://' + cacheHost + this.props.cacheDatabaseIndexCelery,
      CELERY_RESULT_BACKEND: 'redis://' + cacheHost + this.props.cacheDatabaseIndexCelery,
      CELERY_LOGLEVEL: this.props.serviceConfiguration.logLevel,

      CSRF_TRUSTED_ORIGINS: trustedDomains.map(domain => `https://${domain}`).join(','),

      OTEL_SDK_DISABLED: 'True',

    };
  }

  private getSecretConfiguration() {
    return {
      DB_PASSWORD: Secret.fromSecretsManager(this.databaseCredentials, 'password'),
      DB_USER: Secret.fromSecretsManager(this.databaseCredentials, 'username'),
      SECRET_KEY: Secret.fromSecretsManager(this.secretKey),
      DJANGO_SUPERUSER_USERNAME: Secret.fromSecretsManager(this.superuserCredentials, 'username'),
      DJANGO_SUPERUSER_PASSWORD: Secret.fromSecretsManager(this.superuserCredentials, 'password'),
      DJANGO_SUPERUSER_EMAIL: Secret.fromSecretsManager(this.superuserCredentials, 'email'),
    };
  }

  private setupService() {
    const VOLUME_NAME = 'tmp';
    const task = this.serviceFactory.createTaskDefinition('main', {
      volumes: [{ name: VOLUME_NAME }],
      cpu: this.props.serviceConfiguration.taskSize?.cpu ?? '256',
      memoryMiB: this.props.serviceConfiguration.taskSize?.memory ?? '512',
    });

    const container = task.addContainer('main', {
      image: ContainerImage.fromRegistry(this.props.serviceConfiguration.image),
      healthCheck: {
        // command: ['CMD-SHELL', `python -c "import requests; x = requests.get('http://localhost:${this.props.service.port}/'); exit(x.status_code != 200)" >> /proc/1/fd/1`],
        command: ['CMD-SHELL', `exit 0`],
        interval: Duration.seconds(10),
        startPeriod: Duration.seconds(30),
      },
      portMappings: [{ containerPort: this.props.service.port, hostPort: this.props.service.port, protocol: Protocol.TCP }],
      readonlyRootFilesystem: true,
      secrets: this.getSecretConfiguration(),
      environment: this.getEnvironmentConfiguration(),
      logging: new AwsLogDriver({ streamPrefix: 'main', logGroup: this.logs }),
    });
    this.serviceFactory.attachEphemeralStorage(container, VOLUME_NAME, '/tmp', '/app/log');
    this.serviceFactory.setupWritableVolume(VOLUME_NAME, task, this.logs, container, '/tmp', '/app/log');

    this.serviceFactory.allowExecutingCommands(task);

    const service = this.serviceFactory.createService({
      id: 'main',
      task,
      path: undefined,
      domain: this.props.serviceConfiguration.subdomain + '.' + this.props.hostedzone.zoneName,
      options: {
        desiredCount: 1,
        enableExecuteCommand: true,
      },
    });
    this.setupConnectivity('main', service.connections.securityGroups);
    this.allowAccessToSecrets(service.taskDefinition.executionRole!);
    return service;
  }

  private setupCeleryService() {
    const VOLUME_NAME = 'temp';
    const WRITABLE_DIRS = ['/tmp', '/app/tmp', '/app/log'];
    const task = this.serviceFactory.createTaskDefinition('celery', {
      volumes: [{ name: VOLUME_NAME }],
      cpu: this.props.serviceConfiguration.celeryTaskSize?.cpu ?? '256',
      memoryMiB: this.props.serviceConfiguration.celeryTaskSize?.memory ?? '512',
    });

    const container = task.addContainer('celery', {
      image: ContainerImage.fromRegistry(this.props.serviceConfiguration.image),
      healthCheck: {
        command: ['CMD-SHELL', 'celery inspect ping >> /proc/1/fd/1 2>&1'],
        interval: Duration.seconds(10),
        startPeriod: Duration.seconds(60),
      },
      readonlyRootFilesystem: true,
      secrets: this.getSecretConfiguration(),
      environment: this.getEnvironmentConfiguration(),
      logging: new AwsLogDriver({ streamPrefix: 'celery', logGroup: this.logs }),
      command: ['/celery_worker.sh'],
    });
    this.serviceFactory.attachEphemeralStorage(container, VOLUME_NAME, ...WRITABLE_DIRS);
    this.serviceFactory.setupWritableVolume(VOLUME_NAME, task, this.logs, container, ...WRITABLE_DIRS);

    const service = this.serviceFactory.createService({
      task,
      path: undefined,
      id: 'celery',
      options: { desiredCount: 0 },
    });
    this.setupConnectivity('celery', service.connections.securityGroups);
    this.allowAccessToSecrets(service.taskDefinition.executionRole!);
  }

  private logGroup() {
    return new LogGroup(this, 'logs', {
      retention: RetentionDays.ONE_MONTH,
      encryptionKey: this.props.key,
    });
  }

  private setupConnectivity(id: string, serviceSecurityGroups: ISecurityGroup[]) {
    const dbSecurityGroupId = StringParameter.valueForStringParameter(this, Statics._ssmDatabaseSecurityGroup);
    const dbSecurityGroup = SecurityGroup.fromSecurityGroupId(this, `db-security-group-${id}`, dbSecurityGroupId);
    const dbPort = StringParameter.valueForStringParameter(this, Statics._ssmDatabasePort);

    const cachePort = this.props.cache.db.attrRedisEndpointPort;
    serviceSecurityGroups.forEach(serviceSecurityGroup => {
      dbSecurityGroup.connections.allowFrom(serviceSecurityGroup, Port.tcp(Token.asNumber(dbPort)));
      this.props.cache.db.vpcSecurityGroupIds?.forEach((cacheSecurityGroupId, index) => {
        const cacheSecurityGroup = SecurityGroup.fromSecurityGroupId(this, `cache-security-group-${id}-${index}`, cacheSecurityGroupId);
        cacheSecurityGroup.connections.allowFrom(serviceSecurityGroup, Port.tcp(Token.asNumber(cachePort)));
      });
    });
  }

  private allowAccessToSecrets(role: IRole) {
    this.databaseCredentials.grantRead(role);
    this.superuserCredentials.grantRead(role);
    this.secretKey.grantRead(role);
  }

  private certificate() {
    const parameters = new RemoteParameters(this, 'params', {
      path: `${Statics.ssmWildcardCertificatePath}/`,
      region: 'us-east-1',
      timeout: Duration.seconds(10),
    });
    const certificateArn = parameters.get(Statics.ssmWildcardCertificateArn);
    return Certificate.fromCertificateArn(this, 'cert', certificateArn);
  }
}
