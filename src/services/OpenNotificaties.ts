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
import { DnsRecordType } from 'aws-cdk-lib/aws-servicediscovery';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { OpenNotificatiesConfiguration } from '../Configuration';
import { EcsServiceFactory, EcsServiceFactoryProps } from '../constructs/EcsServiceFactory';
import { CacheDatabase } from '../constructs/Redis';
import { Statics } from '../Statics';
import { Utils } from '../Utils';

export interface OpenNotificatiesServiceProps {
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
  readonly openNotificationsConfiguration: OpenNotificatiesConfiguration;
  readonly key: Key;
}

export class OpenNotificatiesService extends Construct {

  private static RABBIT_MQ_NAME = 'queue';
  private static RABBIT_MQ_PORT = 5672;

  private readonly logs: LogGroup;
  private readonly props: OpenNotificatiesServiceProps;
  private readonly serviceFactory: EcsServiceFactory;
  private readonly databaseCredentials: ISecret;
  private readonly openNotificatiesCredentials: ISecret;
  private readonly clientCredentialsNotificationsZaak: ISecret;
  private readonly clientCredentialsZaakNotifications: ISecret;
  private readonly secretKey: ISecret;

  constructor(scope: Construct, id: string, props: OpenNotificatiesServiceProps) {
    super(scope, id);
    this.props = props;
    this.serviceFactory = new EcsServiceFactory(this, props.service);
    this.logs = this.logGroup();

    this.databaseCredentials = SecretParameter.fromSecretNameV2(this, 'database-credentials', Statics._ssmDatabaseCredentials);
    this.openNotificatiesCredentials = SecretParameter.fromSecretNameV2(this, 'open-klant-credentials', Statics._ssmOpenNotificatiesCredentials);
    this.clientCredentialsZaakNotifications = SecretParameter.fromSecretNameV2(this, 'client-credentials-zaak-notifications', Statics._ssmClientCredentialsZaakNotifications);
    this.clientCredentialsNotificationsZaak = SecretParameter.fromSecretNameV2(this, 'client-credentials-notifications-zaak', Statics._ssmClientCredentialsNotificationsZaak);
    this.secretKey = new SecretParameter(this, 'secret-key', {
      description: 'Open klant secret key',
      generateSecretString: {
        excludePunctuation: true,
      },
    });

    this.setupConfigurationService();

    const rabbitMqService = this.setupRabbitMqService();
    const mainService = this.setupService();
    const celeryService = this.setupCeleryService();
    this.setupCeleryBeatService();

    rabbitMqService.connections.allowFrom(mainService.connections, Port.tcp(OpenNotificatiesService.RABBIT_MQ_PORT));
    rabbitMqService.connections.allowFrom(celeryService.connections, Port.tcp(OpenNotificatiesService.RABBIT_MQ_PORT));
  }

  private getEnvironmentConfiguration() {

    const cacheHost = this.props.cache.db.attrRedisEndpointAddress + ':' + this.props.cache.db.attrRedisEndpointPort + '/';
    const trustedDomains = this.props.alternativeDomainNames?.map(a => a) ?? [];
    trustedDomains.push(this.props.hostedzone.zoneName);

    const rabbitMqHost = `${OpenNotificatiesService.RABBIT_MQ_NAME}.${this.props.service.namespace.namespaceName}`;
    const rabbitMqBrokerUrl = `amqp://guest:guest@${rabbitMqHost}:${OpenNotificatiesService.RABBIT_MQ_PORT}//`;

    return {
      DJANGO_SETTINGS_MODULE: 'nrc.conf.docker',
      DB_NAME: Statics.databaseOpenNotificaties,
      DB_HOST: StringParameter.valueForStringParameter(this, Statics._ssmDatabaseHostname),
      DB_PORT: StringParameter.valueForStringParameter(this, Statics._ssmDatabasePort),
      ALLOWED_HOSTS: '*',
      CACHE_DEFAULT: cacheHost + this.props.cacheDatabaseIndex,
      CACHE_AXES: cacheHost + this.props.cacheDatabaseIndex,
      SUBPATH: '/' + this.props.path,
      IS_HTTPS: 'yes',
      UWSGI_PORT: this.props.service.port.toString(),
      USE_X_FORWARDED_HOST: 'True',

      LOG_LEVEL: this.props.openNotificationsConfiguration.logLevel,
      LOG_REQUESTS: Utils.toPythonBooleanString(this.props.openNotificationsConfiguration.debug, false),
      LOG_OUTGOING_REQUESTS_DB_SAVE: Utils.toPythonBooleanString(this.props.openNotificationsConfiguration.debug, false),
      LOG_QUERIES: 'False',
      DEBUG: Utils.toPythonBooleanString(this.props.openNotificationsConfiguration.debug, false),
      SESSION_COOKIE_AGE: Statics.sessionTimeoutDefaultSeconds.toString(),

      // Celery
      CELERY_RESULT_BACKEND: 'redis://' + cacheHost + this.props.cacheDatabaseIndexCelery,
      CELERY_LOGLEVEL: this.props.openNotificationsConfiguration.logLevel,
      CELERY_WORKER_CONCURRENCY: '4',
      RABBITMQ_HOST: rabbitMqHost,
      CELERY_BROKER_URL: rabbitMqBrokerUrl,

      // Conectivity
      CORS_ALLOW_ALL_ORIGINS: 'True',
      CSRF_TRUSTED_ORIGINS: trustedDomains.map(domain => `https://${domain}`).join(','),

      // Open notificaties specific stuff
      OPENNOTIFICATIES_ORGANIZATION: Statics.organization,
      OPENNOTIFICATIES_DOMAIN: trustedDomains[0],
      AUTORISATIES_API_ROOT: `https://${trustedDomains[0]}/open-zaak/autorisaties/api/v1`, // TODO remove hardcoded path 'open-zaak'


      // Used by setup_configuration file and separate service
      OPEN_ZAAK_BASE_URL: `https://${trustedDomains[0]}/open-zaak`,

      // 11 Feb 2025 - This is replaced by the setup_configuration file and separate service
      // What configuration steps to run while setup_configuration is called
      // SITES_CONFIG_ENABLE: 'True',
      // AUTHORIZATION_CONFIG_ENABLE: 'True',
      // OPENZAAK_NOTIF_CONFIG_ENABLE: 'True',
      // NOTIFICATION_RETRY_CONFIG_ENABLE: 'False',


      LOG_NOTIFICATIONS_IN_DB: Utils.toPythonBooleanString(this.props.openNotificationsConfiguration.persitNotifications, false),


    };
  }

