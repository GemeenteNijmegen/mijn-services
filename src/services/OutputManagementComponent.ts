import { Duration } from 'aws-cdk-lib';
import { AwsLogDriver, ContainerImage, Secret as EcsSecret, Protocol } from 'aws-cdk-lib/aws-ecs';
import { Key } from 'aws-cdk-lib/aws-kms';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { OutputManagementComponentConfiguration } from '../Configuration';
import { EcsServiceFactory, EcsServiceFactoryProps } from '../constructs/EcsServiceFactory';
import { Statics } from '../Statics';

const DEFAULT_UUID = '00000000-0000-0000-0000-000000000000';

export interface OMCServiceProps {
  service: EcsServiceFactoryProps;
  omcConfiguration: OutputManagementComponentConfiguration;
  key: Key;
}

export class OMCService extends Construct {

  private readonly logs: LogGroup;
  private readonly props: OMCServiceProps;
  private readonly serviceFactory: EcsServiceFactory;
  private readonly configurationParameters: any;

  constructor(scope: Construct, id: string, props: OMCServiceProps) {
    super(scope, id);
    this.props = props;
    this.serviceFactory = new EcsServiceFactory(this, props.service);
    this.logs = this.logGroup();

    this.configurationParameters = this.setupConfigurationParameters(id);
    this.setupService();
  }

  private setupConfigurationParameters(id: string) {

    // Secret for signing the ZGW jwt token to authenticate at other ZGW components
    const ssmZgwJwt = `/${Statics.projectName}/omc/${id}/omc-jwt`;
    const omcJwtSecret = new Secret(this, 'omc-jwt', {
      description: `For jwt token to authenticate at OMC (${id})`,
      secretName: ssmZgwJwt,
    });

    // Secret for jwt token to authenticate at OMC
    const ssmOmcJwt = `/${Statics.projectName}/omc/${id}/zgw-jwt`;
    const zgwJwtSecret = new Secret(this, 'zgw-jwt', {
      description: `For jwt token to authenticate at other ZGW components, for OMC (${id})`,
      secretName: ssmOmcJwt,
    });

    // OpenKlant API key
    const ssmOpenKlantApiKey = `/${Statics.projectName}/omc/${id}/open-klant/api-key`;
    const openKlantApiKey = new Secret(this, 'open-klant-api-key', {
      description: `API key for OMC (${id}) to authenticate at open-klant `,
      secretName: ssmOpenKlantApiKey,
    });

    // NotifyNL API key
    const ssmNotifyNlApiKey = `/${Statics.projectName}/omc/${id}/notify/api-key`;
    const notifyNlApiKey = new Secret(this, 'notify-api-key', {
      description: `API key for OMC (${id}) to authenticate at NotifyNL`,
      secretName: ssmNotifyNlApiKey,
    });

    return {
      openklant: openKlantApiKey,
      notify: notifyNlApiKey,
      omcJwt: omcJwtSecret,
      zgwJwt: zgwJwtSecret,
    };
  }

