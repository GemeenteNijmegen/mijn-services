import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import { AwsLogDriver, Compatibility, ContainerImage, FargateService, Protocol, Secret, TaskDefinition } from 'aws-cdk-lib/aws-ecs';
import { Protocol as AlbProtocol, ListenerCondition } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Key } from 'aws-cdk-lib/aws-kms';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { IHostedZone } from 'aws-cdk-lib/aws-route53';
import { DnsRecordType } from 'aws-cdk-lib/aws-servicediscovery';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { GZACFrontendConfiguration } from '../ConfigurationInterfaces';
import {
  EcsServiceFactory,
  EcsServiceFactoryProps,
  ECSServiceUtils,
} from '../constructs/EcsServiceFactory';
import { SubdomainCloudfront } from '../constructs/SubdomainCloudfront';
import { Statics } from '../Statics';


interface GZACServiceProps {
  readonly service: EcsServiceFactoryProps;
  readonly path: string;
  readonly hostedzone: IHostedZone;
  /**
   * The configuration for the open configuration installation
   */
  readonly serviceConfiguration: GZACFrontendConfiguration;
  readonly key: Key;
  readonly certificate: ICertificate;
}

export class GZACFrontendService extends Construct {


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

    // Ensure SSM parameters for this service exist
    const params = this.setupParameters();

    // Compile the domain name this service is running on.
    const domainName = `https://${this.props.serviceConfiguration.subdomain}.${this.props.hostedzone.zoneName}`;

    return {
      secrets: {
        KEYCLOAK_URL: Secret.fromSsmParameter(params.keycloakUrl),
        KEYCLOAK_REALM: Secret.fromSsmParameter(params.keycloakRealm),
        KEYCLOAK_CLIENT_ID: Secret.fromSsmParameter(params.keycloakClientId),
        KEYCLOAK_REDIRECT_URI: Secret.fromSsmParameter(params.keycloakRedirectUrl),
        KEYCLOAK_LOGOUT_REDIRECT_URI: Secret.fromSsmParameter(params.keycloakLogoutRedirectUrl),
      },
      envionment: {
        API_URI: `https://gzac-api.${this.props.hostedzone.zoneName}`,
        WHITELISTED_DOMAIN: domainName,
        ENABLE_CASE_WIDGETS: 'true',
        ENABLE_TASK_PANEL: 'true',
      },
    };
  }

  private setupService() {
    const task = new TaskDefinition(this, 'gzac-frontend', {
      cpu: this.props.serviceConfiguration.taskSize?.cpu ?? '512',
      memoryMiB: this.props.serviceConfiguration.taskSize?.memory ?? '1024',
      compatibility: Compatibility.FARGATE,
    });

    const env = this.getEnvironmentConfiguration();

    // Main service container
    task.addContainer('gzac-frontend', {
      image: ContainerImage.fromRegistry(this.props.serviceConfiguration.image),
      command: [
        '/bin/sh', '-c',
        // Replace hardcoded gzac-backend upstream with API_URI, then run normal startup
        'sed -i "s|http://gzac-backend:8080|${API_URI}|g" /etc/nginx/conf.d/default.conf && '
        + 'envsubst < /usr/share/nginx/html/assets/config.template.js > /usr/share/nginx/html/assets/config.js && '
        + 'exec nginx -g "daemon off;"',
      ],
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
      secrets: env.secrets,
      environment: env.envionment,
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
      desiredCount: this.props.serviceConfiguration.taskSize?.desiredTaskCount ?? 1,
      enableExecuteCommand: true,
      healthCheckGracePeriod: Duration.seconds(120), // Give time to start
    });


    // Attach to loadbalancer
    let fqdomain = `${this.props.serviceConfiguration.subdomain}.${this.props.hostedzone.zoneName}`;
    this.props.service.loadbalancer.listener.addTargets('gzac-frontend', {
      conditions: [ListenerCondition.hostHeaders([fqdomain])],
      healthCheck: {
        enabled: true,
        path: '/',
        healthyHttpCodes: '200,302',
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
      subdomain: this.props.serviceConfiguration.subdomain,
    });

    return service;
  }

  private logGroup() {
    return new LogGroup(this, 'logs', {
      retention: RetentionDays.ONE_MONTH,
      encryptionKey: this.props.key,
    });
  }

  private setupParameters() {
    const hostedZoneName = this.props.hostedzone.zoneName;
    const frontendDomain = `${this.props.serviceConfiguration.subdomain}.${hostedZoneName}`;

    const backendUrl = new StringParameter(this, 'backend-url', {
      stringValue: `https://gzac-api.${hostedZoneName}`,
      description: 'URL pointing the gzac backend used by frontend',
      parameterName: `/${Statics.projectName}/${this.props.serviceConfiguration.id}/frontend/api-url`,
    });

    const keycloakUrl = new StringParameter(this, 'keycloak-url', {
      stringValue: `https://keycloak.${hostedZoneName}`,
      description: 'Keycloak URL used by the gzac frontend',
      parameterName: `/${Statics.projectName}/${this.props.serviceConfiguration.id}/frontend/keycloak-url`,
    });

    const keycloakRealm = new StringParameter(this, 'keycloak-realm', {
      stringValue: 'gzac',
      description: 'Keycloak realm used by the gzac frontend',
      parameterName: `/${Statics.projectName}/${this.props.serviceConfiguration.id}/frontend/keycloak-realm`,
    });

    const keycloakClientId = new StringParameter(this, 'keycloak-client-id', {
      stringValue: 'gzac-frontend',
      description: 'Keycloak client id used by the gzac frontend',
      parameterName: `/${Statics.projectName}/${this.props.serviceConfiguration.id}/frontend/keycloak-client-id`,
    });

    const keycloakRedirectUrl = new StringParameter(this, 'keycloak-redirect-uri', {
      stringValue: `https://${frontendDomain}`,
      description: 'Keycloak redirect URI used by the gzac frontend',
      parameterName: `/${Statics.projectName}/${this.props.serviceConfiguration.id}/frontend/keycloak-redirect-uri`,
    });

    const keycloakLogoutRedirectUrl = new StringParameter(this, 'keycloak-logout-redirect-uri', {
      stringValue: `https://${frontendDomain}`,
      description: 'Keycloak logout redirect URI used by the gzac frontend',
      parameterName: `/${Statics.projectName}/${this.props.serviceConfiguration.id}/frontend/keycloak-logout-redirect-uri`,
    });

    return {
      backendUrl,
      keycloakUrl,
      keycloakRealm,
      keycloakClientId,
      keycloakRedirectUrl,
      keycloakLogoutRedirectUrl,
    };
  }

}
