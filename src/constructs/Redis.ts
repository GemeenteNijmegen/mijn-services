import { IVpc, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { CfnCacheCluster, CfnParameterGroup, CfnSubnetGroup } from 'aws-cdk-lib/aws-elasticache';
import { Construct } from 'constructs';

export interface CacheDatabaseProps {
  /**
   * The VPC to place the redis instance in.
   */
  vpc: IVpc;
  /**
   * When true, deploys a custom parameter group that increases the number of databases from 16 to 112.
   * Note: changing this on an existing cluster requires replacement.
   * @default false
   */
  useCustomRedisParameterGroup?: boolean;
}

export class CacheDatabase extends Construct {

  readonly db: CfnCacheCluster;

  constructor(scope: Construct, id: string, props: CacheDatabaseProps) {
    super(scope, id);

    const redisSecurityGroup = new SecurityGroup(this, 'redis-security-group', {
      vpc: props.vpc,
      allowAllOutbound: true,
    });

    const redisSubnetGroup = new CfnSubnetGroup(this, 'redis-subnet-group', {
      subnetIds: props.vpc.isolatedSubnets.map((subnet) => subnet.subnetId),
      description: 'Subnet group for redis',
    });

    const parameterGroup = new CfnParameterGroup(this, 'redis-parameters', {
      cacheParameterGroupFamily: 'redis7',  // match your Redis version
      description: 'Custom param group with more databases',
      properties: {
        databases: '112',  // default is 16, increase to 112 update requires replacement
      },
    });

    const db = new CfnCacheCluster(this, 'redis-cluster', {
      autoMinorVersionUpgrade: true,
      cacheNodeType: 'cache.t4g.micro',
      engine: 'redis',
      numCacheNodes: 1,
      cacheSubnetGroupName: redisSubnetGroup.ref,
      vpcSecurityGroupIds: [redisSecurityGroup.securityGroupId],
      snapshotRetentionLimit: 5,
      cacheParameterGroupName: props.useCustomRedisParameterGroup ? parameterGroup.ref : undefined,
    });

    this.db = db;
  }
}