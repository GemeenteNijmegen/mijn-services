import { Duration } from 'aws-cdk-lib';
import { IntegrationType } from 'aws-cdk-lib/aws-apigateway';
import { CfnIntegration, CfnRoute, HttpApi, HttpConnectionType, VpcLink } from 'aws-cdk-lib/aws-apigatewayv2';
import { Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { Cluster, Compatibility, ContainerImage, FargateService, Protocol, TaskDefinition } from 'aws-cdk-lib/aws-ecs';
import { DnsRecordType, PrivateDnsNamespace } from 'aws-cdk-lib/aws-servicediscovery';
import { Construct } from 'constructs';


export interface ServiceProps {
  link: VpcLink;
  cluster: Cluster;
  api: HttpApi;
  namespace: PrivateDnsNamespace;
  vpcLinkSecurityGroup: SecurityGroup;
  port: number;
}


export class Service extends Construct {

  private readonly props: ServiceProps;
  readonly service: FargateService;

  constructor(scope: Construct, id: string, props: ServiceProps) {
    super(scope, id);
    this.props = props;
    this.service = this.createService();
  }

  addRoute(path: string) {
    const integration = new CfnIntegration(this, 'integration', {
      apiId: this.props.api.apiId,
      connectionId: this.props.link.vpcLinkId,
      connectionType: HttpConnectionType.VPC_LINK,
      integrationType: IntegrationType.HTTP_PROXY,
      integrationUri: this.service.serviceArn,
      integrationMethod: 'ANY',
      payloadFormatVersion: '1.0',
    });
    integration.node.addDependency(this.service);
    integration.node.addDependency(this.props.link);

    const route = new CfnRoute(this, 'route', {
      apiId: this.props.api.apiId,
      routeKey: `ANY /${path}/{proxy+}`,
      target: `integrations/${integration.ref}`,
    });
    route.addDependency(integration);

  }

  private createService() {
    const task = new TaskDefinition(this, 'task', {
      cpu: '256',
      memoryMiB: '512',
      compatibility: Compatibility.FARGATE,
    });

    this.setupContainers(task);

    const service = new FargateService(this, 'service', {
      cluster: this.props.cluster,
      taskDefinition: task,
      cloudMapOptions: {
        cloudMapNamespace: this.props.namespace,
        containerPort: this.props.port,
        dnsRecordType: DnsRecordType.SRV,
        dnsTtl: Duration.seconds(60),
      },
    });

    service.connections.allowFrom(this.props.vpcLinkSecurityGroup, Port.tcp(this.props.port));

    return service;
  }

  /**
   * Overwrite this method to add more containers into a single
   * service. E.g. for when using an initalization container.
   * @param task
   * @returns
   */
  setupContainers(task: TaskDefinition) {
    return task.addContainer('main', {
      image: ContainerImage.fromRegistry('nginxdemos/hello'),
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://127.0.0.1 || exit 1'],
        interval: Duration.seconds(10),
      },
      portMappings: [
        {
          containerPort: this.props.port,
          hostPort: this.props.port,
          protocol: Protocol.TCP,
        },
      ],
    });
  }

}