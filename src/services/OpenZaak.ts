import { Duration, Token } from 'aws-cdk-lib';
import { ISecurityGroup, Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { AwsLogDriver, ContainerImage, FargateService, Protocol, Secret } from 'aws-cdk-lib/aws-ecs';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { EcsTask } from 'aws-cdk-lib/aws-events-targets';
import { IRole } from 'aws-cdk-lib/aws-iam';
import { Key } from 'aws-cdk-lib/aws-kms';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { IHostedZone } from 'aws-cdk-lib/aws-route53';
import { ISecret, Secret as SecretParameter } from 'aws-cdk-lib/aws-secretsmanager';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { OpenZaakConfiguration } from '../ConfigurationInterfaces';
import { EcsServiceFactory, EcsServiceFactoryProps } from '../constructs/EcsServiceFactory';
import { CacheDatabase } from '../constructs/Redis';
import { Statics } from '../Statics';
import { Utils } from '../Utils';
import { ServiceInfraUtils } from './ServiceInfraUtils';

export interface OpenZaakServiceProps {
  cache: CacheDatabase;
  cacheDatabaseIndex: number;
  cacheDatabaseIndexCelery: number;
  service: EcsServiceFactoryProps;
  path: string;
  hostedzone: IHostedZone;
  alternativeDomainNames?: string[];
  key: Key;
  openZaakConfiguration: OpenZaakConfiguration;
}

export class OpenZaakService extends Construct {

  private readonly logs: LogGroup;
  private readonly props: OpenZaakServiceProps;
  private readonly serviceFactory: EcsServiceFactory;
  private readonly databaseCredentials: ISecret;
  private readonly openZaakCredentials: ISecret;
  private readonly secretKey: ISecret;
  private readonly clientCredentialsNotificationsZaak: ISecret;
  private readonly clientCredentialsZaakNotifications: ISecret;

  readonly service: FargateService;

  constructor(scope: Construct, id: string, props: OpenZaakServiceProps) {
    super(scope, id);
    this.props = props;
    this.serviceFactory = new EcsServiceFactory(this, props.service);
    this.logs = this.logGroup();

    this.databaseCredentials = SecretParameter.fromSecretNameV2(this, 'database-credentials', Statics._ssmDatabaseCredentials);
    this.openZaakCredentials = SecretParameter.fromSecretNameV2(this, 'open-klant-credentials', Statics._ssmOpenZaakCredentials);
    this.clientCredentialsZaakNotifications = SecretParameter.fromSecretNameV2(this, 'client-credentials-zaak-notifications', Statics._ssmClientCredentialsZaakNotifications);
    this.clientCredentialsNotificationsZaak = SecretParameter.fromSecretNameV2(this, 'client-credentials-notifications-zaak', Statics._ssmClientCredentialsNotificationsZaak);
    this.secretKey = new SecretParameter(this, 'secret-key', {
      description: 'Open klant secret key',
      generateSecretString: {
        excludePunctuation: true,
      },
    });

    this.setupConfigurationService();
    this.service = this.setupService();
    this.setupCeleryService();
  }

  private getEnvironmentConfiguration() {

    const cacheHost = this.props.cache.db.attrRedisEndpointAddress + ':' + this.props.cache.db.attrRedisEndpointPort + '/';

    const trustedDomains = this.props.alternativeDomainNames?.map(a => a) ?? [];
    trustedDomains.push(this.props.hostedzone.zoneName);

    return {
      DJANGO_SETTINGS_MODULE: 'openzaak.conf.docker',
      DB_NAME: Statics.databaseOpenZaak,
      DB_HOST: StringParameter.valueForStringParameter(this, Statics._ssmDatabaseHostname),
      DB_PORT: StringParameter.valueForStringParameter(this, Statics._ssmDatabasePort),
      ALLOWED_HOSTS: '*',
      CACHE_DEFAULT: cacheHost + this.props.cacheDatabaseIndex,
      CACHE_AXES: cacheHost + this.props.cacheDatabaseIndex,
      SUBPATH: '/' + this.props.path,
      IS_HTTPS: 'True',
      UWSGI_PORT: this.props.service.port.toString(),

      LOG_LEVEL: this.props.openZaakConfiguration.logLevel,
      LOG_REQUESTS: Utils.toPythonBooleanString(this.props.openZaakConfiguration.debug, false),
      LOG_OUTGOING_REQUESTS_DB_SAVE: Utils.toPythonBooleanString(this.props.openZaakConfiguration.debug, false),
      LOG_QUERIES: 'False',
      DEBUG: Utils.toPythonBooleanString(this.props.openZaakConfiguration.debug, false),
      SESSION_COOKIE_AGE: Statics.sessionTimeoutDefaultSeconds.toString(),

      // TODO not used as we do not store documents nor import them... yet
      // IMPORT_DOCUMENTEN_BASE_DIR=${IMPORT_DOCUMENTEN_BASE_DIR:-/app/import-data}
      // IMPORT_DOCUMENTEN_BATCH_SIZE=${IMPORT_DOCUMENTEN_BATCH_SIZE:-500}

      // Celery
      CELERY_BROKER_URL: 'redis://' + cacheHost + this.props.cacheDatabaseIndexCelery,
      CELERY_RESULT_BACKEND: 'redis://' + cacheHost + this.props.cacheDatabaseIndexCelery,
      CELERY_LOGLEVEL: this.props.openZaakConfiguration.logLevel,
      CELERY_WORKER_CONCURRENCY: '4',

      // Conectivity
      CSRF_TRUSTED_ORIGINS: trustedDomains.map(domain => `https://${domain}`).join(','),


      // Open notificaties specific stuff
      SENDFILE_BACKEND: 'django_sendfile.backends.simple', // Django backend to download files
      OPENZAAK_DOMAIN: trustedDomains[0],
      OPENZAAK_ORGANIZATION: Statics.organization,
      NOTIF_API_ROOT: `https://${trustedDomains[0]}/open-notificaties/api/v1/`, // TODO remove hardcoded path
      OPENZAAK_NOTIF_CONFIG_ENABLE: 'True', // Enable the configuration setup for connecting to open-notificaties

      // Somehow this is required aswell...
      DEMO_CONFIG_ENABLE: 'False',
      DEMO_CLIENT_ID: 'demo-client',
      DEMO_SECRET: 'demo-secret',
    };
  }

  private getSecretConfiguration() {
    const secrets = {
      DB_PASSWORD: Secret.fromSecretsManager(this.databaseCredentials, 'password'),
      DB_USER: Secret.fromSecretsManager(this.databaseCredentials, 'username'),

      // Django requires a secret key to be defined (auto generated on deployment for this service)
      SECRET_KEY: Secret.fromSecretsManager(this.secretKey),

      // Generic super user creation works with running the createsuperuser command
      DJANGO_SUPERUSER_USERNAME: Secret.fromSecretsManager(this.openZaakCredentials, 'username'),
      DJANGO_SUPERUSER_PASSWORD: Secret.fromSecretsManager(this.openZaakCredentials, 'password'),
      DJANGO_SUPERUSER_EMAIL: Secret.fromSecretsManager(this.openZaakCredentials, 'email'),
      OPENZAAK_SUPERUSER_USERNAME: Secret.fromSecretsManager(this.openZaakCredentials, 'username'),
      OPENZAAK_SUPERUSER_EMAIL: Secret.fromSecretsManager(this.openZaakCredentials, 'email'),

      // Default connection between open-zaak and open-notifications
      NOTIF_OPENZAAK_CLIENT_ID: Secret.fromSecretsManager(this.clientCredentialsNotificationsZaak, 'username'),
      NOTIF_OPENZAAK_SECRET: Secret.fromSecretsManager(this.clientCredentialsNotificationsZaak, 'secret'),
      OPENZAAK_NOTIF_CLIENT_ID: Secret.fromSecretsManager(this.clientCredentialsZaakNotifications, 'username'),
      OPENZAAK_NOTIF_SECRET: Secret.fromSecretsManager(this.clientCredentialsZaakNotifications, 'secret'),

    };
    return secrets;
  }

  /**
   * Setup the main service (e.g. open-zaak container)
   * @returns
   */
  private setupService() {
    const VOLUME_NAME = 'tmp';
    const task = this.serviceFactory.createTaskDefinition('main', {
      volumes: [{ name: VOLUME_NAME }],
      cpu: this.props.openZaakConfiguration.taskSize?.cpu ?? '256',
      memoryMiB: this.props.openZaakConfiguration.taskSize?.memory ?? '512',
    });

    // 3th Main service container
    const container = task.addContainer('main', {
      image: ContainerImage.fromRegistry(this.props.openZaakConfiguration.image),
      healthCheck: {
        command: ['CMD-SHELL', ServiceInfraUtils.frontendHealthCheck(this.props.service.port)],
        // command: ['CMD-SHELL', `python -c "import requests; x = requests.get('http://localhost:${this.props.service.port}/'); exit(x.status_code != 200)" >> /proc/1/fd/1`],
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
    this.serviceFactory.attachEphemeralStorage(container, VOLUME_NAME, '/tmp');

    this.serviceFactory.setupWritableVolume(VOLUME_NAME, task, this.logs, container, '/tmp');

    const service = this.serviceFactory.createService({
      id: 'main',
      task: task,
      path: this.props.path,
      options: {
        desiredCount: 1,
      },
      apiVersionHeaderValue: this.props.openZaakConfiguration.apiVersion,
      volumeMounts: {
        fileSystemRoot: '/openzaak',
        volumes: {
          'media': 'app/media',
          'private-media': 'app/private-media',
        },
      },
    });

    this.setupConnectivity('main', service.connections.securityGroups);
    this.allowAccessToSecrets(service.taskDefinition.executionRole!);
    return service;
  }

  /**
   * This service is disabled by default an can be ran manually to
   * setup the configuration when deploying a new open-zaak.
   * @returns
   */
  private setupConfigurationService() {
    const VOLUME_NAME = 'tmp';
    const task = this.serviceFactory.createTaskDefinition('setup-configuration', {
      volumes: [{ name: VOLUME_NAME }],
    });

    // Configuration - initialization container
    const initContainer = task.addContainer('init-config', {
      image: ContainerImage.fromRegistry(this.props.openZaakConfiguration.image),
      command: undefined, // Do not set a command as the entrypoint will handle this for us (see Dockerfile)
      readonlyRootFilesystem: false, // The HTTP Cache using SQLite prevents us from running without write to root...
      essential: true,
      secrets: this.getSecretConfiguration(),
      environment: {
        ...this.getEnvironmentConfiguration(),
        RUN_SETUP_CONFIG: 'true', // Make sure the setup script can run?
      },
      logging: new AwsLogDriver({
        streamPrefix: 'logs',
        logGroup: this.logs,
      }),
    });
    this.serviceFactory.attachEphemeralStorage(initContainer, VOLUME_NAME, '/tmp', '/app/setup_configuration');

    // Make sure we have a writable volume
    this.serviceFactory.setupWritableVolume(VOLUME_NAME, task, this.logs, initContainer, '/tmp', '/app/setup_configuration');

    // Scheduel a task in the past (so we can run it manually)
    const rule = new Rule(this, 'scheudle-setup', {
      schedule: Schedule.cron({
        year: '2020',
      }),
      description: 'Rule to run setup configuration for open-zaak (manually)',
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

  private setupCeleryService() {
    const VOLUME_NAME = 'temp';
    const task = this.serviceFactory.createTaskDefinition('celery', {
      volumes: [{ name: VOLUME_NAME }],
      cpu: this.props.openZaakConfiguration.celeryTaskSize?.cpu ?? '256',
      memoryMiB: this.props.openZaakConfiguration.celeryTaskSize?.memory ?? '512',

    });

    const container = task.addContainer('celery', {
      image: ContainerImage.fromRegistry(this.props.openZaakConfiguration.image),
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
        fileSystemRoot: '/openzaak',
        volumes: {
          'media': 'app/media',
          'private-media': 'app/private-media',
        },
      },
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


    serviceSecurityGroups.forEach(serviceSecurityGroup => {
      if (this.props.service.loadbalancer) {
        this.props.service.loadbalancer.connections.securityGroups.forEach(securityGroup => {
          serviceSecurityGroup.addIngressRule(securityGroup, Port.tcp(this.props.service.port));
        });
      }
    });
  }

  private allowAccessToSecrets(role: IRole) {
    this.databaseCredentials.grantRead(role);
    this.openZaakCredentials.grantRead(role);
    this.secretKey.grantRead(role);
  }


}
