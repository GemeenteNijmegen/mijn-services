import { IRegistrationStrategy } from './IRegistrationStrategy';
import { PartijPerRolStrategy } from './PartijPerRolStrategy';
import { RolRegisrationStrategySinglePartij } from './RolRegisrationStrategySinglePartij';
import { logger } from '../Logger';
import { OpenKlantRegistrationServiceProps } from '../OpenKlantRegistrationHandler';


export class RegistrationStrategyFactory {

  private readonly configuration: OpenKlantRegistrationServiceProps;
  constructor(configuration: OpenKlantRegistrationServiceProps) {
    this.configuration = configuration;
  }

  buildStrategy() : IRegistrationStrategy {
    const strategy = process.env.STRATEGY;

    if (strategy == 'rolregistrationsinglepartij') {
      logger.debug('Using rol registration strategy single partij');
      return new RolRegisrationStrategySinglePartij(this.configuration);
    } else if (strategy == 'partijperrol') {
      return new PartijPerRolStrategy(this.configuration);
    } else if (strategy == 'partijperroldry') {
      return new PartijPerRolStrategy(this.configuration, false);
    }

    logger.warn('Defaulting to PartijPerRolStrategy.');
    return new PartijPerRolStrategy(this.configuration);
  }

}
