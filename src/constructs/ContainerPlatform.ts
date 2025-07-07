import { VpcLink } from 'aws-cdk-lib/aws-apigatewayv2';
import { IVpc, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { Cluster, FargateService } from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancer, IListenerCertificate } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { IHostedZone } from 'aws-cdk-lib/aws-route53';
import { PrivateDnsNamespace } from 'aws-cdk-lib/aws-servicediscovery';
import { Construct } from 'constructs';
import { ServiceLoadBalancer } from './LoadBalancer';

export interface ContainerPlatformProps {
  /**
   * The VPC to place the redis instance in.
   */
  vpc: IVpc;

  certificate: IListenerCertificate;

  hostedZone: IHostedZone;
}

export class ContainerPlatform extends Construct {

  readonly cluster: Cluster;
  readonly vpcLink: VpcLink;
  readonly vpcLinkSecurityGroup: SecurityGroup;
  readonly namespace: PrivateDnsNamespace;
  readonly loadBalancer: ServiceLoadBalancer;

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
    });

    const serviceLoadBalancer = new ServiceLoadBalancer(this, 'lb', {
      vpc: props.vpc,
      certificate: props.certificate,
      hostedZone: props.hostedZone,
    });

    this.loadBalancer = serviceLoadBalancer;
  }
}
