import { Criticality } from '@gemeentenijmegen/aws-constructs';
import { Environment } from 'aws-cdk-lib';

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

  /**
   * Config for services meant for acc only right now
   */
  gzacService?: GZACConfiguration;

  gzacFrontendService?: GZACFrontendConfiguration;

  openProductServices?: OpenProductServicesConfiguration;
}

export interface OpenKlantConfiguration extends MainTaskSizeConfiguration, CeleryTaskSizeConfiguration {
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

export interface OpenNotificatiesConfiguration extends MainTaskSizeConfiguration, CeleryTaskSizeConfiguration {
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

export interface OpenZaakConfiguration extends MainTaskSizeConfiguration, CeleryTaskSizeConfiguration {
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

export interface ObjecttypesConfiguration extends MainTaskSizeConfiguration {
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

export interface ObjectsConfiguration extends MainTaskSizeConfiguration, CeleryTaskSizeConfiguration {
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
  roltypesToRegister: ('adviseur' |
    'behandelaar' |
    'belanghebbende' |
    'beslisser' |
    'initiator' |
    'klantcontacter' |
    'zaakcoordinator' |
    'mede_initiator')[];
  /**
   * Different strategies that the service will use to register the contactinfo in OpenKlant
   * See the README of this particular service for more information.
   */
  strategy: 'rolregistrationsinglepartij' // Convert the rol to a partij and store the partij id in the rol. Check if the partij exists and update digitale addressen (cannot be used in production)
  |
  'partijperrol' // Convert the rol to a partij en store the partij id in the rol. Uses a dummy partij identificatie to keep each partij unique and for easy removal later on.
  |
  'partijperroldry' // Without updating the rol in the Zaken api
  |
  'partijperrol-with-form'; // Get contactgegevens and preference from form instead of rol


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

export interface OpenProductServicesConfiguration extends MainTaskSizeConfiguration, CeleryTaskSizeConfiguration {
  /**
   * Open Product imagetag
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

export interface MainTaskSizeConfiguration {
  /**
   * Configure the task size for the main service
   * @default - cdk defaults
   */
  taskSize?: {
    cpu: string;
    memory: string;
  };
}

export interface CeleryTaskSizeConfiguration {
  /**
   * Configure the task size for the celery service
   * @default - cdk defaults
   */
  celeryTaskSize?: {
    cpu: string;
    memory: string;
  };
}
