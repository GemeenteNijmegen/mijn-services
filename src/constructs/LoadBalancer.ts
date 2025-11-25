import { Duration, StackProps } from 'aws-cdk-lib';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';
import { IVpc, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { FargateService } from 'aws-cdk-lib/aws-ecs';
import { AddApplicationTargetsProps, ApplicationListener, ApplicationLoadBalancer, IListenerCertificate, ListenerAction, ListenerCondition, Protocol } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { LambdaTarget } from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets';
import { Function } from 'aws-cdk-lib/aws-lambda';
import { ARecord, IHostedZone, PrivateHostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { LoadBalancerTarget } from 'aws-cdk-lib/aws-route53-targets';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

interface LoadBalancerProps extends StackProps {
  vpc: IVpc;
  hostedzone: IHostedZone;
}

export class ServiceLoadBalancer extends Construct {
  public alb: ApplicationLoadBalancer;
  private listener: ApplicationListener;
  private priority: number = 2;
  constructor(scope: Construct, id: string, private readonly props: LoadBalancerProps) {
    super(scope, id);

    const privateHostedZone = new PrivateHostedZone(this, 'private-hostedzone', {
      vpc: props.vpc,
      zoneName: `alb.${props.hostedzone.zoneName}`,
      comment: 'Used for privat ALB dns name',
    });
    const certificate = new Certificate(this, 'cert', {
      domainName: `alb.${props.hostedzone.zoneName}`,
      validation: CertificateValidation.fromDns(props.hostedzone), // Note: we use the public hosted zone here
    });

    // Import VPC
    this.alb = new ApplicationLoadBalancer(this, 'alb', {
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE_WITH_EGRESS,
      },
    });

    new ARecord(this, 'a-record', {
      target: RecordTarget.fromAlias(new LoadBalancerTarget(this.alb)),
      zone: privateHostedZone,
    });

    this.listener = this.createListener(certificate);
    this.forwardHttpToHttps();

    this.addAccessLogging();
  }

  private addAccessLogging() {
    const bucket = new Bucket(this, 'access-logs');
    this.alb.logAccessLogs(bucket);
  }


  createListener(certificate: IListenerCertificate) {
    const httpListener = this.alb.addListener('listener', {
      port: 443,
      certificates: [certificate],
      open: false,
      defaultAction: ListenerAction.fixedResponse(404, {
        contentType: 'text/plain',
        messageBody: 'Niet gevonden',
      }),
    });

    return httpListener;
  }

  forwardHttpToHttps() {
    const httpListener = this.alb.addListener('listener', {
      port: 80,
      open: false,
      defaultAction: ListenerAction.redirect({
        permanent: true,
        protocol: 'https',
      })
    });

    return httpListener;
  }

  attachECSService(
    service: FargateService,
    pathOrSubdomain: string,
    priority?: number,
    props?: AddApplicationTargetsProps,
    routeBySubdomain?: boolean,
    targetGroupId?: string,
  ) {
    const defaultHealthCheck = {
      enabled: true,
      path: '/',
      healthyHttpCodes: '200',
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 6,
      timeout: Duration.seconds(10),
      interval: Duration.seconds(15),
      protocol: Protocol.HTTP,
    };

    let condition = ListenerCondition.pathPatterns([pathOrSubdomain]);
    if (routeBySubdomain) {
      condition = ListenerCondition.hostHeaders([pathOrSubdomain]);
    }

    const listenerProps: AddApplicationTargetsProps = {
      port: 80,
      targets: [service],
      conditions: [condition],
      priority: priority ?? this.priority,
      healthCheck: props?.healthCheck ?? defaultHealthCheck,
      deregistrationDelay: Duration.minutes(1),
    };
    console.debug(listenerProps);
    this.listener.addTargets(`${targetGroupId ?? pathOrSubdomain}-target`, { ...listenerProps, ...props });
    this.priority += 1;
  }

  attachLambda(lambda: Function, path: string, priority?: number, props?: AddApplicationTargetsProps) {
    const listenerProps: AddApplicationTargetsProps = {
      targets: [new LambdaTarget(lambda)],
      conditions: [
        ListenerCondition.pathPatterns([path]),
      ],
      priority: priority ?? this.priority,
    };
    this.listener.addTargets(`${path}-target`, { ...listenerProps, ...props });
    this.priority += 1;
  }
}
