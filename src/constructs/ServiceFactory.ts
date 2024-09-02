import { Duration } from 'aws-cdk-lib';
import { CfnIntegration, CfnRoute, HttpApi, HttpConnectionType, HttpIntegrationType, VpcLink } from 'aws-cdk-lib/aws-apigatewayv2';
import { Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { Cluster, Compatibility, FargateService, TaskDefinition } from 'aws-cdk-lib/aws-ecs';
import { ScheduledFargateTask } from 'aws-cdk-lib/aws-ecs-patterns';
import { Schedule } from 'aws-cdk-lib/aws-events';
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


export class ServiceFactory {

  private readonly props: ServiceFactoryProps;
  private readonly scope: Construct;

  constructor(scope: Construct, props: ServiceFactoryProps) {
    this.scope = scope;
    this.props = props;
  }

  createTaskDefinition(id?: string) {
    const task = new TaskDefinition(this.scope, `${id ? id + '-' : ''}task`, {
      cpu: '256',
      memoryMiB: '512',
      compatibility: Compatibility.FARGATE,
    });
    return task;
  }

  createService(task: TaskDefinition, path?: string, id?: string) {
    const service = new FargateService(this.scope, `${id ? id + '-' : ''}service`, {
      cluster: this.props.cluster,
      taskDefinition: task,
      cloudMapOptions: path ? {
        cloudMapNamespace: this.props.namespace,
        containerPort: this.props.port,
        dnsRecordType: DnsRecordType.SRV,
        dnsTtl: Duration.seconds(60),
      } : undefined,
    });

    service.connections.allowFrom(this.props.vpcLinkSecurityGroup, Port.tcp(this.props.port));

    if (path) {
      this.addRoute(service, path);
    }

    return service;
  }

  createScheduledService(date: Date, task: TaskDefinition, id?: string) {
    return new ScheduledFargateTask(this.scope, `${id ? id + '-' : ''}service`, {
      schedule: Schedule.cron({
        day: date.getDay().toString(),
        hour: date.getHours().toString(),
        minute: date.getMinutes().toString(),
        month: date.getMonth().toString(),
        year: date.getFullYear().toString(),
      }),
      cluster: this.props.cluster,
      scheduledFargateTaskDefinitionOptions: {
        taskDefinition: task,
      },
    });
  }

  private addRoute(service: FargateService, path: string, id?: string) {
    if (!service.cloudMapService) {
      throw Error('Cannot add route if ther\'s no cloudmap service configured');
    }
    const integration = new CfnIntegration(this.scope, `${id ? id + '-' : ''}integration`, {
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

    const route = new CfnRoute(this.scope, `${id ? id + '-' : ''}route`, {
      apiId: this.props.api.apiId,
      routeKey: `ANY /${path}/{proxy+}`,
      target: `integrations/${integration.ref}`,
    });
    route.addDependency(integration);

  }

}