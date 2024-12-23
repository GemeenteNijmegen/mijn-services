import { Duration, Token } from 'aws-cdk-lib';
import { ISecurityGroup, Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { AwsLogDriver, ContainerDependencyCondition, ContainerImage, Protocol, Secret } from 'aws-cdk-lib/aws-ecs';
import { IRole } from 'aws-cdk-lib/aws-iam';
import { Key } from 'aws-cdk-lib/aws-kms';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { IHostedZone } from 'aws-cdk-lib/aws-route53';
import { ISecret, Secret as SecretParameter } from 'aws-cdk-lib/aws-secretsmanager';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { OpenZaakConfiguration } from '../Configuration';
import { EcsServiceFactory, EcsServiceFactoryProps } from '../constructs/EcsServiceFactory';
import { CacheDatabase } from '../constructs/Redis';
import { Statics } from '../Statics';
import { Utils } from '../Utils';

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

    this.setupService();
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
      SUBPATH: '/'+this.props.path,
      IS_HTTPS: 'True',
      UWSGI_PORT: this.props.service.port.toString(),

      LOG_LEVEL: this.props.openZaakConfiguration.logLevel,
      LOG_REQUESTS: Utils.toPythonBooleanString(this.props.openZaakConfiguration.debug, false),
      LOG_OUTGOING_REQUESTS_DB_SAVE: Utils.toPythonBooleanString(this.props.openZaakConfiguration.debug, false),
      LOG_QUERIES: 'False',
      DEBUG: Utils.toPythonBooleanString(this.props.openZaakConfiguration.debug, false),

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

  private setupService() {
    const VOLUME_NAME = 'tmp';
    const task = this.serviceFactory.createTaskDefinition('main', {
      volumes: [{ name: VOLUME_NAME }],
    });

    // 3th Main service container
    const container = task.addContainer('main', {
      image: ContainerImage.fromRegistry(this.props.openZaakConfiguration.image),
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
        streamPrefix: 'logs',
        logGroup: this.logs,
      }),
    });
    this.serviceFactory.attachEphemeralStorage(container, VOLUME_NAME, '/tmp');

    // 2nd Configuration - initialization container
    const initContainer = task.addContainer('init-config', {
      image: ContainerImage.fromRegistry(this.props.openZaakConfiguration.image),
      command: ['/setup_configuration.sh'],
      readonlyRootFilesystem: true,
      essential: false, // exit after running
      secrets: this.getSecretConfiguration(),
      environment: this.getEnvironmentConfiguration(),
      logging: new AwsLogDriver({
        streamPrefix: 'logs',
        logGroup: this.logs,
      }),
    });
    container.addContainerDependencies({
      container: initContainer,
      condition: ContainerDependencyCondition.SUCCESS,
    });
    this.serviceFactory.attachEphemeralStorage(initContainer, VOLUME_NAME, '/tmp');

    this.serviceFactory.setupWritableVolume(VOLUME_NAME, task, this.logs, initContainer, '/tmp');

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
    const VOLUME_NAME = 'temp';
    const task = this.serviceFactory.createTaskDefinition('celery', {
      volumes: [{ name: VOLUME_NAME }],
    });

    const container = task.addContainer('celery', {
      image: ContainerImage.fromRegistry(this.props.openZaakConfiguration.image),
      healthCheck: {
        command: ['CMD-SHELL', 'celery', '--app', 'openzaak'],
        interval: Duration.seconds(10),
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
  }

  private allowAccessToSecrets(role: IRole) {
    this.databaseCredentials.grantRead(role);
    this.openZaakCredentials.grantRead(role);
    this.secretKey.grantRead(role);
  }


}