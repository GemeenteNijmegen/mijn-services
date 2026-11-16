import { Duration, Token } from 'aws-cdk-lib';
import { ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import { ISecurityGroup, Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import {
  AwsLogDriver,
  Compatibility,
  ContainerImage,
  FargateService,
  Protocol,
  Secret,
  TaskDefinition,
} from 'aws-cdk-lib/aws-ecs';
import { Protocol as AlbProtocol, ListenerCondition } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Key } from 'aws-cdk-lib/aws-kms';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { DatabaseInstance } from 'aws-cdk-lib/aws-rds';
import { IHostedZone } from 'aws-cdk-lib/aws-route53';
import {
  ISecret,
  Secret as SecretParameter,
} from 'aws-cdk-lib/aws-secretsmanager';
import { DnsRecordType } from 'aws-cdk-lib/aws-servicediscovery';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { IKOConfiguration } from '../ConfigurationInterfaces';
import {
  EcsServiceFactoryProps,
  ECSServiceUtils,
} from '../constructs/EcsServiceFactory';
import { CacheDatabase } from '../constructs/Redis';
import { SubdomainCloudfront } from '../constructs/SubdomainCloudfront';
import { AdditionalDatabase } from '../custom-resources/database/AdditionalDatabase';
import { Statics } from '../Statics';

interface IKOServiceProps {
  readonly service: EcsServiceFactoryProps;
  readonly hostedzone: IHostedZone;
  /**
   * The configuration for this IKO instance
   */
  readonly serviceConfiguration: IKOConfiguration;
  readonly key: Key;
  readonly certificate: ICertificate;
  readonly cache: CacheDatabase;
}

/**
 * Integraal Klant & Objectbeeld (IKO)
 * Spring Boot application with its own database, using the shared
 * redis cluster for caching and the shared keycloak for authentication.
 */
export class IKOService extends Construct {

  private static readonly PORT = 8080;
  /**
   * Spring Boot actuator (health probes and metrics) listens on a separate
   * port so it is not exposed through the loadbalancer listener.
   */
  private static readonly MANAGEMENT_PORT = 9090;

  private readonly logs: LogGroup;
  private readonly props: IKOServiceProps;

  private databaseConnectionString: string;
  private databaseUserCredentials: ISecret;

  private readonly keycloakClientCredentials: ISecret;
  private readonly cryptoKey: ISecret;

  constructor(scope: Construct, id: string, props: IKOServiceProps) {
    super(scope, id);
    this.props = props;

    this.logs = this.logGroup();
    this.setupDatabase();
    this.keycloakClientCredentials = this.setupKeycloakClientCredentials();
    this.cryptoKey = this.setupCryptoKey();

    this.setupService();
  }

  private getEnvironmentConfiguration() {
    const realm = this.props.serviceConfiguration.keycloakRealm ?? 'iko';
    const keycloakIssuerUri = `https://keycloak.${this.props.hostedzone.zoneName}/realms/${realm}`;
    const cache = this.props.cache.db;

    return {
      SERVER_PORT: IKOService.PORT.toString(),
      LOGGING_LEVEL_COM_RITENSE_IKO: this.props.serviceConfiguration.logLevel,

      // Actuator
      MANAGEMENT_SERVER_PORT: IKOService.MANAGEMENT_PORT.toString(),
      MANAGEMENT_ENDPOINT_HEALTH_PROBES_ENABLED: 'true',
      MANAGEMENT_ENDPOINTS_WEB_EXPOSURE_INCLUDE: 'health,prometheus',

      // Database
      SPRING_DATASOURCE_URL: this.databaseConnectionString,

      // Redis
      SPRING_DATA_REDIS_HOST: cache.attrRedisEndpointAddress,
      SPRING_DATA_REDIS_PORT: cache.attrRedisEndpointPort,
      SPRING_DATA_REDIS_DATABASE: this.props.serviceConfiguration.redisDatabaseNumber.toString(),

      // OAuth2 (admin login and API tokens)
      SPRING_SECURITY_OAUTH2_CLIENT_PROVIDER_KEYCLOAK_ISSUERURI: keycloakIssuerUri,
      SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_KEYCLOAK_CLIENTID: this.props.serviceConfiguration.keycloakClientId ?? 'iko',
      SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_ISSUERURI: keycloakIssuerUri,
      SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_AUTHORITIESCLAIMNAME: "['resource_access']['iko']['roles']",
      SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_AUDIENCES: 'iko',
      IKO_SECURITY_ADMIN_ROLESCLAIM: 'roles',
      IKO_SECURITY_ADMIN_AUTHORITIES: 'ROLE_ADMIN',
      IKO_SECURITY_ADMIN_SESSION_TIMEOUT: '30m',
      IKO_SECURITY_ADMIN_SESSION_WARNINGBEFORE: '2m',
      SERVER_SERVLET_SESSION_COOKIE_SECURE: 'true',

      // Logging and debugging
      IKO_LOGGING_DB_ENABLED: 'false',
      IKO_DEBUG_SHOW_HEADERS: this.props.serviceConfiguration.debug ? 'true' : 'false',
    };
  }

  private getSecretConfiguration() {
    return {
      SPRING_DATASOURCE_USERNAME: Secret.fromSecretsManager(this.databaseUserCredentials, 'username'),
      SPRING_DATASOURCE_PASSWORD: Secret.fromSecretsManager(this.databaseUserCredentials, 'password'),
      SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_KEYCLOAK_CLIENTSECRET: Secret.fromSecretsManager(this.keycloakClientCredentials, 'secret'),
      IKO_CRYPTO_KEY: Secret.fromSecretsManager(this.cryptoKey, 'key'),
    };
  }

  private setupService() {

    // Setup task
    const task = new TaskDefinition(this, 'iko-task', {
      cpu: this.props.serviceConfiguration.taskSize?.cpu ?? '1024',
      memoryMiB: this.props.serviceConfiguration.taskSize?.memory ?? '2048',
      compatibility: Compatibility.FARGATE,
    });

    // Add the container
    task.addContainer('iko', {
      image: ContainerImage.fromRegistry(this.props.serviceConfiguration.image),
      portMappings: [
        {
          containerPort: IKOService.PORT,
          hostPort: IKOService.PORT,
          protocol: Protocol.TCP,
        },
        {
          containerPort: IKOService.MANAGEMENT_PORT,
          hostPort: IKOService.MANAGEMENT_PORT,
          protocol: Protocol.TCP,
        },
      ],
      readonlyRootFilesystem: false, // Allow ECS Exec
      secrets: this.getSecretConfiguration(),
      environment: this.getEnvironmentConfiguration(),
      logging: new AwsLogDriver({
        streamPrefix: 'iko',
        logGroup: this.logs,
      }),
    });
    ECSServiceUtils.allowExecutingCommands(task);

    // Setup the service
    const service = new FargateService(this, 'iko-service', {
      cluster: this.props.service.cluster,
      taskDefinition: task,
      cloudMapOptions: { // Expose for intercontainer communication
        cloudMapNamespace: this.props.service.namespace,
        containerPort: IKOService.PORT,
        dnsRecordType: DnsRecordType.SRV,
        dnsTtl: Duration.seconds(60),
      },
      desiredCount: this.props.serviceConfiguration.taskSize?.desiredTaskCount ?? 1,
      enableExecuteCommand: true,
      healthCheckGracePeriod: Duration.seconds(300), // Spring Boot + Camel take a few minutes to start
    });
    this.setupConnectivity('iko', service.connections.securityGroups);

    // Attach to loadbalancer
    const fqdomain = `${this.props.serviceConfiguration.subdomain}.${this.props.hostedzone.zoneName}`;
    this.props.service.loadbalancer.listener.addTargets(this.props.serviceConfiguration.id, {
      conditions: [ListenerCondition.hostHeaders([fqdomain])],
      healthCheck: {
        enabled: true,
        path: '/actuator/health/readiness',
        port: IKOService.MANAGEMENT_PORT.toString(),
        healthyHttpCodes: '200',
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 6,
        timeout: Duration.seconds(10),
        interval: Duration.seconds(15),
        protocol: AlbProtocol.HTTP,
      },
      port: IKOService.PORT,
      targets: [service],
      priority: this.props.serviceConfiguration.loadbalancerPriority,
      deregistrationDelay: Duration.minutes(1),
    });

    // The health check runs on the management port, which is not the target port
    service.connections.allowFrom(this.props.service.loadbalancer.alb, Port.tcp(IKOService.MANAGEMENT_PORT));

    new SubdomainCloudfront(this, 'subdomain', {
      certificate: this.props.certificate,
      hostedZone: this.props.hostedzone,
      loadbalancer: this.props.service.loadbalancer.alb,
      subdomain: this.props.serviceConfiguration.subdomain,
    });

    return service;
  }

  private setupDatabase() {

    const databaseName = this.props.serviceConfiguration.databaseName;

    // Import admin credentials
    const dbAdmin = SecretParameter.fromSecretNameV2(this, 'db-admin', Statics._ssmDatabaseCredentials);

    // Import the RDS instance
    const hostname = StringParameter.valueForStringParameter(this, Statics._ssmDatabaseHostname);
    const port = StringParameter.valueForStringParameter(this, Statics._ssmDatabasePort);

    // Import the RDS instance security group
    const dbSecurityGroupId = StringParameter.valueForStringParameter(this, Statics._ssmDatabaseSecurityGroup);
    const dbSecurityGroup = SecurityGroup.fromSecurityGroupId(this, 'db-security-group', dbSecurityGroupId);

    // Create credentials for this IKO instance
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
      databaseName: databaseName,
      dbUserCredentialsSecret: this.databaseUserCredentials,
      instance: dbInstance,
      vpc: this.props.service.cluster.vpc,
    });

    this.databaseConnectionString = `jdbc:postgresql://${hostname}:${port}/${databaseName}`;
  }

  /**
   * Client secret for the keycloak client used for admin login.
   * Keycloak generates the actual secret, copy it into this secret after creating the client.
   */
  private setupKeycloakClientCredentials() {
    return new SecretParameter(this, 'keycloak-client-credentials', {
      description: `Keycloak client secret for IKO (${this.props.serviceConfiguration.id})`,
      generateSecretString: {
        excludePunctuation: true,
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: 'secret',
      },
    });
  }

  /**
   * AES key used by IKO to encrypt connector configuration in its database.
   * IKO expects a base64 encoded 256 bit key, the generated value is a placeholder:
   * replace it with the output of `openssl rand -base64 32` before first use.
   */
  private setupCryptoKey() {
    return new SecretParameter(this, 'crypto-key', {
      description: `AES-256 key (base64) for encrypting IKO connector configuration (${this.props.serviceConfiguration.id})`,
      generateSecretString: {
        excludePunctuation: true,
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: 'key',
      },
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
    const cachePort = this.props.cache.db.attrRedisEndpointPort;
    serviceSecurityGroups.forEach(serviceSecurityGroup => {
      dbSecurityGroup.connections.allowFrom(serviceSecurityGroup, Port.tcp(Token.asNumber(dbPort)));
      this.props.cache.db.vpcSecurityGroupIds?.forEach((cacheSecurityGroupId, index) => {
        const cacheSecurityGroup = SecurityGroup.fromSecurityGroupId(this, `cache-security-group-${id}-${index}`, cacheSecurityGroupId);
        cacheSecurityGroup.connections.allowFrom(serviceSecurityGroup, Port.tcp(Token.asNumber(cachePort)));
      });
    });
  }

}
