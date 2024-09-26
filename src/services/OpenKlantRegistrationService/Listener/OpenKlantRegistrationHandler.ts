import { Response } from '@gemeentenijmegen/apigateway-http';
import { Notification } from './Notification';
import { IZakenApi } from './ZakenApi';

export interface OpenKlantRegistrationServiceProps {
  readonly zakenApiUrl: string;
  readonly openKlantApiUrl: string;
  readonly openKlantApiKey: string;
  readonly zakenApi: IZakenApi;
}

export class OpenKlantRegistrationHandler {

  private readonly configuration: OpenKlantRegistrationServiceProps;
  constructor(configuration: OpenKlantRegistrationServiceProps) {
    this.configuration = configuration;

    if (process.env.DEBUG) {
      console.log('Configured using:', this.configuration);
    }
  }


  async handleNotification(notification: Notification) {

    if (process.env.DEBUG) {
      console.log('Recevied notification', notification);
    }

    // Validate notification
    const errors = this.validateNotification(notification);
    if (errors) {
      return Response.json({ errors }, 400);
    }

    // Get the involved rol details and check if the role is the 'aanvrager'
    const rolUrl = notification.resourceUrl;
    const rol = await this.configuration.zakenApi.get(rolUrl);

    // Check if role is the 'aanvrager'?
    console.log(rol);

    // Store contactgegevens in OpenKlant

    return Response.ok();

  }


  private validateNotification(notification: Notification) {
    const errors: string[] = [];

    if (notification.actie !== 'create' || notification.resource !== 'rol') {
      errors.push(`Only rol creation notifications are handled by this endpoint (recevied: ${notification.actie}, ${notification.resource}).`);
    }

    if (!notification.hoofdObject.includes(this.configuration.zakenApiUrl)) {
      errors.push('Notification points to a different ZRC than is configured for this endpoint.');
    }

    if (errors.length > 0) {
      console.error('Notification validation failed', errors);
    }
    return errors.length == 0 ? undefined : errors;
  }

}