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
import { GZACConfiguration } from '../ConfigurationInterfaces';
import {
  EcsServiceFactory,
  EcsServiceFactoryProps,
  ECSServiceUtils,
} from '../constructs/EcsServiceFactory';
import { SubdomainCloudfront } from '../constructs/SubdomainCloudfront';
import { AdditionalDatabase } from '../custom-resources/database/AdditionalDatabase';
import { Statics } from '../Statics';

interface GZACServiceProps {
  readonly service: EcsServiceFactoryProps;
  readonly hostedzone: IHostedZone;
  /**
   * The configuration for the open configuration installation
   */
  readonly serviceConfiguration: GZACConfiguration;
  readonly key: Key;
  readonly certificate: ICertificate;
}

export class GZACService extends Construct {

  private static readonly RABBIT_MQ_PORT = 5672;

  private readonly logs: LogGroup;
  private readonly props: GZACServiceProps;
  private readonly serviceFactory: EcsServiceFactory;

  private databaseConnectionString: string;
  private databaseUserCredentials: ISecret;

  private readonly gzacApiCredentials: ISecret;
  private readonly pluginEncryptionSecret: ISecret;

  constructor(scope: Construct, id: string, props: GZACServiceProps) {
    super(scope, id);
    this.props = props;

    // Setup
    this.logs = this.logGroup();
    this.setupDatabase();
    this.gzacApiCredentials = this.setupGzacApiCredentials();
    this.pluginEncryptionSecret = this.setupPluginEncryptionSecret();

    // Create services
    const gzacRabbitMQService = this.setupRabbitMqService();
    const service = this.setupService();

    // Allow services to cummunicate
    gzacRabbitMQService.connections.allowFrom(service.connections, Port.tcp(GZACService.RABBIT_MQ_PORT));
  }

  private getEnvironmentConfiguration() {
    const keycloakBaseUrl = `https://keycloak.${this.props.hostedzone.zoneName}`;
    const keycloakIssuerUri = `${keycloakBaseUrl}/realms/gzac`;
    const frontendDomain = `https://gzac.${this.props.hostedzone.zoneName}`;

    return {
      SPRING_PROFILES_ACTIVE: 'docker',
      SPRING_DATASOURCE_URL: this.databaseConnectionString,
      SPRING_DATASOURCE_NAME: this.props.serviceConfiguration.databaseName,

      // OAuth2 Resource Server (JWT validation)
      SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_ISSUERURI: keycloakIssuerUri,
      SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_JWKSETURI: `${keycloakIssuerUri}/protocol/openid-connect/certs`,

      // OAuth2 Client Provider (Keycloak issuer URIs)
      SPRING_SECURITY_OAUTH2_CLIENT_PROVIDER_KEYCLOAKJWT_ISSUERURI: keycloakIssuerUri,
      SPRING_SECURITY_OAUTH2_CLIENT_PROVIDER_KEYCLOAKAPI_ISSUERURI: keycloakIssuerUri,

      // OAuth2 Client Registration
      SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_KEYCLOAKJWT_CLIENTID: 'gzac-frontend',
      SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_KEYCLOAKAPI_CLIENTID: 'valtimo-user-m2m-client',
      SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_KEYCLOAKAPI_AUTHORIZATIONGRANTTYPE: 'authorization_code',
      SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_KEYCLOAKAPI_SCOPE: 'openid',

      // RabbitMQ
      SPRING_RABBITMQ_HOST: `${this.props.serviceConfiguration.id}-rabbit-mq.mijn-services.local`,
      SPRING_RABBITMQ_PORT: '5672',
      SPRING_RABBITMQ_USERNAME: 'guest',
      SPRING_RABBITMQ_PASSWORD: 'guest',

      // Valtimo / GZAC
      VALTIMO_APP_HOSTNAME: frontendDomain,
      VALTIMO_WEB_CORS_CORSCONFIGURATION_ALLOWEDORIGINS: frontendDomain,
      VALTIMO_WEB_CORS_CORSCONFIGURATION_ALLOWEDMETHODS: '*',
      VALTIMO_WEB_CORS_CORSCONFIGURATION_ALLOWEDHEADERS: '*',
      VALTIMO_WEB_CORS_PATHS: '/**',
    };
  }

