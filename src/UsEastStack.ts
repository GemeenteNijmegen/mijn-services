import { Stack, StackProps } from 'aws-cdk-lib';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';
import { HostedZone, IHostedZone } from 'aws-cdk-lib/aws-route53';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { RemoteParameters } from 'cdk-remote-stack';
import { Construct } from 'constructs';
import { Configurable } from './Configuration';
import { Statics } from './Statics';

interface UsEastStackProps extends StackProps, Configurable {}

export class UsEastStack extends Stack {
  private readonly props: UsEastStackProps;

  constructor(scope: Construct, id: string, props: UsEastStackProps) {
    super(scope, id, props);
    this.props = props;

    const hostedzone = this.importHostedZone();
    this.setupCloudfrontCertificate(hostedzone);

  }

  /**
   * Create a certificate in us-east-1
   * Validate using DNS if no alternative domain names are privated. Manual cname record creation required othersies.
   * Store ceritifate arn in ssm.
   * @param hostedzone
   */
  setupCloudfrontCertificate(hostedzone: IHostedZone) {
    const validation = this.props.configuration.alternativeDomainNames ? CertificateValidation.fromDns() : CertificateValidation.fromDns(hostedzone);
    const certificate = new Certificate(this, 'cloudfonrt-certificate', {
      domainName: hostedzone.zoneName,
      subjectAlternativeNames: this.props.configuration.alternativeDomainNames,
      validation: validation,
    });

    new StringParameter(this, 'cloudfront-certificate-arn', {
      parameterName: Statics._ssmCertificateArn,
      stringValue: certificate.certificateArn,
    });
  }

  importHostedZone() {
    const params = new RemoteParameters(this, 'remote-params', {
      path: Statics.ssmAccountRootHostedZonePath,
      region: this.props.configuration.deploymentEnvironment.region,
    });
    return HostedZone.fromHostedZoneAttributes(this, 'hostedzone', {
      hostedZoneId: params.get(Statics.ssmAccountRootHostedZoneId),
      zoneName: params.get(Statics.ssmAccountRootHostedZoneName),
    });
  }
}