import { CfnOutput, Duration, Fn, Token } from 'aws-cdk-lib';
import { ISecurityGroup, Port, SecurityGroup, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { AwsLogDriver, ContainerImage, FargateService, Protocol, Secret, TaskDefinition } from 'aws-cdk-lib/aws-ecs';
import { IRole } from 'aws-cdk-lib/aws-iam';
import { Key } from 'aws-cdk-lib/aws-kms';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { IHostedZone } from 'aws-cdk-lib/aws-route53';
import { ISecret, Secret as SecretParameter } from 'aws-cdk-lib/aws-secretsmanager';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { ObjectsConfiguration } from '../ConfigurationInterfaces';
import { EcsServiceFactory, EcsServiceFactoryProps, ECSServiceUtils } from '../constructs/EcsServiceFactory';
import { CacheDatabase } from '../constructs/Redis';
import { Statics } from '../Statics';
import { Utils } from '../Utils';

export interface ObjectsServiceProps {
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
  readonly serviceConfiguration: ObjectsConfiguration;
  readonly key: Key;
  readonly dockerhubCredentials: ISecret;
}

export class ObjectsService extends Construct {

  private readonly logs: LogGroup;
  private readonly props: ObjectsServiceProps;
  private readonly serviceFactory: EcsServiceFactory;
  private readonly databaseCredentials: ISecret;
  private readonly databaseUserCredentials: ISecret;
  private readonly superuserCredentials: ISecret;
  private readonly secretKey: ISecret;

  constructor(scope: Construct, id: string, props: ObjectsServiceProps) {
    super(scope, id);
    this.props = props;
    this.serviceFactory = new EcsServiceFactory(this, props.service);
    this.logs = this.logGroup();

    // DB that has a individual user for this service (new style)
    const newDatabaseName = `${Statics.databaseObjects}-database`;
    const databaseUserCredentialsName = Statics.databaseCredentialsName(newDatabaseName);
    this.databaseUserCredentials = SecretParameter.fromSecretNameV2(this, 'database-user-credentials', databaseUserCredentialsName);


    this.databaseCredentials = SecretParameter.fromSecretNameV2(this, 'database-credentials', Statics._ssmDatabaseCredentials);
    this.superuserCredentials = SecretParameter.fromSecretNameV2(this, 'superuser-credentials', Statics._ssmObjectsCredentials);
    this.secretKey = new SecretParameter(this, 'secret-key', {
      description: 'Objects secret key',
      generateSecretString: {
        excludePunctuation: true,
      },
    });

    const mainService = this.setupService();
    const celeryService = this.setupCeleryService();
    this.setupMigrationTask(mainService, celeryService);
  }

  private getEnvironmentConfiguration() {

    const cacheHost = this.props.cache.db.attrRedisEndpointAddress + ':' + this.props.cache.db.attrRedisEndpointPort + '/';
    const trustedDomains = this.props.alternativeDomainNames?.map(a => a) ?? [];
    trustedDomains.push(this.props.hostedzone.zoneName);

    const env: Record<string, string> = {

      // Add env vars from service config
      ...this.props.serviceConfiguration.environment,

      DJANGO_SETTINGS_MODULE: 'objects.conf.docker',
      DB_HOST: StringParameter.valueForStringParameter(this, Statics._ssmDatabaseHostname),
      DB_PORT: StringParameter.valueForStringParameter(this, Statics._ssmDatabasePort),
      ALLOWED_HOSTS: '*', // TODO make stricter at some point
      CACHE_DEFAULT: cacheHost + this.props.cacheDatabaseIndex,
      CACHE_AXES: cacheHost + this.props.cacheDatabaseIndex,
      SUBPATH: '/' + this.props.path,
      IS_HTTPS: 'yes',
      USE_X_FORWARDED_HOST: 'True',

      // UWSGI_PORT: this.props.service.port.toString(), // Contiainer fails to start when we set a port (wsgi stuff in struct mode).
      // The default port however 8080, so we can safely remove this envvar.

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
      CELERY_WORKER_CONCURRENCY: '4',

      // Conectivity
      CORS_ALLOW_ALL_ORIGINS: 'True', // TODO make strickter at some point
      CSRF_TRUSTED_ORIGINS: trustedDomains.map(domain => `https://${domain}`).join(','),

      // Disable OpenTelemetry (not used by this platform)
      OTEL_SDK_DISABLED: 'True',
    };

    if (this.props.serviceConfiguration.useNewDatabase == true) {
      env.DB_NAME_OLD = Statics.databaseObjects;
      env.DB_NAME = Statics.databaseObjects + '-database';
    } else {
      env.DB_NAME = Statics.databaseObjects;
      env.DB_NAME_NEW = Statics.databaseObjects + '-database';
    }

    return env;
  }

  private getSecretConfiguration() {
    let secrets = {
      // Django requires a secret key to be defined (auto generated on deployment for this service)
      SECRET_KEY: Secret.fromSecretsManager(this.secretKey),

      // Generic super user creation works with running the createsuperuser command
      DJANGO_SUPERUSER_USERNAME: Secret.fromSecretsManager(this.superuserCredentials, 'username'),
      DJANGO_SUPERUSER_PASSWORD: Secret.fromSecretsManager(this.superuserCredentials, 'password'),
      DJANGO_SUPERUSER_EMAIL: Secret.fromSecretsManager(this.superuserCredentials, 'email'),
    } as Record<string, Secret>;

    if (this.props.serviceConfiguration.useNewDatabase === true) {
      secrets = {
        ...secrets,
        DB_PASSWORD_OLD: Secret.fromSecretsManager(this.databaseCredentials, 'password'),
        DB_USER_OLD: Secret.fromSecretsManager(this.databaseCredentials, 'username'),
        DB_PASSWORD: Secret.fromSecretsManager(this.databaseUserCredentials, 'password'),
        DB_USER: Secret.fromSecretsManager(this.databaseUserCredentials, 'username'),
      };
    } else {
      secrets = {
        ...secrets,
        DB_PASSWORD: Secret.fromSecretsManager(this.databaseCredentials, 'password'),
        DB_USER: Secret.fromSecretsManager(this.databaseCredentials, 'username'),
        DB_PASSWORD_NEW: Secret.fromSecretsManager(this.databaseUserCredentials, 'password'),
        DB_USER_NEW: Secret.fromSecretsManager(this.databaseUserCredentials, 'username'),
      };
    }

    return secrets;
  }


  private setupService() {
    const VOLUME_NAME = 'tmp';
    const task = this.serviceFactory.createTaskDefinition('main', {
      volumes: [{ name: VOLUME_NAME }],
      cpu: this.props.serviceConfiguration.taskSize?.cpu ?? '256',
      memoryMiB: this.props.serviceConfiguration.taskSize?.memory ?? '512',
    });

    // Main service container
    const container = task.addContainer('main', {
      image: ContainerImage.fromRegistry(this.props.serviceConfiguration.image, {
        credentials: this.props.dockerhubCredentials,
      }),
      healthCheck: {
        // command: ['CMD-SHELL', `python -c "import requests; x = requests.get('http://localhost:${this.props.service.port}/'); exit(x.status_code != 200)" >> /proc/1/fd/1`],
        command: ['CMD-SHELL', 'exit 0'], // Disable for now as it keeps restarting.
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
      readonlyRootFilesystem: false, // Required for ECS Exec
      secrets: this.getSecretConfiguration(),
      environment: this.getEnvironmentConfiguration(),
      logging: new AwsLogDriver({
        streamPrefix: 'main',
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
        healthCheckGracePeriod: Duration.seconds(120), // Give more time to start (newer django starts slower?)
        desiredCount: 1,
        enableExecuteCommand: true, // Needed to run commands for upgrading container and running migration scripts.
      },
    });
    this.setupConnectivity('main', service.connections.securityGroups);
    this.allowAccessToSecrets(service.taskDefinition.executionRole!);
    ECSServiceUtils.allowExecutingCommands(task);
    return service;
  }


  private setupCeleryService() {
    const VOLUME_NAME = 'temp';
    const WITABLE_DIRS = [
      '/tmp',
      '/app/tmp',
      '/app/log',
    ];
    const task = this.serviceFactory.createTaskDefinition('celery', {
      volumes: [{ name: VOLUME_NAME }],
      cpu: this.props.serviceConfiguration.celeryTaskSize?.cpu ?? '256',
      memoryMiB: this.props.serviceConfiguration.celeryTaskSize?.memory ?? '512',
    });

    const container = task.addContainer('celery', {
      image: ContainerImage.fromRegistry(this.props.serviceConfiguration.image, {
        credentials: this.props.dockerhubCredentials,
      }),
      healthCheck: {
        command: ['CMD-SHELL', 'python /app/bin/check_celery_worker_liveness.py >> /proc/1/fd/1 2>&1'],
        interval: Duration.seconds(10),
        startPeriod: Duration.seconds(60),
      },
      readonlyRootFilesystem: false, // Required for ECS Exec
      secrets: this.getSecretConfiguration(),
      environment: this.getEnvironmentConfiguration(),
      logging: new AwsLogDriver({
        streamPrefix: 'logs',
        logGroup: this.logs,
      }),
      command: ['/celery_worker.sh'],
    });
    this.serviceFactory.attachEphemeralStorage(container, VOLUME_NAME, ...WITABLE_DIRS);

    this.serviceFactory.setupWritableVolume(VOLUME_NAME, task, this.logs, container, ...WITABLE_DIRS);

    const service = this.serviceFactory.createService({
      task,
      path: undefined, // Not exposed service
      id: 'celery',
      options: {
        desiredCount: 1,
        enableExecuteCommand: true, // Needed to run commands for upgrading container and running migration scripts.
      },
    });
    this.setupConnectivity('celery', service.connections.securityGroups);
    this.allowAccessToSecrets(service.taskDefinition.executionRole!);
    ECSServiceUtils.allowExecutingCommands(task);
    return service;
  }

  /**
   * Standalone, CDK-owned migration task definition. Runs `manage.py migrate`
   * off the load balancer (no ECS Service, no ALB, no target group), to be
   * invoked with `aws ecs run-task` by the `src/django-migrate` runner during a
   * maintenance window.
   *
   * Only created when `migrationImage` is configured, so it can be pinned to the
   * new version independently of the running service. Emits the values the
   * runner's `.env` needs as stack outputs.
   */
  private setupMigrationTask(mainService: FargateService, celeryService: FargateService) {
    const migrationImage = this.props.serviceConfiguration.migrationImage;
    if (!migrationImage) {
      return;
    }

    const VOLUME_NAME = 'tmp';
    const CONTAINER_NAME = 'migrate';
    const WRITABLE_DIRS = ['/tmp', '/app/log'];

    const task = this.serviceFactory.createTaskDefinition('migrate', {
      family: `${Statics.projectName}-objects-migrate`,
      volumes: [{ name: VOLUME_NAME }],
      cpu: this.props.serviceConfiguration.taskSize?.cpu ?? '256',
      memoryMiB: this.props.serviceConfiguration.taskSize?.memory ?? '512',
    });

    const container = task.addContainer(CONTAINER_NAME, {
      image: ContainerImage.fromRegistry(migrationImage, {
        credentials: this.props.dockerhubCredentials,
      }),
      command: ['python', 'src/manage.py', 'migrate', '--noinput'],
      readonlyRootFilesystem: false,
      secrets: this.getSecretConfiguration(),
      environment: this.getEnvironmentConfiguration(),
      logging: new AwsLogDriver({
        streamPrefix: 'migrate',
        logGroup: this.logs,
      }),
    });
    this.serviceFactory.attachEphemeralStorage(container, VOLUME_NAME, ...WRITABLE_DIRS);
    this.serviceFactory.setupWritableVolume(VOLUME_NAME, task, this.logs, container, ...WRITABLE_DIRS);

    // No ECS Service is created, so no security group exists yet. Create one and
    // wire it to the database + cache exactly like the running service's SG, so
    // the operator can hand it to `run-task`.
    const migrationSecurityGroup = new SecurityGroup(this, 'migrate-security-group', {
      vpc: this.props.service.cluster.vpc,
      description: 'Objects standalone migration task',
      allowAllOutbound: true,
    });
    this.setupConnectivity('migrate', [migrationSecurityGroup]);

    this.allowAccessToSecrets(task.executionRole!);
    ECSServiceUtils.allowExecutingCommands(task);

    this.migrationTaskOutputs(task, CONTAINER_NAME, migrationSecurityGroup, [mainService, celeryService]);
  }

  /**
   * Emit everything the `src/django-migrate` runner's `.env` needs, so the
   * operator does not have to hunt through the console. See
   * `src/django-migrate/.env.example`.
   */
  private migrationTaskOutputs(task: TaskDefinition, containerName: string, securityGroup: ISecurityGroup, services: FargateService[]) {
    const subnetIds = this.props.service.cluster.vpc.selectSubnets({
      subnetType: SubnetType.PRIVATE_WITH_EGRESS,
    }).subnetIds;

    new CfnOutput(this, 'migrate-cluster', {
      value: this.props.service.cluster.clusterName,
      description: 'django-migrate ECS_CLUSTER',
    });
    // Every service sharing the schema must be scaled to 0 before migrating.
    new CfnOutput(this, 'migrate-services', {
      value: services.map(service => service.serviceName).join(','),
      description: 'django-migrate ECS_SERVICE (comma-separated, scale all to 0)',
    });
    // ARN includes the exact family:revision to pin as MIGRATION_TASK_DEFINITION.
    new CfnOutput(this, 'migrate-taskdefinition', {
      value: task.taskDefinitionArn,
      description: 'django-migrate MIGRATION_TASK_DEFINITION (family:revision)',
    });
    new CfnOutput(this, 'migrate-container', {
      value: containerName,
      description: 'django-migrate MIGRATION_CONTAINER_NAME',
    });
    new CfnOutput(this, 'migrate-subnets', {
      value: Fn.join(',', subnetIds),
      description: 'django-migrate SUBNETS',
    });
    new CfnOutput(this, 'migrate-security-groups', {
      value: securityGroup.securityGroupId,
      description: 'django-migrate SECURITY_GROUPS',
    });
    new CfnOutput(this, 'migrate-log-group', {
      value: this.logs.logGroupName,
      description: 'CloudWatch log group for the migration task',
    });
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
    this.databaseUserCredentials.grantRead(role);
    this.superuserCredentials.grantRead(role);
    this.secretKey.grantRead(role);
  }


}