  private getEnvironmentConfiguration() {

    return {
      // How a user authenticates at OMC
      OMC_AUTH_JWT_ISSUER: 'OMC', // Something identifying Notify NL (OMC Web API) service (it will be used internally) - The OMC is the issuer
      OMC_AUTH_JWT_AUDIENCE: 'OMC', // Cannot be missing 	Something identifying Notify NL (OMC Web API) service (it will be used internally) - The OMC is the audience
      // OpenNotificaties kan alleen maar met een static auth header authenticeren bij een callback endpoint (dus omc), daarom deze epxiration property ophogen.
      // The OMC JWT tokens are generated by OMC and authorized by Open services. New JWT token has to be generated manually, using OMC dedicated library, if the token validity expire (by default it is 60 minutes)
      OMC_AUTH_JWT_EXPIRESINMIN: (60*24).toString(),
      OMC_AUTH_JWT_USERID: 'OMC', // The OMC JWT tokens are generated by OMC and authorized by Open services. New JWT token has to be generated manually, using OMC dedicated library, if the token validity expire (by default it is 60 minutes)
      OMC_AUTH_JWT_USERNAME: 'OMC', // The OMC JWT tokens are generated by OMC and authorized by Open services. New JWT token has to be generated manually, using OMC dedicated library, if the token validity expire (by default it is 60 minutes)

      NOTIFY_API_BASEURL: 'https://api.notifynl.nl', // The domain where your Notify API instance is listening (e.g.: "https://api.notifynl.nl")
      OMC_FEATURE_WORKFLOW_VERSION: '2', // Should be two because we use open-klant 2.0

      // Builds ZGW token
      ZGW_AUTH_JWT_ISSUER: this.props.omcConfiguration.zgwTokenInformation.issuer, // Something identifying "OpenZaak" / "OpenKlant" / "OpenNotificatie" Web API services (token is shared between of them)
      ZGW_AUTH_JWT_AUDIENCE: this.props.omcConfiguration.zgwTokenInformation.audience, // Cannot be missing 	Something identifying OMC Web API service (it will be used internally) - The OMC is the audience
      ZGW_AUTH_JWT_EXPIRESINMIN: (60*24).toString(), // This JWT token will be generated from secret, and other JWT claims, configured from UI of OpenZaak Web API service. Identical details (secret, iss, aud, exp, etc) as in Open services needs to be used here
      ZGW_AUTH_JWT_USERID: this.props.omcConfiguration.zgwTokenInformation.userId, //  This JWT token will be generated from secret, and other JWT claims, configured from UI of OpenZaak Web API service. Identical details (secret, iss, aud, exp, etc) as in Open services needs to be used here
      ZGW_AUTH_JWT_USERNAME: this.props.omcConfiguration.zgwTokenInformation.username, // This JWT token will be generated from secret, and other JWT claims, configured from UI of OpenZaak Web API service. Identical details (secret, iss, aud, exp, etc) as in Open services needs to be used here

      // API keys for ZGW(ish) components
      ZGW_AUTH_KEY_OBJECTEN: 'NOT IN USE', // Cannot be missing and have null or empty value 	It needs to be generated from "Objecten" Web API service UI
      ZGW_AUTH_KEY_OBJECTTYPEN: 'NOT IN USE', // Cannot be missing and have null or empty value 	It needs to be generated from "ObjectTypen" Web API service UI

      // Domains for ZGW(ish) components
      ZGW_ENDPOINT_OPENNOTIFICATIES: this.props.omcConfiguration.notificatiesApiUrl, // You have to use ONLY the domain part from URLs where you are hosting the dedicated Open services
      ZGW_ENDPOINT_OPENZAAK: this.props.omcConfiguration.zakenApiUrl, // You have to use ONLY the domain part from URLs where you are hosting the dedicated Open services
      ZGW_ENDPOINT_OPENKLANT: this.props.omcConfiguration.openKlantUrl, // You have to use ONLY the domain part from URLs where you are hosting the dedicated Open services
      ZGW_ENDPOINT_OBJECTEN: 'mijn-services.accp.nijmegen.nl/not-in-use', // You have to use ONLY the domain part from URLs where you are hosting the dedicated Open services
      ZGW_ENDPOINT_OBJECTTYPEN: 'mijn-services.accp.nijmegen.nl/not-in-use', // You have to use ONLY the domain part from URLs where you are hosting the dedicated Open services
      ZGW_ENDPOINT_BESLUITEN: 'mijn-services.accp.nijmegen.nl/not-in-use', // NOT USED NOW
      ZGW_ENDPOINT_CONTACTMOMENTEN: this.props.omcConfiguration.openKlantUrl,

      // Template references in Notify
      NOTIFY_TEMPLATEID_EMAIL_ZAAKCREATE: this.props.omcConfiguration.templates.zaakCreateEmail ?? DEFAULT_UUID,
      NOTIFY_TEMPLATEID_EMAIL_ZAAKUPDATE: this.props.omcConfiguration.templates.zaakUpdateEmail ?? DEFAULT_UUID,
      NOTIFY_TEMPLATEID_EMAIL_ZAAKCLOSE: this.props.omcConfiguration.templates.zaakCloseEmail ?? DEFAULT_UUID,
      NOTIFY_TEMPLATEID_EMAIL_TASKASSIGNED: DEFAULT_UUID,
      NOTIFY_TEMPLATEID_EMAIL_MESSAGERECEIVED: DEFAULT_UUID,
      NOTIFY_TEMPLATEID_SMS_ZAAKCREATE: this.props.omcConfiguration.templates.zaakCreateSms ?? DEFAULT_UUID,
      NOTIFY_TEMPLATEID_SMS_ZAAKUPDATE: this.props.omcConfiguration.templates.zaakUpdateSms ?? DEFAULT_UUID,
      NOTIFY_TEMPLATEID_SMS_ZAAKCLOSE: this.props.omcConfiguration.templates.zaakCloseSms ?? DEFAULT_UUID,
      NOTIFY_TEMPLATEID_SMS_TASKASSIGNED: DEFAULT_UUID,
      NOTIFY_TEMPLATEID_SMS_MESSAGE: DEFAULT_UUID,


      // Whitelisted IDs used by OMC web API?
      // Let op: Dit zijn de UUIDs van de zaaktypes etc. De URL wordt zelf opgebouwd.
      ZGW_WHITELIST_ZAAKCREATE_IDS: '*', // LETOP: Zaaktype identificatie geen UUID!	Is provided by the user based on "Identificatie" property of case type retrieved from case URI ("zaak") from "OpenZaak" Web API service
      ZGW_WHITELIST_ZAAKUPDATE_IDS: '*', // LETOP: Zaaktype identificatie geen UUID!	Is provided by the user based on "Identificatie" property of case type retrieved from case URI ("zaak") from "OpenZaak" Web API service
      ZGW_WHITELIST_ZAAKCLOSE_IDS: '*', //  LETOP: Zaaktype identificatie geen UUID! Is provided by the user based on "Identificatie" property of case type retrieved from case URI ("zaak") from "OpenZaak" Web API service
      ZGW_WHITELIST_TASKASSIGNED_IDS: '*', // 	Is provided by the user based on "Identificatie" property of case type retrieved from case URI ("zaak") from "OpenZaak" Web API service
      ZGW_WHITELIST_DECISIONMADE_IDS: '*', // 	Is provided by the user based on "Identificatie" property of case type retrieved from case URI ("zaak") from "OpenZaak" Web API service
      ZGW_WHITELIST_MESSAGE_ALLOWED: 'true', // Cannot be missing and have null or empty value 	Is provided by the user
      ZGW_VARIABLE_OBJECTTYPE_TASKOBJECTTYPE_UUID: '00000000-0000-0000-0000-000000000000', // Cannot be missing and have null or empty value + must be in UUID format 	Is provided by the user based on "objectType" from "kenmerken" from the initial notification received from "Notificaties" Web API service
      ZGW_VARIABLE_OBJECTTYPE_MESSAGEOBJECTTYPE_UUID: '00000000-0000-0000-0000-000000000000,00000000-0000-0000-0000-000000000000', 	// Cannot be missing and have null or empty value + must be in UUID format 	Is provided by the user based on "informatieobjecttype" from "informatieobject" retrieved from "OpenZaak" Web API service when querying "besluiten"

      // Environment settings
      DEBUG: this.props.omcConfiguration.debug ? 'true' : 'false',
      ASPNETCORE_ENVIRONMENT: this.props.omcConfiguration.mode,
    };
  }

