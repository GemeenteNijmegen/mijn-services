import { Tracer } from '@aws-lambda-powertools/tracer';
import { ICatalogiApi } from './CatalogiApi';
import { IOpenKlantApi } from './OpenKlantApi';
import { RegistrationStrategyFactory } from './strategies/RegistrationStrategyFactory';
import { IZakenApi } from './ZakenApi';
import { logger } from '../Shared/Logger';
import { Notification } from '../Shared/model/Notification';

export interface OpenKlantRegistrationServiceProps {
  readonly zakenApiUrl: string;
  readonly zakenApi: IZakenApi;
  readonly openKlantApi: IOpenKlantApi;
  readonly catalogiApi: ICatalogiApi;
  readonly roltypesToRegister: string[];
  /**
   * Limit from what catalogi the registration
   * service responds.
   * @default - all catalogi
   */
  readonly catalogusUuids?: string[];
  /**
   * Annotate trace with usefull information if a
   * tracer is provided
   */
  readonly tracer?: Tracer;
}

export class OpenKlantRegistrationHandler {

  private readonly configuration: OpenKlantRegistrationServiceProps;
  private readonly strategyFactorty: RegistrationStrategyFactory;
  constructor(configuration: OpenKlantRegistrationServiceProps) {
    this.configuration = configuration;
    this.strategyFactorty = new RegistrationStrategyFactory(this.configuration);
    logger.debug('Configured using:', { configuration: this.configuration });
  }

  async handleNotification(notification: Notification): Promise<void> {
    logger.debug('Recevied notification', { notification });

    // Get the strategy that is in use currently
    const strategy = this.strategyFactorty.buildStrategy();

    // Validate notification
    const ignoreReasons = strategy.validateNotification(notification);
    if (ignoreReasons) {
      return;
    }

    // Handle notification as defined by the strategy
    await strategy.register(notification);
  }

}
