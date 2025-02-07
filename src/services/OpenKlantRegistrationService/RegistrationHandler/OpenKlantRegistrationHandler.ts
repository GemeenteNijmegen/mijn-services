import { ApiGatewayV2Response, Response } from '@gemeentenijmegen/apigateway-http';
import { logger } from '../Shared/Logger';
import { Notification } from '../Shared/model/Notification';
import { ICatalogiApi } from './CatalogiApi';
import { IOpenKlantApi } from './OpenKlantApi';
import { RegistrationStrategyFactory } from './strategies/RegistrationStrategyFactory';
import { IZakenApi } from './ZakenApi';

export interface OpenKlantRegistrationServiceProps {
  readonly zakenApiUrl: string;
  readonly zakenApi: IZakenApi;
  readonly openKlantApi: IOpenKlantApi;
  readonly catalogiApi: ICatalogiApi;
  readonly roltypesToRegister: string[];
}

export class OpenKlantRegistrationHandler {

  private readonly configuration: OpenKlantRegistrationServiceProps;
  private readonly strategyFactorty: RegistrationStrategyFactory;
  constructor(configuration: OpenKlantRegistrationServiceProps) {
    this.configuration = configuration;
    this.strategyFactorty = new RegistrationStrategyFactory(this.configuration);
    logger.debug('Configured using:', { configuration: this.configuration });
  }

  async handleNotification(notification: Notification): Promise<ApiGatewayV2Response> {
    logger.debug('Recevied notification', { notification });

    // Get the strategy that is in use currently
    const strategy = this.strategyFactorty.buildStrategy();

    // Validate notification
    const errors = strategy.validateNotification(notification);
    if (errors) {
      return Response.json({ errors }, 206); // TODO change back in 400 later maybe?
    }

    // Handle notification as defined by the strategy
    return strategy.register(notification);
  }

}
