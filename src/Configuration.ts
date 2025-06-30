import { Criticality } from '@gemeentenijmegen/aws-constructs';
import { Environment } from 'aws-cdk-lib';
import { Statics } from './Statics';

/**
 * Adds a configuration field to another interface
 */
export interface Configurable {
  configuration: Configuration;
}

/**
 * Basic configuration options per environment
 */
export interface Configuration {
  /**
   * Branch name for the applicible branch (this branch)
   */
  branch: string;

  /**
   * The pipeline will run from this environment
   *
   * Use this environment for your initial manual deploy
   */
  buildEnvironment: Required<Environment>;

  /**
   * Environment to deploy the application to
   *
   * The pipeline (which usually runs in the build account) will
   * deploy the application to this environment. This is usually
   * the workload AWS account in our default region.
   */
  deploymentEnvironment: Required<Environment>;

  /**
   * Base criticality for monitoring deployed for this branch.
   */
  criticality: Criticality;

  /**
   * Provie alternative domain names
   */
  alternativeDomainNames?: string[];

  /**
   * CNAME records to create for this project
   * E.g. for certificates.
   */
  cnameRecords?: Record<string, string>;

  /**
   * A list of databases that is created for
   * the particular environment.
   */
  databases: string[];

  /**
   * Configure the backup retention period in days
   * this is the standard DRS backup feature.
   * This can be configured seperately from any AWS
   * Backup plans.
   * @default 35
   */
  databaseSnapshotRetentionDays?: number;

  /**
   * Create a transfer server & user for allowing
   * access to the filesystem via SFTP
   */
  createTransferServer?: boolean;

  /**
   * Configuration for open klant
   */
  openklant?: OpenKlantConfiguration;

  /**
   * Configuration for open notifications
   * Note: deplends on open zaak service being deployed as well.
   */
  openNotificaties?: OpenNotificatiesConfiguration;

  /**
   * Configuration for open zaak
   */
  openZaak?: OpenZaakConfiguration;

  /**
   * Configurations for OMCs
   */
  outputManagementComponents?: OutputManagementComponentConfiguration[];

  /**
   * List or open klant registration services
   */
  openKlantRegistrationServices?: OpenKlantRegistrationServiceConfiguration[];

  /**
   * Configuration for objecttypes service
   */
  objecttypesService?: ObjecttypesConfiguration;

  /**
   * Configuration for objects service
   */
  objectsService?: ObjectsConfiguration;
  /**
   * Configuration for Keycloack service
   * GZAC Keycloak
   */
  keyCloackService?: KeyCloakConfiguration;


  gzacService?: GZACConfiguration;

  gzacFrontendService?: GZACFrontendConfiguration;
}

export interface OpenKlantConfiguration {
  /**
   * Docker image to use.
   * Usually includes the version number.
   */
  image: string;
  /**
   * Log level for the container
   */
  logLevel: 'DEBUG' | 'INFO' | 'ERROR';
  /**
   * Enable debug mode and logging
   */
  debug?: boolean;
}

export interface OpenNotificatiesConfiguration {
  /**
   * Docker image to use.
   * Usually includes the version number.
   */
  image: string;
  /**
   * Docker image to use for rabbitMQ
   */
  rabbitMqImage: string;
  /**
   * Log level for the container
   */
  logLevel: 'DEBUG' | 'INFO' | 'ERROR';
  /**
   * Enable debug mode and logging
   */
  debug?: boolean;
  /**
   * @default false
   */
  persitNotifications?: boolean;
}

export interface OpenZaakConfiguration {
  /**
   * Docker image to use.
   * Usually includes the version number.
   */
  image: string;
  /**
   * Log level for the container
   */
  logLevel: 'DEBUG' | 'INFO' | 'ERROR';
  /**
   * Enable debug mode and logging
   */
  debug?: boolean;
  /**
   * API-version header value. Should coinside with the version
   * implemented in the container image.
   * Note: this is a workaround as this should be set by the service
   * itself but that does not seem to happen.
   */
  apiVersion: string;
}

export interface ObjecttypesConfiguration {
  /**
   * Docker image to use.
   * Usually includes the version number.
   */
  image: string;
  /**
   * Log level for the container
   */
  logLevel: 'DEBUG' | 'INFO' | 'ERROR';
  /**
   * Enable debug mode and logging
   */
  debug?: boolean;
}

