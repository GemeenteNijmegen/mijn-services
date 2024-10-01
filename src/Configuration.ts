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
   * Configuration for OMC used by VrijBRP notifications
   */
  vrijBrpOmc?: OutputManagementComponentConfiguration;

  /**
   * List or open klant registration services
   */
  openKlantRegistrationServices?: OpenKlantRegistrationServiceConfiguration[];

}

export interface OpenKlantConfiguration {
  image: string;
  logLevel: 'DEBUG' | 'INFO' | 'ERROR';
  debug?: boolean;
}

export interface OpenNotificatiesConfiguration {
  image: string;
  rabbitMqImage: string;
  logLevel: 'DEBUG' | 'INFO' | 'ERROR';
  debug?: boolean;
}

export interface OpenZaakConfiguration {
  image: string;
  logLevel: 'DEBUG' | 'INFO' | 'ERROR';
  debug?: boolean;
}

export interface OutputManagementComponentConfiguration {
  image: string;
  logLevel: 'DEBUG' | 'INFO' | 'ERROR';
  debug?: boolean;
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
}

export interface OpenKlantRegistrationServiceConfiguration {
  cdkId: string;
  path: string;
  openKlantUrl: string;
  zakenApiUrl: string;
  debug: boolean;
  roltypesToRegister: ('adviseur'|'behandelaar'|'belanghebbende'|'beslisser'|'initiator'|'klantcontacter'|'zaakcoordinator'|'mede_initiator')[];
}

const EnvironmentConfigurations: {[key:string]: Configuration} = {
  acceptance: {
    branch: 'acceptance',
    buildEnvironment: Statics.gnBuildEnvironment,
    deploymentEnvironment: Statics.gnMijnServicesAccp,
    alternativeDomainNames: [
      'mijn-services.accp.nijmegen.nl',
    ],
    cnameRecords: {
      _b528d6157c2d9a369bf7d7812881d466: '_189b6977b0d0141d6cbb01e0ba1386e6.djqtsrsxkq.acm-validations.aws.',
    },
    databases: Statics.databasesAcceptance,
    openklant: {
      image: 'maykinmedia/open-klant:2.1.0',
      logLevel: 'DEBUG',
      debug: true,
    },
    openNotificaties: {
      image: 'openzaak/open-notificaties:1.7.0',
      rabbitMqImage: 'rabbitmq:3.13.4-alpine',
      logLevel: 'DEBUG',
      debug: true,
    },
    openZaak: {
      image: 'openzaak/open-zaak:1.14.0',
      logLevel: 'DEBUG',
      debug: true,
    },
    vrijBrpOmc: {
      image: 'worthnl/notifynl-omc:1.8.15',
      logLevel: 'DEBUG',
      debug: true,
      mode: 'Development',
      openKlantUrl: 'mijn-services.accp.nijmegen.nl/open-klant',
      zakenApiUrl: 'mijn-services.accp.nijmegen.nl/open-zaak',
      notificatiesApiUrl: 'mijn-services.accp.nijmegen.nl/open-notificaties',
    },
    openKlantRegistrationServices: [
      {
        cdkId: 'open-klant-registration-service-vrijbrp',
        debug: true,
        openKlantUrl: 'https://mijn-services.accp.nijmegen.nl/open-klant/klantinteracties/api/v1',
        zakenApiUrl: 'https://example.com/conduction-zaken-api-url-here',
        path: '/open-klant-registration-service-vrijbrp/callback',
        roltypesToRegister: ['initiator'],
      },
      {
        cdkId: 'open-klant-registration-service-development',
        debug: true,
        openKlantUrl: 'https://mijn-services.accp.nijmegen.nl/open-klant/klantinteracties/api/v1',
        zakenApiUrl: 'https://lb.zgw.sandbox-marnix.csp-nijmegen.nl/open-zaak/zaken/api/v1',
        path: '/open-klant-registration-service-development/callback',
        roltypesToRegister: ['initiator'],
      },
    ],
  },
  main: {
    branch: 'main',
    buildEnvironment: Statics.gnBuildEnvironment,
    deploymentEnvironment: Statics.gnMijnServicesProd,
    alternativeDomainNames: [
      'mijn-services.nijmegen.nl',
    ],
    cnameRecords: {
      _762e893c9ea81e57b34ab11ed543256d: '_1c518863d978cddd100e65875b7c1136.djqtsrsxkq.acm-validations.aws.',
    },
    databases: Statics.databasesProduction,
    openklant: {
      image: 'maykinmedia/open-klant:2.1.0',
      logLevel: 'INFO',
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
