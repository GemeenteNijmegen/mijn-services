import { Response } from '@gemeentenijmegen/apigateway-http';
import { Bsn } from '@gemeentenijmegen/utils';
import { IRegistrationStrategy } from './IRegistrationStrategy';
import { Notification } from '../model/Notification';
import { OpenKlantDigitaalAdresWithUuid } from '../model/Partij';
import { Rol } from '../model/Rol';
import { OpenKlantMapper } from '../OpenKlantMapper';
import { OpenKlantRegistrationServiceProps } from '../OpenKlantRegistrationHandler';


export class RolWithBRPRegistrationStrategy implements IRegistrationStrategy {

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

    // Get name from Rol
    const personName = await this.getNameFromRol(rol);
    // Create a partij
    const partijInput = OpenKlantMapper.partijFromRol(rol, personName);
    const partij = await this.configuration.openKlantApi.registerPartij(partijInput);
    console.debug('Partij created', partij);

    // Create a partij identificatie
    const partijIdentificatieInput = OpenKlantMapper.partijIdentificatieFromRol(rol, partij.uuid);
    const partijIdentificatie = await this.configuration.openKlantApi.addPartijIdentificatie(partijIdentificatieInput);
    console.debug('Partij identificatie created', partijIdentificatie);

    // Attach digitale adressen to partij
    const digitaleAdressenInput = OpenKlantMapper.digitaalAdressenFromRol(rol, partij.uuid);
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
      uuid: partij.uuid,
      soortPartij: partij.soortPartij,
      voorkeursDigitaalAdres: {
        uuid: voorkeur,
      },
    });

    return Response.ok();
  }

  private getNameFromRol(rol: Rol) {
    const bsnString = rol?.betrokkeneIdentificatie.inpBsn;
    if (!bsnString) {
      throw Error('No bsn found in rol');
    }
    return this.configuration.brpApi.getName(new Bsn(bsnString));
  }
}