export interface ObjectsConfiguration {
  /**
   * Docker image to use.
   * Usually includes the version number.
   */
  image: string;
  /**
   * Log level for the container
   */
  logLevel: 'DEBUG' | 'INFO' | 'ERROR';
  /**
   * Enable debug mode and logging
   */
  debug?: boolean;
}

export interface OutputManagementComponentConfiguration {
  /**
   * Construct CDK is. Used as `new OMC(this, props.cdkId, {...});`
   */
  cdkId: string;
  /**
   * Path to mount this OMC on in the API gateway
   */
  path: string;
  /**
   * Docker image to use.
   * Usually includes the version number.
   */
  image: string;
  /**
   * Enable debug mode and logging
   */
  debug?: boolean;
  /**
   * The OMC component can run in different modes.
   * Development mode enables additonal logging
   */
  mode: 'Development' | 'Production';
  /**
   * Set the URL of the open klant component to use (do not include https://)
   * Note: Secret for API key is generated by the construct itself and can be
   * configured using the console.
   */
  openKlantUrl: string;
  /**
   * Set the URL of the zaken api component to use (do not include https://)
   * Note: Secret for API key is generated by the construct itself and can be
   * configured using the console.
   */
  zakenApiUrl: string;
  /**
   * Set the URL of the notificatie api component to use (do not include https://)
   * Note: Secret for API key is generated by the construct itself and can be
   * configured using the console.
   */
  notificatiesApiUrl: string;
  /**
   * API URL (net als zaken api url) voor objecten API
   * @default none
   */
  objectenApiUrl?: string;
  /**
   * API URL (net als zaken api url) voor objecttypen API
   * @default none
   */
  objecttypenApiUrl?: string;
  /**
   * API URL (net als zaken api url) voor besluiten API
   * @default none
   */
  besluitenApiUrl?: string;
  /**
   * Information to include in the ZGW token
   * build for authenticating at other ZGW APIs.
   */
  zgwTokenInformation: {
    issuer: string;
    audience: string;
    userId: string;
    username: string;
  };
  /**
   * Taak objecttype uuid
   */
  taakObjecttypeUuid?: string;
  /**
   * Template UUIDs defined in NotifyNL to use for notifications.
   */
  templates: {
    zaakCreateEmail?: string;
    zaakUpdateEmail?: string;
    zaakCloseEmail?: string;
    taskAssignedEmail?: string;
    messsageEmail?: string;
    zaakCreateSms?: string;
    zaakUpdateSms?: string;
    zaakCloseSms?: string;
    taskAssignedSms?: string;
    messsageSms?: string;
  };
}

export interface OpenKlantRegistrationServiceConfiguration {
  /**
   * Construct CDK is. Used as `new OMC(this, props.cdkId, {...});`
   */
  cdkId: string;
  /**
   * Path to mount this OMC on in the API gateway
   */
  path: string;
  /**
   * The API url for OpenKlant (including /api/v1/)
   */
  openKlantUrl: string;
  /**
   * The API url for Zaken API (including /zaken/api/v1/)
   */
  zakenApiUrl: string;
  /**
   * Enable additional logging
   */
  debug: boolean;
  /**
   * Which rol types to accept and register in OpenKlant
   */
  roltypesToRegister: (
    | 'adviseur'
    | 'behandelaar'
    | 'belanghebbende'
    | 'beslisser'
    | 'initiator'
    | 'klantcontacter'
    | 'zaakcoordinator'
    | 'mede_initiator'
  )[];
  /**
   * Different strategies that the service will use to register the contactinfo in OpenKlant
   * See the README of this particular service for more information.
   */
  strategy:
  | 'rolregistrationsinglepartij' // Convert the rol to a partij and store the partij id in the rol. Check if the partij exists and update digitale addressen (cannot be used in production)
  | 'partijperrol' // Convert the rol to a partij en store the partij id in the rol. Uses a dummy partij identificatie to keep each partij unique and for easy removal later on.
  | 'partijperroldry' // Without updating the rol in the Zaken api
  | 'partijperrol-with-form'; // Get contactgegevens and preference from form instead of rol
  /**
   * Flag to enable processing of notifications
   */
  enabled: boolean;
  /**
   * Whitelist of catalogi to respond to based on roltype catalogus field
   * Provide a whitelist list of uuid's of catalogi.
   * @default - all catalogi
   */
  catalogiWhitelist?: string[];
}

