import { VpcLink } from 'aws-cdk-lib/aws-apigatewayv2';
import { ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import { IVpc, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { Cluster } from 'aws-cdk-lib/aws-ecs';
import { IHostedZone } from 'aws-cdk-lib/aws-route53';
import { PrivateDnsNamespace } from 'aws-cdk-lib/aws-servicediscovery';
import { Construct } from 'constructs';
import { CloudfrontDistributionForLoadBalancer } from './CloudfrontDistributionForLoadBalancer';
import { ServiceLoadBalancer } from './LoadBalancer';

export interface ContainerPlatformProps {
  /**
   * The VPC to place the redis instance in.
   */
  vpc: IVpc;

  certificate: ICertificate;

  hostedZone: IHostedZone;

  domains: string[];
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
    });

    new CloudfrontDistributionForLoadBalancer(this, 'distribution', {
      certificate: props.certificate,
      domains: props.domains,
      loadbalancer: serviceLoadBalancer.alb,
      hostedZone: props.hostedZone,
    });

    this.loadBalancer = serviceLoadBalancer;
  }
}