  private getSecretConfiguration() {
    const secrets = {
      DB_PASSWORD: Secret.fromSecretsManager(this.databaseCredentials, 'password'),
      DB_USER: Secret.fromSecretsManager(this.databaseCredentials, 'username'),

      // Django requires a secret key to be defined (auto generated on deployment for this service)
      SECRET_KEY: Secret.fromSecretsManager(this.secretKey),

      // Generic super user creation works with running the createsuperuser command
      DJANGO_SUPERUSER_USERNAME: Secret.fromSecretsManager(this.openNotificatiesCredentials, 'username'),
      DJANGO_SUPERUSER_PASSWORD: Secret.fromSecretsManager(this.openNotificatiesCredentials, 'password'),
      DJANGO_SUPERUSER_EMAIL: Secret.fromSecretsManager(this.openNotificatiesCredentials, 'email'),
      OPENNOTIFICATIES_SUPERUSER_USERNAME: Secret.fromSecretsManager(this.openNotificatiesCredentials, 'username'),
      OPENNOTIFICATIES_SUPERUSER_EMAIL: Secret.fromSecretsManager(this.openNotificatiesCredentials, 'email'),

      // Default connection between open-zaak and open-notifications
      NOTIF_OPENZAAK_CLIENT_ID: Secret.fromSecretsManager(this.clientCredentialsNotificationsZaak, 'username'),
      NOTIF_OPENZAAK_SECRET: Secret.fromSecretsManager(this.clientCredentialsNotificationsZaak, 'secret'),
      OPENZAAK_NOTIF_CLIENT_ID: Secret.fromSecretsManager(this.clientCredentialsZaakNotifications, 'username'),
      OPENZAAK_NOTIF_SECRET: Secret.fromSecretsManager(this.clientCredentialsZaakNotifications, 'secret'),


    };
    return secrets;
  }

  private setupRabbitMqService() {
    const task = this.serviceFactory.createTaskDefinition('rabbit-mq');
    task.addContainer('main', {
      image: ContainerImage.fromRegistry(this.props.openNotificationsConfiguration.rabbitMqImage),
      logging: new AwsLogDriver({
        streamPrefix: 'rabbit-mq',
        logGroup: this.logs,
      }),
      readonlyRootFilesystem: true,
      portMappings: [{
        containerPort: OpenNotificatiesService.RABBIT_MQ_PORT,
      }],
      secrets: {},
      environment: {}, // TODO figgure out if we need any settings?
      // healthCheck: { // TODO Running this health check before rabbitmq is fully started will prevent the container from starting
      //   command: ['rabbitmq-diagnostics', '-q', 'check_port_connectivity'],
      // },
    });
    const service = this.serviceFactory.createService({
      task,
      path: undefined, // Not exposed service
      id: OpenNotificatiesService.RABBIT_MQ_NAME,
      options: {
        desiredCount: 1,
      },
      customCloudMap: {
        cloudMapNamespace: this.props.service.namespace,
        containerPort: OpenNotificatiesService.RABBIT_MQ_PORT,
        name: OpenNotificatiesService.RABBIT_MQ_NAME,
        dnsRecordType: DnsRecordType.A, // Required for lookup
        dnsTtl: Duration.seconds(60),
      },
    });
    return service;
  }