  private getSecretConfiguration() {

    const params = this.setupParameters();

    const secrets = {
      SPRING_DATASOURCE_USERNAME: Secret.fromSecretsManager(this.databaseUserCredentials, 'username'),
      SPRING_DATASOURCE_PASSWORD: Secret.fromSecretsManager(this.databaseUserCredentials, 'password'),
      SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_KEYCLOAKAPI_CLIENTSECRET: Secret.fromSecretsManager(this.gzacApiCredentials, 'secret'),
      KEYCLOAK_RESOURCE: Secret.fromSecretsManager(this.gzacApiCredentials, 'username'),
      KEYCLOAK_CREDENTIALS_SECRET: Secret.fromSecretsManager(this.gzacApiCredentials, 'secret'),
      KEYCLOAK_REALM: Secret.fromSsmParameter(params.keycloakRealm),
      KEYCLOAK_AUTH_SERVER_URL: Secret.fromSsmParameter(params.keycloakUrl),
      VALTIMO_PLUGIN_ENCRYPTIONSECRET: Secret.fromSecretsManager(this.pluginEncryptionSecret, 'key'),
      OPERATON_BPM_ADMINUSER_PASSWORD: Secret.fromSecretsManager(this.gzacApiCredentials, 'secret'),
    };
    return secrets;
  }

