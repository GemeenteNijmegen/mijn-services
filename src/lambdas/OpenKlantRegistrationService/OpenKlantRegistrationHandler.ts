

export class OpenKlantRegistrationHandler {


  async init() {
    console.time('init');

    // Create Zaken api client

    // Create OpenKlant client

    console.timeEnd('init');
  }


  async handleNotification(_notification: any) {

    // Validate notification

    // Get zaak data and involved rollen

    // Get contactgegevens van correct role (e.g. indiener)

    // Store contactgegevens in OpenKlant

  }

}