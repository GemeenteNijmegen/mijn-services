import {
  aws_ssm as SSM, Stack,
  StackProps,
} from 'aws-cdk-lib';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';
import { HostedZone, IHostedZone } from 'aws-cdk-lib/aws-route53';
import { RemoteParameters } from 'cdk-remote-stack';
import { Construct } from 'constructs';
import { Statics } from './Statics';

export interface UsEastCertificateStackProps extends StackProps {
  mainRegion: string;
  /**
   * Additional domain names to use for the certificate
   * @default - no alternative domain names
   */
  alternativeDomainNames?: string[];
}

export class UsEastCertificateStack extends Stack {

  constructor(scope: Construct, id: string, props: UsEastCertificateStackProps) {
    super(scope, id, props);
    const hostedZone = this.importProjectHostedZone(this, props.mainRegion);
    this.createCertificate(hostedZone, props.alternativeDomainNames);
  }

  private importProjectHostedZone(scope: Construct, fromRegion: string) {
    const zoneParams = new RemoteParameters(scope, 'zone-params', {
      path: Statics.ssmAccountRootHostedZonePath,
      region: fromRegion,
    });
    return HostedZone.fromHostedZoneAttributes(scope, 'zone', {
      hostedZoneId: zoneParams.get(Statics.ssmAccountRootHostedZoneId),
      zoneName: zoneParams.get(Statics.ssmAccountRootHostedZoneName),
    });
  }
  createCertificate(hostedZone: IHostedZone, alternativeDomainNames?: string[]) {
    const validation = alternativeDomainNames ? CertificateValidation.fromDns() : CertificateValidation.fromDns(hostedZone);
    const cert = new Certificate(this, 'certificate', {
      domainName: hostedZone.zoneName,
      validation: validation,
      subjectAlternativeNames: alternativeDomainNames,
    });

    new SSM.StringParameter(this, 'cert-arn', {
      stringValue: cert.certificateArn,
      parameterName: Statics.ssmCertificateArn,
    });


  }
}
