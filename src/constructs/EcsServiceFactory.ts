import { Criticality } from '@gemeentenijmegen/aws-constructs';
import { Duration } from 'aws-cdk-lib';
import { CfnIntegration, CfnRoute, HttpApi, HttpConnectionType, HttpIntegrationType, VpcLink } from 'aws-cdk-lib/aws-apigatewayv2';
import { Alarm, ComparisonOperator, Metric, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch';
import { ISecurityGroup, Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { AwsLogDriver, CloudMapOptions, Cluster, Compatibility, ContainerDefinition, ContainerDependencyCondition, ContainerImage, FargateService, FargateServiceProps, TaskDefinition, TaskDefinitionProps } from 'aws-cdk-lib/aws-ecs';
import { AccessPoint, FileSystem, IFileSystem } from 'aws-cdk-lib/aws-efs';
import { Protocol } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { DnsRecordType, PrivateDnsNamespace } from 'aws-cdk-lib/aws-servicediscovery';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { Statics } from '../Statics';
import { ServiceLoadBalancer } from './LoadBalancer';


export interface EcsServiceFactoryProps {
  link: VpcLink;
  cluster: Cluster;
  api: HttpApi;
  loadbalancer: ServiceLoadBalancer;
  namespace: PrivateDnsNamespace;
  vpcLinkSecurityGroup: SecurityGroup;
  port: number;
}

interface volumeMounts {
  fileSystemRoot: string;
  volumes: Record<string, string>;
}

export interface CreateEcsServiceOptions {
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

  /**
   * HealthCheckPath is used instead of the root path if provided for
   * loadbalancer health checks
   */
  healthCheckPath?: string;


  /**
   * Provide the root path bool to expose the service on the main domain
   * (bla.com/)
   */
  isRootPath?: boolean;

  /**
   * Configuration for mount paths in the filesystem.
   * Provide a name and the container mounth path.
   * A filesystem is automatically created.
   * @default - no filesystem is created
   */
  volumeMounts?: volumeMounts;
  /**
   * Pass request rewrite paraemters to the API gateway integration.
   * @see https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-apigatewayv2-integration.html#cfn-apigatewayv2-integration-requestparameters
   * @default - none
   */
  requestParameters?: Record<string, string>;
  /**
   * Use a custom cloudmap configuration
   */
  customCloudMap?: CloudMapOptions;
  /**
   * Add a API-verison header with this value to the responses
   * @default - no api version header is set in the response
   */
  apiVersionHeaderValue?: string;
}

export class EcsServiceFactory {

  private readonly props: EcsServiceFactoryProps;
  private readonly scope: Construct;

  private filesystem?: IFileSystem;
  private securitygroup?: ISecurityGroup;

  constructor(scope: Construct, props: EcsServiceFactoryProps) {
    this.scope = scope;
    this.props = props;
  }

  createTaskDefinition(id: string, options?: Partial<TaskDefinitionProps>) {
    const task = new TaskDefinition(this.scope, `${id}-task`, {
      cpu: options?.cpu ?? '256',
      memoryMiB: options?.memoryMiB ?? '512',
      compatibility: Compatibility.FARGATE,
      ...options,
    });
    return task;
  }

  createService(options: CreateEcsServiceOptions) {

    let cloudmap: CloudMapOptions | undefined = undefined;
    if (options.path || options.isRootPath) { //TODO allow root path
      cloudmap = {
        cloudMapNamespace: this.props.namespace,
        containerPort: this.props.port,
        dnsRecordType: DnsRecordType.SRV,
        dnsTtl: Duration.seconds(60),
      };
    }
    if (options.customCloudMap) {
      cloudmap = options.customCloudMap;
    }

    const service = new FargateService(this.scope, `${options.id}-service`, {
      cluster: this.props.cluster,
      taskDefinition: options.task,
      cloudMapOptions: cloudmap,
      ...options.options,
    });

    if (options.path || options.isRootPath) {
      service.connections.allowFrom(this.props.vpcLinkSecurityGroup, Port.tcp(this.props.port));
      this.addRoute(service, options.path ?? '', options.id, options.requestParameters, options.apiVersionHeaderValue, options.isRootPath, options.healthCheckPath);
    }
    if (options.volumeMounts) {
      this.createVolumes(service, options.id, options.volumeMounts);
    }

    this.UnresponsiveServiceAlarm(options.id, service);

    return service;
  }

  /**
   * This adds a cloudwatch alarm for unresponsive services. Health checks should catch this, but they're not yet stable enough.
   *
   * The service will stop reporting statistics to cloudwatch, this catches missing data for CPUUtilization and will alarm based on that.
   * NB: This will not auto-remediate.
   */
  private UnresponsiveServiceAlarm(idPrefix: string, service: FargateService) {
    const criticality = new Criticality('critical');
    new Alarm(this.scope, `${idPrefix}-service-unresponsive-alarm`, {
      alarmName: `${service.serviceName}-unresponsive-${criticality.toString()}`,
      evaluationPeriods: 1,
      metric: new Metric({
        dimensionsMap: {
          ClusterName: this.props.cluster.clusterName,
          ServiceName: service.serviceName,
        },
        metricName: 'CPUUtilization',
        namespace: 'AWS/ECS',
        statistic: 'SampleCount',
        period: Duration.minutes(3),
      }),
      threshold: 0,
      comparisonOperator: ComparisonOperator.LESS_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.BREACHING,
    });
  }

  attachEphemeralStorage(container: ContainerDefinition, name: string, ...mountpoints: string[]) {
    mountpoints.forEach(mountpoint => {
      container.addMountPoints({
        containerPath: mountpoint,
        readOnly: false,
        sourceVolume: name,
      });
    });
  }

  /**
   * Initalize the writable directories the task requires
   * @param volumeName
   * @param task
   * @param runBeforeContainer
   * @param dirs
   */
  setupWritableVolume(volumeName: string, task: TaskDefinition, logs: LogGroup, runBeforeContainer: ContainerDefinition, ...dirs: string[]) {
    const command = dirs.map(dir => `chmod 0777 ${dir}`).join(' && ');
    const fsInitContainer = task.addContainer('init-storage', {
      image: ContainerImage.fromRegistry('alpine:latest'),
      entryPoint: ['sh', '-c'],
      command: [command],
      readonlyRootFilesystem: true,
      essential: false, // exit after running
      logging: new AwsLogDriver({
        streamPrefix: 'logs',
        logGroup: logs,
      }),
    });
    runBeforeContainer.addContainerDependencies({
      container: fsInitContainer,
      condition: ContainerDependencyCondition.SUCCESS,
    });
    dirs.forEach(dir => {
      this.attachEphemeralStorage(fsInitContainer, volumeName, dir);
    });
  }

  private createVolumes(service: FargateService, id: string, volumeMounts: volumeMounts) {

    const fileSystem = this.getImportedFileSystem();
    const securityGroup = this.getImportedFileSystemSecurityGroup();

    const fileSystemAccessPoint = new AccessPoint(this.scope, `${id}-esf-access-point`, {
      fileSystem: fileSystem,
      /**
       * Dit moet configureerbaar zijn vrees ik: Soms wil je dat twee containers bij dezelfde
       * data kunnen, soms juist niet. Als je dan het path aanpast hebben ze hun eigen 'root'.
       */
      path: volumeMounts.fileSystemRoot,
      createAcl: {
        ownerGid: '1000',
        ownerUid: '1000',
        permissions: '755',
      },
      posixUser: {
        uid: '1000',
        gid: '1000',
      },
    });

    const privateFileSystemConfig = {
      authorizationConfig: {
        accessPointId: fileSystemAccessPoint.accessPointId,
        iam: 'ENABLED',
      },
      fileSystemId: fileSystem.fileSystemId,
      transitEncryption: 'ENABLED',
    };

    const volumes = Object.entries(volumeMounts.volumes ?? {});
    for (const volume of volumes) {
      const name = volume[0];
      const containerPath = volume[1];
      service.taskDefinition.addVolume({
        name: name,
        efsVolumeConfiguration: privateFileSystemConfig,
      });
      service.taskDefinition.defaultContainer?.addMountPoints({
        readOnly: false,
        containerPath: containerPath,
        sourceVolume: name,
      });
    }

    service.connections.securityGroups.forEach(sg => {
      securityGroup.addIngressRule(sg, Port.NFS);
    });
  }

  private getImportedFileSystem() {
    const securityGroup = this.getImportedFileSystemSecurityGroup();
    if (!this.filesystem) {
      const fileSystemArn = StringParameter.valueForStringParameter(this.scope, Statics._ssmFilesystemArn);
      const fileSystem = FileSystem.fromFileSystemAttributes(this.scope, 'ImportedFileSystem', {
        fileSystemArn: fileSystemArn,
        securityGroup,
      });
      this.filesystem = fileSystem;
    }
    return this.filesystem;
  }

  private getImportedFileSystemSecurityGroup() {
    if (!this.securitygroup) {
      const securityGroupId = StringParameter.valueForStringParameter(this.scope, Statics._ssmFilesystemSecurityGroupId);
      const securityGroup = SecurityGroup.fromSecurityGroupId(this.scope, 'sg', securityGroupId);
      //import the storage stack filesystem and security group here
      this.securitygroup = securityGroup;
    }
    return this.securitygroup;
  }

  private addRoute(service: FargateService,
    path: string,
    id: string,
    requestParameters?: Record<string,
      string>,
    apiVersionHeaderValue?: string,
    isRootPath?: boolean,
    healthCheckPath?: string,
  ) {
    let props = undefined;

    if (healthCheckPath) {
      props = {
        healthCheck: {
          enabled: true,
          path: healthCheckPath,
          healthyHttpCodes: '200',
          healthyThresholdCount: 2,
          unhealthyThresholdCount: 6,
          timeout: Duration.seconds(10),
          interval: Duration.seconds(15),
          protocol: Protocol.HTTP,
        },
      };
    }
    this.props.loadbalancer.attachECSService(service, `/${path}*`, undefined, props);

    if (!service.cloudMapService) {
      throw Error('Cannot add route if ther\'s no cloudmap service configured');
    }

    // Tja... Ik hoop dit later beter op te lossen (19 feb 2025).
    let responseParameters: any = undefined;
    if (apiVersionHeaderValue) {
      responseParameters = {
        200: this.apiVersionHeader(apiVersionHeaderValue), //	OK
        201: this.apiVersionHeader(apiVersionHeaderValue), //	Created
        202: this.apiVersionHeader(apiVersionHeaderValue), //	Accepted
        203: this.apiVersionHeader(apiVersionHeaderValue), //	Non - Authoritative Information
        204: this.apiVersionHeader(apiVersionHeaderValue), //	No Content
        205: this.apiVersionHeader(apiVersionHeaderValue), //	Reset Content
        206: this.apiVersionHeader(apiVersionHeaderValue), //	Partial Content
        207: this.apiVersionHeader(apiVersionHeaderValue), //	Multi - Status
        208: this.apiVersionHeader(apiVersionHeaderValue), //	Already Reported
        226: this.apiVersionHeader(apiVersionHeaderValue), //	IM Used
      };
    }

    const integration = new CfnIntegration(this.scope, `${id}-integration`, {
      apiId: this.props.api.apiId,
      connectionId: this.props.link.vpcLinkId,
      connectionType: HttpConnectionType.VPC_LINK,
      integrationType: HttpIntegrationType.HTTP_PROXY,
      integrationUri: service.cloudMapService?.serviceArn,
      integrationMethod: 'ANY',
      payloadFormatVersion: '1.0',
      requestParameters: {
        'overwrite:header.X_FORWARDED_PROTO': 'https',
        ...requestParameters,
      },
      responseParameters: responseParameters,
    });

    integration.node.addDependency(service);
    integration.node.addDependency(this.props.link);

    let route;
    if (isRootPath) {
      route = new CfnRoute(this.scope, `${id}-route`, {
        apiId: this.props.api.apiId,
        routeKey: 'ANY /{proxy+}', // TODO: enable root path
        target: `integrations/${integration.ref}`,
      });
    } else {
      route = new CfnRoute(this.scope, `${id}-route`, {
        apiId: this.props.api.apiId,
        routeKey: `ANY /${path}/{proxy+}`, // TODO: enable root path
        target: `integrations/${integration.ref}`,
      });
    }
    route.addDependency(integration);
  }

  private apiVersionHeader(apiVersionHeaderValue: string) {
    return {
      ResponseParameters: [
        {
          Destination: 'overwrite:header.API-version',
          Source: apiVersionHeaderValue,
        },
      ],
    };
  }

}
