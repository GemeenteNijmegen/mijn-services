import { Duration } from 'aws-cdk-lib';
import { VpcLink } from 'aws-cdk-lib/aws-apigatewayv2';
import { IVpc, Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { Cluster, Compatibility, ContainerImage, FargateService, TaskDefinition } from 'aws-cdk-lib/aws-ecs';
import { DnsRecordType, PrivateDnsNamespace } from 'aws-cdk-lib/aws-servicediscovery';
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
  private readonly vpcLinkSecurityGroup: SecurityGroup;
  private readonly cloudmap: PrivateDnsNamespace;

  constructor(scope: Construct, id: string, props: ContainerPlatformProps) {
    super(scope, id);

    this.cloudmap = new PrivateDnsNamespace(this, 'cloudmap', {
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

  }

  helloWorldContainer() {
    const task = new TaskDefinition(this, 'hello-world-task', {
      cpu: '256',
      memoryMiB: '512',
      compatibility: Compatibility.FARGATE,
    });

    task.addContainer('main', {
      image: ContainerImage.fromRegistry('nginxdemos/hello'),
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://127.0.0.1 || exit 1'],
        interval: Duration.seconds(10),
      },
    });

    const service = new FargateService(this, 'hello-world-service', {
      cluster: this.cluster,
      taskDefinition: task,
      cloudMapOptions: {
        cloudMapNamespace: this.cloudmap,
        containerPort: 80,
        dnsRecordType: DnsRecordType.SRV,
        dnsTtl: Duration.seconds(60),
      },
    });

    service.connections.allowFrom(this.vpcLinkSecurityGroup, Port.tcp(80));

    return service;
  }

}