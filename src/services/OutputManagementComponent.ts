import { Duration } from 'aws-cdk-lib';
import { AwsLogDriver, ContainerImage, Secret as EcsSecret, Protocol } from 'aws-cdk-lib/aws-ecs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { OutputManagementComponentConfiguration } from '../Configuration';
import { ServiceFactory, ServiceFactoryProps } from '../constructs/ServiceFactory';
import { Statics } from '../Statics';

export interface OMCServiceProps {
  service: ServiceFactoryProps;
  omcConfiguration: OutputManagementComponentConfiguration;
}

export class OMCService extends Construct {

  private readonly logs: LogGroup;
  private readonly props: OMCServiceProps;
  private readonly serviceFactory: ServiceFactory;

  constructor(scope: Construct, id: string, props: OMCServiceProps) {
    super(scope, id);
    this.props = props;
    this.serviceFactory = new ServiceFactory(this, props.service);
    this.logs = this.logGroup();


    this.setupService();
  }

  private getEnvironmentConfiguration() {

    return {
      // How a user authenticates at OMC
      OMC_AUTHORIZATION_JWT_ISSUER: 'OMC', // Something identifying Notify NL (OMC Web API) service (it will be used internally) - The OMC is the issuer
      OMC_AUTHORIZATION_JWT_AUDIENCE: 'OMC', // Cannot be missing 	Something identifying Notify NL (OMC Web API) service (it will be used internally) - The OMC is the audience
      // OpenNotificaties kan alleen maar met een static auth header authenticeren bij een callback endpoint (dus omc), daarom deze epxiration property ophogen.
      // The OMC JWT tokens are generated by OMC and authorized by Open services. New JWT token has to be generated manually, using OMC dedicated library, if the token validity expire (by default it is 60 minutes)
      OMC_AUTHORIZATION_JWT_EXPIRESINMIN: (60*24).toString(),
      OMC_AUTHORIZATION_JWT_USERID: 'OMC', // The OMC JWT tokens are generated by OMC and authorized by Open services. New JWT token has to be generated manually, using OMC dedicated library, if the token validity expire (by default it is 60 minutes)
      OMC_AUTHORIZATION_JWT_USERNAME: 'OMC', // The OMC JWT tokens are generated by OMC and authorized by Open services. New JWT token has to be generated manually, using OMC dedicated library, if the token validity expire (by default it is 60 minutes)

      OMC_API_BASEURL_NOTIFYNL: 'https://api.notifynl.nl', // The domain where your Notify API instance is listening (e.g.: "https://api.notifynl.nl")
      OMC_FEATURES_WORKFLOW_VERSION: '2', // Should be two because we use open-klant 2.0

      // Builds ZGW token
      USER_AUTHORIZATION_JWT_ISSUER: 'ZGW', // Something identifying "OpenZaak" / "OpenKlant" / "OpenNotificatie" Web API services (token is shared between of them)
      USER_AUTHORIZATION_JWT_AUDIENCE: 'ZGW', // Cannot be missing 	Something identifying OMC Web API service (it will be used internally) - The OMC is the audience
      USER_AUTHORIZATION_JWT_EXPIRESINMIN: '60', // This JWT token will be generated from secret, and other JWT claims, configured from UI of OpenZaak Web API service. Identical details (secret, iss, aud, exp, etc) as in Open services needs to be used here
      USER_AUTHORIZATION_JWT_USERID: 'OMC', //  This JWT token will be generated from secret, and other JWT claims, configured from UI of OpenZaak Web API service. Identical details (secret, iss, aud, exp, etc) as in Open services needs to be used here
      USER_AUTHORIZATION_JWT_USERNAME: 'OMC', // This JWT token will be generated from secret, and other JWT claims, configured from UI of OpenZaak Web API service. Identical details (secret, iss, aud, exp, etc) as in Open services needs to be used here

      // API keys for ZGW(ish) components
      USER_API_KEY_OPENKLANT_2: '',
      //USER_API_KEY_OPENKLANT: '', // Cannot be missing and have null or empty value (if you are using OMC Workflow v2 and above; otherwise, it's not mandatory) 	It needs to be generated for OMC Workflow v2 and above from "OpenKlant" 2.0 Web API service UI
      USER_API_KEY_OBJECTEN: 'NOT IN USE', // Cannot be missing and have null or empty value 	It needs to be generated from "Objecten" Web API service UI
      USER_API_KEY_OBJECTTYPEN: 'NOT IN USE', // Cannot be missing and have null or empty value 	It needs to be generated from "ObjectTypen" Web API service UI
      USER_API_KEY_NOTIFYNL: '', // Cannot be missing and have null or empty value + must be in name-UUID-UUID format + must pass Notify NL validation 	It needs to be generated from "Notify NL" Admin Portal

      // Domains for ZGW(ish) components
      USER_DOMAIN_OPENNOTIFICATIES: 'mijn-services.accp.nijmegen.nl/open-notificaties', // You have to use ONLY the domain part from URLs where you are hosting the dedicated Open services
      USER_DOMAIN_OPENZAAK: 'mijn-services.accp.nijmegen.nl/open-zaak', // You have to use ONLY the domain part from URLs where you are hosting the dedicated Open services
      USER_DOMAIN_OPENKLANT: 'mijn-services.accp.nijmegen.nl/open-klant', // You have to use ONLY the domain part from URLs where you are hosting the dedicated Open services
      USER_DOMAIN_OBJECTEN: 'mijn-services.accp.nijmegen.nl/not-in-use', // You have to use ONLY the domain part from URLs where you are hosting the dedicated Open services
      USER_DOMAIN_OBJECTTYPEN: 'mijn-services.accp.nijmegen.nl/not-in-use', // You have to use ONLY the domain part from URLs where you are hosting the dedicated Open services

      // Template references in Notify
      USER_TEMPLATEIDS_EMAIL_ZAAKCREATE: '00000000-0000-0000-0000-000000000000', // Cannot be missing and have null or empty value + must be in UUID format 	Should be generated per specific business use case from "Notify NL" Admin Portal
      USER_TEMPLATEIDS_EMAIL_ZAAKUPDATE: '00000000-0000-0000-0000-000000000000', // 	Cannot be missing and have null or empty value + must be in UUID format 	Should be generated per specific business use case from "Notify NL" Admin Portal
      USER_TEMPLATEIDS_EMAIL_ZAAKCLOSE: '00000000-0000-0000-0000-000000000000', // 	Cannot be missing and have null or empty value + must be in UUID format 	Should be generated per specific business use case from "Notify NL" Admin Portal
      USER_TEMPLATEIDS_EMAIL_TASKASSIGNED: '00000000-0000-0000-0000-000000000000', // 	Cannot be missing and have null or empty value + must be in UUID format 	Should be generated per specific business use case from "Notify NL" Admin Portal
      USER_TEMPLATEIDS_EMAIL_MESSAGE: '00000000-0000-0000-0000-000000000000', // 	Cannot be missing and have null or empty value + must be in UUID format 	Should be generated per specific business use case from "Notify NL" Admin Portal
      USER_TEMPLATEIDS_SMS_ZAAKCREATE: '00000000-0000-0000-0000-000000000000', // 	Cannot be missing and have null or empty value + must be in UUID format 	Should be generated per specific business use case from "Notify NL" Admin Portal
      USER_TEMPLATEIDS_SMS_ZAAKUPDATE: '00000000-0000-0000-0000-000000000000', // 	Cannot be missing and have null or empty value + must be in UUID format 	Should be generated per specific business use case from "Notify NL" Admin Portal
      USER_TEMPLATEIDS_SMS_ZAAKCLOSE: '00000000-0000-0000-0000-000000000000', // 	Cannot be missing and have null or empty value + must be in UUID format 	Should be generated per specific business use case from "Notify NL" Admin Portal
      USER_TEMPLATEIDS_SMS_TASKASSIGNED: '00000000-0000-0000-0000-000000000000', // 	Cannot be missing and have null or empty value + must be in UUID format 	Should be generated per specific business use case from "Notify NL" Admin Portal
      USER_TEMPLATEIDS_SMS_MESSAGE: '00000000-0000-0000-0000-000000000000', // 	Cannot be missing and have null or empty value + must be in UUID format 	Should be generated per specific business use case from "Notify NL" Admin Portal


      // Whitelisted IDs used by OMC web API?
      // Let op: Dit zijn de UUIDs van de zaaktypes etc. De URL wordt zelf opgebouwd.
      USER_WHITELIST_ZAAKCREATE_IDS: '*', // LETOP: Zaaktype identificatie geen UUID!	Is provided by the user based on "Identificatie" property of case type retrieved from case URI ("zaak") from "OpenZaak" Web API service
      USER_WHITELIST_ZAAKUPDATE_IDS: '*', // LETOP: Zaaktype identificatie geen UUID!	Is provided by the user based on "Identificatie" property of case type retrieved from case URI ("zaak") from "OpenZaak" Web API service
      USER_WHITELIST_ZAAKCLOSE_IDS: '*', //  LETOP: Zaaktype identificatie geen UUID! Is provided by the user based on "Identificatie" property of case type retrieved from case URI ("zaak") from "OpenZaak" Web API service
      USER_WHITELIST_TASKASSIGNED_IDS: '*', // 	Is provided by the user based on "Identificatie" property of case type retrieved from case URI ("zaak") from "OpenZaak" Web API service
      USER_WHITELIST_DECISIONMADE_IDS: '*', // 	Is provided by the user based on "Identificatie" property of case type retrieved from case URI ("zaak") from "OpenZaak" Web API service
      USER_WHITELIST_MESSAGE_ALLOWED: 'true', // Cannot be missing and have null or empty value 	Is provided by the user
      USER_WHITELIST_TASKOBJECTTYPE_UUID: '00000000-0000-0000-0000-000000000000', // Cannot be missing and have null or empty value + must be in UUID format 	Is provided by the user based on "objectType" from "kenmerken" from the initial notification received from "Notificaties" Web API service
      USER_WHITELIST_MESSAGEOBJECTTYPE_UUIDS: '00000000-0000-0000-0000-000000000000,00000000-0000-0000-0000-000000000000', 	// Cannot be missing and have null or empty value + must be in UUID format 	Is provided by the user based on "informatieobjecttype" from "informatieobject" retrieved from "OpenZaak" Web API service when querying "besluiten"


      // TODO not sure if this does anything
      DEBUG: this.props.omcConfiguration.debug ? 'true' : 'false',
      ASPNETCORE_ENVIRONMENT: this.props.omcConfiguration.mode, // Use docker profile
    };
  }

  private getSecretConfiguration() {
    const secrets = {
      OMC_AUTHORIZATION_JWT_SECRET: EcsSecret.fromSecretsManager(Secret.fromSecretNameV2(this, 'omc-jwt', Statics._ssmOmcOmcJwtSecret)),
      USER_AUTHORIZATION_JWT_SECRET: EcsSecret.fromSecretsManager(Secret.fromSecretNameV2(this, 'zgw-jwt', Statics._ssmOmcZgwJwtSecret)),
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
      path: 'omc',
      options: {
        desiredCount: 1,
      },
    });
    return service;
  }

  private logGroup() {
    return new LogGroup(this, 'logs', {
      retention: RetentionDays.ONE_MONTH,
    });
  }

}