export interface KeyCloakConfiguration {
  /**
   * Docker image to use.
   * Usually includes the version number.
   */
  image: string;
  /**
   * Log level for the container
   */
  logLevel: 'DEBUG' | 'INFO' | 'ERROR';
  /**
   * Enable debug mode and logging
   */
  debug?: boolean;
}

export interface GZACFrontendConfiguration {
  /**
   * Docker image to use.
   * Usually includes the version number.
   */
  image: string;
  /**
   * Log level for the container
   */
  logLevel: 'DEBUG' | 'INFO' | 'ERROR';
  /*
   * Enable debug mode and logging
   */
  debug?: boolean;
}

export interface GZACConfiguration {
  /**
   * Docker image to use.
   * Usually includes the version number.
   */
  backendImage: string;
  /**
   * Docker image to use.
   * Usually includes the version number.
   */
  frontendImage: string;
  /**
   * Log level for the container
   */
  logLevel: 'DEBUG' | 'INFO' | 'ERROR';
  /**
   * Enable debug mode and logging
   */
  debug?: boolean;
}

const EnvironmentConfigurations: { [key: string]: Configuration } = {
  acceptance: {
    branch: 'acceptance',
    buildEnvironment: Statics.gnBuildEnvironment,
    deploymentEnvironment: Statics.gnMijnServicesAccp,
    criticality: new Criticality('medium'),
    alternativeDomainNames: ['mijn-services.accp.nijmegen.nl'],
    cnameRecords: {
      _b528d6157c2d9a369bf7d7812881d466:
        '_189b6977b0d0141d6cbb01e0ba1386e6.djqtsrsxkq.acm-validations.aws.',
    },
    createTransferServer: false,
    databases: Statics.databasesAcceptance,
    databaseSnapshotRetentionDays: 10,
    openklant: {
      image: 'maykinmedia/open-klant:2.5.0',
      logLevel: 'DEBUG',
      debug: true,
    },
    openNotificaties: {
      image: 'openzaak/open-notificaties:1.8.0',
      rabbitMqImage: 'rabbitmq:4.0.5-alpine',
      logLevel: 'DEBUG',
      debug: true,
      persitNotifications: true,
    },
    openZaak: {
      image: 'openzaak/open-zaak:1.17.0',
      logLevel: 'DEBUG',
      debug: true,
      apiVersion: '1.3.1',
    },
    objecttypesService: {
      image: 'maykinmedia/objecttypes-api:3.0.0',
      logLevel: 'DEBUG',
      debug: true,
    },
    objectsService: {
      image: 'maykinmedia/objects-api:3.0.0',
      logLevel: 'DEBUG',
      debug: true,
    },
    keyCloackService: {
      image: 'quay.io/keycloak/keycloak:24.0.1',
      logLevel: 'DEBUG',
      debug: true,
    },
    gzacService: {
      backendImage: 'ritense/gzac-backend:12.6.0',
      frontendImage: 'ritense/gzac-frontend:12.6.0',
      logLevel: 'DEBUG',
      debug: true,
    },
    gzacFrontendService: {
      image: 'ritense/gzac-frontend:12.6.0',
      logLevel: 'DEBUG',
      debug: true,
    },
    outputManagementComponents: [
      {
        cdkId: 'local-omc',
        path: 'local-omc', // Without /
        image: 'worthnl/notifynl-omc:1.15.3',
        debug: true,
        mode: 'Development',
        openKlantUrl:
          'mijn-services.accp.nijmegen.nl/open-klant/klantinteracties/api/v1',
        zakenApiUrl: 'mijn-services.accp.nijmegen.nl/open-zaak/zaken/api/v1',
        notificatiesApiUrl:
          'mijn-services.accp.nijmegen.nl/open-notificaties/api/v1',
        zgwTokenInformation: {
          audience: '', // This must be empty for the token to start working... no clue as to why.
          issuer: 'OMC',
          userId: 'OMC',
          username: 'OMC',
        },
        templates: {
          zaakCreateEmail: 'e2915eea-de25-48f5-8292-879d369060fa',
          zaakUpdateEmail: 'e868044f-4a30-42c9-b1bf-8ad95ec2a6b8',
          zaakCloseEmail: '14cebdee-a179-4e0e-b7de-c660fdd47c57',
          zaakCreateSms: 'b17f8f7a-6992-466d-8248-3f1c077610ce',
          zaakUpdateSms: '0ff5f21a-2af1-4fd4-8080-45cff34e0df7',
          zaakCloseSms: 'ac885f24-09d8-4702-845f-2f53cd045790',
          taskAssignedEmail: 'e2915eea-de25-48f5-8292-879d369060fa',
          taskAssignedSms: 'b17f8f7a-6992-466d-8248-3f1c077610ce',
        },
      },
      {
        cdkId: 'woweb-omc',
        path: 'woweb-omc', // Without /
        image: 'worthnl/notifynl-omc:1.15.3',
        debug: true,
        mode: 'Development',
        openKlantUrl: 'mijn-services.accp.nijmegen.nl/open-klant/klantinteracties/api/v1',
        zakenApiUrl: 'openzaak.woweb.app/zaken/api/v1',
        notificatiesApiUrl: 'mijn-services.accp.nijmegen.nl/open-notificaties/api/v1',
        objectenApiUrl: 'mijn-services.accp.nijmegen.nl/objects/api/v2',
        objecttypenApiUrl: 'mijn-services.accp.nijmegen.nl/objecttypes/api/v2',
        zgwTokenInformation: {
          audience: '', // This must be empty for the token to start working... no clue as to why.
          issuer: 'nijmegen_devops',
          userId: 'nijmegen_devops',
          username: 'nijmegen_devops',
        },
        taakObjecttypeUuid: 'fa36dfdd-899c-4b40-92ad-6d5c0077748a',
        templates: {
          // zaakCreateEmail: 'e2915eea-de25-48f5-8292-879d369060fa',
          // zaakUpdateEmail: 'e868044f-4a30-42c9-b1bf-8ad95ec2a6b8',
          // zaakCloseEmail: '14cebdee-a179-4e0e-b7de-c660fdd47c57',
          taskAssignedEmail: 'ec835216-4629-4bba-ac3a-6bc4770062e8',
          // zaakCreateSms: 'b17f8f7a-6992-466d-8248-3f1c077610ce',
          // zaakUpdateSms: '0ff5f21a-2af1-4fd4-8080-45cff34e0df7',
          // zaakCloseSms: 'ac885f24-09d8-4702-845f-2f53cd045790',
          taskAssignedSms: '2ab3d68e-0a8a-4a9a-b091-0e934ed1c64b',
        },
      },
    ],
    openKlantRegistrationServices: [
      {
        cdkId: 'open-klant-registration-service-test',
        debug: true,
        openKlantUrl:
          'https://mijn-services.accp.nijmegen.nl/open-klant/klantinteracties/api/v1',
        zakenApiUrl:
          'https://mijn-services.accp.nijmegen.nl/open-zaak/zaken/api/v1',
        path: '/open-klant-registration-service-test/callback',
        roltypesToRegister: ['initiator'],
        strategy: 'partijperrol-with-form', // Unique partij per rol (of zaak dus)
        enabled: true,
      },
      {
        cdkId: 'open-klant-registration-service-woweb',
        debug: true,
        openKlantUrl:
          'https://mijn-services.accp.nijmegen.nl/open-klant/klantinteracties/api/v1',
        zakenApiUrl: 'https://openzaak.woweb.app/zaken/api/v1',
        path: '/open-klant-registration-service-woweb/callback',
        roltypesToRegister: ['initiator'],
        strategy: 'partijperrol-with-form', // Unique partij per rol (of zaak dus)
        enabled: true,
        catalogiWhitelist: [
          '84f9e30d-8a3e-4ca0-8011-556ae3cbdd41', // VIP catalogus on acceptance
        ],
      },
    ],
  },
  main: {
    branch: 'main',
    buildEnvironment: Statics.gnBuildEnvironment,
    deploymentEnvironment: Statics.gnMijnServicesProd,
    criticality: new Criticality('high'),
    alternativeDomainNames: ['mijn-services.nijmegen.nl'],
    cnameRecords: {
      _762e893c9ea81e57b34ab11ed543256d:
        '_1c518863d978cddd100e65875b7c1136.djqtsrsxkq.acm-validations.aws.',
    },
    databases: Statics.databasesProduction,
    databaseSnapshotRetentionDays: 35,
    openklant: {
      image: 'maykinmedia/open-klant:2.5.0',
      logLevel: 'INFO',
    },
    openKlantRegistrationServices: [
      {
        cdkId: 'open-klant-registration-service-woweb',
        debug: false,
        openKlantUrl:
          'https://mijn-services.nijmegen.nl/open-klant/klantinteracties/api/v1',
        zakenApiUrl: 'https://openzaak.nijmegen.cloud/zaken/api/v1',
        path: '/open-klant-registration-service-woweb/callback',
        roltypesToRegister: ['initiator'],
        strategy: 'partijperroldry', // Unique partij per rol (of zaak dus)
        // TODO change from dryrun later (but do not yet write results back to openzaak)
        enabled: true,
        catalogiWhitelist: [
          '84f9e30d-8a3e-4ca0-8011-556ae3cbdd41', // VIP catalogus op productie
        ],
      },
    ],
    outputManagementComponents: [
      {
        cdkId: 'woweb-omc',
        path: 'woweb-omc', // Without /
        image: 'worthnl/notifynl-omc:1.15.3',
        debug: true,
        mode: 'Production',
        openKlantUrl: 'mijn-services.nijmegen.nl/open-klant/klantinteracties/api/v1',
        zakenApiUrl: 'openzaak.nijmegen.cloud/zaken/api/v1',
        notificatiesApiUrl: 'opennotificaties.nijmegen.cloud/api/v1',
        objectenApiUrl: 'objects-api.nijmegen.cloud/api/v2',
        objecttypenApiUrl: 'objecttypes-api.nijmegen.cloud/api/v2',
        zgwTokenInformation: {
          audience: '', // This must be empty for the token to start working... no clue as to why.
          issuer: 'nijmegen_devops',
          userId: 'nijmegen_devops',
          username: 'nijmegen_devops',
        },
        taakObjecttypeUuid: 'bf3dbb29-5391-40e3-94a8-c662bedcd0f7',
        templates: { // IDs refer to templates in NotifyNL service: APV - Gemeente Nijmegen
          // zaakCreateEmail: '06ff0f61-a0a3-4ea5-a583-4106dac20c33',
          // zaakUpdateEmail: 'ff09a540-3a88-4f70-9717-11a6c0fac356',
          // zaakCloseEmail: '9582f057-acf4-4fe1-b856-0bfdb6e7e956',
          taskAssignedEmail: 'b9624682-0ecd-48bc-b5f8-884bcc0ac469',
          // zaakCreateSms: 'b789f105-f49b-4a4c-b54d-804db68c3760',
          // zaakUpdateSms: 'ceaa93e9-8ebd-474b-8617-ea41239f1ccb',
          // zaakCloseSms: 'd7ab0077-44f0-4756-ba99-edf5f2ac3ed7',
          taskAssignedSms: '1ef3a3b6-d525-4e57-a212-81448b91ada9',
        },
      },
    ],
    openNotificaties: {
      image: 'openzaak/open-notificaties:1.8.0',
      rabbitMqImage: 'rabbitmq:4.0.5-alpine',
      logLevel: 'INFO',
      debug: false,
      persitNotifications: true,
    },
    openZaak: {
      image: 'openzaak/open-zaak:1.17.0',
      logLevel: 'INFO',
      debug: false,
      apiVersion: '1.3.1',
    },
    objecttypesService: {
      image: 'maykinmedia/objecttypes-api:3.0.0',
      logLevel: 'INFO',
      debug: false,
    },
    objectsService: {
      image: 'maykinmedia/objects-api:3.0.0',
      logLevel: 'INFO',
      debug: false,
    },
  },
};

/**
 * Retrieve a configuration object by passing a branch string
 *
 * **NB**: This retrieves the subobject with key `branchName`, not
 * the subobject containing the `branchName` as the value of the `branch` key
 *
 * @param branchName the branch for which to retrieve the environment
 * @returns the configuration object for this branch
 */
export function getEnvironmentConfiguration(branchName: string): Configuration {
  const conf = EnvironmentConfigurations[branchName];
  if (!conf) {
    throw Error(`No configuration found for branch ${branchName}`);
  }
  return conf;
}
