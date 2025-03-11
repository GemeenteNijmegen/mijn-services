import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { AwsLogDriver, ContainerImage, Protocol } from 'aws-cdk-lib/aws-ecs';
import { Key } from 'aws-cdk-lib/aws-kms';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { IHostedZone } from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';
import { GZACFrontendConfiguration } from '../Configuration';
import {
  EcsServiceFactory,
  EcsServiceFactoryProps,
} from '../constructs/EcsServiceFactory';


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

    // this.setupConfigurationService();
    const service = this.setupService();
    service.applyRemovalPolicy(RemovalPolicy.DESTROY);
  }

  private getEnvironmentConfiguration() {
    const trustedDomains =
      this.props.alternativeDomainNames?.map((a) => a) ?? [];
    trustedDomains.push(this.props.hostedzone.zoneName);
    return {
      API_URI: 'https://mijn-services.accp.nijmegen.nl/gzac-backend',
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
    // const container =
    task.addContainer('gzac-frontend', {
      image: ContainerImage.fromRegistry(this.props.serviceConfiguration.image),
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
      readonlyRootFilesystem: false,
      // secrets: this.getSecretConfiguration(),
      environment: this.getEnvironmentConfiguration(),
      logging: new AwsLogDriver({
        streamPrefix: 'main',
        logGroup: this.logs,
      }),
    });
    // this.serviceFactory.attachEphemeralStorage(container, VOLUME_NAME, '/tmp', '/app/log');

    // 1st Filesystem write access - initialization container
    // this.serviceFactory.setupWritableVolume(VOLUME_NAME, task, this.logs, container, '/tmp', '/app/log');

    const service = this.serviceFactory.createService({
      id: 'gzac-frontend',
      task: task,
      path: this.props.path,
      options: {
        desiredCount: 0,
      },
    });
    return service;
  }

  //   private setupConfigurationService() {
  //     const VOLUME_NAME = 'tmp';
  //     const task = this.serviceFactory.createTaskDefinition('setup', {
  //       volumes: [{ name: VOLUME_NAME }],
  //     });

  //     // Configuration container
  //     const initContainer = task.addContainer('setup', {
  //       image: ContainerImage.fromRegistry(this.props.serviceConfiguration.image),
  //       command: ['python', 'src/manage.py', 'createsuperuser', '--no-input', '--skip-checks'], // See django docs
  //       readonlyRootFilesystem: true,
  //       essential: true,
  //       logging: new AwsLogDriver({
  //         streamPrefix: 'setup',
  //         logGroup: this.logs,
  //       }),
  //       secrets: this.getSecretConfiguration(),
  //       environment: this.getEnvironmentConfiguration(),
  //     });
  //     this.serviceFactory.attachEphemeralStorage(initContainer, VOLUME_NAME, '/tmp', '/app/log', '/app/setup_configuration');

  //     // Filesystem write access - initialization container
  //     this.serviceFactory.setupWritableVolume(VOLUME_NAME, task, this.logs, initContainer, '/tmp', '/app/log', '/app/setup_configuration');

  //     // Scheduel a task in the past (so we can run it manually)
  //     const rule = new Rule(this, 'schedule-setup', {
  //       schedule: Schedule.cron({
  //         year: '2020',
  //       }),
  //       description: 'Rule to run setup configuration for KeyCloak-api (manually)',
  //     });
  //     const ecsTask = new EcsTask({
  //       cluster: this.props.service.cluster,
  //       taskDefinition: task,
  //     });
  //     rule.addTarget(ecsTask);

  //     // Setup connectivity
  //     this.setupConnectivity('setup', ecsTask.securityGroups ?? []);
  //     this.allowAccessToSecrets(task.executionRole!);
  //   }

  private logGroup() {
    return new LogGroup(this, 'logs', {
      retention: RetentionDays.ONE_MONTH,
      encryptionKey: this.props.key,
    });
  }

}
