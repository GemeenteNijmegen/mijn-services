import { Token } from 'aws-cdk-lib';
import { ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import { ISecurityGroup, Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { AwsLogDriver, ContainerImage, Protocol, Secret } from 'aws-cdk-lib/aws-ecs';
import { Key } from 'aws-cdk-lib/aws-kms';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { DatabaseInstance } from 'aws-cdk-lib/aws-rds';
import { IHostedZone } from 'aws-cdk-lib/aws-route53';
import { ISecret, Secret as SecretParameter } from 'aws-cdk-lib/aws-secretsmanager';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { KeyCloakConfigurationV2 } from '../ConfigurationInterfaces';
import { EcsServiceFactory, EcsServiceFactoryProps } from '../constructs/EcsServiceFactory';
import { SubdomainCloudfront } from '../constructs/SubdomainCloudfront';
import { AdditionalDatabase } from '../custom-resources/database/AdditionalDatabase';
import { Statics } from '../Statics';

interface KeyCloakServiceV2Props {
  readonly service: EcsServiceFactoryProps;
  readonly hostedzone: IHostedZone;
  readonly serviceConfiguration: KeyCloakConfigurationV2;
  readonly key: Key;
  readonly certificate: ICertificate;
}

export class KeyCloakServiceV2 extends Construct {

  static readonly PORT = 8080;

  private readonly logs: LogGroup;
  private readonly props: KeyCloakServiceV2Props;
  private readonly serviceFactory: EcsServiceFactory;

  private databaseUserCredentials: ISecret;
  private readonly keyCloakAdminCredentials: ISecret;


  constructor(scope: Construct, id: string, props: KeyCloakServiceV2Props) {
    super(scope, id);
    this.props = props;
    this.serviceFactory = new EcsServiceFactory(this, props.service);
    this.logs = this.logGroup();

    this.keyCloakAdminCredentials = this.keycloakAdminCredentials();

    this.setupDatabase();
    this.setupService();
    this.setupCloudFrontSubdomain();
  }

  private getEnvironmentConfiguration() {
    const databaseHostname = StringParameter.valueForStringParameter(this, Statics._ssmDatabaseHostname);
    const databasePort = StringParameter.valueForStringParameter(this, Statics._ssmDatabasePort);

    return {
      KC_DB: 'postgres', // Database driver
      KC_DB_URL: `jdbc:postgresql://${databaseHostname}:${databasePort}/${this.props.serviceConfiguration.databaseName}`,
      KC_FEATURES: 'token-exchange,admin-fine-grained-authz',
      KC_PROXY_HEADERS: 'forwarded',
      KC_HTTP_ENABLED: 'true',
      KC_HOSTNAME: `${this.props.serviceConfiguration.subdomain}.${this.props.hostedzone.zoneName}`,
      KC_HEALTH_ENABLED: 'true',
      KC_LOG_LEVEL: this.props.serviceConfiguration.logLevel,
    };
  }

  private getSecretConfiguration() {
    const secrets = {
      KC_DB_PASSWORD: Secret.fromSecretsManager(this.databaseUserCredentials, 'password'),
      KC_DB_USERNAME: Secret.fromSecretsManager(this.databaseUserCredentials, 'username'),
      KEYCLOAK_ADMIN_PASSWORD: Secret.fromSecretsManager(this.keyCloakAdminCredentials, 'secret'),
      KEYCLOAK_ADMIN: Secret.fromSecretsManager(this.keyCloakAdminCredentials, 'username'),
    };
    return secrets;
  }


  private setupService() {
    const VOLUME_NAME = 'tmp';
    const task = this.serviceFactory.createTaskDefinition('main', {
      volumes: [{ name: VOLUME_NAME }],
      cpu: '512',
      memoryMiB: '1024',
    });

    task.addContainer('main', {
      image: ContainerImage.fromRegistry(this.props.serviceConfiguration.image),
      // healthCheck: {
      //   command: ['CMD-SHELL', 'curl --head -fsS http://localhost:9000/health/ready || exit 1'],
      //   interval: Duration.seconds(10),
      //   startPeriod: Duration.seconds(30),
      // },
      command: ['start-dev'],
      portMappings: [
        {
          containerPort: KeyCloakServiceV2.PORT,
          hostPort: KeyCloakServiceV2.PORT,
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

    const service = this.serviceFactory.createService({
      id: this.props.serviceConfiguration.id,
      task: task,
      healthCheckPath: '/health/ready',
      domain: `${this.props.serviceConfiguration.subdomain}.${this.props.hostedzone.zoneName}`,
      options: {
        desiredCount: 1,
        enableExecuteCommand: true,
      },
    });
    this.serviceFactory.allowExecutingCommands(task);
    this.setupConnectivity('main', service.connections.securityGroups);
    return service;
  }

  private keycloakAdminCredentials() {
    return new SecretParameter(this, 'admin-credentials', {
      description: `Credentials for KeyCloak Admin user (keycloak: ${this.props.serviceConfiguration.id})`,
      generateSecretString: {
        excludePunctuation: true,
        secretStringTemplate: JSON.stringify({
          username: 'admin',
        }),
        generateStringKey: 'secret',
      },
    });
  }

  private setupDatabase() {

    // Import admin credentials
    const dbAdmin = SecretParameter.fromSecretNameV2(this, 'db-admin', Statics._ssmDatabaseCredentials);

    // Create credentials for this open-zaak instance
    this.databaseUserCredentials = new SecretParameter(this, 'db-credentials', {
      description: `Credentials for connecting to the ${this.props.serviceConfiguration.databaseName} database instance`,
      generateSecretString: {
        excludePunctuation: true,
        secretStringTemplate: JSON.stringify({
          username: this.props.serviceConfiguration.databaseName,
        }),
        generateStringKey: 'password',
      },
      secretName: Statics.databaseCredentialsName(this.props.serviceConfiguration.databaseName),
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
      databaseName: this.props.serviceConfiguration.databaseName,
      dbUserCredentialsSecret: this.databaseUserCredentials,
      instance: dbInstance,
      vpc: this.props.service.cluster.vpc,
    });
  }

  private setupCloudFrontSubdomain() {

    new SubdomainCloudfront(this, 'subdomain', {
      certificate: this.props.certificate,
      hostedZone: this.props.hostedzone,
      loadbalancer: this.props.service.loadbalancer.alb,
      subdomain: this.props.serviceConfiguration.subdomain,
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

  }


}
