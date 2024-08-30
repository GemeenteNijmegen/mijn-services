import { CfnAccount, IntegrationType } from 'aws-cdk-lib/aws-apigateway';
import { CfnIntegration, CfnRoute, CfnStage, DomainName, HttpApi, HttpConnectionType, SecurityPolicy, VpcLink } from 'aws-cdk-lib/aws-apigatewayv2';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { ManagedPolicy, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { ARecord, IHostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { ApiGatewayv2DomainProperties } from 'aws-cdk-lib/aws-route53-targets';
import { IService } from 'aws-cdk-lib/aws-servicediscovery';
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
}

export class ApiGateway extends Construct {

  readonly api: HttpApi;

  constructor(scope: Construct, id: string, props: ApiGatewayProps) {
    super(scope, id);

    const cert = new Certificate(this, 'certificate', {
      domainName: props.hostedzone.zoneName,
      validation: CertificateValidation.fromDns(props.hostedzone),
    });

    this.api = new HttpApi(this, 'api-gateway', {
      description: 'API for mijn-services',
    });

    const domain = new DomainName(this, 'domain', {
      certificate: cert,
      domainName: props.hostedzone.zoneName,
      securityPolicy: SecurityPolicy.TLS_1_2,
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
      }),
    };

  }

  addRoute(id: string, link: VpcLink, service: IService, path: string) {
    const integration = new CfnIntegration(this, `integration-${id}`, {
      apiId: this.api.apiId,
      connectionId: link.vpcLinkId,
      connectionType: HttpConnectionType.VPC_LINK,
      integrationType: IntegrationType.HTTP_PROXY,
      integrationUri: service.serviceArn,
      integrationMethod: 'ANY',
      payloadFormatVersion: '1.0',
    });
    integration.node.addDependency(service);
    integration.node.addDependency(link);

    const route = new CfnRoute(this, `route-${id}`, {
      apiId: this.api.apiId,
      routeKey: `ANY /${path}/{proxy+}`,
      target: `integrations/${integration.ref}`,
    });
    route.addDependency(integration);

  }
}