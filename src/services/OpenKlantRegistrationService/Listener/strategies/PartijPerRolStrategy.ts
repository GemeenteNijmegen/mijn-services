import { randomUUID } from 'crypto';
import { Response } from '@gemeentenijmegen/apigateway-http';
import { IRegistrationStrategy } from './IRegistrationStrategy';
import { ErrorResponse } from '../ErrorResponse';
import { Notification } from '../model/Notification';
import { OpenKlantDigitaalAdresWithUuid, OpenKlantPartijWithUuid } from '../model/Partij';
import { Rol } from '../model/Rol';
import { OpenKlantMapper } from '../OpenKlantMapper';
import { OpenKlantRegistrationServiceProps } from '../OpenKlantRegistrationHandler';


export class PartijPerRolStrategy implements IRegistrationStrategy {

  private readonly configuration: OpenKlantRegistrationServiceProps;
  private readonly updateRolInZaakApi: boolean;
  constructor(configuration: OpenKlantRegistrationServiceProps, updateRolInZaakApi?: boolean) {
    this.configuration = configuration;
    this.updateRolInZaakApi = updateRolInZaakApi ?? true;
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

    if (rol.betrokkene) {
      console.debug('Rol alreay had betrokkene url set. Skipping update...');
      return Response.ok();
    }

    // Check if role is of the target role type, otherwise return 200 but do not handle the notification
    const isTargetRolType = this.configuration.roltypesToRegister.includes(rolType.omschrijvingGeneriek.toLocaleLowerCase());
    if (!isTargetRolType) {
      console.debug('Role is not of the type to forward to open klant. Ignoring this notification.');
      return Response.ok();
    }
    console.debug('Found a rol of the target type to forward to open klant.');

    let partij: OpenKlantPartijWithUuid | undefined = undefined;
    if (rol.betrokkeneType == 'natuurlijk_persoon') {
      partij = await this.handleNatuurlijkPersoon(rol);
    }

    if (rol.betrokkeneType == 'niet_natuurlijk_persoon') {
      partij = await this.handleNietNatuurlijkPersoon(rol);
    }

    if (!partij) {
      throw new ErrorResponse(500, 'No partij was found or created');
    }

    if (this.updateRolInZaakApi == true) {
      await this.updateRolWithParijUrl(partij.uuid, rol);
    } else {
      console.debug('Skipping update of role in zaken api as updateRolInZaakApi is false');
    }

    return Response.ok();
  }

  private async handleNatuurlijkPersoon(rol: Rol) {
    // Create the partij
    const partijInput = OpenKlantMapper.persoonPartijFromRol(rol);
    const persoon = await this.configuration.openKlantApi.registerPartij(partijInput);
    console.debug('Persoon partij created', persoon);
    // Create the partij identificatie
    const identificatieInput = this.createTemporaryPartijIdentificatie(persoon.uuid);
    const identificatie = await this.configuration.openKlantApi.addPartijIdentificatie(identificatieInput);
    console.debug('Persoon partij identificatie created', identificatie);
    // Add the digitale adressen (and select voorkeur)
    await this.setDigitaleAdressenForPartijFromRol(persoon, rol);
    console.debug('Digitale addressen created');
    return persoon;
  }

  private async handleNietNatuurlijkPersoon(rol: Rol) {
    // Act as if the rol is actually a natuurlijk persoon for converting it to a persoon partij.
    // Note that we can do this in this particular situation as we do not use the rol.betrokkeneIdentificatie
    //  but instead use a random ID so that we can remove these partijen later.
    rol.betrokkeneType = 'natuurlijk_persoon';
    // Create the partij
    const partijInput = OpenKlantMapper.persoonPartijFromRol(rol);
    const persoon = await this.configuration.openKlantApi.registerPartij(partijInput);
    console.debug('Persoon partij created (for kvk in partij per rol strategy)', persoon);
    // Create the partij identificatie
    const identificatieInput = this.createTemporaryPartijIdentificatie(persoon.uuid);
    const identificatie = await this.configuration.openKlantApi.addPartijIdentificatie(identificatieInput);
    console.debug('Persoon partij identificatie created (for kvk in partij per rol strategy)', identificatie);
    // Add the digitale adressen (and select voorkeur)
    await this.setDigitaleAdressenForPartijFromRol(persoon, rol);
    console.debug('Digitale addressen created (for kvk in partij per rol strategy)');
    return persoon;

  }

  private async updateRolWithParijUrl(partijUuid: string, rol: Rol) {
    const partijUrl = this.configuration.openKlantApi.getEndpoint() + `/partijen/${partijUuid}`;
    rol.betrokkene = partijUrl;
    const rolUpdate = await this.configuration.zakenApi.updateRol(rol);
    console.debug('Rol updated with betrokkene', rolUpdate);
  }

  private async setDigitaleAdressenForPartijFromRol(partij: OpenKlantPartijWithUuid, rol: Rol) {
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
    const partijUpdate = await this.configuration.openKlantApi.updatePartij({
      uuid: partij.uuid,
      soortPartij: partij.soortPartij,
      voorkeursDigitaalAdres: {
        uuid: voorkeur,
      },
    });
    console.debug('Partij updates with voorkeur', partijUpdate);
  }

  private createTemporaryPartijIdentificatie(partijUuid: string) {
    return {
      identificeerdePartij: {
        uuid: partijUuid,
      },
      partijIdentificator: {
        codeObjecttype: 'TEMPORARY PARTIJ ID',
        codeSoortObjectId: 'tempPartijId',
        objectId: randomUUID(),
        codeRegister: 'TEMP',
      },
    };
  }

}
