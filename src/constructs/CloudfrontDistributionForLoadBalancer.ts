import { aws_cloudfront_origins } from 'aws-cdk-lib';
import { Certificate, ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import { Distribution, ViewerProtocolPolicy, PriceClass } from 'aws-cdk-lib/aws-cloudfront';
import { ApplicationLoadBalancer } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { RemoteParameters } from 'cdk-remote-stack';
import { Construct } from 'constructs';
import { Statics } from '../Statics';

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

  /**
   * Get the certificate ARN from parameter store in us-east-1
   * @returns string Certificate ARN
   */
  private certificateArn() {
    const parameters = new RemoteParameters(this, 'params', {
      path: `${Statics.ssmCertificatePath}/`,
      region: 'us-east-1',
    });
    const certificateArn = parameters.get(Statics.ssmCertificateArn);
    return certificateArn;
  }


  createDistribution() {
    const certificate = Certificate.fromCertificateArn(this, 'certificate', this.certificateArn());
    const distribution = new Distribution(this, 'MyDistribution', {
      comment: 'Distribution for my services loadbalancer',
      defaultBehavior: {
        origin: aws_cloudfront_origins.VpcOrigin.withApplicationLoadBalancer(this.props.loadbalancer),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
      certificate: certificate,
      domainNames: this.props.domains,
      priceClass: PriceClass.PRICE_CLASS_100,
    });
    return distribution;
  }
}
