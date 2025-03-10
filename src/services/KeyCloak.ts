import { Duration, Token } from 'aws-cdk-lib';
import { ISecurityGroup, Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { AwsLogDriver, ContainerImage, Protocol, Secret } from 'aws-cdk-lib/aws-ecs';
import { IRole } from 'aws-cdk-lib/aws-iam';
import { Key } from 'aws-cdk-lib/aws-kms';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { IHostedZone } from 'aws-cdk-lib/aws-route53';
import { ISecret, Secret as SecretParameter } from 'aws-cdk-lib/aws-secretsmanager';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { KeyCloakConfiguration } from '../Configuration';
import { EcsServiceFactory, EcsServiceFactoryProps } from '../constructs/EcsServiceFactory';
import { Statics } from '../Statics';
import { Utils } from '../Utils';

interface KeyCloakServiceProps {
  readonly service: EcsServiceFactoryProps;
  readonly path: string;
  readonly hostedzone: IHostedZone;
  readonly alternativeDomainNames?: string[];
  /**
   * The configuration for the open configuration installation
   */
  readonly serviceConfiguration: KeyCloakConfiguration;
  readonly key: Key;
}

export class KeyCloakService extends Construct {

  private readonly logs: LogGroup;
  private readonly props: KeyCloakServiceProps;
  private readonly serviceFactory: EcsServiceFactory;
  private readonly databaseCredentials: ISecret;


  constructor(scope: Construct, id: string, props: KeyCloakServiceProps) {
    super(scope, id);
    this.props = props;
    this.serviceFactory = new EcsServiceFactory(this, props.service);
    this.logs = this.logGroup();

    this.databaseCredentials = SecretParameter.fromSecretNameV2(this, 'database-credentials', Statics._ssmDatabaseCredentials);

    // this.setupConfigurationService();
    this.setupService();
  }

  private getEnvironmentConfiguration() {
    const trustedDomains = this.props.alternativeDomainNames?.map(a => a) ?? [];
    trustedDomains.push(this.props.hostedzone.zoneName);
    const databaseHostname = StringParameter.valueForStringParameter(this, Statics._ssmDatabaseHostname);
    const databasePort = StringParameter.valueForStringParameter(this, Statics._ssmDatabasePort);
    return {
      ALLOWED_HOSTS: '*', // TODO make stricter at some point

      KEYCLOAK_ADMIN: 'admin',
      KEYCLOAK_ADMIN_PASSWORD: 'admin',
      KC_DB: 'postgres',
      KC_DB_URL: `jdbc:postgresql://${databaseHostname}:${databasePort}/${Statics.databaseKeyCloak}`,
      KC_FEATURES: 'token-exchange,admin-fine-grained-authz',
      KC_HTTP_RELATIVE_PATH: '/' + this.props.path,
      KC_PROXY_HEADERS: 'forwarded',
      KC_HTTP_ENABLED: 'true',
      KC_HOSTNAME: 'mijn-services.accp.nijmegen.nl',

      LOG_LEVEL: this.props.serviceConfiguration.logLevel,
      LOG_REQUESTS: Utils.toPythonBooleanString(this.props.serviceConfiguration.debug, false),
      DEBUG: Utils.toPythonBooleanString(this.props.serviceConfiguration.debug, false),


      // Conectivity
      CORS_ALLOW_ALL_ORIGINS: 'True', // TODO make strickter at some point
      CSRF_TRUSTED_ORIGINS: trustedDomains.map(domain => `https://${domain}`).join(','),

    };
  }

  private getSecretConfiguration() {
    const secrets = {
      KC_DB_PASSWORD: Secret.fromSecretsManager(this.databaseCredentials, 'password'),
      KC_DB_USERNAME: Secret.fromSecretsManager(this.databaseCredentials, 'username'),

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

    // Main service container
    // const container =
    task.addContainer('main', {
      image: ContainerImage.fromRegistry(this.props.serviceConfiguration.image),
      healthCheck: {
        command: ['CMD-SHELL', 'echo'],
        interval: Duration.seconds(10),
        startPeriod: Duration.seconds(30),
      },
      command: ['start-dev'],
      portMappings: [
        {
          containerPort: this.props.service.port,
          hostPort: this.props.service.port,
          protocol: Protocol.TCP,
        },
      ],
      readonlyRootFilesystem: false, // moet uiteindelijk op true, maar voor nu niet
      secrets: this.getSecretConfiguration(),
      environment: this.getEnvironmentConfiguration(),
      logging: new AwsLogDriver({
        streamPrefix: 'main',
        logGroup: this.logs,
      }),

    });
    // this.serviceFactory.attachEphemeralStorage(container, VOLUME_NAME, '/tmp', '/app/log');

    // 1st Filesystem write access - initialization container
    // this.serviceFactory.setupWritableVolume(VOLUME_NAME, task, this.logs, container, '/tmp', '/app/log');

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

  //   private setupConfigurationService() {
  //     const VOLUME_NAME = 'tmp';
  //     const task = this.serviceFactory.createTaskDefinition('setup', {
  //       volumes: [{ name: VOLUME_NAME }],
  //     });

  //     // Configuration container
  //     const initContainer = task.addContainer('setup', {
  //       image: ContainerImage.fromRegistry(this.props.serviceConfiguration.image),
  //       command: ['python', 'src/manage.py', 'createsuperuser', '--no-input', '--skip-checks'], // See django docs
  //       readonlyRootFilesystem: true,
  //       essential: true,
  //       logging: new AwsLogDriver({
  //         streamPrefix: 'setup',
  //         logGroup: this.logs,
  //       }),
  //       secrets: this.getSecretConfiguration(),
  //       environment: this.getEnvironmentConfiguration(),
  //     });
  //     this.serviceFactory.attachEphemeralStorage(initContainer, VOLUME_NAME, '/tmp', '/app/log', '/app/setup_configuration');

  //     // Filesystem write access - initialization container
  //     this.serviceFactory.setupWritableVolume(VOLUME_NAME, task, this.logs, initContainer, '/tmp', '/app/log', '/app/setup_configuration');

  //     // Scheduel a task in the past (so we can run it manually)
  //     const rule = new Rule(this, 'schedule-setup', {
  //       schedule: Schedule.cron({
  //         year: '2020',
  //       }),
  //       description: 'Rule to run setup configuration for KeyCloak-api (manually)',
  //     });
  //     const ecsTask = new EcsTask({
  //       cluster: this.props.service.cluster,
  //       taskDefinition: task,
  //     });
  //     rule.addTarget(ecsTask);

  //     // Setup connectivity
  //     this.setupConnectivity('setup', ecsTask.securityGroups ?? []);
  //     this.allowAccessToSecrets(task.executionRole!);
  //   }


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

  private allowAccessToSecrets(role: IRole) {
    this.databaseCredentials.grantRead(role);

  }


}
