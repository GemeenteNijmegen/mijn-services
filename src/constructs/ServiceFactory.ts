import { Duration } from 'aws-cdk-lib';
import { CfnIntegration, CfnRoute, HttpApi, HttpConnectionType, HttpIntegrationType, VpcLink } from 'aws-cdk-lib/aws-apigatewayv2';
import { Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { Cluster, Compatibility, FargateService, FargateServiceProps, TaskDefinition } from 'aws-cdk-lib/aws-ecs';
import { DnsRecordType, PrivateDnsNamespace } from 'aws-cdk-lib/aws-servicediscovery';
import { Construct } from 'constructs';


export interface ServiceFactoryProps {
  link: VpcLink;
  cluster: Cluster;
  api: HttpApi;
  namespace: PrivateDnsNamespace;
  vpcLinkSecurityGroup: SecurityGroup;
  port: number;
}

export interface CreateServiceOptions {
  /**
   * Provide an cdk id for the service as the resources are created
   * in the scope provided during factory construction.
   */
  id: string;
  /**
   * The taskdefinition the service will use.
   */
  task: TaskDefinition;
  /**
   * This overwrites the service options created by this
   * factory. Can also be used to append options
   */
  options?: Partial<FargateServiceProps>;
  /**
   * Provide a path to expose the service on in the
   * API gateway. An api route, integration and servicediscovery
   * are created when this property is set.
   * @default - No integration, route and servicediscovery are created
   */
  path?: string;
}

export class ServiceFactory {

  private readonly props: ServiceFactoryProps;
  private readonly scope: Construct;

  constructor(scope: Construct, props: ServiceFactoryProps) {
    this.scope = scope;
    this.props = props;
  }

  createTaskDefinition(id: string) {
    const task = new TaskDefinition(this.scope, `${id}-task`, {
      cpu: '256',
      memoryMiB: '512',
      compatibility: Compatibility.FARGATE,
    });
    return task;
  }

  createService(options: CreateServiceOptions) {
    const service = new FargateService(this.scope, `${options.id}-service`, {
      cluster: this.props.cluster,
      taskDefinition: options.task,
      cloudMapOptions: options.path ? {
        cloudMapNamespace: this.props.namespace,
        containerPort: this.props.port,
        dnsRecordType: DnsRecordType.SRV,
        dnsTtl: Duration.seconds(60),
      } : undefined,
      ...options.options,
    });

    service.connections.allowFrom(this.props.vpcLinkSecurityGroup, Port.tcp(this.props.port));

    if (options.path) {
      this.addRoute(service, options.path, options.id);
    }

    return service;
  }

  private addRoute(service: FargateService, path: string, id: string) {
    if (!service.cloudMapService) {
      throw Error('Cannot add route if ther\'s no cloudmap service configured');
    }
    const integration = new CfnIntegration(this.scope, `${id}-integration`, {
      apiId: this.props.api.apiId,
      connectionId: this.props.link.vpcLinkId,
      connectionType: HttpConnectionType.VPC_LINK,
      integrationType: HttpIntegrationType.HTTP_PROXY,
      integrationUri: service.cloudMapService?.serviceArn,
      integrationMethod: 'ANY',
      payloadFormatVersion: '1.0',
    });
    integration.node.addDependency(service);
    integration.node.addDependency(this.props.link);

    const route = new CfnRoute(this.scope, `${id}-route`, {
      apiId: this.props.api.apiId,
      routeKey: `ANY /${path}/{proxy+}`,
      target: `integrations/${integration.ref}`,
    });
    route.addDependency(integration);

  }

}