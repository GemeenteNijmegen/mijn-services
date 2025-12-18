import { aws_cloudfront_origins } from 'aws-cdk-lib';
import { ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import { AllowedMethods, CachePolicy, Distribution, OriginProtocolPolicy, OriginRequestPolicy, PriceClass, ResponseHeadersPolicy, ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { ApplicationLoadBalancer } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { AaaaRecord, ARecord, IHostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import { Construct } from 'constructs';

class SubdomainCloudfrontProps {
  subdomain: string;
  loadbalancer: ApplicationLoadBalancer;
  hostedZone: IHostedZone;
  certificate: ICertificate;
}
export class SubdomainCloudfront extends Construct {

  private domain: string;

  constructor(scope: Construct, id: string, private props: SubdomainCloudfrontProps) {
    super(scope, id);
    this.domain = `${this.props.subdomain}.${this.props.hostedZone.zoneName}`;
    this.createDistribution();
  }

  createDistribution() {

    // Note: VpcOrigin access to lb is managed using custom resource in CloudfrontDistributionForLoadBalancer construct.
    const httpsOrigin = aws_cloudfront_origins.VpcOrigin.withApplicationLoadBalancer(this.props.loadbalancer, {
      protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY,
      originId: `${this.props.subdomain}-https`,
      domainName: `alb.${this.props.hostedZone.zoneName}`,
    });

    const distribution = new Distribution(this, 'distribution', {
      comment: `Distribution for ${this.props.subdomain} subdomain`,
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
      certificate: this.props.certificate,
      domainNames: [this.domain],
      priceClass: PriceClass.PRICE_CLASS_100,
    });
    this.addDnsRecords(distribution);
    return distribution;
  }

  private addDnsRecords(distribution: Distribution) {
    new ARecord(this, 'a-record', {
      recordName: this.domain,
      target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
      zone: this.props.hostedZone,
    });
    new AaaaRecord(this, 'aaaa', {
      recordName: this.domain,
      target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
      zone: this.props.hostedZone,
    });
  }

}
