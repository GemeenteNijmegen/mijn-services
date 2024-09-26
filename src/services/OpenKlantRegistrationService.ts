import { Duration } from 'aws-cdk-lib';
import { ApiKey, UsagePlan } from 'aws-cdk-lib/aws-apigateway';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Function } from 'aws-cdk-lib/aws-lambda';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { OpenKlantRegistrationServiceConfiguration } from '../Configuration';
import { ListenerFunction } from '../lambdas/OpenKlantRegistrationService/listener-function';
import { Statics } from '../Statics';

export interface OpenKlantRegistrationServiceProps {
  openKlantRegistrationServiceConfiguration: OpenKlantRegistrationServiceConfiguration;
  api: HttpApi;
}

export class OpenKlantRegistrationService extends Construct {

  private readonly props: OpenKlantRegistrationServiceProps;
  constructor(scope: Construct, id: string, props: OpenKlantRegistrationServiceProps) {
    super(scope, id);
    this.props = props;

    const params = this.setupVulServiceConfiguration(id);

    const service = new ListenerFunction(this, 'listener', {
      timeout: Duration.seconds(30),
      environment: {
        OPEN_KLANT_API_URL: this.props.openKlantRegistrationServiceConfiguration.openKlantUrl,
        OPEN_KLANT_API_KEY_ANR: params.openklant.secretArn,
        ZGW_TOKEN_CLIENT_SECRET: params.zgw.secretArn,
        ZAKEN_API_URL: this.props.openKlantRegistrationServiceConfiguration.zakenApiUrl,
        DEBUG: this.props.openKlantRegistrationServiceConfiguration.debug ? 'true' : 'false',
      },
    });

    params.openklant.grantRead(service);
    params.zgw.grantRead(service);

    this.setupRoute(id, service);

  }

  private setupVulServiceConfiguration(id: string) {
    const ssmOpenKlantApiKey = `/${Statics.projectName}/open-klant-regisration/${id}/open-klant-api-key`;
    const ssmZgwTokenClientCredentials = `/${Statics.projectName}/open-klant-regisration/${id}/zgw-token/client-credentials`;

    const openKlantApiKey = new Secret(this, 'open-klant-api-key', {
      secretName: ssmOpenKlantApiKey,
      description: 'OpenKlantRegistrationService (${id}) api key for open-klant',
    });

    const zgwTokenClientCredentials = new Secret(this, 'zgw-token-client-credentials', {
      secretName: ssmZgwTokenClientCredentials,
      description: 'OpenKlantRegistrationService (${id}) api key for open-klant',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          clientId: 'client-id',
        }),
        generateStringKey: 'secret',
      },
    });

    return {
      openklant: openKlantApiKey,
      zgw: zgwTokenClientCredentials,
    };

  }

  private setupRoute(id: string, handler: Function) {

    new UsagePlan(this, 'usage-plan', {
      description: `For ${id}`,
    });

    new ApiKey(this, 'api-key', {
      description: `For ${id}`,
    });

    this.props.api.addRoutes({
      path: this.props.openKlantRegistrationServiceConfiguration.path,
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('integration', handler),
    });
  }

}