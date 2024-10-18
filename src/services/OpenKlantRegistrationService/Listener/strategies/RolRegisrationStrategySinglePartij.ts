import { Response } from '@gemeentenijmegen/apigateway-http';
import { IRegistrationStrategy } from './IRegistrationStrategy';
import { StrategyStatics } from './StrategyStatics';
import { Notification } from '../model/Notification';
import { OpenKlantDigitaalAdresWithUuid, OpenKlantPartijWithUuid } from '../model/Partij';
import { Rol } from '../model/Rol';
import { OpenKlantMapper } from '../OpenKlantMapper';
import { OpenKlantRegistrationServiceProps } from '../OpenKlantRegistrationHandler';


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

    let partij = await this.findPartijIfItExists(rol);
    if (partij) {
      console.debug('Found existing partij.');
      // Validate contactgevens and update if nessecary
      await this.updateDigitaleAdressen(partij, rol);
    } else {
      console.debug('No existing partij found, creating new partij...');
      partij = await this.registerPartij(rol);
    }

    await this.updateRolWithParijUrl(partij.uuid, rol);

    return Response.ok();
  }


  /**
   * Uses the rol to find the persoon or contactpersoon
   * that is identified with the rol.
   * @param rol
   * @returns
   */
  private async findPartijIfItExists(rol: Rol) : Promise<OpenKlantPartijWithUuid | undefined> {
    if (rol.betrokkeneType == 'natuurlijk_persoon') {
      return this.configuration.openKlantApi.findPartij(rol.betrokkeneIdentificatie.inpBsn, 'persoon');
    } else if (rol.betrokkeneType == 'niet_natuurlijk_persoon') {
      const kvk = rol.betrokkeneIdentificatie.annIdentificatie;
      const name = rol.contactpersoonRol?.naam ?? rol.betrokkeneIdentificatie.geslachtsnaam;
      const pseudoId = StrategyStatics.constructPseudoId(kvk!, name!);
      return this.configuration.openKlantApi.findPartij(pseudoId, 'contactpersoon');
    }
    return undefined;
  }


  /**
   * Create a new partij including digitale adressen en identificatie.
   * If the partij is a orgnisation creates a contactpersoon that works for
   * the organisation.
   * @param rol
   * @returns
   */
  private async registerPartij(rol: Rol) : Promise<OpenKlantPartijWithUuid> {
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
      console.debug('Partij is an organisatie, storing contactgegevens in contactpersoon partij...');
      const partijUrl = this.configuration.openKlantApi.getEndpoint() + `/partijen/${partij.uuid}`;
      const contactpersoonInput = OpenKlantMapper.contactpersoonFromRol(rol, partijUrl, partij.uuid);
      const contactpersoon = await this.configuration.openKlantApi.registerPartij(contactpersoonInput);

      const kvk = rol.betrokkeneIdentificatie.annIdentificatie;
      const name = rol.contactpersoonRol?.naam ?? rol.betrokkeneIdentificatie.geslachtsnaam;
      await this.configuration.openKlantApi.addPartijIdentificatie({
        identificeerdePartij: contactpersoon,
        partijIdentificator: {
          codeObjecttype: 'CUSTOM PSEUDO ID CONTACTPERSOON',
          codeRegister: StrategyStatics.PSUEDOID_REGISTER,
          codeSoortObjectId: 'Custom PseudoID',
          objectId: StrategyStatics.constructPseudoId(kvk!, name!),
        },
      });

      console.debug('Contactpersoon partij created', contactpersoon);
      partijWithDigitaleAdressen = contactpersoon;
    }

    await this.setDigitaleAdressenForPartijFromRol(partijWithDigitaleAdressen, rol);

    return partijWithDigitaleAdressen;
  }

  private async updateDigitaleAdressen(partij: OpenKlantPartijWithUuid, rol: Rol) {
    console.warn('We do not know which is the perefered adres, old ones are removed and the new ones are added.');
    if (partij._expand?.digitale_adressen) {
      await this.removeOldDigitaleAdressen(partij);
    }
    return this.setDigitaleAdressenForPartijFromRol(partij, rol);
  }

  private async removeOldDigitaleAdressen(partij: OpenKlantPartijWithUuid) {
    if (!partij._expand?.digitale_adressen || partij._expand?.digitale_adressen.length == 0) {
      return;
    }
    for (const digitaalAdres of partij._expand.digitale_adressen) {
      await this.configuration.openKlantApi.deleteDigitaalAdres(digitaalAdres.uuid);
    }
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


}
