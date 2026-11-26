import { Duration, Token } from 'aws-cdk-lib';
import { ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import { ISecurityGroup, Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import {
  AwsLogDriver,
  Compatibility,
  ContainerDependencyCondition,
  ContainerDefinition,
  ContainerImage,
  FargateService,
  HealthCheck,
  Protocol,
  Secret,
  TaskDefinition,
} from 'aws-cdk-lib/aws-ecs';
import {
  ApplicationListenerRule,
  ApplicationProtocol,
  ApplicationTargetGroup,
  Protocol as AlbProtocol,
  ListenerAction,
  ListenerCondition,
} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Key } from 'aws-cdk-lib/aws-kms';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { DatabaseInstance } from 'aws-cdk-lib/aws-rds';
import { IHostedZone } from 'aws-cdk-lib/aws-route53';
import { ISecret, Secret as SecretParameter } from 'aws-cdk-lib/aws-secretsmanager';
import { DnsRecordType } from 'aws-cdk-lib/aws-servicediscovery';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { OpenNotificatiesConfigurationV2 } from '../ConfigurationInterfaces';
import { EcsServiceFactoryProps, ECSServiceUtils } from '../constructs/EcsServiceFactory';
import { CacheDatabase } from '../constructs/Redis';
import { SubdomainCloudfront } from '../constructs/SubdomainCloudfront';
import { AdditionalDatabase } from '../custom-resources/database/AdditionalDatabase';
import { Statics } from '../Statics';
import { Utils } from '../Utils';

export interface OpenNotificatiesV2ServiceProps {
  readonly service: EcsServiceFactoryProps;
  readonly hostedzone: IHostedZone;
  readonly certificate: ICertificate;
  readonly key: Key;
  readonly cache: CacheDatabase;
  readonly dockerhubCredentials: ISecret;
  readonly serviceConfiguration: OpenNotificatiesConfigurationV2;
}

/**
 * Open Notificaties on its own subdomain.
 *
 * Runs as a single ECS service. Each task holds three containers sharing the
 * same image: the web application (runs the database migrations on start),
 * the celery worker that delivers notifications, and celery beat that
 * schedules deliveries and cleanup. Redis is used as celery broker.
 */
export class OpenNotificatiesV2Service extends Construct {

  private static readonly PORT = 8000;

  private readonly logs: LogGroup;
  private readonly props: OpenNotificatiesV2ServiceProps;
  private readonly secretKey: ISecret;
  private databaseUserCredentials: ISecret;

  readonly service: FargateService;

  constructor(scope: Construct, id: string, props: OpenNotificatiesV2ServiceProps) {
    super(scope, id);
    this.props = props;

    this.logs = this.logGroup();
    this.secretKey = new SecretParameter(this, 'secret-key', {
      description: `Open notificaties secret key for: ${props.serviceConfiguration.id}`,
      generateSecretString: {
        excludePunctuation: true,
      },
    });
    this.setupDatabase();
    this.service = this.setupService();
    this.setupExposure();
  }

  private get domain() {
    return `${this.props.serviceConfiguration.subdomain}.${this.props.hostedzone.zoneName}`;
  }

  private getEnvironmentConfiguration() {
    const config = this.props.serviceConfiguration;
    const cacheHost = this.props.cache.db.attrRedisEndpointAddress + ':' + this.props.cache.db.attrRedisEndpointPort + '/';
    const celeryUrl = 'redis://' + cacheHost + config.redisCeleryDatabaseNumber;

    return {
      DJANGO_SETTINGS_MODULE: 'nrc.conf.docker',
      DB_NAME: config.databaseName,
      DB_HOST: StringParameter.valueForStringParameter(this, Statics._ssmDatabaseHostname),
      DB_PORT: StringParameter.valueForStringParameter(this, Statics._ssmDatabasePort),
      ALLOWED_HOSTS: '*',
      CACHE_DEFAULT: cacheHost + config.redisCacheDatabaseNumber,
      CACHE_AXES: cacheHost + config.redisCacheDatabaseNumber,
      IS_HTTPS: 'True',
      SITE_DOMAIN: this.domain,
      CSRF_TRUSTED_ORIGINS: `https://${this.domain}`,
      SESSION_COOKIE_AGE: Statics.sessionTimeoutDefaultSeconds.toString(),
      UWSGI_PROCESSES: '2',

      LOG_LEVEL: config.logLevel,
      LOG_REQUESTS: Utils.toPythonBooleanString(config.debug, false),
      LOG_OUTGOING_REQUESTS_DB_SAVE: Utils.toPythonBooleanString(config.debug, false),
      LOG_QUERIES: 'False',
      DEBUG: Utils.toPythonBooleanString(config.debug, false),
      OTEL_SDK_DISABLED: 'true',

      CELERY_BROKER_URL: celeryUrl,
      CELERY_RESULT_BACKEND: celeryUrl,
      CELERY_LOGLEVEL: config.logLevel,
      CELERY_WORKER_CONCURRENCY: '4',

      LOG_NOTIFICATIONS_IN_DB: Utils.toPythonBooleanString(config.persistNotifications, false),
      NOTIFICATION_NUMBER_OF_DAYS_RETAINED: '30',
    };
  }

  private getSecretConfiguration() {
    return {
      SECRET_KEY: Secret.fromSecretsManager(this.secretKey),
      DB_USER: Secret.fromSecretsManager(this.databaseUserCredentials, 'username'),
      DB_PASSWORD: Secret.fromSecretsManager(this.databaseUserCredentials, 'password'),
    };
  }

  private setupService() {
    const config = this.props.serviceConfiguration;

    const task = new TaskDefinition(this, 'task', {
      cpu: config.taskSize?.cpu ?? '512',
      memoryMiB: config.taskSize?.memory ?? '1536',
      compatibility: Compatibility.FARGATE,
    });

    // The image's default command runs the migrations, then starts uwsgi on port 8000
    const web = this.addContainer(task, 'web', {
      healthCheck: {
        command: ['CMD-SHELL', `python -c "import urllib.request; urllib.request.urlopen('http://localhost:${OpenNotificatiesV2Service.PORT}/')"`],
        interval: Duration.seconds(15),
        startPeriod: Duration.seconds(120),
        retries: 3,
      },
    });
    web.addPortMappings({
      containerPort: OpenNotificatiesV2Service.PORT,
      hostPort: OpenNotificatiesV2Service.PORT,
      protocol: Protocol.TCP,
    });

    const worker = this.addContainer(task, 'celery', {
      command: ['/celery_worker.sh'],
      healthCheck: {
        command: ['CMD-SHELL', 'python /app/bin/check_celery_worker_liveness.py >> /proc/1/fd/1 2>&1'],
        interval: Duration.seconds(10),
        startPeriod: Duration.seconds(60),
      },
    });

    // Required: beat schedules the delivery of notifications, not only cleanup
    const beat = this.addContainer(task, 'celery-beat', {
      command: ['/celery_beat.sh'],
    });

    // Migrations run when the web container starts
    [worker, beat].forEach(container => container.addContainerDependencies({
      container: web,
      condition: ContainerDependencyCondition.HEALTHY,
    }));

    ECSServiceUtils.allowExecutingCommands(task);

    const service = new FargateService(this, 'service', {
      cluster: this.props.service.cluster,
      taskDefinition: task,
      cloudMapOptions: {
        cloudMapNamespace: this.props.service.namespace,
        containerPort: OpenNotificatiesV2Service.PORT,
        dnsRecordType: DnsRecordType.SRV,
        dnsTtl: Duration.seconds(60),
      },
      desiredCount: config.taskSize?.desiredTaskCount ?? 1,
      enableExecuteCommand: true,
      healthCheckGracePeriod: Duration.seconds(180), // Migrations run before the web server starts
    });
    this.setupConnectivity(service.connections.securityGroups);
    return service;
  }

  private setupExposure() {
    const config = this.props.serviceConfiguration;

    // Target group and rule are created in this construct (not via listener.addTargets),
    // so they end up in the stack of this service instead of the load balancer's stack.
    const targetGroup = new ApplicationTargetGroup(this, 'target-group', {
      vpc: this.props.service.cluster.vpc,
      port: OpenNotificatiesV2Service.PORT,
      protocol: ApplicationProtocol.HTTP,
      healthCheck: {
        enabled: true,
        path: '/',
        healthyHttpCodes: '200',
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 6,
        timeout: Duration.seconds(10),
        interval: Duration.seconds(15),
        protocol: AlbProtocol.HTTP,
      },
      targets: [this.service],
      deregistrationDelay: Duration.minutes(1),
    });

    new ApplicationListenerRule(this, 'listener-rule', {
      listener: this.props.service.loadbalancer.listener,
      priority: config.loadbalancerPriority,
      conditions: [ListenerCondition.hostHeaders([this.domain])],
      action: ListenerAction.forward([targetGroup]),
    });

    new SubdomainCloudfront(this, 'subdomain', {
      certificate: this.props.certificate,
      hostedZone: this.props.hostedzone,
      loadbalancer: this.props.service.loadbalancer.alb,
      subdomain: config.subdomain,
    });
  }

  private addContainer(task: TaskDefinition, name: string, options: { command?: string[]; healthCheck?: HealthCheck }): ContainerDefinition {
    return task.addContainer(name, {
      image: ContainerImage.fromRegistry(this.props.serviceConfiguration.image, {
        credentials: this.props.dockerhubCredentials,
      }),
      command: options.command,
      healthCheck: options.healthCheck,
      essential: true,
      readonlyRootFilesystem: false, // Allow ECS Exec and celery beat's schedule file
      secrets: this.getSecretConfiguration(),
      environment: this.getEnvironmentConfiguration(),
      logging: new AwsLogDriver({
        streamPrefix: name,
        logGroup: this.logs,
      }),
    });
  }

  private logGroup() {
    return new LogGroup(this, 'logs', {
      retention: RetentionDays.ONE_MONTH,
      encryptionKey: this.props.key,
    });
  }

  private setupDatabase() {
    const databaseName = this.props.serviceConfiguration.databaseName;

    const dbAdmin = SecretParameter.fromSecretNameV2(this, 'db-admin', Statics._ssmDatabaseCredentials);

    this.databaseUserCredentials = new SecretParameter(this, 'db-credentials', {
      description: `Credentials for connecting to the ${databaseName} database instance`,
      generateSecretString: {
        excludePunctuation: true,
        secretStringTemplate: JSON.stringify({
          username: databaseName,
        }),
        generateStringKey: 'password',
      },
      secretName: Statics.databaseCredentialsName(databaseName),
    });

    const hostname = StringParameter.valueForStringParameter(this, Statics._ssmDatabaseHostname);
    const port = StringParameter.valueForStringParameter(this, Statics._ssmDatabasePort);
    const dbSecurityGroupId = StringParameter.valueForStringParameter(this, Statics._ssmDatabaseSecurityGroup);
    const dbSecurityGroup = SecurityGroup.fromSecurityGroupId(this, 'db-security-group', dbSecurityGroupId);

    const dbInstance = DatabaseInstance.fromDatabaseInstanceAttributes(this, 'rds-instance', {
      instanceEndpointAddress: hostname,
      instanceIdentifier: '', // Not used by the AdditionalDatabase construct
      port: Token.asNumber(port),
      securityGroups: [dbSecurityGroup],
    });

    new AdditionalDatabase(this, 'db', {
      adminCredentialsSecret: dbAdmin,
      databaseName,
      dbUserCredentialsSecret: this.databaseUserCredentials,
      instance: dbInstance,
      vpc: this.props.service.cluster.vpc,
    });
  }

  private setupConnectivity(serviceSecurityGroups: ISecurityGroup[]) {
    const dbSecurityGroupId = StringParameter.valueForStringParameter(this, Statics._ssmDatabaseSecurityGroup);
    const dbSecurityGroup = SecurityGroup.fromSecurityGroupId(this, 'db-security-group-service', dbSecurityGroupId);
    const dbPort = StringParameter.valueForStringParameter(this, Statics._ssmDatabasePort);
    const cachePort = this.props.cache.db.attrRedisEndpointPort;

    serviceSecurityGroups.forEach(serviceSecurityGroup => {
      dbSecurityGroup.connections.allowFrom(serviceSecurityGroup, Port.tcp(Token.asNumber(dbPort)));
      this.props.cache.db.vpcSecurityGroupIds?.forEach((cacheSecurityGroupId, index) => {
        const cacheSecurityGroup = SecurityGroup.fromSecurityGroupId(this, `cache-security-group-${index}`, cacheSecurityGroupId);
        cacheSecurityGroup.connections.allowFrom(serviceSecurityGroup, Port.tcp(Token.asNumber(cachePort)));
      });
    });
  }
}
