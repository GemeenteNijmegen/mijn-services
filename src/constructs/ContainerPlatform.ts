import { VpcLink } from 'aws-cdk-lib/aws-apigatewayv2';
import { IVpc, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { Cluster, ExecuteCommandLogging } from 'aws-cdk-lib/aws-ecs';
import { PrivateDnsNamespace } from 'aws-cdk-lib/aws-servicediscovery';
import { Construct } from 'constructs';

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

    this.cluster = new Cluster(this, 'cluster', {
      vpc: props.vpc,
      executeCommandConfiguration: {
        logging: ExecuteCommandLogging.DEFAULT,
      },
    });

  }

}