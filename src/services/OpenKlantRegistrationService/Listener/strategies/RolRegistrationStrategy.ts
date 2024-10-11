import { Response } from '@gemeentenijmegen/apigateway-http';
import { IRegistrationStrategy } from './IRegistrationStrategy';
import { Notification } from '../model/Notification';
import { OpenKlantDigitaalAdresWithUuid } from '../model/Partij';
import { OpenKlantMapper } from '../OpenKlantMapper';
import { OpenKlantRegistrationServiceProps } from '../OpenKlantRegistrationHandler';


export class RolRegisrationStrategy implements IRegistrationStrategy {

  private readonly configuration: OpenKlantRegistrationServiceProps;
  constructor(configuration: OpenKlantRegistrationServiceProps) {
    this.configuration = configuration;
  }

  validateNotification(notification: Notification): string[] | undefined {
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


  async register(notification: Notification): Promise<Response> {
    // Get the involved rol details and check if the role is the 'aanvrager'
    const rolUrl = notification.resourceUrl;
    const rol = await this.configuration.zakenApi.getRol(rolUrl);
    const rolType = await this.configuration.catalogiApi.getRolType(rol.roltype);

    // Check if role is of the target role type, otherwise return 200 but do not handle the notification
    const isTargetRolType = this.configuration.roltypesToRegister.includes(rolType.omschrijvingGeneriek.toLocaleLowerCase());
    if (!isTargetRolType) {
      console.debug('Role is not of the type to forward to open klant. Ignoring this notification.');
      return Response.ok();
    }
    console.debug('Found a rol of the target type to forward to open klant.');

    // FOR BSN AND ORGANISATION
    // Create a partij
    const partijInput = OpenKlantMapper.partijFromRol(rol);
    const partij = await this.configuration.openKlantApi.registerPartij(partijInput);
    console.debug('Partij created', partij);

    // Create a partij identificatie
    const partijIdentificatieInput = OpenKlantMapper.partijIdentificatieFromRol(rol, partij.uuid);
    const partijIdentificatie = await this.configuration.openKlantApi.addPartijIdentificatie(partijIdentificatieInput);
    console.debug('Partij identificatie created', partijIdentificatie);

    let partijWithDigitaleAdressen = partij;
    if (partij.soortPartij == 'organisatie') {
      const partijUrl = this.configuration.openKlantApi.getEndpoint() + `/partijen/${partij.uuid}`;
      const contactpersoonInput = OpenKlantMapper.contactpersoonFromRol(rol, partij.uuid, partijUrl);
      const contactpersoon = await this.configuration.openKlantApi.registerPartij(contactpersoonInput);
      partijWithDigitaleAdressen = contactpersoon;
    }

    // Attach digitale adressen to partij
    const digitaleAdressenInput = OpenKlantMapper.digitaalAdressenFromRol(rol, partijWithDigitaleAdressen.uuid);
    const promises: Promise<OpenKlantDigitaalAdresWithUuid>[] = [];
    digitaleAdressenInput.forEach(digitaalAdres => {
      promises.push(this.configuration.openKlantApi.addDigitaalAdres(digitaalAdres));
    });
    const digitaleAdressen = await Promise.all(promises);
    digitaleAdressen.forEach(adres => console.log('Digitaal adres created', adres));

    // Store the first digitaal adres as the prefered
    // TODO figure out what the primary should be of the returned adressen?
    const telefoon = digitaleAdressen.find(adres => adres.soortDigitaalAdres == OpenKlantMapper.TELEFOONNUMMER);
    const email = digitaleAdressen.find(adres => adres.soortDigitaalAdres == OpenKlantMapper.EMAIL);
    const voorkeur = telefoon?.uuid ?? email?.uuid;
    if (!voorkeur) {
      throw Error('No telefoon or email adres registered.');
    }
    await this.configuration.openKlantApi.updatePartij({
      uuid: partijWithDigitaleAdressen.uuid,
      soortPartij: partijWithDigitaleAdressen.soortPartij,
      voorkeursDigitaalAdres: {
        uuid: voorkeur,
      },
    });

    // Update rol with partij URL
    const partijUrl = this.configuration.openKlantApi.getEndpoint() + `/partijen/${partijWithDigitaleAdressen.uuid}`;
    rol.betrokkene = partijUrl;
    await this.configuration.zakenApi.updateRol(rol);

    return Response.ok();
  }
}
