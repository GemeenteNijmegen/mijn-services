import { StackProps, Duration } from 'aws-cdk-lib';
import { IVpc, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { FargateService } from 'aws-cdk-lib/aws-ecs';
import { IListenerCertificate, ApplicationLoadBalancer, ApplicationListener, ListenerAction, ListenerCondition, Protocol } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { AaaaRecord, ARecord, IHostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { LoadBalancerTarget } from 'aws-cdk-lib/aws-route53-targets';
import { Construct } from 'constructs';

interface LoadBalancerProps extends StackProps {
  vpc: IVpc;
  certificate: IListenerCertificate;
  hostedZone: IHostedZone;
}

export class ServiceLoadBalancer extends Construct {
  public alb: ApplicationLoadBalancer;
  private listener: ApplicationListener;
  private priority: number = 1;
  constructor(scope: Construct, id: string, private readonly props: LoadBalancerProps) {
    super(scope, id);

    // Import VPC
    this.alb = new ApplicationLoadBalancer(this, 'alb', {
      vpc: props.vpc,
      internetFacing: true,
    });

    this.addDnsRecords();
    this.listener = this.createListener(props.certificate);
  }

  private addDnsRecords() {
    new ARecord(this, 'a-record', {
      target: RecordTarget.fromAlias(new LoadBalancerTarget(this.alb)),
      zone: this.props.hostedZone,
    });
    new AaaaRecord(this, 'aaaa', {
      target: RecordTarget.fromAlias(new LoadBalancerTarget(this.alb)),
      zone: this.props.hostedZone,
    });
  }

  createListener(certificate: IListenerCertificate) {
    const httpsListener = this.alb.addListener('listener', {
      port: 443,
      certificates: [certificate],
      open: true,
      defaultAction: ListenerAction.fixedResponse(404, {
        contentType: 'text/plain',
        messageBody: 'Niet gevonden',
      }),
    });

    return httpsListener;
  }

  attachECSService(service: FargateService, path: string, priority?: number) {
    const listenerProps = {
      port: 80,
      targets: [service],
      conditions: [
        ListenerCondition.pathPatterns([path]),
      ],
      priority: priority ?? this.priority,
      healthCheck: {
        enabled: true,
        path: '/',
        healthyHttpCodes: '200',
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 6,
        timeout: Duration.seconds(10),
        interval: Duration.seconds(15),
        protocol: Protocol.HTTP,
      },
      deregistrationDelay: Duration.minutes(1),
    };
    console.debug(listenerProps);
    this.listener.addTargets(`${service.node.id}-target`, listenerProps);
    this.priority += 1;
  }
}
