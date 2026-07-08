import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import { AwsLogDriver, ContainerImage, FargateService, Protocol } from 'aws-cdk-lib/aws-ecs';
import { Protocol as AlbProtocol, ListenerCondition } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Key } from 'aws-cdk-lib/aws-kms';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { IHostedZone } from 'aws-cdk-lib/aws-route53';
import { DnsRecordType } from 'aws-cdk-lib/aws-servicediscovery';
import { Construct } from 'constructs';
import { GZACFrontendConfiguration } from '../ConfigurationInterfaces';
import {
  EcsServiceFactory,
  EcsServiceFactoryProps,
  ECSServiceUtils,
} from '../constructs/EcsServiceFactory';
import { SubdomainCloudfront } from '../constructs/SubdomainCloudfront';


interface GZACServiceProps {
  readonly service: EcsServiceFactoryProps;
  readonly path: string;
  readonly hostedzone: IHostedZone;
  readonly alternativeDomainNames?: string[];
  /**
   * The configuration for the open configuration installation
   */
  readonly serviceConfiguration: GZACFrontendConfiguration;
  readonly key: Key;
  readonly certificate: ICertificate;
}

export class GZACFrontendService extends Construct {

  static readonly SUBDOMAIN = 'gzac';

  private readonly logs: LogGroup;
  private readonly props: GZACServiceProps;
  private readonly serviceFactory: EcsServiceFactory;

  constructor(scope: Construct, id: string, props: GZACServiceProps) {
    super(scope, id);
    this.props = props;
    this.serviceFactory = new EcsServiceFactory(this, props.service);
    this.logs = this.logGroup();

    const service = this.setupService();
    service.applyRemovalPolicy(RemovalPolicy.DESTROY);
  }

  private getEnvironmentConfiguration() {
    const trustedDomains =
      this.props.alternativeDomainNames?.map((a) => a) ?? [];
    trustedDomains.push(this.props.hostedzone.zoneName);
    return {
      API_URI: 'https://mijn-services.accp.nijmegen.nl/api',
      KEYCLOAK_URL: 'https://mijn-services.accp.nijmegen.nl/keycloak',
      KEYCLOAK_REALM: 'valtimo',
      KEYCLOAK_CLIENT_ID: 'valtimo-console',
      KEYCLOAK_REDIRECT_URI: 'https://mijn-services.accp.nijmegen.nl/keycloak',
      KEYCLOAK_LOGOUT_REDIRECT_URI: 'https://mijn-services.accp.nijmegen.nl',
      WHITELISTED_DOMAIN: 'https://mijn-services.accp.nijmegen.nl',
      ENABLE_CASE_WIDGETS: 'true',
      ENABLE_TASK_PANEL: 'true',
    };
  }

  // private getSecretConfiguration() {
  //   const secrets = {};
  //   return secrets;
  // }

  private setupService() {
    const VOLUME_NAME = 'tmp';
    const task = this.serviceFactory.createTaskDefinition('gzac-frontend', {
      volumes: [{ name: VOLUME_NAME }],
      cpu: '512',
      memoryMiB: '1024',
    });

    // Main service container
    task.addContainer('gzac-frontend', {
      image: ContainerImage.fromAsset('./src/containers/gzac-frontend'),
      healthCheck: {
        command: ['CMD-SHELL', 'exit 0'],
        interval: Duration.seconds(10),
        startPeriod: Duration.seconds(30),
      },
      portMappings: [
        {
          containerPort: this.props.service.port,
          hostPort: this.props.service.port,
          protocol: Protocol.TCP,
        },
      ],
      readonlyRootFilesystem: false, // Needed for ECS exec
      // secrets: this.getSecretConfiguration(),
      environment: this.getEnvironmentConfiguration(),
      logging: new AwsLogDriver({
        streamPrefix: 'main',
        logGroup: this.logs,
      }),
    });

    // Setup the service
    const service = new FargateService(this, 'gzac-frontend-service', {
      cluster: this.props.service.cluster,
      taskDefinition: task,
      cloudMapOptions: { // Expose for intercontainer communication
        cloudMapNamespace: this.props.service.namespace,
        containerPort: this.props.service.port,
        dnsRecordType: DnsRecordType.SRV,
        dnsTtl: Duration.seconds(60),
      },
      desiredCount: 1,
      enableExecuteCommand: true,
      healthCheckGracePeriod: Duration.seconds(120), // Give time to start
    });


    // Attach to loadbalancer
    let fqdomain = `${GZACFrontendService.SUBDOMAIN}.${this.props.hostedzone.zoneName}`;
    if (this.props.alternativeDomainNames && this.props.alternativeDomainNames.length > 0) {
      fqdomain = `${GZACFrontendService.SUBDOMAIN}.${this.props.alternativeDomainNames[0]}`;
    }
    this.props.service.loadbalancer.listener.addTargets('gzac-frontend', {
      conditions: [ListenerCondition.hostHeaders([fqdomain])],
      healthCheck: {
        enabled: true,
        path: '/',
        healthyHttpCodes: '200',
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 6,
        timeout: Duration.seconds(10),
        interval: Duration.seconds(15),
        protocol: AlbProtocol.HTTP,
      },
      port: 80,
      targets: [service],
      priority: this.props.serviceConfiguration.loadbalancerPriority,
      deregistrationDelay: Duration.minutes(1),
    });
    ECSServiceUtils.allowExecutingCommands(task);

    new SubdomainCloudfront(this, 'subdomain', {
      certificate: this.props.certificate,
      hostedZone: this.props.hostedzone,
      loadbalancer: this.props.service.loadbalancer.alb,
      subdomain: GZACFrontendService.SUBDOMAIN,
    });

    return service;
  }

  private logGroup() {
    return new LogGroup(this, 'logs', {
      retention: RetentionDays.ONE_MONTH,
      encryptionKey: this.props.key,
    });
  }

}
