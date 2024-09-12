import { Duration, Token } from 'aws-cdk-lib';
import { ISecurityGroup, Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { AwsLogDriver, ContainerDependencyCondition, ContainerImage, Protocol, Secret } from 'aws-cdk-lib/aws-ecs';
import { IRole } from 'aws-cdk-lib/aws-iam';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { IHostedZone } from 'aws-cdk-lib/aws-route53';
import { ISecret, Secret as SecretParameter } from 'aws-cdk-lib/aws-secretsmanager';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { OpenNotificatiesConfiguration } from '../Configuration';
import { CacheDatabase } from '../constructs/Redis';
import { ServiceFactory, ServiceFactoryProps } from '../constructs/ServiceFactory';
import { Statics } from '../Statics';
import { Utils } from '../Utils';

export interface OpenNotificatiesServiceProps {
  cache: CacheDatabase;
  cacheDatabaseIndex: number;
  cacheDatabaseIndexCelery: number;
  service: ServiceFactoryProps;
  path: string;
  hostedzone: IHostedZone;
  alternativeDomainNames?: string[];

  openNotificationsConfiguration: OpenNotificatiesConfiguration;
}

export class OpenNotificatiesService extends Construct {

  private static RABBIT_MQ_NAME = 'rabbitmq';
  private static RABBIT_MQ_PORT = 5672;

  private readonly logs: LogGroup;
  private readonly props: OpenNotificatiesServiceProps;
  private readonly serviceFactory: ServiceFactory;
  private readonly databaseCredentials: ISecret;
  // private readonly rabbitMqCredentials: ISecret;
  private readonly openNotificatiesCredentials: ISecret;
  private readonly secretKey: ISecret;

  constructor(scope: Construct, id: string, props: OpenNotificatiesServiceProps) {
    super(scope, id);
    this.props = props;
    this.serviceFactory = new ServiceFactory(this, props.service);
    this.logs = this.logGroup();

    this.databaseCredentials = SecretParameter.fromSecretNameV2(this, 'database-credentials', Statics._ssmDatabaseCredentials);
    this.openNotificatiesCredentials = SecretParameter.fromSecretNameV2(this, 'open-klant-credentials', Statics._ssmOpenNotificatiesCredentials);
    // this.rabbitMqCredentials = SecretParameter.fromSecretNameV2(this, 'rabbit-mq-credentials', Statics._ssmRabbitMqCredentials);
    this.secretKey = new SecretParameter(this, 'secret-key', {
      description: 'Open klant secret key',
      generateSecretString: {
        excludePunctuation: true,
      },
    });

    this.setupRabbitMqService();
    this.setupService();
    // this.setupCeleryService();
    // this.setupCeleryBeatService();
  }

  private getEnvironmentConfiguration() {

    const cacheHost = this.props.cache.db.attrRedisEndpointAddress + ':' + this.props.cache.db.attrRedisEndpointPort + '/';

    const trustedOrigins = this.props.alternativeDomainNames?.map(alternative => `https://${alternative}`) ?? [];
    trustedOrigins.push(`https://${this.props.hostedzone.zoneName}`);


    const rabbitMqHost = `${OpenNotificatiesService.RABBIT_MQ_NAME}.${this.props.service.namespace}`;
    const rabbitMqBrokerUrl = `amqp://guest:guest@${rabbitMqHost}:${OpenNotificatiesService.RABBIT_MQ_PORT}//`;

    return {
      DJANGO_SETTINGS_MODULE: 'nrc.conf.docker',
      DB_NAME: Statics.databaseOpenNotificaties,
      DB_HOST: StringParameter.valueForStringParameter(this, Statics._ssmDatabaseHostname),
      DB_PORT: StringParameter.valueForStringParameter(this, Statics._ssmDatabasePort),
      ALLOWED_HOSTS: '*',
      CACHE_DEFAULT: cacheHost + this.props.cacheDatabaseIndex,
      CACHE_AXES: cacheHost + this.props.cacheDatabaseIndex,
      SUBPATH: '/'+this.props.path,
      IS_HTTPS: 'yes',
      UWSGI_PORT: this.props.service.port.toString(),

      LOG_LEVEL: this.props.openNotificationsConfiguration.logLevel,
      LOG_REQUESTS: Utils.toPythonBooleanString(this.props.openNotificationsConfiguration.debug, false),
      LOG_QUERIES: 'False',
      DEBUG: Utils.toPythonBooleanString(this.props.openNotificationsConfiguration.debug, false),

      // Celery
      CELERY_RESULT_BACKEND: 'redis://' + cacheHost + this.props.cacheDatabaseIndexCelery,
      CELERY_LOGLEVEL: this.props.openNotificationsConfiguration.logLevel,
      CELERY_WORKER_CONCURRENCY: '4',
      RABBITMQ_HOST: rabbitMqHost,
      CELERY_BROKER_URL: rabbitMqBrokerUrl,
      // PUBLISH_BROKER_URL: 'amqp://guest:guest@rabbitmq.zgw.local:5672/%2F', // TODO i dont think we need this

      // Conectivity
      CSRF_TRUSTED_ORIGINS: trustedOrigins.join(','),
      // CORS_ALLOW_ALL_ORIGINS: 'True', // TODO figure out of we need this?


      // Open notificaties specific stuff
      OPENNOTIFICATIES_ORGANIZATION: Statics.organization,
      OPENNOTIFICATIES_DOMAIN: trustedOrigins[0],

      // TODO find a way to privde these when open zaak is running as well
      // NOTIF_OPENZAAK_CLIENT_ID: 'notificaties-client',
      // NOTIF_OPENZAAK_SECRET: 'notificaties-secret',
      // AUTORISATIES_API_ROOT: 'https://lb.zgw.sandbox-marnix.csp-nijmegen.nl/open-zaak/autorisaties/api/v1',
      // OPENZAAK_NOTIF_CLIENT_ID: 'oz-client',
      // OPENZAAK_NOTIF_SECRET: 'oz-secret',


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

    };
    return secrets;
  }

  private setupRabbitMqService() {
    const task = this.serviceFactory.createTaskDefinition('rabbit-mq');
    task.addContainer('main', {
      image: ContainerImage.fromRegistry(this.props.openNotificationsConfiguration.rabbitMqImage),
      logging: new AwsLogDriver({
        streamPrefix: 'logs',
        logGroup: this.logs,
      }),
      portMappings: [{
        containerPort: OpenNotificatiesService.RABBIT_MQ_PORT,
      }],
      secrets: {
        // RABBITMQ_DEFAULT_USER: Secret.fromSecretsManager(this.rabbitMqCredentials, 'username'), // TODO do we need this?
        // RABBITMQ_DEFAULT_PASS: Secret.fromSecretsManager(this.rabbitMqCredentials, 'password'), // TODO do we need this?
      },
      environment: {}, // TODO figgure out if we need any settings?
    });
  }

  private setupService() {
    const task = this.serviceFactory.createTaskDefinition('main');

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
        streamPrefix: 'logs',
        logGroup: this.logs,
      }),
    });

    // Initialization container
    const initContainer = task.addContainer('init', {
      image: ContainerImage.fromRegistry(this.props.openNotificationsConfiguration.image),
      command: ['/setup_configuration.sh'],
      readonlyRootFilesystem: true,
      essential: false, // exit after running
      logging: new AwsLogDriver({
        streamPrefix: 'init-storage',
      }),
    });
    container.addContainerDependencies({
      container: initContainer,
      condition: ContainerDependencyCondition.SUCCESS,
    });

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
  }

  setupCeleryService() {
    const task = this.serviceFactory.createTaskDefinition('celery');
    task.addContainer('celery', {
      image: ContainerImage.fromRegistry(this.props.openNotificationsConfiguration.image),
      healthCheck: {
        command: ['CMD-SHELL', 'celery', '--app', 'openklant.celery'],
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
  }


}