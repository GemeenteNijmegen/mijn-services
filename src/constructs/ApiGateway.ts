import { CfnAccount } from 'aws-cdk-lib/aws-apigateway';
import { CfnStage, DomainName, HttpApi, SecurityPolicy } from 'aws-cdk-lib/aws-apigatewayv2';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { ManagedPolicy, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { ARecord, IHostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { ApiGatewayv2DomainProperties } from 'aws-cdk-lib/aws-route53-targets';
import { Construct } from 'constructs';

export interface ApiGatewayProps {
  /**
   * The VPC to place the redis instance in.
   */
  vpc: IVpc;
  /**
   * Hosted zone for requesting a certificate
   */
  hostedzone: IHostedZone;
  /**
   * Additional domain names to use for the certificate
   * @default - no alternative domain names
   */
  alternativeDomainNames?: string[];
}

export class ApiGateway extends Construct {

  readonly api: HttpApi;

  constructor(scope: Construct, id: string, props: ApiGatewayProps) {
    super(scope, id);

    const validation = props.alternativeDomainNames ? CertificateValidation.fromDns() : CertificateValidation.fromDns(props.hostedzone);
    const cert = new Certificate(this, 'certificate', {
      domainName: props.hostedzone.zoneName,
      validation: validation,
      subjectAlternativeNames: props.alternativeDomainNames,
    });

    const domain = new DomainName(this, 'domain', {
      certificate: cert,
      domainName: props.hostedzone.zoneName,
      securityPolicy: SecurityPolicy.TLS_1_2,
    });

    this.api = new HttpApi(this, 'api-gateway', {
      description: 'API for mijn-services',
      defaultDomainMapping: {
        domainName: domain,
      },
    });

    new ARecord(this, 'a', {
      target: RecordTarget.fromAlias(new ApiGatewayv2DomainProperties(domain.regionalDomainName, domain.regionalHostedZoneId)),
      zone: props.hostedzone,
    });

    this.setupAccessLogging();

  }

  private setupAccessLogging() {

    const loggroup = new LogGroup(this, 'access-logging', {
      retention: RetentionDays.ONE_YEAR,
    });

    // We need to configure API gateway service to have a role that allows it to log to cloudwatch...
    const role = new Role(this, 'accesslogging-role', {
      assumedBy: new ServicePrincipal('apigateway.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonAPIGatewayPushToCloudWatchLogs'),
      ],
    });
    new CfnAccount(this, 'account', {
      cloudWatchRoleArn: role.roleArn,
    });

    loggroup.grantWrite(role);
    loggroup.grantWrite(new ServicePrincipal('apigateway.amazonaws.com'));

    const defaultStage = this.api.defaultStage?.node.defaultChild as CfnStage;
    if (!defaultStage) {
      throw Error('Expected default stage to be set for api gateway!');
    }
    defaultStage.accessLogSettings = {
      destinationArn: loggroup.logGroupArn,
      format: JSON.stringify({
        requestId: '$context.requestId',
        userAgent: '$context.identity.userAgent',
        sourceIp: '$context.identity.sourceIp',
        requestTime: '$context.requestTime',
        requestTimeEpoch: '$context.requestTimeEpoch',
        httpMethod: '$context.httpMethod',
        path: '$context.path',
        status: '$context.status',
        protocol: '$context.protocol',
        responseLength: '$context.responseLength',
        domainName: '$context.domainName',
        integrationError: '$context.integration.error',
        integrationStatus: '$context.integration.status',
      }),
    };

  }


}