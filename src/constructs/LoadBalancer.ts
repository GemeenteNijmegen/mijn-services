import { StackProps, Duration } from 'aws-cdk-lib';
import { IVpc, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { FargateService } from 'aws-cdk-lib/aws-ecs';
import { IListenerCertificate, ApplicationLoadBalancer, ApplicationListener, ListenerAction, ListenerCondition, Protocol } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';

interface LoadBalancerProps extends StackProps {
  vpc: IVpc;
  securityGroup: SecurityGroup;
  certificate: IListenerCertificate;
}
export class LoadBalancer extends Construct {
  public alb: ApplicationLoadBalancer;
  private listener: ApplicationListener;
  private priority: number = 1;
  constructor(scope: Construct, id: string, private readonly props: LoadBalancerProps) {
    super(scope, id);

    // Import VPC
    this.alb = new ApplicationLoadBalancer(this, 'alb', {
      vpc: props.vpc,
      internetFacing: true,
      securityGroup: props.securityGroup,
    });
    this.listener = this.createListener(props.certificate);
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

  attachECSService(id: string, service: FargateService, domain: string, priority?: number) {
    const listenerProps = {
      port: 80,
      targets: [service],
      conditions: [
        ListenerCondition.hostHeaders([`${domain}`]),
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
    this.listener.addTargets(id, listenerProps);
    this.priority += 1;
  }
}
