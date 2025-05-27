import { randomUUID } from 'crypto';
import { logger } from '../../Shared/Logger';
import { Notification } from '../../Shared/model/Notification';
import { OpenKlantPartijWithUuid } from '../../Shared/model/Partij';
import { Rol } from '../../Shared/model/Rol';
import { RolType } from '../../Shared/model/RolType';
import { OpenKlantMapper } from '../OpenKlantMapper';
import { OpenKlantRegistrationServiceProps } from '../OpenKlantRegistrationHandler';
import { ISubmissionStorage, SubmissionStorage } from '../SubmissionStorage';
import { SubmissionUtils } from '../SubmissionUtils';
import { NotFoundError } from '../ZgwApi';
import { IRegistrationStrategy } from './IRegistrationStrategy';

export class PartijPerRolStrategyWithForm implements IRegistrationStrategy {

  private readonly configuration: OpenKlantRegistrationServiceProps;
  private readonly submissisonStorage: ISubmissionStorage;
  constructor(configuration: OpenKlantRegistrationServiceProps, submissionStorage?: ISubmissionStorage) {
    this.configuration = configuration;
    if (!submissionStorage) {
      this.submissisonStorage = new SubmissionStorage();
    } else {
      this.submissisonStorage = submissionStorage;
    }
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
      logger.info('Notification ignored', { errors });
    }
    return errors.length == 0 ? undefined : errors;
  }

  async register(notification: Notification): Promise<void> {

    try {

      // Get the rol and roltype
      const rol = await this.configuration.zakenApi.getRol(notification.resourceUrl);
      const rolType = await this.configuration.catalogiApi.getRolType(rol.roltype);

      // Is the rol of the correct type and catalog?
      if (!this.shouldHandleRolOfThisType(rolType)) {
        return;
      }
      logger.info('Received a role to forward to open-klant.');

      // Enter phase 1 or 2 depending on if partij reference exists in betrokkene field
      if (!rol.betrokkene) {
        logger.info('PHASE 1: Create partij and update rol');
        await this.createPartijAndUpdateRol(rol);
        // Phase 1 is done now. After deleting and recreating the role
        // there will be a new create rol notification arriving at this
        // implementation that has a betrokkene url. When this is handled
        // the form is fetched, parsed and digitale addressen are set.
        logger.info('Done creating partij and updating rol, returning');
      } else {
        // Phase 2 starts here
        logger.info('PHASE 2: Add contact data to partij');
        await this.addDataToPartij(rol, notification);
        logger.info('Contact data added to partij');
      }

    } catch (error) {

      // If did not find rol
      if (error instanceof NotFoundError && error.message.includes('rol')) {
        logger.info('Did not find role, this is probably fine.');
        return;
      }

      // Log and rethrow
      logger.error('Failed to handle notification', { error });
      throw error;
    }

    return;
  }

  private async addDataToPartij(rol: Rol, notification: Notification) {
    // Get the existing partij
    const partij = await this.configuration.openKlantApi.getPartij(rol.betrokkene!);

    // Get the form reference
    const zaak = await this.configuration.zakenApi.getZaak(notification.hoofdObject);
    const reference = zaak._expand?.eigenschappen?.find(eigenschap => eigenschap.naam == 'formulier_referentie')?.waarde;
    if (!reference) {
      throw Error('Could not find form reference so no data can be transfered to open-klant.');
    }

    // The the form submission
    const userType = rol.betrokkeneType == 'natuurlijk_persoon' ? 'person' : 'organization';
    const userId = userType == 'person' ? rol.betrokkeneIdentificatie.inpBsn : rol.betrokkeneIdentificatie.annIdentificatie;
    const form = await this.submissisonStorage.getFormJson(reference, userId!, userType!);

    // Based on the form contents add digital adresses
    await this.setDigitaleAdressenForPartijFromRol(partij, form);
  }

  private async createPartijAndUpdateRol(rol: Rol) {
    let partij: OpenKlantPartijWithUuid | undefined = undefined;

    if (rol.betrokkeneType == 'natuurlijk_persoon') {
      partij = await this.handleNatuurlijkPersoonNew(rol);
      logger.info('Registratie van partij als natuurlijk_persoon is afgerond.');
    }

    if (rol.betrokkeneType == 'niet_natuurlijk_persoon') {
      partij = await this.handleNietNatuurlijkPersoonNew(rol);
      logger.info('Registratie van partij als niet_natuurlijk_persoon is afgerond.');
    }

    if (!partij) {
      throw new Error('Failed to create a partij');
    }

    await this.updateRolWithParijUrl(partij.uuid, rol);
    logger.info('Update van de rol met partij url is uitgevoerd.');
  }


  shouldHandleRolOfThisType(roltype: RolType) {

    // Filter if role is from right catalogus
    if (this.configuration.catalogusUuids) {
      const inWhitelist = this.configuration.catalogusUuids.find(catalogusUuid => roltype.catalogus && roltype.catalogus.includes(catalogusUuid));
      if (!inWhitelist) {
        logger.info('Catalogus of roltype is not in the configured whitelist of catalogi, ignoring notification');
        return false;
      }
    }

    // Check if role is of the target role type (i.e. initiator)
    const isTargetRolType = this.configuration.roltypesToRegister.includes(roltype.omschrijvingGeneriek.toLocaleLowerCase());
    if (!isTargetRolType) {
      logger.info('Role is not of the type to forward to open klant. Ignoring this notification.');
      return false;
    }

    return true;
  }

  async handleNatuurlijkPersoonNew(rol: Rol) {
    // Create the partij
    const partijInput = OpenKlantMapper.persoonPartijFromRol(rol);
    const persoon = await this.configuration.openKlantApi.registerPartij(partijInput);
    logger.debug('Persoon partij created', persoon);
    // Create the partij identificatie
    const identificatieInput = this.createTemporaryPartijIdentificatie(persoon.uuid);
    const identificatie = await this.configuration.openKlantApi.addPartijIdentificatie(identificatieInput);
    logger.debug('Persoon partij identificatie created', identificatie);
    return persoon;
  }

  async handleNietNatuurlijkPersoonNew(rol: Rol) {
    // Act as if the rol is actually a natuurlijk persoon for converting it to a persoon partij.
    // Note that we can do this in this particular situation as we do not use the rol.betrokkeneIdentificatie
    //  but instead use a random ID so that we can remove these partijen later.
    const localRol = { ...rol }; // Fix for below aproach that resulted in a major bug when the rol is updated later on.
    localRol.betrokkeneType = 'natuurlijk_persoon'; // We add the partij as a natuurlijk_persoon as from the zaak pov it is the contactpersoon. We cannot use the layered model organization->contactpersoon.
    // Create the partij
    const partijInput = OpenKlantMapper.persoonPartijFromRol(localRol);
    const persoon = await this.configuration.openKlantApi.registerPartij(partijInput);
    logger.debug('Persoon partij created (for kvk in partij per rol strategy)', persoon);
    // Create the partij identificatie
    const identificatieInput = this.createTemporaryPartijIdentificatie(persoon.uuid);
    const identificatie = await this.configuration.openKlantApi.addPartijIdentificatie(identificatieInput);
    logger.debug('Persoon partij identificatie created (for kvk in partij per rol strategy)', identificatie);
    return persoon;
  }

  async updateRolWithParijUrl(partijUuid: string, rol: Rol) {
    const partijUrl = this.configuration.openKlantApi.getEndpoint() + `/partijen/${partijUuid}`;
    rol.betrokkene = partijUrl;
    const updatedRole = await this.configuration.zakenApi.updateRol(rol);
    logger.debug('Rol updated with betrokkene', { updatedRole });
    return updatedRole;
  }

  async setDigitaleAdressenForPartijFromRol(partij: OpenKlantPartijWithUuid, submission: any) {

    // First try to parse the form data from the submission
    const form = JSON.parse(submission.submission.Message);

    // Check if a phone number is valid using the following expression (used in open-klant)
    const phonenumberRegex = /^(0[8-9]00[0-9]{4,7})|(0[1-9][0-9]{8})|(\+[0-9]{9,20}|1400|140[0-9]{2,3})$/;

    const phone = SubmissionUtils.findTelefoon(form);
    const email = SubmissionUtils.findEmail(form);
    const preference = SubmissionUtils.findKanaalvoorkeur(form);
    const isValidPhone = phone ? phonenumberRegex.test(phone) : false;

    if (phone && !isValidPhone) {
      logger.info('Invalid phonenumber, not registering in open-klant');
    }

    // // Register phone number if provied and correct format
    // let registeredPhone = undefined;
    // if (phone && isValidPhone) {
    //   registeredPhone = await this.configuration.openKlantApi.addDigitaalAdres({
    //     adres: phone,
    //     omschrijving: 'Telefoon',
    //     soortDigitaalAdres: OpenKlantMapper.TELEFOONNUMMER,
    //     verstrektDoorBetrokkene: null,
    //     verstrektDoorPartij: {
    //       uuid: partij.uuid,
    //     },
    //   });
    // }

    // // Register email if prived and correct format
    // let registeredEmail = undefined;
    // if (email) {
    //   registeredEmail = await this.configuration.openKlantApi.addDigitaalAdres({
    //     adres: email,
    //     omschrijving: 'Email',
    //     soortDigitaalAdres: OpenKlantMapper.EMAIL,
    //     verstrektDoorBetrokkene: null,
    //     verstrektDoorPartij: {
    //       uuid: partij.uuid,
    //     },
    //   });
    // }

    // Logic reasoning
    // 1. Has only email -> Use that (disregard preference)
    // 2. Has only phone -> Use that (disregard preference)
    // 3. Has email & phone -> Find preference in form
    // 4. Has email & phone & no preference -> email
    // 5. No email & phone -> Throw error

    const hasEmail = !!email;
    const hasPhone = phone && isValidPhone;

    if (hasEmail && !hasPhone) {
      // (1) Register email as preference
      const adres = await this.registerDigitaalAdres(email, 'email', partij.uuid);
      await this.setVoorkeurDigitiaalAdres(partij, adres.uuid);
    } else if (hasPhone && !hasEmail) {
      // (2) Register phone as preference
      const adres = await this.registerDigitaalAdres(phone, 'telefoonnummer', partij.uuid);
      await this.setVoorkeurDigitiaalAdres(partij, adres.uuid);
    } else if (hasEmail && hasPhone && preference == 'email') {
      // (3) Register email as preference
      const adres = await this.registerDigitaalAdres(email, 'email', partij.uuid);
      await this.setVoorkeurDigitiaalAdres(partij, adres.uuid);
    } else if (hasEmail && hasPhone && preference == 'sms') {
      // (3) Register phone as preference
      const adres = await this.registerDigitaalAdres(phone, 'telefoonnummer', partij.uuid);
      await this.setVoorkeurDigitiaalAdres(partij, adres.uuid);
    } else if (hasEmail && hasPhone && !preference) {
      // (4) Register email as preference
      const adres = await this.registerDigitaalAdres(email, 'email', partij.uuid);
      await this.setVoorkeurDigitiaalAdres(partij, adres.uuid);
    } else if (!hasEmail && !hasPhone) {
      // (5) Well now we only can throw an error
      throw new Error('Failed to set a preference as we do not have any registered digitaal adres');
    } else {
      logger.error('Not registering any preference, how did this happen?');
    }

  }

  private async registerDigitaalAdres(adres: string, type: 'telefoonnummer' | 'email' | 'overig', partijUuid: string) {
    return this.configuration.openKlantApi.addDigitaalAdres({
      adres: adres,
      omschrijving: type,
      soortDigitaalAdres: type,
      verstrektDoorBetrokkene: null,
      verstrektDoorPartij: {
        uuid: partijUuid,
      },
    });
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

  private async setVoorkeurDigitiaalAdres(partij: OpenKlantPartijWithUuid, voorkeursDigitaalAdresUuid: string) {
    const partijUpdate = await this.configuration.openKlantApi.updatePartij({
      uuid: partij.uuid,
      soortPartij: partij.soortPartij,
      voorkeursDigitaalAdres: {
        uuid: voorkeursDigitaalAdresUuid,
      },
    });
    return partijUpdate;
  }


}