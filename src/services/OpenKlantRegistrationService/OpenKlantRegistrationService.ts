import { Duration } from 'aws-cdk-lib';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Function } from 'aws-cdk-lib/aws-lambda';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { ListenerFunction } from './Listner/listener-function';
import { OpenKlantRegistrationServiceConfiguration } from '../../Configuration';
import { Statics } from '../../Statics';

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
        OPEN_KLANT_API_KEY_ARN: params.openklant.secretArn,
        ZGW_TOKEN_CLIENT_CREDETIALS_ARN: params.zgw.secretArn,
        ZAKEN_API_URL: this.props.openKlantRegistrationServiceConfiguration.zakenApiUrl,
        DEBUG: this.props.openKlantRegistrationServiceConfiguration.debug ? 'true' : 'false',
        API_KEY_ARN: params.authentication.secretArn,
      },
    });

    params.openklant.grantRead(service);
    params.zgw.grantRead(service);
    params.authentication.grantRead(service);

    this.setupRoute(service);

  }

  private setupVulServiceConfiguration(id: string) {
    const ssmApiKey = `/${Statics.projectName}/open-klant-regisration/${id}/api-key`;
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

    const serviceApiKey = new Secret(this, 'service-api-key', {
      secretName: ssmApiKey,
      description: 'OpenKlantRegistrationService (${id}) api key used for calling this service',
      generateSecretString: {
        excludePunctuation: true,
        passwordLength: 64,
      },
    });


    return {
      openklant: openKlantApiKey,
      zgw: zgwTokenClientCredentials,
      authentication: serviceApiKey,
    };

  }

  private setupRoute(handler: Function) {
    this.props.api.addRoutes({
      path: this.props.openKlantRegistrationServiceConfiguration.path,
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('integration', handler),
    });
  }

}