  private setupConfigurationService() {
    const VOLUME_NAME = 'tmp';
    const task = this.serviceFactory.createTaskDefinition('setup-configuration', {
      volumes: [{ name: VOLUME_NAME }],
    });

    // Configuration container
    const initContainer = task.addContainer('init-config', {
      image: ContainerImage.fromAsset('./src/containers/open-notificaties/', {
        buildArgs: {
          OPEN_NOTIFICATIES_IMAGE: this.props.openNotificationsConfiguration.image,
        },
      }),
      command: undefined, // Command is defined in Dockerfile
      readonlyRootFilesystem: true,
      essential: true,
      logging: new AwsLogDriver({
        streamPrefix: 'setup-configuration',
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
      }),
      description: 'Rule to run setup configuration for open-notificaties (manually)',
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
      cpu: this.props.openNotificationsConfiguration.taskSize?.cpu ?? '256',
      memoryMiB: this.props.openNotificationsConfiguration.taskSize?.memory ?? '512',
    });

    // Main service container
    const container = task.addContainer('main', {
      image: ContainerImage.fromRegistry(this.props.openNotificationsConfiguration.image),
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

  private setupCeleryService() {
    const VOLUME_NAME = 'tempcelery';
    const WITABLE_DIRS = [
      '/tmp',
      '/app/tmp',
      '/app/log',
    ];
    const task = this.serviceFactory.createTaskDefinition('celery', {
      volumes: [{ name: VOLUME_NAME }],
      cpu: this.props.openNotificationsConfiguration.celeryTaskSize?.cpu ?? '256',
      memoryMiB: this.props.openNotificationsConfiguration.celeryTaskSize?.memory ?? '512',
    });
    const celeryContainer = task.addContainer('celery', {
      image: ContainerImage.fromRegistry(this.props.openNotificationsConfiguration.image),
      healthCheck: {
        command: ['CMD-SHELL', 'celery inspect ping >> /proc/1/fd/1 2>&1'],
        interval: Duration.seconds(10),
        startPeriod: Duration.seconds(60),
      },
      readonlyRootFilesystem: true,
      secrets: this.getSecretConfiguration(),
      environment: this.getEnvironmentConfiguration(),
      logging: new AwsLogDriver({
        streamPrefix: 'celery-service',
        logGroup: this.logs,
      }),
      command: ['/celery_worker.sh'],
    });
    this.serviceFactory.attachEphemeralStorage(celeryContainer, VOLUME_NAME, ...WITABLE_DIRS);
    this.serviceFactory.setupWritableVolume(VOLUME_NAME, task, this.logs, celeryContainer, ...WITABLE_DIRS);
    const service = this.serviceFactory.createService({
      task,
      path: undefined, // Not exposed service
      id: 'celery',
      options: {
        desiredCount: 1,
      },
    });
    this.setupConnectivity('celery', service.connections.securityGroups);
    this.allowAccessToSecrets(service.taskDefinition.executionRole!);
    return service;
  }

  private setupCeleryBeatService() {
    const VOLUME_NAME = 'celerybeat';
    const task = this.serviceFactory.createTaskDefinition('celery-beat', {
      volumes: [{ name: VOLUME_NAME }],
    });

    const beat = task.addContainer('beat', {
      image: ContainerImage.fromRegistry(this.props.openNotificationsConfiguration.image),
      healthCheck: {
        command: ['CMD-SHELL', 'celery', 'inspect', 'ping', '--app', 'nrc'],
        interval: Duration.seconds(10),
      },
      readonlyRootFilesystem: true,
      secrets: this.getSecretConfiguration(),
      environment: this.getEnvironmentConfiguration(),
      logging: new AwsLogDriver({
        streamPrefix: 'celery-beat-service',
        logGroup: this.logs,
      }),
      command: ['/celery_beat.sh'],
    });
    this.serviceFactory.attachEphemeralStorage(beat, VOLUME_NAME, '/app/celerybeat', '/tmp', '/app/log');

    this.serviceFactory.setupWritableVolume(VOLUME_NAME, task, this.logs, beat, '/app/celerybeat', '/tmp', '/app/log');

    const service = this.serviceFactory.createService({
      task,
      path: undefined, // Not exposed service
      id: 'celery-beat',
      options: {
        desiredCount: 1,
      },
    });
    this.setupConnectivity('celery-beat', service.connections.securityGroups);
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
    this.openNotificatiesCredentials.grantRead(role);
    this.secretKey.grantRead(role);
  }


}