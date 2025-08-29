import { Duration, Token } from 'aws-cdk-lib';
import { ISecurityGroup, Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { AwsLogDriver, ContainerImage, Protocol } from 'aws-cdk-lib/aws-ecs';
import { IRole } from 'aws-cdk-lib/aws-iam';
import { Key } from 'aws-cdk-lib/aws-kms';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { ISecret, Secret as SecretParameter } from 'aws-cdk-lib/aws-secretsmanager';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { CorsaZgwServiceConfiguration } from '../ConfigurationInterfaces';
import { EcsServiceFactory, EcsServiceFactoryProps } from '../constructs/EcsServiceFactory';
import { CacheDatabase } from '../constructs/Redis';
import { Statics } from '../Statics';

export interface CorsaZgwProps {

  readonly redis: CacheDatabase;
  readonly redisChannel: number;

  readonly service: EcsServiceFactoryProps;
  readonly path: string;

  readonly repository: Repository;

  /**
   * The configuration for the open configuration installation
   */
  readonly serviceConfiguration: CorsaZgwServiceConfiguration;
  readonly key: Key;
}

export class CorsaZgwService extends Construct {

  private readonly logs: LogGroup;
  private readonly props: CorsaZgwProps;
  private readonly serviceFactory: EcsServiceFactory;
  private readonly databaseCredentials: ISecret;
  // private readonly superuserCredentials: ISecret;
  // private readonly secretKey: ISecret;

  constructor(scope: Construct, id: string, props: CorsaZgwProps) {
    super(scope, id);
    this.props = props;

    this.serviceFactory = new EcsServiceFactory(this, props.service);
    this.logs = this.logGroup();

    this.databaseCredentials = SecretParameter.fromSecretNameV2(this, 'database-credentials', Statics._ssmDatabaseCredentials);

    this.setupService();
  }


  private getEnvironmentSecrets() {
    return {};
  }

  private getEnvironmentVariables() {
    return {};
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
      readonlyRootFilesystem: true,
      secrets: this.getEnvironmentSecrets(),
      environment: this.getEnvironmentVariables(),
      logging: new AwsLogDriver({
        streamPrefix: 'corsa-zgw',
        logGroup: this.logs,
      }),
    });

    // this.serviceFactory.attachEphemeralStorage(container, VOLUME_NAME, '/tmp', '/app/log');
    // 1st Filesystem write access - initialization container
    // this.serviceFactory.setupWritableVolume(VOLUME_NAME, task, this.logs, container, '/tmp', '/app/log');

    const service = this.serviceFactory.createService({
      id: 'corsa-zgw',
      task: task,
      path: this.props.path,
      options: {
        desiredCount: 1,
      },
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

}