  private setupService() {

    // Setup task
    const task = new TaskDefinition(this, 'gzac-backend-task', {
      cpu: this.props.serviceConfiguration.taskSize?.cpu ?? '512',
      memoryMiB: this.props.serviceConfiguration.taskSize?.memory ?? '1024',
      compatibility: Compatibility.FARGATE,
    });

    // Add the backend container
    task.addContainer('gzac-backend', {
      image: ContainerImage.fromRegistry(this.props.serviceConfiguration.image),
      healthCheck: {
        command: ['CMD-SHELL', 'exit 0'],
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
      readonlyRootFilesystem: false, // Allow ECS Exec
      secrets: this.getSecretConfiguration(),
      environment: this.getEnvironmentConfiguration(),
      logging: new AwsLogDriver({
        streamPrefix: 'gzac-backend',
        logGroup: this.logs,
      }),
    });
    ECSServiceUtils.allowExecutingCommands(task);

    // Setup the service
    const service = new FargateService(this, 'gzac-service', {
      cluster: this.props.service.cluster,
      taskDefinition: task,
      cloudMapOptions: { // Expose for intercontainer communication
        cloudMapNamespace: this.props.service.namespace,
        containerPort: this.props.service.port,
        dnsRecordType: DnsRecordType.SRV,
        dnsTtl: Duration.seconds(60),
      },
      desiredCount: this.props.serviceConfiguration.taskSize?.desiredTaskCount ?? 1,
      enableExecuteCommand: true,
      healthCheckGracePeriod: Duration.seconds(300), // GZAC needs 3-4 min to start
    });
    this.setupConnectivity('gzac-backend', service.connections.securityGroups);

    // Attach to loadbalancer
    const fqdomain = `${this.props.serviceConfiguration.subdomain}.${this.props.hostedzone.zoneName}`;
    this.props.service.loadbalancer.listener.addTargets(this.props.serviceConfiguration.id, {
      conditions: [ListenerCondition.hostHeaders([fqdomain])],
      healthCheck: {
        enabled: true,
        path: '/actuator/health/readiness',
        healthyHttpCodes: '200',
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 6,
        timeout: Duration.seconds(10),
        interval: Duration.seconds(15),
        protocol: AlbProtocol.HTTP,
      },
      port: this.props.service.port,
      targets: [service],
      priority: this.props.serviceConfiguration.loadbalancerPriority,
      deregistrationDelay: Duration.minutes(1),
    });

    new SubdomainCloudfront(this, 'subdomain', {
      certificate: this.props.certificate,
      hostedZone: this.props.hostedzone,
      loadbalancer: this.props.service.loadbalancer.alb,
      subdomain: this.props.serviceConfiguration.subdomain,
    });

    return service;
  }

  /**
   * Backend requires a rabbitmq service for queueing
   * @returns
   */
  private setupRabbitMqService() {

    // Setup task
    const task = new TaskDefinition(this, 'rabbit-mq-task', {
      cpu: '512',
      memoryMiB: '1024',
      compatibility: Compatibility.FARGATE,
    });

    // Add the container
    task.addContainer('gzac-rabbit-mq', {
      image: ContainerImage.fromAsset('./src/containers/gzac-rabbitmq'),
      logging: new AwsLogDriver({
        streamPrefix: 'gzac-rabbit-mq',
        logGroup: this.logs,
      }),
      readonlyRootFilesystem: true,
      portMappings: [
        {
          containerPort: GZACService.RABBIT_MQ_PORT,
          hostPort: GZACService.RABBIT_MQ_PORT,
          protocol: Protocol.TCP,
        },
      ],
    });


    // Setup the service
    const service = new FargateService(this, 'rabbit-mq', {
      cluster: this.props.service.cluster,
      taskDefinition: task,
      cloudMapOptions: { // Expose for intercontainer communication
        cloudMapNamespace: this.props.service.namespace,
        containerPort: GZACService.RABBIT_MQ_PORT,
        name: `${this.props.serviceConfiguration.id}-rabbit-mq`,
        dnsRecordType: DnsRecordType.SRV,
        dnsTtl: Duration.seconds(60),
      },
      desiredCount: this.props.serviceConfiguration.taskSize?.desiredTaskCount ?? 1,
      enableExecuteCommand: false,
      healthCheckGracePeriod: Duration.seconds(120), // Give time to start
    });

    return service;
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
    serviceSecurityGroups.forEach((serviceSecurityGroup) => {
      dbSecurityGroup.connections.allowFrom(
        serviceSecurityGroup,
        Port.tcp(Token.asNumber(dbPort)),
      );
    });
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

    // Create credentials for this open-zaak instance
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

    // Set the connection string for the java containers
    this.databaseConnectionString = `jdbc:postgresql://${hostname}:${port}/${databaseName}`;
  }


  private setupGzacApiCredentials() {
    return new SecretParameter(this, 'gzac-backend-m2m-credentials', {
      description: 'Credentials for GZAC Backend M-2-M',
      generateSecretString: {
        excludePunctuation: true,
        secretStringTemplate: JSON.stringify({
          username: 'valtimo-user-m2m-client',
        }),
        generateStringKey: 'secret',
      },
    });
  }

  private setupPluginEncryptionSecret() {
    return new SecretParameter(this, 'gzac-plugin-encryption-secret', {
      description: 'AES-256 encryption key for GZAC plugin properties (must be exactly 32 bytes)',
      generateSecretString: {
        excludePunctuation: true,
        excludeUppercase: false,
        includeSpace: false,
        passwordLength: 32,
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: 'key',
      },
    });
  }

  private setupParameters() {

    const keycloakUrl = new StringParameter(this, `${this.props.serviceConfiguration.id}-keycloak-url`, {
      stringValue: `https://keycloak.${this.props.hostedzone.zoneName}`,
      description: 'Keycloak URL used by the gzac backend',
      parameterName: `/${Statics.projectName}/${this.props.serviceConfiguration.id}/backend/keycloak-url`,
    });

    const keycloakRealm = new StringParameter(this, `${this.props.serviceConfiguration.id}-keycloak-realm`, {
      stringValue: 'gzac',
      description: 'Keycloak realm used by the gzac backend',
      parameterName: `/${Statics.projectName}/${this.props.serviceConfiguration.id}/backend/keycloak-realm`,
    });

    return {
      keycloakRealm,
      keycloakUrl,
    };

  }

}
