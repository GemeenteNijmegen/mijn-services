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
import { OpenKlantConfiguration } from '../Configuration';
import { EcsServiceFactory, EcsServiceFactoryProps } from '../constructs/EcsServiceFactory';
import { CacheDatabase } from '../constructs/Redis';
import { Statics } from '../Statics';

export interface OpenKlantServiceProps {
  image: string;
  cache: CacheDatabase;
  cacheDatabaseIndex: number;
  cacheDatabaseIndexCelery: number;
  logLevel: string;
  service: EcsServiceFactoryProps;
  path: string;
  hostedzone: IHostedZone;
  alternativeDomainNames?: string[];
  key: Key;
  serviceConfiguration: OpenKlantConfiguration;
}

export class OpenKlantService extends Construct {
  private readonly logs: LogGroup;
  private readonly props: OpenKlantServiceProps;
  private readonly serviceFactory: EcsServiceFactory;
  private readonly databaseCredentials: ISecret;
  private readonly openKlantCredentials: ISecret;
  private readonly secretKey: ISecret;
  constructor(scope: Construct, id: string, props: OpenKlantServiceProps) {
    super(scope, id);
    this.props = props;
    this.serviceFactory = new EcsServiceFactory(this, props.service);
    this.logs = this.logGroup();


    this.databaseCredentials = SecretParameter.fromSecretNameV2(this, 'database-credentials', Statics._ssmDatabaseCredentials);
    this.openKlantCredentials = SecretParameter.fromSecretNameV2(this, 'open-klant-credentials', Statics._ssmOpenKlantCredentials);
    this.secretKey = new SecretParameter(this, 'secret-key', {
      description: 'Open klant secret key',
      generateSecretString: {
        excludePunctuation: true,
      },
    });

    this.setupConfigurationService();
    this.setupService();
    this.setupCeleryService();
  }

  private getEnvironmentConfiguration() {

    const cacheHost = this.props.cache.db.attrRedisEndpointAddress + ':' + this.props.cache.db.attrRedisEndpointPort + '/';

    const trustedOrigins = this.props.alternativeDomainNames?.map(alternative => `https://${alternative}`) ?? [];
    trustedOrigins.push(`https://${this.props.hostedzone.zoneName}`);

    return {
      DJANGO_SETTINGS_MODULE: 'openklant.conf.docker',
      DB_NAME: Statics.databaseOpenKlant,
      DB_HOST: StringParameter.valueForStringParameter(this, Statics._ssmDatabaseHostname),
      DB_PORT: StringParameter.valueForStringParameter(this, Statics._ssmDatabasePort),
      ALLOWED_HOSTS: '*',
      CACHE_DEFAULT: cacheHost + this.props.cacheDatabaseIndex,
      CACHE_AXES: cacheHost + this.props.cacheDatabaseIndex,
      SUBPATH: '/' + this.props.path,
      IS_HTTPS: 'True',
      UWSGI_PORT: this.props.service.port.toString(),

      LOG_LEVEL: this.props.logLevel,
      LOG_REQUESTS: 'True',
      LOG_QUERIES: 'False',
      DEBUG: 'True',
      SESSION_COOKIE_AGE: Statics.sessionTimeoutDefaultSeconds.toString(),

      // Celery
      CELERY_BROKER_URL: 'redis://' + cacheHost + this.props.cacheDatabaseIndexCelery,
      CELERY_RESULT_BACKEND: 'redis://' + cacheHost + this.props.cacheDatabaseIndexCelery,
      CELERY_LOGLEVEL: this.props.logLevel,


      CSRF_TRUSTED_ORIGINS: trustedOrigins.join(','),

    };
  }

  private getSecretConfiguration() {
    const secrets = {
      DB_PASSWORD: Secret.fromSecretsManager(this.databaseCredentials, 'password'),
      DB_USER: Secret.fromSecretsManager(this.databaseCredentials, 'username'),

      // Django requires a secret key to be defined (auto generated on deployment for this service)
      SECRET_KEY: Secret.fromSecretsManager(this.secretKey),

      // Generic super user creation works with running the createsuperuser command
      DJANGO_SUPERUSER_USERNAME: Secret.fromSecretsManager(this.openKlantCredentials, 'username'),
      DJANGO_SUPERUSER_PASSWORD: Secret.fromSecretsManager(this.openKlantCredentials, 'password'),
      DJANGO_SUPERUSER_EMAIL: Secret.fromSecretsManager(this.openKlantCredentials, 'email'),
    };
    return secrets;
  }

  private setupConfigurationService() {
    const task = this.serviceFactory.createTaskDefinition('init');
    task.addContainer('init', {
      image: ContainerImage.fromRegistry(this.props.image),
      healthCheck: {
        command: ['CMD-SHELL', 'exit 0'], // Not sure what to check when executing a single script
        startPeriod: Duration.seconds(30), // Give the script an inital 30 seconds to run before starting the health check
      },
      // Note: use env vars in combinations with the below command https://stackoverflow.com/questions/26963444/django-create-superuser-from-batch-file
      // Note command can only run once: 'CommandError: Error: That gebruikersnaam is already taken.'
      command: ['python', 'src/manage.py', 'createsuperuser', '--no-input', '--skip-checks'],
      portMappings: [],
      logging: new AwsLogDriver({
        streamPrefix: 'init',
        logGroup: this.logs,
      }),
      readonlyRootFilesystem: true,
      secrets: this.getSecretConfiguration(),
      environment: this.getEnvironmentConfiguration(),
    });

    // Scheduel a task in the past (so we can run it manually)
    const rule = new Rule(this, 'scheudle-setup', {
      schedule: Schedule.cron({
        year: '2020',
      }),
      description: 'Rule to run setup configuration for open-klant (manually)',
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

  setupService() {
    const task = this.serviceFactory.createTaskDefinition('main', {
      cpu: this.props.serviceConfiguration.taskSize?.cpu ?? '256',
      memoryMiB: this.props.serviceConfiguration.taskSize?.memory ?? '512',
    });
    task.addContainer('main', {
      image: ContainerImage.fromRegistry(this.props.image),
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
        streamPrefix: 'main',
        logGroup: this.logs,
      }),
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
    const VOLUME_NAME = 'temp';
    const task = this.serviceFactory.createTaskDefinition('celery', {
      volumes: [{ name: VOLUME_NAME }],
      cpu: this.props.serviceConfiguration.celeryTaskSize?.cpu ?? '256',
      memoryMiB: this.props.serviceConfiguration.celeryTaskSize?.memory ?? '512',
    });

    // Setup celery container
    const container = task.addContainer('celery', {
      image: ContainerImage.fromRegistry(this.props.image),
      healthCheck: {
        command: ['CMD-SHELL', 'celery inspect ping >> /proc/1/fd/1 2>&1'],
        interval: Duration.seconds(10),
        startPeriod: Duration.seconds(60),
      },
      readonlyRootFilesystem: true,
      secrets: this.getSecretConfiguration(),
      environment: this.getEnvironmentConfiguration(),
      logging: new AwsLogDriver({
        streamPrefix: 'celery',
        logGroup: this.logs,
      }),
      command: ['/celery_worker.sh'],
    });
    this.serviceFactory.attachEphemeralStorage(container, VOLUME_NAME, '/tmp');

    this.serviceFactory.setupWritableVolume(VOLUME_NAME, task, this.logs, container, '/tmp');

    // Construct the service and setup conectivity and secrets access
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
    this.openKlantCredentials.grantRead(role);
  }

}