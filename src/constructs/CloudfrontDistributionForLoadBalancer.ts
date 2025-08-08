import { aws_cloudfront_origins, Duration } from 'aws-cdk-lib';
import { Certificate, ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import { AllowedMethods, CachePolicy, Distribution, OriginProtocolPolicy, OriginRequestPolicy, PriceClass, ResponseHeadersPolicy, ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { Port } from 'aws-cdk-lib/aws-ec2';
import { ApplicationLoadBalancer } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { AaaaRecord, ARecord, IHostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import { RemoteParameters } from 'cdk-remote-stack';
import { Construct } from 'constructs';
import { Statics } from '../Statics';
import { SecurityGroupFromId } from './SecurityGroupFromId';

class CloudfrontDistributionForLoadBalancerProps {
  domains: string[];
  loadbalancer: ApplicationLoadBalancer;
  certificate: ICertificate;
  hostedZone: IHostedZone;
  deployDnsRecords?: boolean;
}
export class CloudfrontDistributionForLoadBalancer extends Construct {
  constructor(scope: Construct, id: string, private props: CloudfrontDistributionForLoadBalancerProps) {
    super(scope, id);

    this.createDistribution();
  }

  /**
   * Get the certificate ARN from parameter store in us-east-1
   * @returns string Certificate ARN
   */
  private certificateArn() {
    const parameters = new RemoteParameters(this, 'params', {
      path: `${Statics.ssmCertificatePath}/`,
      region: 'us-east-1',
      timeout: Duration.seconds(10),
    });
    const certificateArn = parameters.get(Statics.ssmCertificateArn);
    return certificateArn;
  }


  createDistribution() {
    const certificate = Certificate.fromCertificateArn(this, 'certificate', this.certificateArn());

    const httpsOrigin = aws_cloudfront_origins.VpcOrigin.withApplicationLoadBalancer(this.props.loadbalancer, {
      protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY,
      originId: 'alborigin-https',
      domainName: `alb.${this.props.hostedZone.zoneName}`, // Private DNS hostedzone used for alb.
    });

    const distribution = new Distribution(this, 'MyDistribution', {
      comment: 'Distribution for my services loadbalancer',
      defaultBehavior: {
        origin: httpsOrigin,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_ALL,
        responseHeadersPolicy: new ResponseHeadersPolicy(this, 'response-header-policy', {
          comment: 'Response headers allowed for mijn-services',
          customHeadersBehavior: {
            customHeaders: [
              { // Required for some apps to call open-zaak
                header: 'API-version',
                value: '1.3.1',
                override: false,
              },
            ],
          },
        }),
        originRequestPolicy: OriginRequestPolicy.ALL_VIEWER,
        cachePolicy: CachePolicy.CACHING_DISABLED, // Maybe later we can look into this
      },
      defaultRootObject: 'index.html',
      certificate: certificate,
      domainNames: this.props.domains,
      priceClass: PriceClass.PRICE_CLASS_100,
    });
    this.addDnsRecords(distribution);
    this.allowAccessToLoadBalancer(this.props.loadbalancer, distribution);
    return distribution;
  }

  private allowAccessToLoadBalancer(lb: ApplicationLoadBalancer, distribution: Distribution) {
    const group = new SecurityGroupFromId(this, 'cfsg', 'CloudFront-VPCOrigins-Service-SG');
    group.node.addDependency(distribution);
    lb.connections.securityGroups.forEach(sg => {
      sg.addIngressRule(group.group, Port.HTTPS, 'allow access from cloudfront to loadbalancer');
    });
  }


  private addDnsRecords(distribution: Distribution) {
    if (this.props.deployDnsRecords) {
      new ARecord(this, 'a-record', {
        target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
        zone: this.props.hostedZone,
      });
      new AaaaRecord(this, 'aaaa', {
        target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
        zone: this.props.hostedZone,
      });
    }
    new ARecord(this, 'a-record-cf', {
      target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
      zone: this.props.hostedZone,
      recordName: `cf.${this.props.hostedZone.zoneName}`,
    });
    new AaaaRecord(this, 'aaaa-recrod-cf', {
      target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
      zone: this.props.hostedZone,
      recordName: `cf.${this.props.hostedZone.zoneName}`,
    });
  }

}
