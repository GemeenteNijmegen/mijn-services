import { Duration } from 'aws-cdk-lib';
import { HttpApi, HttpMethod, MappingValue, ParameterMapping } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Function } from 'aws-cdk-lib/aws-lambda';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { ListenerFunction } from './Listener/listener-function';
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

    const haalcentraalApiKey = Secret.fromSecretNameV2(this, 'haalcentraal-apikey', Statics.ssmHaalCentraalBRPApiKeySecret);
    const params = this.setupVulServiceConfiguration(id);
    const openKlantConfig = this.props.openKlantRegistrationServiceConfiguration;
    const service = new ListenerFunction(this, 'listener', {
      timeout: Duration.seconds(30),
      description: `Notification endpoint for ${id}`,
      environment: {
        OPEN_KLANT_API_URL: openKlantConfig.openKlantUrl,
        OPEN_KLANT_API_KEY_ARN: params.openklant.secretArn,
        ZGW_TOKEN_CLIENT_ID_ARN: params.zgw.id.secretArn,
        ZGW_TOKEN_CLIENT_SECRET_ARN: params.zgw.secret.secretArn,
        ZAKEN_API_URL: openKlantConfig.zakenApiUrl,
        DEBUG: openKlantConfig.debug ? 'true' : 'false',
        API_KEY_ARN: params.authentication.secretArn,
        ROLTYPES_TO_REGISTER: openKlantConfig.roltypesToRegister.join(','),
        HAALCENTRAAL_BRP_APIKEY_ARN: haalcentraalApiKey.secretArn,
        HAALCENTRAAL_BRP_BASEURL: StringParameter.fromStringParameterName(this, 'haalcentraal-apibaseurl', Statics.ssmHaalCentraalBRPBaseUrl).stringValue,
        STRATEGY: this.props.openKlantRegistrationServiceConfiguration.strategy,
      },
    });

    params.openklant.grantRead(service);
    params.zgw.id.grantRead(service);
    params.zgw.secret.grantRead(service);
    params.authentication.grantRead(service);
    haalcentraalApiKey.grantRead(service);

    this.setupRoute(service);

  }

  private setupVulServiceConfiguration(id: string) {
    const ssmApiKey = `/${Statics.projectName}/open-klant-registration/${id}/api-key`;
    const ssmOpenKlantApiKey = `/${Statics.projectName}/open-klant-registration/${id}/open-klant-api-key`;
    const ssmZgwTokenClientId = `/${Statics.projectName}/open-klant-registration/${id}/zgw/client-id`;
    const ssmZgwTokenClientSecret = `/${Statics.projectName}/open-klant-registration/${id}/zgw/clientsecret`;

    const openKlantApiKey = new Secret(this, 'open-klant-api-key', {
      secretName: ssmOpenKlantApiKey,
      description: `OpenKlantRegistrationService (${id}) api key for open-klant`,
    });

    const zgwTokenClientId = new Secret(this, 'zgw-token-client-id', {
      secretName: ssmZgwTokenClientId,
      description: `OpenKlantRegistrationService (${id}) ZGW token client id`,
    });

    const zgwTokenClientSecret = new Secret(this, 'zgw-token-client-secret', {
      secretName: ssmZgwTokenClientSecret,
      description: `OpenKlantRegistrationService (${id}) ZGW token client secret`,
    });

    const serviceApiKey = new Secret(this, 'service-api-key', {
      secretName: ssmApiKey,
      description: `OpenKlantRegistrationService (${id}) api key used for calling this service`,
      generateSecretString: {
        excludePunctuation: true,
        passwordLength: 64,
      },
    });

    return {
      openklant: openKlantApiKey,
      zgw: {
        id: zgwTokenClientId,
        secret: zgwTokenClientSecret,
      },
      authentication: serviceApiKey,
    };

  }

  private setupRoute(handler: Function) {
    this.props.api.addRoutes({
      path: this.props.openKlantRegistrationServiceConfiguration.path,
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('integration', handler, {
        parameterMapping: new ParameterMapping().appendHeader('X-Authorization', MappingValue.requestHeader('Authorization')),
      }),
    });
  }

}
