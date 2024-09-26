

export interface OpenKlantRegistrationServiceProps {
  readonly zakenApiUrl: string;
  readonly openKlantApiUrl: string;
  readonly zgwTokenClientId: string;
  readonly zgwTokenClientSecret: string;
  readonly openKlantApiKey: string;
}

export class OpenKlantRegistrationHandler {

  private readonly configuration: OpenKlantRegistrationServiceProps;
  constructor(configuration: OpenKlantRegistrationServiceProps) {
    this.configuration = configuration;

    if (process.env.DEBUG) {
      console.log('Configured using:', this.configuration);
    }
  }


  async handleNotification(_notification: any) {

    // Validate notification

    // Get zaak data and involved rollen

    // Get contactgegevens van correct role (e.g. indiener)

    // Store contactgegevens in OpenKlant

  }

}