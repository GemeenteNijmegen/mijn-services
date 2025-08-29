import { Key } from 'aws-cdk-lib/aws-kms';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { CorsaZgwServiceConfiguration } from '../ConfigurationInterfaces';
import { EcsServiceFactoryProps } from '../constructs/EcsServiceFactory';
import { CacheDatabase } from '../constructs/Redis';

export interface CorsaZgwProps {

  readonly redis: CacheDatabase;
  readonly redisChannel: number;

  readonly service: EcsServiceFactoryProps;
  readonly path: string;

  /**
   * The configuration for the open configuration installation
   */
  readonly serviceConfiguration: CorsaZgwServiceConfiguration;
  readonly key: Key;
}

export class CorsaZgwService extends Construct {

  private readonly logs: LogGroup;
  private readonly props: CorsaZgwProps;
  // private readonly serviceFactory: EcsServiceFactory;
  // private readonly databaseCredentials: ISecret;
  // private readonly superuserCredentials: ISecret;
  // private readonly secretKey: ISecret;

  constructor(scope: Construct, id: string, props: CorsaZgwProps) {
    super(scope, id);
    this.props = props;

    // this.serviceFactory = new EcsServiceFactory(this, props.service);
    this.logs = this.logGroup();

    // this.databaseCredentials = SecretParameter.fromSecretNameV2(this, 'database-credentials', Statics._ssmDatabaseCredentials);
    // this.superuserCredentials = SecretParameter.fromSecretNameV2(this, 'superuser-credentials', Statics._ssmObjectsCredentials);
    // this.secretKey = new SecretParameter(this, 'secret-key', {
    //   description: 'Cor secret key',
    //   generateSecretString: {
    //     excludePunctuation: true,
    //   },
    // });

    // this.setupConfigurationService();
    // this.setupService();
    // this.setupCeleryService();
  }


  private logGroup() {
    return new LogGroup(this, 'logs', {
      retention: RetentionDays.ONE_MONTH,
      encryptionKey: this.props.key,
    });
  }

  // private setupConnectivity(id: string, serviceSecurityGroups: ISecurityGroup[]) {

  //   const dbSecurityGroupId = StringParameter.valueForStringParameter(this, Statics._ssmDatabaseSecurityGroup);
  //   const dbSecurityGroup = SecurityGroup.fromSecurityGroupId(this, `db-security-group-${id}`, dbSecurityGroupId);
  //   const dbPort = StringParameter.valueForStringParameter(this, Statics._ssmDatabasePort);
  //   serviceSecurityGroups.forEach(serviceSecurityGroup => {
  //     dbSecurityGroup.connections.allowFrom(serviceSecurityGroup, Port.tcp(Token.asNumber(dbPort)));
  //   });

  //   const cachePort = this.props.cache.db.attrRedisEndpointPort;
  //   serviceSecurityGroups.forEach(serviceSecurityGroup => {
  //     dbSecurityGroup.connections.allowFrom(serviceSecurityGroup, Port.tcp(Token.asNumber(dbPort)));
  //     this.props.cache.db.vpcSecurityGroupIds?.forEach((cacheSecurityGroupId, index) => {
  //       const cacheSecurityGroup = SecurityGroup.fromSecurityGroupId(this, `cache-security-group-${id}-${index}`, cacheSecurityGroupId);
  //       cacheSecurityGroup.connections.allowFrom(serviceSecurityGroup, Port.tcp(Token.asNumber(cachePort)));
  //     });
  //   });
  // }


}
