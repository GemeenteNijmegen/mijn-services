import { Duration, Token } from 'aws-cdk-lib';
import { ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import { ISecurityGroup, Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { AwsLogDriver, ContainerImage, FargateService, Protocol, Secret } from 'aws-cdk-lib/aws-ecs';
import { Protocol as AlbProtocol, ListenerCondition } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Key } from 'aws-cdk-lib/aws-kms';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { DatabaseInstance } from 'aws-cdk-lib/aws-rds';
import { IHostedZone } from 'aws-cdk-lib/aws-route53';
import { BlockPublicAccess, Bucket } from 'aws-cdk-lib/aws-s3';
import { ISecret, Secret as SecretParameter } from 'aws-cdk-lib/aws-secretsmanager';
import { DnsRecordType } from 'aws-cdk-lib/aws-servicediscovery';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { OpenZaakConfigurationV2 } from '../ConfigurationInterfaces';
import { EcsServiceFactory, EcsServiceFactoryProps, ECSServiceUtils } from '../constructs/EcsServiceFactory';
import { CacheDatabase } from '../constructs/Redis';
import { SubdomainCloudfront } from '../constructs/SubdomainCloudfront';
import { AdditionalDatabase } from '../custom-resources/database/AdditionalDatabase';
import { Statics } from '../Statics';
import { Utils } from '../Utils';

export interface OpenZaakv2ServiceProps {
  cache: CacheDatabase;
  service: EcsServiceFactoryProps;
  hostedzone: IHostedZone;
  certificate: ICertificate;
  key: Key;
  openZaakConfiguration: OpenZaakConfigurationV2;
  readonly dockerhubCredentials: ISecret;
  readonly alternativeDomainNames?: string[];
}

export class OpenZaakv2Service extends Construct {

  private static PORT = 8000; // Note: setting a different ports breaks the container

  private readonly logs: LogGroup;
  private readonly props: OpenZaakv2ServiceProps;
  private readonly serviceFactory: EcsServiceFactory;

  private databaseUserCredentials: ISecret;

  private readonly secretKey: ISecret;
  private readonly filesBucket: Bucket;

  readonly service: FargateService;

  constructor(scope: Construct, id: string, props: OpenZaakv2ServiceProps) {
    super(scope, id);
    this.props = props;
    this.serviceFactory = new EcsServiceFactory(this, props.service);
    this.logs = this.logGroup();

    this.secretKey = new SecretParameter(this, 'secret-key', {
      description: `Open zaak secret key for: ${props.openZaakConfiguration.id}`,
      generateSecretString: {
        excludePunctuation: true,
      },
    });

    this.filesBucket = this.setupFilesBucket();
    this.setupDatabase();
    this.service = this.setupService();
    this.setupCeleryService();
    this.setupCloudFrontSubdomain();
  }

  private getEnvironmentConfiguration() {

    const cacheHost = this.props.cache.db.attrRedisEndpointAddress + ':' + this.props.cache.db.attrRedisEndpointPort + '/';

    const siteDomain = `${this.props.openZaakConfiguration.subdomain}.${this.props.hostedzone.zoneName}`;

    const env: Record<string, string> = {
      DJANGO_SETTINGS_MODULE: 'openzaak.conf.docker',
      DB_NAME: this.props.openZaakConfiguration.databaseName,
      DB_HOST: StringParameter.valueForStringParameter(this, Statics._ssmDatabaseHostname),
      DB_PORT: StringParameter.valueForStringParameter(this, Statics._ssmDatabasePort),
      ALLOWED_HOSTS: '*',
      CACHE_DEFAULT: cacheHost + this.props.openZaakConfiguration.redisCacheDatabaseNumber,
      CACHE_AXES: cacheHost + this.props.openZaakConfiguration.redisCacheDatabaseNumber,
      IS_HTTPS: 'True',
      LOG_LEVEL: this.props.openZaakConfiguration.logLevel,
      LOG_REQUESTS: Utils.toPythonBooleanString(this.props.openZaakConfiguration.debug, false),
      LOG_OUTGOING_REQUESTS_DB_SAVE: Utils.toPythonBooleanString(this.props.openZaakConfiguration.debug, false),
      LOG_QUERIES: 'False',
      DEBUG: Utils.toPythonBooleanString(this.props.openZaakConfiguration.debug, false),
      SESSION_COOKIE_AGE: Statics.sessionTimeoutDefaultSeconds.toString(),
      CSRF_TRUSTED_ORIGINS: `https://${siteDomain}`,

      // Celery
      CELERY_BROKER_URL: 'redis://' + cacheHost + this.props.openZaakConfiguration.redisCeleryDatabaseNumber,
      CELERY_RESULT_BACKEND: 'redis://' + cacheHost + this.props.openZaakConfiguration.redisCeleryDatabaseNumber,
      CELERY_LOGLEVEL: this.props.openZaakConfiguration.logLevel,
      CELERY_WORKER_CONCURRENCY: '4',

      SITE_DOMAIN: siteDomain,
      OPENZAAK_DOMAIN: siteDomain,
      OTEL_SDK_DISABLED: 'true',

      // Files
      SENDFILE_BACKEND: 'django_sendfile.backends.simple', // Django backend to download files
      DOCUMENTEN_API_BACKEND: 's3_storage',
      S3_STORAGE_BUCKET_NAME: this.filesBucket.bucketName,
      // S3_ACCESS_KEY_ID: '', // boto3 is used so credentials are pickedup by the SDK.

    };


    return env;
  }

  private getSecretConfiguration() {
    let secrets = {
      // Django requires a secret key to be defined (auto generated on deployment for this service)
      SECRET_KEY: Secret.fromSecretsManager(this.secretKey),
      // Database credentials
      DB_PASSWORD: Secret.fromSecretsManager(this.databaseUserCredentials, 'password'),
      DB_USER: Secret.fromSecretsManager(this.databaseUserCredentials, 'username'),
    };

    return secrets;
  }

  /**
   * Setup the main service (e.g. open-zaak container)
   * @returns
   */
  private setupService() {
    const task = this.serviceFactory.createTaskDefinition('main', {
      cpu: this.props.openZaakConfiguration.taskSize?.cpu ?? '256',
      memoryMiB: this.props.openZaakConfiguration.taskSize?.memory ?? '512',
    });

    task.addContainer('main', {
      image: ContainerImage.fromRegistry(this.props.openZaakConfiguration.image, {
        credentials: this.props.dockerhubCredentials,
      }),
      // healthCheck: undefined, // Disabled as we have ALB health checks
      portMappings: [
        {
          containerPort: OpenZaakv2Service.PORT, // Setting a different port breaks the container
          hostPort: OpenZaakv2Service.PORT,
          protocol: Protocol.TCP,
        },
      ],
      readonlyRootFilesystem: false, // Used for ECS Exec
      secrets: this.getSecretConfiguration(),
      environment: this.getEnvironmentConfiguration(),
      logging: new AwsLogDriver({
        streamPrefix: 'logs',
        logGroup: this.logs,
      }),
    });

    // Setup the service
    const service = new FargateService(this, `${this.props.openZaakConfiguration.id}-service`, {
      cluster: this.props.service.cluster,
      taskDefinition: task,
      cloudMapOptions: { // Expose for intercontainer communication
        cloudMapNamespace: this.props.service.namespace,
        containerPort: OpenZaakv2Service.PORT,
        dnsRecordType: DnsRecordType.SRV,
        dnsTtl: Duration.seconds(60),
      },
      desiredCount: this.props.openZaakConfiguration.taskSize?.desiredTaskCount ?? 1,
      enableExecuteCommand: true,
      healthCheckGracePeriod: Duration.seconds(120), // Give time to start
    });

    // Attach to loadbalancer
    let fqdomain = `${this.props.openZaakConfiguration.subdomain}.${this.props.hostedzone.zoneName}`;
    if (this.props.alternativeDomainNames && this.props.alternativeDomainNames.length > 0) {
      fqdomain = `${this.props.openZaakConfiguration.subdomain}.${this.props.alternativeDomainNames[0]}`;
    }
    this.props.service.loadbalancer.listener.addTargets(this.props.openZaakConfiguration.id, {
      conditions: [ListenerCondition.hostHeaders([fqdomain])],
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
      port: 80,
      targets: [service],
      priority: this.props.openZaakConfiguration.loadbalancerPriority,
      deregistrationDelay: Duration.minutes(1),
    });
    ECSServiceUtils.allowExecutingCommands(task);
    this.setupConnectivity('main', service.connections.securityGroups);
    this.filesBucket.grantReadWrite(task.taskRole!);
    return service;
  }


  private setupCeleryService() {
    const task = this.serviceFactory.createTaskDefinition('celery', {
      cpu: this.props.openZaakConfiguration.celeryTaskSize?.cpu ?? '256',
      memoryMiB: this.props.openZaakConfiguration.celeryTaskSize?.memory ?? '512',

    });

    task.addContainer('celery', {
      image: ContainerImage.fromRegistry(this.props.openZaakConfiguration.image, {
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

    const service = this.serviceFactory.createService({
      task,
      path: undefined, // Not exposed service
      domain: undefined, // Not exposed service
      id: 'celery',
      options: {
        desiredCount: this.props.openZaakConfiguration.celeryTaskSize?.desiredTaskCount ?? 1,
        enableExecuteCommand: true, // Needed to run commands for upgrading container and running migration scripts.
      },
    });
    this.setupConnectivity('celery', service.connections.securityGroups);
    ECSServiceUtils.allowExecutingCommands(task);
    this.filesBucket.grantReadWrite(task.taskRole!);
  }

  private logGroup() {
    return new LogGroup(this, 'logs', {
      retention: RetentionDays.ONE_MONTH,
      encryptionKey: this.props.key,
    });
  }

  private setupDatabase() {

    // Import admin credentials
    const dbAdmin = SecretParameter.fromSecretNameV2(this, 'db-admin', Statics._ssmDatabaseCredentials);

    // Create credentials for this open-zaak instance
    this.databaseUserCredentials = new SecretParameter(this, 'db-credentials', {
      description: `Credentials for connecting to the ${this.props.openZaakConfiguration.databaseName} database instance`,
      generateSecretString: {
        excludePunctuation: true,
        secretStringTemplate: JSON.stringify({
          username: this.props.openZaakConfiguration.databaseName,
        }),
        generateStringKey: 'password',
      },
      secretName: Statics.databaseCredentialsName(this.props.openZaakConfiguration.databaseName),
    });

    // Import the RDS instance
    const hostname = StringParameter.valueForStringParameter(this, Statics._ssmDatabaseHostname);
    const port = StringParameter.valueForStringParameter(this, Statics._ssmDatabasePort);

    // Import the RDS instance security group
    const dbSecurityGroupId = StringParameter.valueForStringParameter(this, Statics._ssmDatabaseSecurityGroup);
    const dbSecurityGroup = SecurityGroup.fromSecurityGroupId(this, 'db-security-group', dbSecurityGroupId);

    // Wrap in an RDS instance interface
    const dbInstance = DatabaseInstance.fromDatabaseInstanceAttributes(this, 'rds-instance', {
      instanceEndpointAddress: hostname,
      instanceIdentifier: '', // Not used by AdditionalDatabase construct so leave blank
      port: Token.asNumber(port),
      securityGroups: [dbSecurityGroup],
    });

    // Create the database (using custom resource, the db lives in the db stack)
    new AdditionalDatabase(this, 'db', {
      adminCredentialsSecret: dbAdmin,
      databaseName: this.props.openZaakConfiguration.databaseName,
      dbUserCredentialsSecret: this.databaseUserCredentials,
      instance: dbInstance,
      vpc: this.props.service.cluster.vpc,
    });
  }


  private setupFilesBucket() {
    return new Bucket(this, 'files-bucket', {
      enforceSSL: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    });
  }

  private setupCloudFrontSubdomain() {

    new SubdomainCloudfront(this, 'subdomain', {
      certificate: this.props.certificate,
      hostedZone: this.props.hostedzone,
      loadbalancer: this.props.service.loadbalancer.alb,
      subdomain: this.props.openZaakConfiguration.subdomain,
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
        this.props.service.loadbalancer.alb.connections.securityGroups.forEach(securityGroup => {
          serviceSecurityGroup.addIngressRule(securityGroup, Port.tcp(this.props.service.port));
        });
      }
    });
  }


}
