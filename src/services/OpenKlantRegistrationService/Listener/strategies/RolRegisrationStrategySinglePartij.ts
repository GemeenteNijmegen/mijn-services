import { Response } from '@gemeentenijmegen/apigateway-http';
import { IRegistrationStrategy } from './IRegistrationStrategy';
import { StrategyStatics } from './StrategyStatics';
import { ErrorResponse } from '../ErrorResponse';
import { Notification } from '../model/Notification';
import { OpenKlantDigitaalAdresWithUuid, OpenKlantPartijWithUuid } from '../model/Partij';
import { Rol } from '../model/Rol';
import { OpenKlantMapper } from '../OpenKlantMapper';
import { OpenKlantRegistrationServiceProps } from '../OpenKlantRegistrationHandler';
import { logger } from '../Logger';


export class RolRegisrationStrategySinglePartij implements IRegistrationStrategy {

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
      logger.info('Notification validation failed', {errors});
    }
    return errors.length == 0 ? undefined : errors;
  }


  async register(notification: Notification): Promise<Response> {
    // Get the involved rol details and check if the role is the 'aanvrager'
    const rolUrl = notification.resourceUrl;
    const rol = await this.configuration.zakenApi.getRol(rolUrl);
    const rolType = await this.configuration.catalogiApi.getRolType(rol.roltype);

    if (rol.betrokkene) {
      logger.debug('Rol alreay had betrokkene url set. Skipping update...');
      return Response.ok();
    }

    // Check if role is of the target role type, otherwise return 200 but do not handle the notification
    const isTargetRolType = this.configuration.roltypesToRegister.includes(rolType.omschrijvingGeneriek.toLocaleLowerCase());
    if (!isTargetRolType) {
      logger.debug('Role is not of the type to forward to open klant. Ignoring this notification.');
      return Response.ok();
    }
    logger.debug('Found a rol of the target type to forward to open klant.');

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
    await this.updateRolWithParijUrl(partij.uuid, rol);

    return Response.ok();
  }

  private async handleNatuurlijkPersoon(rol: Rol) {

    // 1. Check if the person exists
    let persoon = await this.configuration.openKlantApi.findPartij(rol.betrokkeneIdentificatie.inpBsn, 'persoon');


    if (persoon) { // 2a. If a persoon exists, remove known digitale adressen
      await this.removeOldDigitaleAdressen(persoon);
    } else { // 2b. If persoon does not exist, create it
      const partijInput = OpenKlantMapper.persoonPartijFromRol(rol);
      persoon = await this.configuration.openKlantApi.registerPartij(partijInput);
      logger.debug('Persoon partij created', persoon);
      const identificatieInput = OpenKlantMapper.persoonIdentificatieFromRol(rol, persoon.uuid);
      const identificatie = await this.configuration.openKlantApi.addPartijIdentificatie(identificatieInput);
      logger.debug('Persoon partij identificatie created', identificatie);
    }

    // 3. Add new digitale adressen
    logger.debug('Setting digitale adressen for persoon...');
    await this.setDigitaleAdressenForPartijFromRol(persoon, rol);

    return persoon;

  }

  private async handleNietNatuurlijkPersoon(rol: Rol) {

    // 1. Check if the contactpersoon exists
    const kvk = rol.betrokkeneIdentificatie.annIdentificatie;
    const name = rol.contactpersoonRol?.naam ?? rol.betrokkeneIdentificatie.geslachtsnaam;
    const pseudoId = StrategyStatics.constructPseudoId(kvk!, name!);
    logger.debug('Checking if the contactpersoon alreay exists...');
    let contactpersoon = await this.configuration.openKlantApi.findPartij(pseudoId, 'contactpersoon');

    if (contactpersoon) {
      // 2.a. If a persoon exists, remove known digitale adressen
      logger.debug('Removing known digitale adressen...');
      await this.removeOldDigitaleAdressen(contactpersoon);
    } else {
      // 2.b. If persoon does not exist, create it
      logger.debug('Did not find contactpersoon for this case, creating a new contactpersoon...');

      // 2.b.1. Check if organisatie exists
      logger.debug('Checking if organisation exists...');
      let organisatie = await this.configuration.openKlantApi.findPartij(kvk, 'organisatie');

      // 2.b.2. If it does not exist create the organisatie
      if (!organisatie) {
        logger.debug('No organisation found, creating a new organisation...');
        const organisatieInput = OpenKlantMapper.organisatiePartijFromRol(rol);
        organisatie = await this.configuration.openKlantApi.registerPartij(organisatieInput);
        const organisatieIdentificatieInput = OpenKlantMapper.organisatieIdentificatieFromRol(rol, organisatie.uuid);
        await this.configuration.openKlantApi.addPartijIdentificatie(organisatieIdentificatieInput);
      }

      // 2.b.3. Create the contactpersoon that works for the organisatie
      logger.debug('Creating a contactpersoon...');
      const orgnisatieUrl = this.configuration.openKlantApi.getEndpoint() + `/partijen/${organisatie.uuid}`;
      const contactpersoonInput = OpenKlantMapper.contactpersoonPartijFromRol(rol, orgnisatieUrl, organisatie.uuid);
      contactpersoon = await this.configuration.openKlantApi.registerPartij(contactpersoonInput);
      const contactpersoonIdentificatie = OpenKlantMapper.contactpersoonIdentificatieFromPseudoId(rol, contactpersoon.uuid, pseudoId);
      await this.configuration.openKlantApi.addPartijIdentificatie(contactpersoonIdentificatie);

    }

    // 3. Add new digitale adressen
    logger.debug('Setting digitale adressen for contactpersoon...');
    await this.setDigitaleAdressenForPartijFromRol(contactpersoon, rol);

    return contactpersoon;
  }


  private async removeOldDigitaleAdressen(partij: OpenKlantPartijWithUuid) {
    logger.debug('Removing digital adressen for pertij...');
    if (!partij.digitaleAdressen || partij.digitaleAdressen.length == 0) {
      logger.debug('Partij does not seem to have any digitale adressen');
      return;
    }
    for (const digitaalAdres of partij.digitaleAdressen) {
      logger.debug('Removing digitaal adres', digitaalAdres.uuid);
      await this.configuration.openKlantApi.deleteDigitaalAdres(digitaalAdres.uuid);
    }
  }

  private async updateRolWithParijUrl(partijUuid: string, rol: Rol) {
    const partijUrl = this.configuration.openKlantApi.getEndpoint() + `/partijen/${partijUuid}`;
    rol.betrokkene = partijUrl;
    const rolUpdate = await this.configuration.zakenApi.updateRol(rol);
    logger.debug('Rol updated with betrokkene', rolUpdate);
  }

  private async setDigitaleAdressenForPartijFromRol(partij: OpenKlantPartijWithUuid, rol: Rol) {
    // Attach digitale adressen to partij
    const digitaleAdressenInput = OpenKlantMapper.digitaalAdressenFromRol(rol, partij.uuid);
    const promises: Promise<OpenKlantDigitaalAdresWithUuid>[] = [];
    digitaleAdressenInput.forEach(digitaalAdres => {
      promises.push(this.configuration.openKlantApi.addDigitaalAdres(digitaalAdres));
    });
    const digitaleAdressen = await Promise.all(promises);
    digitaleAdressen.forEach(adres => logger.debug('Digitaal adres created', adres));

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
    logger.debug('Partij updates with voorkeur', partijUpdate);
  }

}
