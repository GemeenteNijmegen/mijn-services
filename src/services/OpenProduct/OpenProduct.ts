import { Duration, Token } from 'aws-cdk-lib';
import { ISecurityGroup, Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { AwsLogDriver, ContainerImage, Protocol, Secret } from 'aws-cdk-lib/aws-ecs';
import { IRole } from 'aws-cdk-lib/aws-iam';
import { Key } from 'aws-cdk-lib/aws-kms';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { IHostedZone } from 'aws-cdk-lib/aws-route53';
import { ISecret, Secret as SecretParameter } from 'aws-cdk-lib/aws-secretsmanager';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { OpenProductServicesConfiguration } from '../../ConfigurationInterfaces';
import { EcsServiceFactory, EcsServiceFactoryProps } from '../../constructs/EcsServiceFactory';
import { OpenConfigurationStore } from '../../constructs/OpenConfigurationStore';
import { CacheDatabase } from '../../constructs/Redis';
import { Statics } from '../../Statics';
import { Utils } from '../../Utils';
import { ServiceInfraUtils } from '../ServiceInfraUtils';

export interface OpenProductServiceProps {
  cache: CacheDatabase;
  cacheDatabaseIndex: number;
  cacheDatabaseIndexCelery: number;
  service: EcsServiceFactoryProps;
  path: string;
  hostedzone: IHostedZone;
  alternativeDomainNames?: string[];
  key: Key;
  openProductConfiguration: OpenProductServicesConfiguration;
  openConfigStore: OpenConfigurationStore;
}

export class OpenProductService extends Construct {

  private readonly logs: LogGroup;
  private readonly props: OpenProductServiceProps;
  private readonly serviceFactory: EcsServiceFactory;
  private readonly databaseCredentials: ISecret;
  private readonly openProductCredentials: ISecret;
  private readonly secretKey: ISecret;

  constructor(scope: Construct, id: string, props: OpenProductServiceProps) {
    super(scope, id);
    this.props = props;
    this.serviceFactory = new EcsServiceFactory(this, props.service);
    this.logs = this.logGroup();

    this.databaseCredentials = SecretParameter.fromSecretNameV2(this, 'database-credentials', Statics._ssmDatabaseCredentials);
    this.openProductCredentials = SecretParameter.fromSecretNameV2(this, 'open-product-credentials', Statics._ssmOpenProductCredentials);
    this.secretKey = new SecretParameter(this, 'secret-key', {
      description: 'Open product secret key',
      generateSecretString: {
        excludePunctuation: true,
      },
    });
    this.setupService();
    this.setupCeleryService();
  }

  private getEnvironmentConfiguration() {

    const cacheHost = this.props.cache.db.attrRedisEndpointAddress + ':' + this.props.cache.db.attrRedisEndpointPort + '/';

    const trustedDomains = this.props.alternativeDomainNames?.map(a => a) ?? [];
    trustedDomains.push(this.props.hostedzone.zoneName);

    return {
      DJANGO_SETTINGS_MODULE: 'openproduct.conf.docker',
      DB_NAME: Statics.databaseOpenProduct,
      DB_HOST: StringParameter.valueForStringParameter(this, Statics._ssmDatabaseHostname),
      DB_PORT: StringParameter.valueForStringParameter(this, Statics._ssmDatabasePort),
      ALLOWED_HOSTS: '*',
      CACHE_DEFAULT: cacheHost + this.props.cacheDatabaseIndex,
      CACHE_AXES: cacheHost + this.props.cacheDatabaseIndex,
      SUBPATH: '/' + this.props.path,
      IS_HTTPS: 'True',
      UWSGI_PORT: this.props.service.port.toString(),

      LOG_LEVEL: this.props.openProductConfiguration.logLevel,
      LOG_REQUESTS: Utils.toPythonBooleanString(this.props.openProductConfiguration.debug, false),
      LOG_OUTGOING_REQUESTS_DB_SAVE: Utils.toPythonBooleanString(this.props.openProductConfiguration.debug, false),
      LOG_QUERIES: 'False',
      DEBUG: Utils.toPythonBooleanString(this.props.openProductConfiguration.debug, false),
      SESSION_COOKIE_AGE: Statics.sessionTimeoutDefaultSeconds.toString(),

      // Celery
      CELERY_BROKER_URL: 'redis://' + cacheHost + this.props.cacheDatabaseIndexCelery,
      CELERY_RESULT_BACKEND: 'redis://' + cacheHost + this.props.cacheDatabaseIndexCelery,
      CELERY_LOGLEVEL: this.props.openProductConfiguration.logLevel,
      CELERY_WORKER_CONCURRENCY: '4',

      // Conectivity
      CSRF_TRUSTED_ORIGINS: trustedDomains.map(domain => `https://${domain}`).join(','),

      // Open notificaties specific stuff
      //   SENDFILE_BACKEND: 'django_sendfile.backends.simple', // Django backend to download files
      //   OPENPRODUCT_DOMAIN: trustedDomains[0],
      //   OPENPRODUCT_ORGANIZATION: Statics.organization,
      //   NOTIF_API_ROOT: `https://${trustedDomains[0]}/open-notificaties/api/v1/`, // TODO remove hardcoded path
      //   OPENZAAK_NOTIF_CONFIG_ENABLE: 'True', // Enable the configuration setup for connecting to open-notificaties

      // Somehow this is required aswell...
      //   DEMO_CONFIG_ENABLE: 'False',
      //   DEMO_CLIENT_ID: 'demo-client',
      //   DEMO_SECRET: 'demo-secret',
    };
  }

  private getSecretConfiguration() {
    const secrets = {
      DB_PASSWORD: Secret.fromSecretsManager(this.databaseCredentials, 'password'),
      DB_USER: Secret.fromSecretsManager(this.databaseCredentials, 'username'),

      // Django requires a secret key to be defined (auto generated on deployment for this service)
      SECRET_KEY: Secret.fromSecretsManager(this.secretKey),

      // Generic super user creation works with running the createsuperuser command
      DJANGO_SUPERUSER_USERNAME: Secret.fromSecretsManager(this.openProductCredentials, 'username'),
      DJANGO_SUPERUSER_PASSWORD: Secret.fromSecretsManager(this.openProductCredentials, 'password'),
      DJANGO_SUPERUSER_EMAIL: Secret.fromSecretsManager(this.openProductCredentials, 'email'),
      // OPENPRODUCT_SUPERUSER_USERNAME: Secret.fromSecretsManager(this.openProductCredentials, 'username'),
      // OPENPRODUCT_SUPERUSER_EMAIL: Secret.fromSecretsManager(this.openProductCredentials, 'email'),

    };
    return secrets;
  }


  /**
   * Setup the main service (e.g. open-product container)
   * @returns
   */
  private setupService() {
    const VOLUME_NAME = 'tmp';
    const task = this.serviceFactory.createTaskDefinition('main', {
      volumes: [{ name: VOLUME_NAME }],
      cpu: this.props.openProductConfiguration.taskSize?.cpu ?? '256',
      memoryMiB: this.props.openProductConfiguration.taskSize?.memory ?? '512',
    });

    // Main service container (3th to run)
    const container = task.addContainer('main', {
      image: ContainerImage.fromRegistry(this.props.openProductConfiguration.image),
      healthCheck: {
        command: ['CMD-SHELL', ServiceInfraUtils.frontendHealthCheck(this.props.service.port)],
        interval: Duration.seconds(10),
        startPeriod: Duration.seconds(30),
      },
      portMappings: [
        {
          containerPort: this.props.service.port,
          hostPort: this.props.service.port,
          protocol: Protocol.TCP,
        },
      ],
      readonlyRootFilesystem: false, // Must be enable as SQLite generates files on for now unknown locations...
      secrets: this.getSecretConfiguration(),
      environment: this.getEnvironmentConfiguration(),
      logging: new AwsLogDriver({
        streamPrefix: 'logs',
        logGroup: this.logs,
      }),
    });
    this.serviceFactory.attachEphemeralStorage(container, VOLUME_NAME, '/tmp', '/app/setup_configuration');

    // Download configuration (2nd to run)
    const configLocation = `s3://${this.props.openConfigStore.bucket.bucketName}/open-product`;
    const configTarget = '/app/setup_configuration';
    const downloadConfiguration = this.serviceFactory.downloadConfiguration(task, this.logs, container, configLocation, configTarget);
    this.serviceFactory.attachEphemeralStorage(downloadConfiguration, VOLUME_NAME, '/app/setup_configuration');

    // File system prermissions for ephemeral storage (1st to run)
    this.serviceFactory.setupWritableVolume(VOLUME_NAME, task, this.logs, downloadConfiguration, '/tmp', '/app/setup_configuration');



    const service = this.serviceFactory.createService({
      id: 'main',
      task: task,
      path: this.props.path,
      options: {
        desiredCount: 1,
      },
      volumeMounts: {
        fileSystemRoot: '/openproduct',
        volumes: {
          'media': 'app/media',
          'private-media': 'app/private-media',
        },
      },
    });

    this.props.openConfigStore.grantReadConfig(service.taskDefinition.taskRole!, 'open-product');
    this.setupConnectivity('main', service.connections.securityGroups);
    this.allowAccessToSecrets(service.taskDefinition.executionRole!);
    return service;
  }

  private setupCeleryService() {
    const VOLUME_NAME = 'temp';
    const task = this.serviceFactory.createTaskDefinition('celery', {
      volumes: [{ name: VOLUME_NAME }],
      cpu: this.props.openProductConfiguration.celeryTaskSize?.cpu ?? '256',
      memoryMiB: this.props.openProductConfiguration.celeryTaskSize?.memory ?? '512',

    });

    const container = task.addContainer('celery', {
      image: ContainerImage.fromRegistry(this.props.openProductConfiguration.image),
      healthCheck: {
        command: ['CMD-SHELL', 'celery inspect ping >> /proc/1/fd/1 2>&1'],
        interval: Duration.seconds(10),
        startPeriod: Duration.seconds(60),
      },
      readonlyRootFilesystem: true,
      secrets: this.getSecretConfiguration(),
      environment: this.getEnvironmentConfiguration(),
      logging: new AwsLogDriver({
        streamPrefix: 'logs',
        logGroup: this.logs,
      }),
      command: ['/celery_worker.sh'],
    });
    this.serviceFactory.attachEphemeralStorage(container, VOLUME_NAME, '/tmp');
    this.serviceFactory.attachEphemeralStorage(container, VOLUME_NAME, '/app/tmp');

    this.serviceFactory.setupWritableVolume(VOLUME_NAME, task, this.logs, container, '/tmp', '/app/tmp');

    const service = this.serviceFactory.createService({
      task,
      path: undefined, // Not exposed service
      id: 'celery',
      options: {
        desiredCount: 1,
      },
      volumeMounts: {
        fileSystemRoot: '/openproduct',
        volumes: {
          'media': 'app/media',
          'private-media': 'app/private-media',
        },
      },
    });
    this.setupConnectivity('celery', service.connections.securityGroups);
    this.allowAccessToSecrets(service.taskDefinition.executionRole!);
  }
  private setupConnectivity(id: string, serviceSecurityGroups: ISecurityGroup[]) {

    const dbSecurityGroupId = StringParameter.valueForStringParameter(this, Statics._ssmDatabaseSecurityGroup);
    const dbSecurityGroup = SecurityGroup.fromSecurityGroupId(this, `db-security-group-${id}`, dbSecurityGroupId);
    const dbPort = StringParameter.valueForStringParameter(this, Statics._ssmDatabasePort);
    serviceSecurityGroups.forEach(serviceSecurityGroup => {
      dbSecurityGroup.connections.allowFrom(serviceSecurityGroup, Port.tcp(Token.asNumber(dbPort)));
    });

    const cachePort = this.props.cache.db.attrRedisEndpointPort;
    serviceSecurityGroups.forEach(serviceSecurityGroup => {
      dbSecurityGroup.connections.allowFrom(serviceSecurityGroup, Port.tcp(Token.asNumber(dbPort)));
      this.props.cache.db.vpcSecurityGroupIds?.forEach((cacheSecurityGroupId, index) => {
        const cacheSecurityGroup = SecurityGroup.fromSecurityGroupId(this, `cache-security-group-${id}-${index}`, cacheSecurityGroupId);
        cacheSecurityGroup.connections.allowFrom(serviceSecurityGroup, Port.tcp(Token.asNumber(cachePort)));
      });
    });
  }
  private logGroup() {
    return new LogGroup(this, 'logs', {
      retention: RetentionDays.ONE_MONTH,
      encryptionKey: this.props.key,
    });
  }
  private allowAccessToSecrets(role: IRole) {
    this.databaseCredentials.grantRead(role);
    this.openProductCredentials.grantRead(role);
    this.secretKey.grantRead(role);
  }
}
