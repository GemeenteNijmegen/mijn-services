import { ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import { Distribution, ViewerProtocolPolicy, PriceClass } from 'aws-cdk-lib/aws-cloudfront';
import { aws_cloudfront_origins } from 'aws-cdk-lib/aws-cloudfront-origins';
import { ApplicationLoadBalancer } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';

class CloudfrontDistributionForLoadBalancerProps {
  domains: string[];
  loadbalancer: ApplicationLoadBalancer;
  certificate: ICertificate;
}
export class CloudfrontDistributionForLoadBalancer extends Construct {
  constructor(scope: Construct, id: string, private props: CloudfrontDistributionForLoadBalancerProps) {
    super(scope, id);

    this.createDistribution();
  }

  createDistribution() {
    const distribution = new Distribution(this, 'MyDistribution', {
      comment: 'Distribution for my services loadbalancer',
      defaultBehavior: {
        origin: aws_cloudfront_origins.VpcOrigin.withApplicationLoadBalancer(this.props.loadbalancer),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
      certificate: this.props.certificate,
      domainNames: this.props.domains,
      priceClass: PriceClass.PRICE_CLASS_100,
    });
    return distribution;
  }
}
