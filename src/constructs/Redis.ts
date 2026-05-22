import { IVpc, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { CfnCacheCluster, CfnParameterGroup, CfnSubnetGroup } from 'aws-cdk-lib/aws-elasticache';
import { Construct } from 'constructs';

export interface CacheDatabaseProps {
  /**
   * The VPC to place the redis instance in.
   */
  vpc: IVpc;
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

    // 1. Create a custom parameter group with increased databases
    const parameterGroup = new CfnParameterGroup(this, 'redis-parameters', {
      cacheParameterGroupFamily: 'redis7',  // match your Redis version
      description: 'Custom param group with more databases',
      properties: {
        databases: '32',  // default is 16, increase as needed
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
      cacheParameterGroupName: parameterGroup.ref,
    });

    this.db = db;
  }
}