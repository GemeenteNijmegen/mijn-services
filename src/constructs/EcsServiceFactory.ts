import { Duration, aws_backup as backup } from 'aws-cdk-lib';
import { CfnIntegration, CfnRoute, HttpApi, HttpConnectionType, HttpIntegrationType, VpcLink } from 'aws-cdk-lib/aws-apigatewayv2';
import { Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { AwsLogDriver, CloudMapOptions, Cluster, Compatibility, ContainerDefinition, ContainerDependencyCondition, ContainerImage, FargateService, FargateServiceProps, TaskDefinition, TaskDefinitionProps } from 'aws-cdk-lib/aws-ecs';
import { AccessPoint, FileSystem } from 'aws-cdk-lib/aws-efs';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { DnsRecordType, PrivateDnsNamespace } from 'aws-cdk-lib/aws-servicediscovery';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { Statics } from '../Statics';


export interface EcsServiceFactoryProps {
  link: VpcLink;
  cluster: Cluster;
  api: HttpApi;
  namespace: PrivateDnsNamespace;
  vpcLinkSecurityGroup: SecurityGroup;
  port: number;
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
  filesystem?: Record<string, string>;
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
      this.addRoute(service, options.path ?? '', options.id, options.requestParameters, options.apiVersionHeaderValue, options.isRootPath);
    }
    if (options.filesystem) {
      const fileSystem = this.createFileSytem(service, options);
      this.createBackupPlan(fileSystem);
    }

    return service;
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

  private createFileSytem(service: FargateService, options: CreateEcsServiceOptions) {
    const privateFileSystemSecurityGroup = new SecurityGroup(this.scope, 'efs-security-group', {
      vpc: this.props.cluster.vpc,
    });

    const fileSystem = new FileSystem(this.scope, 'esf-filesystem', {
      encrypted: true,
      vpc: this.props.cluster.vpc,
      securityGroup: privateFileSystemSecurityGroup,
    });

    const fileSystemAccessPoint = new AccessPoint(this.scope, 'esf-access-point', {
      fileSystem: fileSystem,

      path: '/data',
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

    const volumes = Object.entries(options.filesystem ?? {});
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
      privateFileSystemSecurityGroup.addIngressRule(sg, Port.NFS);
    });

    return fileSystem;
  }

  private addRoute(service: FargateService,
    path: string,
    id: string,
    requestParameters?: Record<string,
      string>,
    apiVersionHeaderValue?: string,
    isRootPath?: boolean,
  ) {
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

  /**
   * Creates a backup plan for the EFS file system.
   */
  private createBackupPlan(fileSystem: FileSystem) {
    const backupVaultArn = StringParameter.valueForStringParameter(
      this.scope,
      Statics._ssmBackupVaultArn,
    );

    const backupVault = backup.BackupVault.fromBackupVaultArn(this.scope, 'backup-vault', backupVaultArn);

    const backupPlan = backup.BackupPlan.dailyMonthly1YearRetention(this.scope, 'efs-backup-plan', backupVault);
    backupPlan.addSelection('backup-selection', {
      resources: [
        backup.BackupResource.fromEfsFileSystem(fileSystem),
      ],
    });
  }

}
