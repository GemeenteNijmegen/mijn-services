import { Response } from '@gemeentenijmegen/apigateway-http';
import { randomUUID } from 'crypto';
import { logger } from '../../Shared/Logger';
import { Notification } from '../../Shared/model/Notification';
import { OpenKlantPartijWithUuid } from '../../Shared/model/Partij';
import { Rol } from '../../Shared/model/Rol';
import { RolType } from '../../Shared/model/RolType';
import { OpenKlantMapper } from '../OpenKlantMapper';
import { OpenKlantRegistrationServiceProps } from '../OpenKlantRegistrationHandler';
import { SubmissionStorage } from '../SubmissionStorage';
import { SubmissionUtils } from '../SubmissionUtils';
import { NotFoundError } from '../ZgwApi';
import { IRegistrationStrategy } from './IRegistrationStrategy';

export class PartijPerRolStrategyWithForm implements IRegistrationStrategy {

  private readonly configuration: OpenKlantRegistrationServiceProps;
  private readonly updateRolInZaakApi: boolean;
  private readonly submissisonStorage: SubmissionStorage;
  constructor(configuration: OpenKlantRegistrationServiceProps, updateRolInZaakApi?: boolean) {
    this.configuration = configuration;
    this.updateRolInZaakApi = updateRolInZaakApi ?? true;
    this.submissisonStorage = new SubmissionStorage();
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

  async register(notification: Notification): Promise<Response> {

    try {

      // Get the rol and roltype
      const rol = await this.configuration.zakenApi.getRol(notification.resourceUrl);
      const rolType = await this.configuration.catalogiApi.getRolType(rol.roltype);

      // Is the rol of the correct type and catalog?
      if (!this.shouldHandleRolOfThisType(rolType)) {
        return Response.ok();
      }
      logger.info('Received a role to forward to open-klant.');


      let partij: OpenKlantPartijWithUuid | undefined = undefined;

      if (!rol.betrokkene) {

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

        // TODO when this fails also remove the partij
        if (this.updateRolInZaakApi == true) {
          // Note this should happen only once as when we already have a partij, we do not delete and recreate a rol.
          await this.updateRolWithParijUrl(partij.uuid, rol);
          logger.info('Update van de rol met partij url is uitgevoerd.');
        } else {
          logger.info('Skipping update of role in zaken api as updateRolInZaakApi is false');
        }

      } else {
        // Get the existing coupled partij
        partij = await this.configuration.openKlantApi.getPartij(rol.betrokkene);
      }

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
      await this.setDigitaleAdressenForPartijFromRol(partij, form.submission);

    } catch (error) {

      // If did not find rol
      if (error instanceof NotFoundError && error.message.includes('rol')) {
        logger.info('Did not find role, this is probably fine.');
        return Response.ok();
      }

      // Log and rethrow
      logger.error('Failed to handle notification', { error });
      throw error;
    }

    return Response.ok();
  }


  private shouldHandleRolOfThisType(roltype: RolType) {

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

  private async handleNatuurlijkPersoonNew(rol: Rol) {
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

  private async handleNietNatuurlijkPersoonNew(rol: Rol) {
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

  private async updateRolWithParijUrl(partijUuid: string, rol: Rol) {
    const partijUrl = this.configuration.openKlantApi.getEndpoint() + `/partijen/${partijUuid}`;
    rol.betrokkene = partijUrl;
    const updatedRole = await this.configuration.zakenApi.updateRol(rol);
    logger.debug('Rol updated with betrokkene', { updatedRole });
  }

  private async setDigitaleAdressenForPartijFromRol(partij: OpenKlantPartijWithUuid, form: any) {

    // Check if a phone number is valid using the following expression (used in open-klant)
    const phonenumberRegex = /^(0[8-9]00[0-9]{4,7})|(0[1-9][0-9]{8})|(\+[0-9]{9,20}|1400|140[0-9]{2,3})$/;

    const phone = SubmissionUtils.findTelefoon(form);
    const email = SubmissionUtils.findEmail(form);
    const preference = SubmissionUtils.findKanaalvoorkeur(form);

    // Register phone number if provied and correct format
    let registeredPhone = undefined;
    const isValidPhone = phonenumberRegex.test(phone);
    if (phone && isValidPhone) {
      registeredPhone = await this.configuration.openKlantApi.addDigitaalAdres({
        adres: phone,
        omschrijving: 'Telefoon',
        soortDigitaalAdres: OpenKlantMapper.TELEFOONNUMMER,
        verstrektDoorBetrokkene: null,
        verstrektDoorPartij: {
          uuid: partij.uuid,
        },
      });
    }

    if (!isValidPhone) {
      logger.info('Invalid phonenumber, not registering in open-klant');
    }

    // Register email if prived and correct format
    let registeredEmail = undefined;
    if (email) {
      registeredEmail = await this.configuration.openKlantApi.addDigitaalAdres({
        adres: email,
        omschrijving: 'Email',
        soortDigitaalAdres: OpenKlantMapper.EMAIL,
        verstrektDoorBetrokkene: null,
        verstrektDoorPartij: {
          uuid: partij.uuid,
        },
      });
    }

    // Logic reasoning
    // 1. Has only email -> Use that (disregard preference)
    // 2. Has only phone -> Use that (disregard preference)
    // 3. Has email & phone -> Find preference in form
    // 4. Has email & phone & no preference -> phone
    // 5. No email & phone -> Throw error

    if (registeredEmail && !registeredPhone) {
      // (1) Register email as preference
      await this.setVoorkeurDigitiaalAdres(partij, registeredEmail.uuid);
    } else if (registeredPhone && !registeredEmail) {
      // (2) Register phone as preference
      await this.setVoorkeurDigitiaalAdres(partij, registeredPhone.uuid);
    } else if (registeredEmail && registeredPhone && preference == 'email') {
      // (3) Register email as preference
      await this.setVoorkeurDigitiaalAdres(partij, registeredEmail.uuid);
    } else if (registeredEmail && registeredPhone && preference == 'sms') {
      // (3) Register phone as preference
      await this.setVoorkeurDigitiaalAdres(partij, registeredPhone.uuid);
    } else if (registeredEmail && registeredPhone && !preference) {
      // (4) Register phone as preference
      await this.setVoorkeurDigitiaalAdres(partij, registeredPhone.uuid);
    } else if (!registeredEmail && !registeredPhone) {
      // (5) Well now we only can throw an error
      throw new Error('Failed to set a preference as we do not have any registered digitaal adres');
    } else {
      logger.error('Not registering any preference, how did this happen?');
    }

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
