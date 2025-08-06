import { Duration, RemovalPolicy, Token } from 'aws-cdk-lib';
import { ISecurityGroup, Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import {
  AwsLogDriver,
  ContainerImage,
  Protocol,
  Secret,
} from 'aws-cdk-lib/aws-ecs';
import { IRole } from 'aws-cdk-lib/aws-iam';
import { Key } from 'aws-cdk-lib/aws-kms';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
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
} from '../constructs/EcsServiceFactory';
import { Statics } from '../Statics';

interface GZACServiceProps {
  readonly service: EcsServiceFactoryProps;
  readonly path: string;
  readonly hostedzone: IHostedZone;
  readonly alternativeDomainNames?: string[];
  /**
   * The configuration for the open configuration installation
   */
  readonly serviceConfiguration: GZACConfiguration;
  readonly key: Key;
}

export class GZACService extends Construct {
  private readonly logs: LogGroup;
  private readonly props: GZACServiceProps;
  private readonly serviceFactory: EcsServiceFactory;
  private readonly databaseCredentials: ISecret;
  private readonly m2mCredentials: ISecret;
  private readonly dockerhubCredentials: ISecret;

  constructor(scope: Construct, id: string, props: GZACServiceProps) {
    super(scope, id);
    this.props = props;
    this.serviceFactory = new EcsServiceFactory(this, props.service);
    this.logs = this.logGroup();
    this.dockerhubCredentials = SecretParameter.fromSecretNameV2(this, 'docherhub-credentials', Statics.dockerhubCredentialsSecret);

    this.databaseCredentials = SecretParameter.fromSecretNameV2(
      this,
      'database-credentials',
      Statics._ssmDatabaseCredentials,
    );
    this.m2mCredentials = SecretParameter.fromSecretNameV2(
      this,
      'm2m-credentials',
      Statics._ssmGZACBackendM2MCredentials,
    );
    const gzacRabbitMQService = this.setupRabbitMqService();
    const service = this.setupService();
    gzacRabbitMQService.applyRemovalPolicy(RemovalPolicy.DESTROY);
    service.applyRemovalPolicy(RemovalPolicy.DESTROY);
    gzacRabbitMQService.connections.allowFrom(service.connections, Port.tcp(5672));
  }

  private getEnvironmentConfiguration() {
    const trustedDomains =
      this.props.alternativeDomainNames?.map((a) => a) ?? [];
    trustedDomains.push(this.props.hostedzone.zoneName);
    const databaseHostname = StringParameter.valueForStringParameter(
      this,
      Statics._ssmDatabaseHostname,
    );
    const databasePort = StringParameter.valueForStringParameter(
      this,
      Statics._ssmDatabasePort,
    );
    return {
      SPRING_PROFILES_ACTIVE: 'docker',
      SPRING_DATASOURCE_URL: `jdbc:postgresql://${databaseHostname}:${databasePort}/${Statics.databaseGZAC}`,
      SPRING_DATASOURCE_NAME: 'gzac',

      VALTIMO_APP_HOSTNAME: 'https://mijn-services.accp.nijmegen.nl/gzac',
      VALTIMO_CONNECTORENCRYPTION_SECRET: '579156b12b9a457a579156b12b9a457a',

      VALTIMO_OAUTH_PUBLIC_KEY:
        'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAooyECQIi6v4TLKOYWwXClDhJcrGcGfKZj7LQIgY/Ajm2nAKv5kiZRoS8GzMzIGKkkilAJyWQCoKlP//azHqzIxO6WZWCqGFxd04vK5JYujsiMMTNvTggfFSM7VxbzU/wv+aAEvBaGUMYp2Oamn5szzYzkzsowujvDZp+CE8ryZWTVmA+8WZE4aoU6VzfXmMDmPxvRXvktPRsJkA7hkv65TTJwUZF38goRg62kRD0hOP1sIy6vwKDSkjafLV1bYNBRiWXNReJNBXauhy74GeiHODGrI62NwUJXSgZ62cViPt6cx/3A7VBPLpEPnpnlZcIDfsFpSUuNEXc7HoLRuldbQIDAQAB',

      KEYCLOAK_REALM: 'valtimo',
      KEYCLOAK_AUTH_SERVER_URL:
        'https://mijn-services.accp.nijmegen.nl/keycloak',

      VALTIMO_WEB_CORS_CORSCONFIGURATION_ALLOWEDORIGINS: trustedDomains
        .map((domain) => `https://${domain}`)
        .join(','),
      VALTIMO_WEB_CORS_CORSCONFIGURATION_ALLOWEDMETHODS: '*',
      VALTIMO_WEB_CORS_CORSCONFIGURATION_ALLOWEDHEADERS: '*',
      VALTIMO_WEB_CORS_PATHS: '/**',
    };
  }

