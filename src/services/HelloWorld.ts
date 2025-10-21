import { Duration } from 'aws-cdk-lib';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { AwsLogDriver, ContainerImage, Protocol } from 'aws-cdk-lib/aws-ecs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { IHostedZone } from 'aws-cdk-lib/aws-route53';
import { RemoteParameters } from 'cdk-remote-stack';
import { Construct } from 'constructs';
import { EcsServiceFactory, EcsServiceFactoryProps } from '../constructs/EcsServiceFactory';
import { SubdomainCloudfront } from '../constructs/SubdomainCloudfront';
import { Statics } from '../Statics';

export interface HelloWorldServiceProps {
  readonly service: EcsServiceFactoryProps;
  readonly hostedzone: IHostedZone;
}

export class HelloWorldService extends Construct {

  private static readonly SUBDOMAIN = 'hello-world';

  private readonly logs: LogGroup;
  private readonly serviceFactory: EcsServiceFactory;
  private readonly distribution: SubdomainCloudfront;

  constructor(scope: Construct, id: string, private props: HelloWorldServiceProps) {
    super(scope, id);

    this.serviceFactory = new EcsServiceFactory(this, props.service);

    this.distribution = new SubdomainCloudfront(this, 'subdomain-cloudfront', {
      certificate: this.certificate(),
      hostedZone: this.props.hostedzone,
      loadbalancer: this.props.service.loadbalancer.alb,
      subdomain: HelloWorldService.SUBDOMAIN,
    });

    this.logs = this.logGroup();

    this.setupService();
  }

  private setupService() {

    const task = this.serviceFactory.createTaskDefinition('main', {
      cpu: '256',
      memoryMiB: '512',
    });

    // Configuration container
    task.addContainer('hellowordl', {
      image: ContainerImage.fromRegistry('jmalloc/echo-server'),
      readonlyRootFilesystem: false,
      logging: new AwsLogDriver({
        streamPrefix: 'setup',
        logGroup: this.logs,
      }),
      portMappings: [
        {
          containerPort: this.props.service.port,
          hostPort: this.props.service.port,
          protocol: Protocol.TCP,
        },
      ],
      environment: {
        LOG_HTTP_HEADERS: 'true',
        LOG_HTTP_BODY: 'true',
      },
    });

    const service = this.serviceFactory.createService({
      id: 'hello-world',
      task: task,
      domain: `${HelloWorldService.SUBDOMAIN}.${this.props.hostedzone.zoneName}`,
      options: {
        desiredCount: 1,
      },
      // healthCheckPath: '/admin', // Not configurabel yet while using subdomain
    });
    return service;
  }


  private logGroup() {
    return new LogGroup(this, 'logs', {
      retention: RetentionDays.ONE_MONTH,
    });
  }

  /**
   * Get the certificate ARN from parameter store in us-east-1
   * TODO find a better place for this
   * @returns string Certificate ARN
   */
  private certificate() {
    const parameters = new RemoteParameters(this, 'params', {
      path: `${Statics.ssmWildcardCertificatePath}/`,
      region: 'us-east-1',
      timeout: Duration.seconds(10),
    });
    const certificateArn = parameters.get(Statics.ssmWildcardCertificateArn);
    return Certificate.fromCertificateArn(this, 'cert', certificateArn);
  }

}
