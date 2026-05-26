import { Configuration } from '../ConfigurationInterfaces';
import { acceptance } from './acceptance';
import { development } from './development';
import { main } from './main';

const EnvironmentConfigurations: { [key: string]: Configuration } = {
  development: development,
  acceptance: acceptance,
  main: main,
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