  private getSecretConfiguration() {
    const secrets = {
      SPRING_DATASOURCE_USERNAME: Secret.fromSecretsManager(
        this.databaseCredentials,
        'username',
      ),
      SPRING_DATASOURCE_PASSWORD: Secret.fromSecretsManager(
        this.databaseCredentials,
        'password',
      ),
      KEYCLOAK_RESOURCE: Secret.fromSecretsManager(
        this.m2mCredentials,
        'username',
      ),
      KEYCLOAK_CREDENTIALS_SECRET: Secret.fromSecretsManager(
        this.m2mCredentials,
        'secret',
      ),
    };
    return secrets;
  }

  private setupService() {
    const VOLUME_NAME = 'tmp';
    const task = this.serviceFactory.createTaskDefinition('gzac-backend', {
      volumes: [{ name: VOLUME_NAME }],
      cpu: '512',
      memoryMiB: '1024',
    });
    task.addContainer('gzac-backend', {
      image: ContainerImage.fromRegistry(this.props.serviceConfiguration.backendImage, {
        credentials: this.dockerhubCredentials,
      }),
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
      readonlyRootFilesystem: false,
      secrets: this.getSecretConfiguration(),
      environment: this.getEnvironmentConfiguration(),
      logging: new AwsLogDriver({
        streamPrefix: 'gzac-backend',
        logGroup: this.logs,
      }),
    });
    // this.serviceFactory.attachEphemeralStorage(container, VOLUME_NAME, '/tmp', '/app/log');

    // 1st Filesystem write access - initialization container
    // this.serviceFactory.setupWritableVolume(VOLUME_NAME, task, this.logs, container, '/tmp', '/app/log');

    const service = this.serviceFactory.createService({
      id: 'gzac',
      task: task,
      path: this.props.path,
      options: {
        desiredCount: 1,
      },
    });
    this.setupConnectivity('gzac-backend', service.connections.securityGroups);
    this.allowAccessToSecrets(service.taskDefinition.executionRole!);
    return service;
  }
  private setupRabbitMqService() {
    const task = this.serviceFactory.createTaskDefinition('gzac-rabbit-mq');
    task.addContainer('gzac-rabbit-mq', {
      image: ContainerImage.fromAsset('./src/containers/gzac-rabbitmq'),
      logging: new AwsLogDriver({
        streamPrefix: 'gzac-rabbit-mq',
        logGroup: this.logs,
      }),
      readonlyRootFilesystem: true,
      portMappings: [{
        containerPort: 5672,
      },
      {
        containerPort: 15672,
      }],
      secrets: {},
      environment: {},
    });
    const service = this.serviceFactory.createService({
      task,
      path: undefined, // No path needed
      id: 'gzac-rabbit-mq',
      options: {
        desiredCount: 1,
      },
      customCloudMap: {
        cloudMapNamespace: this.props.service.namespace,
        containerPort: 5672,
        name: 'gzac-rabbit-mq',
        dnsRecordType: DnsRecordType.A,
        dnsTtl: Duration.seconds(60),
      },
    });
    return service;
  }

  private logGroup() {
    return new LogGroup(this, 'logs', {
      retention: RetentionDays.ONE_MONTH,
      encryptionKey: this.props.key,
    });
  }

  private setupConnectivity(
    id: string,
    serviceSecurityGroups: ISecurityGroup[],
  ) {
    const dbSecurityGroupId = StringParameter.valueForStringParameter(
      this,
      Statics._ssmDatabaseSecurityGroup,
    );
    const dbSecurityGroup = SecurityGroup.fromSecurityGroupId(
      this,
      `db-security-group-${id}`,
      dbSecurityGroupId,
    );
    const dbPort = StringParameter.valueForStringParameter(
      this,
      Statics._ssmDatabasePort,
    );
    serviceSecurityGroups.forEach((serviceSecurityGroup) => {
      dbSecurityGroup.connections.allowFrom(
        serviceSecurityGroup,
        Port.tcp(Token.asNumber(dbPort)),
      );
    });
  }

  private allowAccessToSecrets(role: IRole) {
    this.databaseCredentials.grantRead(role);
    this.m2mCredentials.grantRead(role);
  }
}
