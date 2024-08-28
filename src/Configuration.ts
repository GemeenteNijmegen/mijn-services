import { Statics } from './Statics';

/**
 * Adds a configuration field to another interface
 */
export interface Configurable {
  configuration: Configuration;
}

/**
 * Environment object (required fields)
 */
export interface Environment {
  account: string;
  region: string;
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
  buildEnvironment: Environment;

  /**
   * Environment to deploy the application to
   *
   * The pipeline (which usually runs in the build account) will
   * deploy the application to this environment. This is usually
   * the workload AWS account in our default region.
   */
  deploymentEnvironment: Environment;

  /**
   * Provie alternative domain names
   */
  alternativeDomainNames?: string[];

  /**
   * CNAME records to create for this project
   * E.g. for certificates.
   */
  cnameRecords?: Record<string, string>;
}


const EnvironmentConfigurations: {[key:string]: Configuration} = {
  acceptance: {
    branch: 'acceptance',
    buildEnvironment: Statics.gnBuildEnvironment,
    deploymentEnvironment: Statics.gnMijnServicesAccp,
    // alternativeDomainNames: [ // TODO enable when nijmegen.nl CNAME records are added
    //   'mijn-services.accp.nijmegen.nl',
    // ],
    cnameRecords: {
      _b528d6157c2d9a369bf7d7812881d466: '_189b6977b0d0141d6cbb01e0ba1386e6.djqtsrsxkq.acm-validations.aws.',
    },
  },
  main: {
    branch: 'main',
    buildEnvironment: Statics.gnBuildEnvironment,
    deploymentEnvironment: Statics.gnMijnServicesProd,
    // alternativeDomainNames: [ // TODO enable when nijmegen.nl CNAME records are added
    //   'mijn-services.nijmegen.nl',
    // ],
    cnameRecords: {
      _762e893c9ea81e57b34ab11ed543256d: '_1c518863d978cddd100e65875b7c1136.djqtsrsxkq.acm-validations.aws.',
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
