import { IRegistrationStrategy, SimpleStrategy } from './IRegistrationStrategy';
import { RolRegisrationStrategy } from './RolRegistrationStrategy';
import { OpenKlantRegistrationServiceProps } from '../OpenKlantRegistrationHandler';


export class RegistrationStrategyFactory {

  private readonly configuration: OpenKlantRegistrationServiceProps;
  constructor(configuration: OpenKlantRegistrationServiceProps) {
    this.configuration = configuration;
  }

  buildStrategy() : IRegistrationStrategy {
    const strategy = process.env.STRATEGY;

    if (strategy == 'simple') {
      console.debug('Using simple strategy');
      return new SimpleStrategy(this.configuration);
    } else if (strategy == 'rolregistration') {
      console.debug('Using rol registration strategy');
      return new RolRegisrationStrategy(this.configuration);
    }

    console.warn('Defaulting to simple strategy. This is porbably not what you want.');
    return new SimpleStrategy(this.configuration);
  }

}