  private getSecretConfiguration() {
    const secrets = {
      OMC_AUTH_JWT_SECRET: EcsSecret.fromSecretsManager(this.configurationParameters.omcJwt),
      ZGW_AUTH_JWT_SECRET: EcsSecret.fromSecretsManager(this.configurationParameters.zgwJwt),

      // API keys
      ZGW_AUTH_KEY_OPENKLANT: EcsSecret.fromSecretsManager(this.configurationParameters.openklant),
      USER_API_KEY_OPENKLANT_2: EcsSecret.fromSecretsManager(this.configurationParameters.openklant), //TODO does this exist?
      NOTIFY_API_KEY: EcsSecret.fromSecretsManager(this.configurationParameters.notify),
    };
    return secrets;
  }

  setupService() {
    const VOLUME_NAME = 'MAIN';
    const task = this.serviceFactory.createTaskDefinition('main', {
      volumes: [{ name: VOLUME_NAME }],
    });

    const container = task.addContainer('main', {
      image: ContainerImage.fromRegistry(this.props.omcConfiguration.image),
      healthCheck: {
        command: ['CMD-SHELL', 'exit 0'], // TODO figurout a health check?
        interval: Duration.seconds(10),
        startPeriod: Duration.seconds(30),
      },
      portMappings: [
        {
          containerPort: this.props.service.port,
          hostPort: this.props.service.port,
          protocol: Protocol.TCP,
        },
      ],
      readonlyRootFilesystem: false,
      secrets: this.getSecretConfiguration(),
      environment: this.getEnvironmentConfiguration(),
      logging: new AwsLogDriver({
        streamPrefix: 'logs',
        logGroup: this.logs,
      }),
    });

    this.serviceFactory.attachEphemeralStorage(container, VOLUME_NAME, '/root/.aspnet');

    const service = this.serviceFactory.createService({
      id: 'main',
      task: task,
      path: this.props.omcConfiguration.path,
      requestParameters: {
        'overwrite:path': '/$request.path.proxy', // Remove the /omc-vrijbrp part from the path before forwarding to the integration
      },
      options: {
        desiredCount: 1,
      },
    });

    return service;
  }

  private logGroup() {
    return new LogGroup(this, 'logs', {
      retention: RetentionDays.ONE_MONTH,
      encryptionKey: this.props.key,
    });
  }

}
