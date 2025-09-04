import { Duration, Token } from 'aws-cdk-lib';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { ISecurityGroup, Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { AwsLogDriver, ContainerDependencyCondition, ContainerImage, Protocol, Secret } from 'aws-cdk-lib/aws-ecs';
import { IRole } from 'aws-cdk-lib/aws-iam';
import { Key } from 'aws-cdk-lib/aws-kms';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { IHostedZone } from 'aws-cdk-lib/aws-route53';
import { ISecret, Secret as SecretParameter } from 'aws-cdk-lib/aws-secretsmanager';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { RemoteParameters } from 'cdk-remote-stack';
import { Construct } from 'constructs';
import { CorsaZgwServiceConfiguration } from '../ConfigurationInterfaces';
import { EcsServiceFactory, EcsServiceFactoryProps } from '../constructs/EcsServiceFactory';
import { CacheDatabase } from '../constructs/Redis';
import { SubdomainCloudfront } from '../constructs/SubdomainCloudfront';
import { Statics } from '../Statics';

export interface CorsaZgwProps {

  readonly redis: CacheDatabase;

  readonly service: EcsServiceFactoryProps;

  readonly repository: Repository;

  readonly hostedzone: IHostedZone;

  /**
   * The configuration for the open configuration installation
   */
  readonly serviceConfiguration: CorsaZgwServiceConfiguration;
  readonly key: Key;
}

export class CorsaZgwService extends Construct {

  private static readonly SUBDOMAIN = 'corsa-zgw';

  private readonly logs: LogGroup;
  private readonly props: CorsaZgwProps;
  private readonly serviceFactory: EcsServiceFactory;
  private readonly databaseCredentials: ISecret;
  // private readonly superuserCredentials: ISecret;
  private readonly secretKey: ISecret;
  private readonly distribution: SubdomainCloudfront;

  constructor(scope: Construct, id: string, props: CorsaZgwProps) {
    super(scope, id);
    this.props = props;

    this.serviceFactory = new EcsServiceFactory(this, props.service);
    this.logs = this.logGroup();

    this.distribution = new SubdomainCloudfront(this, 'subdomain-cloudfront', {
      certificate: this.certificate(),
      hostedZone: this.props.hostedzone,
      loadbalancer: this.props.service.loadbalancer.alb,
      subdomain: CorsaZgwService.SUBDOMAIN,
    });

    this.databaseCredentials = SecretParameter.fromSecretNameV2(this, 'database-credentials', Statics._ssmDatabaseCredentials);

    this.secretKey = new SecretParameter(this, 'secret-key', {
      description: 'Secret for CorsaZGW Service - ' + id,
      generateSecretString: {
        excludePunctuation: true,
      },
    });

    this.setupService();
  }

  private getEnvironmentSecrets(): Record<string, Secret> {
    return {
      DB_PASSWORD: Secret.fromSecretsManager(this.databaseCredentials, 'password'),
      DB_USERNAME: Secret.fromSecretsManager(this.databaseCredentials, 'username'),
      APP_KEY: Secret.fromSecretsManager(this.secretKey),
    };
  }

  private getEnvironmentVariables(): Record<string, string> {
    return {

      // DB settings
      DB_CONNECTION: 'pgsql',
      DB_HOST: StringParameter.valueForStringParameter(this, Statics._ssmDatabaseHostname),
      DB_PORT: StringParameter.valueForStringParameter(this, Statics._ssmDatabasePort),
      DB_DATABASE: Statics.databaseCorsaZgwDevService,

      // App settings
      APP_NAME: 'Corsa ZGW',
      APP_ENV: 'development',
      APP_DEBUG: this.props.serviceConfiguration.debug == true ? 'true' : 'false',
      APP_URL: `https://${this.props.hostedzone.zoneName}`,

      // Language
      APP_LOCALE: 'nl',
      APP_FALLBACK_LOCALE: 'en',
      APP_FAKER_LOCALE: 'en_US',

      // Other stuff?
      APP_MAINTENANCE_DRIVER: 'file',
      PHP_CLI_SERVER_WORKERS: '4',
      BCRYPT_ROUNDS: '12',

      // Logging
      LOG_CHANNEL: 'stack',
      LOG_STACK: 'single',
      LOG_DEPRECATIONS_CHANNEL: 'null',
      LOG_LEVEL: this.props.serviceConfiguration.logLevel.toLocaleLowerCase(),

      // Cache store
      CACHE_STORE: 'file',

    };

  }

  private setupService() {

    const VOLUME_NAME = 'tmp';
    const task = this.serviceFactory.createTaskDefinition('main', {
      volumes: [{ name: VOLUME_NAME }],
      cpu: this.props.serviceConfiguration.taskSize?.cpu ?? '256',
      memoryMiB: this.props.serviceConfiguration.taskSize?.memory ?? '512',
    });

    // Configuration container
    const initContainer = task.addContainer('setup', {
      image: ContainerImage.fromEcrRepository(this.props.repository, this.props.serviceConfiguration.imageTag),
      command: ['/init.sh'],
      essential: false,
      readonlyRootFilesystem: false,
      logging: new AwsLogDriver({
        streamPrefix: 'setup',
        logGroup: this.logs,
      }),
      secrets: this.getEnvironmentSecrets(),
      environment: this.getEnvironmentVariables(),
    });

    // Main service container
    const container = task.addContainer('main', {
      image: ContainerImage.fromEcrRepository(this.props.repository, this.props.serviceConfiguration.imageTag),
      healthCheck: {
        command: ['CMD-SHELL', 'exit 0'], // TODO implement normal heathcheck
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
      readonlyRootFilesystem: false, // TODO make this true for security reasons
      secrets: this.getEnvironmentSecrets(),
      environment: this.getEnvironmentVariables(),
      essential: true,
      logging: new AwsLogDriver({
        streamPrefix: 'corsa-zgw',
        logGroup: this.logs,
      }),
    });
    container.addContainerDependencies({
      container: initContainer,
      condition: ContainerDependencyCondition.COMPLETE,
    });

    const service = this.serviceFactory.createService({
      id: 'corsa-zgw',
      task: task,
      domain: `${CorsaZgwService.SUBDOMAIN}.${this.props.hostedzone.zoneName}`,
      options: {
        desiredCount: 1,
      },
      // healthCheckPath: '/admin', // Not configurabel yet while using subdomain
    });
    this.setupConnectivity('corsa-zgw', service.connections.securityGroups);
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

    // Allow db connectivity
    const dbSecurityGroupId = StringParameter.valueForStringParameter(this, Statics._ssmDatabaseSecurityGroup);
    const dbSecurityGroup = SecurityGroup.fromSecurityGroupId(this, `db-security-group-${id}`, dbSecurityGroupId);
    const dbPort = StringParameter.valueForStringParameter(this, Statics._ssmDatabasePort);
    serviceSecurityGroups.forEach(serviceSecurityGroup => {
      dbSecurityGroup.connections.allowFrom(serviceSecurityGroup, Port.tcp(Token.asNumber(dbPort)));
    });

    // Allow redis connectivity
    const cachePort = this.props.redis.db.attrRedisEndpointPort;
    serviceSecurityGroups.forEach(serviceSecurityGroup => {
      dbSecurityGroup.connections.allowFrom(serviceSecurityGroup, Port.tcp(Token.asNumber(dbPort)));
      this.props.redis.db.vpcSecurityGroupIds?.forEach((cacheSecurityGroupId, index) => {
        const cacheSecurityGroup = SecurityGroup.fromSecurityGroupId(this, `cache-security-group-${id}-${index}`, cacheSecurityGroupId);
        cacheSecurityGroup.connections.allowFrom(serviceSecurityGroup, Port.tcp(Token.asNumber(cachePort)));
      });
    });
  }


  private allowAccessToSecrets(role: IRole) {
    this.databaseCredentials.grantRead(role);
    // this.superuserCredentials.grantRead(role);
    // this.secretKey.grantRead(role);
  }

  /**
   * Get the certificate ARN from parameter store in us-east-1
   * TODO find a better place for this
   * @returns string Certificate ARN
   */
  private certificate() {
    const parameters = new RemoteParameters(this, 'params', {
      path: `${Statics.ssmWildcardCertificateArn}/`,
      region: 'us-east-1',
      timeout: Duration.seconds(10),
    });
    const certificateArn = parameters.get(Statics.ssmCertificateArn);
    return Certificate.fromCertificateArn(this, 'cert', certificateArn);
  }

}
