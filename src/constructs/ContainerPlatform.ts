import { Stack } from 'aws-cdk-lib';
import { VpcLink } from 'aws-cdk-lib/aws-apigatewayv2';
import { IVpc, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { Cluster, ExecuteCommandLogging } from 'aws-cdk-lib/aws-ecs';
import { Effect, PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Key } from 'aws-cdk-lib/aws-kms';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { PrivateDnsNamespace } from 'aws-cdk-lib/aws-servicediscovery';
import { Construct } from 'constructs';
import { Statics } from '../Statics';

export interface ContainerPlatformProps {
  /**
   * The VPC to place the redis instance in.
   */
  vpc: IVpc;
}

export class ContainerPlatform extends Construct {

  readonly cluster: Cluster;
  readonly vpcLink: VpcLink;
  readonly vpcLinkSecurityGroup: SecurityGroup;
  readonly namespace: PrivateDnsNamespace;

  constructor(scope: Construct, id: string, props: ContainerPlatformProps) {
    super(scope, id);

    this.namespace = new PrivateDnsNamespace(this, 'cloudmap', {
      name: 'mijn-services.local',
      vpc: props.vpc,
      description: 'Mijn-services CloudMap',
    });

    this.vpcLinkSecurityGroup = new SecurityGroup(this, 'vpc-link-security-group', {
      vpc: props.vpc,
      description: 'VPC Link Security group',
    });

    this.vpcLink = new VpcLink(this, 'vpc-link', {
      vpc: props.vpc,
      securityGroups: [this.vpcLinkSecurityGroup],
    });


    const key = new Key(this, 'cluster-exec-logs-key', {
      description: 'Key for encrypting cluster exec commands and logs',
      alias: `${Statics.projectName}/cluster-exec`,
    });
    const logs = new LogGroup(this, 'cluster-exec-logs', {
      encryptionKey: key,
      retention: RetentionDays.ONE_YEAR, // Also audit trail
    });


    const region = Stack.of(this).region;
    const account = Stack.of(this).account;
    key.addToResourcePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      principals: [new ServicePrincipal(`logs.${region}.amazonaws.com`)],
      actions: [
        'kms:Decrypt',
        'kms:DescribeKey',
        'kms:Encrypt',
        'kms:ReEncrypt*',
        'kms:GenerateDataKey*',
      ],
      resources: ['*'],
      conditions: {
        StringEquals: {
          'aws:RequestedRegion': region,
          'aws:PrincipalAccount': account,
        },
      },
    }));
    key.addToResourcePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      principals: [new ServicePrincipal('ecs.amazonaws.com')],
      actions: [
        'kms:Decrypt',
        'kms:DescribeKey',
        'kms:Encrypt',
        'kms:ReEncrypt*',
        'kms:GenerateDataKey*',
      ],
      resources: ['*'],
      conditions: {
        StringEquals: {
          'aws:RequestedRegion': region,
          'aws:PrincipalAccount': account,
        },
      },
    }));

    this.cluster = new Cluster(this, 'cluster', {
      vpc: props.vpc,
      executeCommandConfiguration: {
        kmsKey: key,
        logConfiguration: {
          cloudWatchLogGroup: logs,
          cloudWatchEncryptionEnabled: true,
        },
        logging: ExecuteCommandLogging.OVERRIDE,
      },
    });

  }

}