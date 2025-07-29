import { Duration, StackProps } from 'aws-cdk-lib';
import { IVpc, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { FargateService } from 'aws-cdk-lib/aws-ecs';
import { AddApplicationTargetsProps, ApplicationListener, ApplicationLoadBalancer, IListenerCertificate, ListenerAction, ListenerCondition, Protocol } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

interface LoadBalancerProps extends StackProps {
  vpc: IVpc;
  certificate: IListenerCertificate;
}

export class ServiceLoadBalancer extends Construct {
  public alb: ApplicationLoadBalancer;
  private listener: ApplicationListener;
  private priority: number = 2;
  constructor(scope: Construct, id: string, private readonly props: LoadBalancerProps) {
    super(scope, id);

    // Import VPC
    this.alb = new ApplicationLoadBalancer(this, 'alb', {
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE_WITH_EGRESS,
      },
    });

    this.listener = this.createListener(props.certificate);

    this.addAccessLogging();
  }

  private addAccessLogging() {
    const bucket = new Bucket(this, 'access-logs');
    this.alb.logAccessLogs(bucket);
  }


  createListener(certificate: IListenerCertificate) {
    const httpListener = this.alb.addListener('listener', {
      port: 80,
      open: false,
      defaultAction: ListenerAction.fixedResponse(404, {
        contentType: 'text/plain',
        messageBody: 'Niet gevonden',
      }),
    });

    return httpListener;
  }

  attachECSService(service: FargateService, path: string, priority?: number, props?: AddApplicationTargetsProps) {
    const listenerProps = {
      port: 80,
      targets: [service],
      conditions: [
        ListenerCondition.httpHeader('x-original-uri', [path]), // Set by cloudfront function (used for path rewrites)
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
    this.listener.addTargets(`${path}-target`, { ...listenerProps, ...props });
    this.priority += 1;
  }
}
