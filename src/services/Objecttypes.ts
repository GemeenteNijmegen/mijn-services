import { Duration, Token } from 'aws-cdk-lib';
import { ISecurityGroup, Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { AwsLogDriver, ContainerImage, Protocol, Secret } from 'aws-cdk-lib/aws-ecs';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { EcsTask } from 'aws-cdk-lib/aws-events-targets';
import { IRole } from 'aws-cdk-lib/aws-iam';
import { Key } from 'aws-cdk-lib/aws-kms';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { IHostedZone } from 'aws-cdk-lib/aws-route53';
import { ISecret, Secret as SecretParameter } from 'aws-cdk-lib/aws-secretsmanager';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { ObjecttypesConfiguration } from '../Configuration';
import { EcsServiceFactory, EcsServiceFactoryProps } from '../constructs/EcsServiceFactory';
import { CacheDatabase } from '../constructs/Redis';
import { Statics } from '../Statics';
import { Utils } from '../Utils';

export interface ObjecttypesServiceProps {
  readonly cache: CacheDatabase;
  readonly cacheDatabaseIndex: number;
  readonly cacheDatabaseIndexCelery: number;
  readonly service: EcsServiceFactoryProps;
  readonly path: string;
  readonly hostedzone: IHostedZone;
  readonly alternativeDomainNames?: string[];
  /**
   * The configuration for the open configuration installation
   */
  readonly serviceConfiguration: ObjecttypesConfiguration;
  readonly key: Key;
}

export class ObjecttypesService extends Construct {

  private readonly logs: LogGroup;
  private readonly props: ObjecttypesServiceProps;
  private readonly serviceFactory: EcsServiceFactory;
  private readonly databaseCredentials: ISecret;
  private readonly superuserCredetials: ISecret;
  private readonly secretKey: ISecret;

  constructor(scope: Construct, id: string, props: ObjecttypesServiceProps) {
    super(scope, id);
    this.props = props;
    this.serviceFactory = new EcsServiceFactory(this, props.service);
    this.logs = this.logGroup();

    this.databaseCredentials = SecretParameter.fromSecretNameV2(this, 'database-credentials', Statics._ssmDatabaseCredentials);
    this.superuserCredetials = SecretParameter.fromSecretNameV2(this, 'superuser-credentials', Statics._ssmObjecttypesCredentials);
    this.secretKey = new SecretParameter(this, 'secret-key', {
      description: 'Objecttypes secret key',
      generateSecretString: {
        excludePunctuation: true,
      },
    });

    this.setupConfigurationService();
    this.setupService();
  }

  private getEnvironmentConfiguration() {

    const cacheHost = this.props.cache.db.attrRedisEndpointAddress + ':' + this.props.cache.db.attrRedisEndpointPort + '/';
    const trustedDomains = this.props.alternativeDomainNames?.map(a => a) ?? [];
    trustedDomains.push(this.props.hostedzone.zoneName);

    return {
      DJANGO_SETTINGS_MODULE: 'objecttypes.conf.docker',
      DB_NAME: Statics.databaseObjecttypes,
      DB_HOST: StringParameter.valueForStringParameter(this, Statics._ssmDatabaseHostname),
      DB_PORT: StringParameter.valueForStringParameter(this, Statics._ssmDatabasePort),
      ALLOWED_HOSTS: '*',
      CACHE_DEFAULT: cacheHost + this.props.cacheDatabaseIndex,
      CACHE_AXES: cacheHost + this.props.cacheDatabaseIndex,
      SUBPATH: '/' + this.props.path,
      IS_HTTPS: 'yes',
      UWSGI_PORT: this.props.service.port.toString(),
      USE_X_FORWARDED_HOST: 'True',

      LOG_LEVEL: this.props.serviceConfiguration.logLevel,
      LOG_REQUESTS: Utils.toPythonBooleanString(this.props.serviceConfiguration.debug, false),
      LOG_OUTGOING_REQUESTS_DB_SAVE: Utils.toPythonBooleanString(this.props.serviceConfiguration.debug, false),
      LOG_QUERIES: 'False',
      DEBUG: Utils.toPythonBooleanString(this.props.serviceConfiguration.debug, false),

      // Celery
      CELERY_RESULT_BACKEND: 'redis://' + cacheHost + this.props.cacheDatabaseIndexCelery,
      CELERY_LOGLEVEL: this.props.serviceConfiguration.logLevel,
      CELERY_WORKER_CONCURRENCY: '4',

      // Conectivity
      CORS_ALLOW_ALL_ORIGINS: 'True',
      CSRF_TRUSTED_ORIGINS: trustedDomains.map(domain => `https://${domain}`).join(','),

    };
  }

  private getSecretConfiguration() {
    const secrets = {
      DB_PASSWORD: Secret.fromSecretsManager(this.databaseCredentials, 'password'),
      DB_USER: Secret.fromSecretsManager(this.databaseCredentials, 'username'),

      // Django requires a secret key to be defined (auto generated on deployment for this service)
      SECRET_KEY: Secret.fromSecretsManager(this.secretKey),

      // Generic super user creation works with running the createsuperuser command
      DJANGO_SUPERUSER_USERNAME: Secret.fromSecretsManager(this.superuserCredetials, 'username'),
      DJANGO_SUPERUSER_PASSWORD: Secret.fromSecretsManager(this.superuserCredetials, 'password'),
      DJANGO_SUPERUSER_EMAIL: Secret.fromSecretsManager(this.superuserCredetials, 'email'),

    };
    return secrets;
  }

  private setupConfigurationService() {
    const VOLUME_NAME = 'tmp';
    const task = this.serviceFactory.createTaskDefinition('setup', {
      volumes: [{ name: VOLUME_NAME }],
    });

    // Configuration container
    const initContainer = task.addContainer('setup', {
      image: ContainerImage.fromRegistry(this.props.serviceConfiguration.image),
      command: ['python', 'src/manage.py', 'createsuperuser', '--no-input', '--skip-checks'], // See django docs
      readonlyRootFilesystem: true,
      essential: true,
      logging: new AwsLogDriver({
        streamPrefix: 'setup',
        logGroup: this.logs,
      }),
      secrets: this.getSecretConfiguration(),
      environment: this.getEnvironmentConfiguration(),
    });
    this.serviceFactory.attachEphemeralStorage(initContainer, VOLUME_NAME, '/tmp', '/app/log', '/app/setup_configuration');

    // Filesystem write access - initialization container
    this.serviceFactory.setupWritableVolume(VOLUME_NAME, task, this.logs, initContainer, '/tmp', '/app/log', '/app/setup_configuration');

    // Scheduel a task in the past (so we can run it manually)
    const rule = new Rule(this, 'scheudle-setup', {
      schedule: Schedule.cron({
        year: '2020',
      })
    });
    const ecsTask = new EcsTask({
      cluster: this.props.service.cluster,
      taskDefinition: task,
    });
    rule.addTarget(ecsTask);

    // Setup connectivity
    this.setupConnectivity('setup', ecsTask.securityGroups ?? []);
    this.allowAccessToSecrets(task.executionRole!);
  }

  private setupService() {
    const VOLUME_NAME = 'tmp';
    const task = this.serviceFactory.createTaskDefinition('main', {
      volumes: [{ name: VOLUME_NAME }],
    });

    // Main service container
    const container = task.addContainer('main', {
      image: ContainerImage.fromRegistry(this.props.serviceConfiguration.image),
      healthCheck: {
        command: ['CMD-SHELL', `python -c "import requests; x = requests.get('http://localhost:${this.props.service.port}/'); exit(x.status_code != 200)" >> /proc/1/fd/1`],
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
      readonlyRootFilesystem: true,
      secrets: this.getSecretConfiguration(),
      environment: this.getEnvironmentConfiguration(),
      logging: new AwsLogDriver({
        streamPrefix: 'setup-service',
        logGroup: this.logs,
      }),

    });
    this.serviceFactory.attachEphemeralStorage(container, VOLUME_NAME, '/tmp', '/app/log');

    // 1st Filesystem write access - initialization container
    this.serviceFactory.setupWritableVolume(VOLUME_NAME, task, this.logs, container, '/tmp', '/app/log');

    const service = this.serviceFactory.createService({
      id: 'main',
      task: task,
      path: this.props.path,
      options: {
        desiredCount: 1,
      },
    });
    this.setupConnectivity('main', service.connections.securityGroups);
    this.allowAccessToSecrets(service.taskDefinition.executionRole!);
    return service;
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

  private allowAccessToSecrets(role: IRole) {
    this.databaseCredentials.grantRead(role);
    this.superuserCredetials.grantRead(role);
    this.secretKey.grantRead(role);
  }


}