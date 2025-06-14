import { randomUUID } from 'crypto';
import { ErrorResponse } from '../../Shared/ErrorResponse';
import { logger } from '../../Shared/Logger';
import { Notification } from '../../Shared/model/Notification';
import { OpenKlantDigitaalAdresWithUuid, OpenKlantPartijWithUuid } from '../../Shared/model/Partij';
import { Rol } from '../../Shared/model/Rol';
import { OpenKlantMapper } from '../OpenKlantMapper';
import { OpenKlantRegistrationServiceProps } from '../OpenKlantRegistrationHandler';
import { IRegistrationStrategy } from './IRegistrationStrategy';

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
      logger.info('Notification ignored', { errors });
    }
    return errors.length == 0 ? undefined : errors;
  }


  async register(notification: Notification): Promise<void> {
    // Get the involved rol details and check if the role is the 'aanvrager'
    const rolUrl = notification.resourceUrl;
    let rol = undefined;
    try {
      rol = await this.configuration.zakenApi.getRol(rolUrl);
    } catch (error) {
      logger.info('Failed to get role, this is probably fine.');
      return;
    }

    const rolType = await this.configuration.catalogiApi.getRolType(rol.roltype);

    // Filter if role is from right catalogus
    if (this.configuration.catalogusUuids) {
      const inWhitelist = this.configuration.catalogusUuids.find(catalogusUuid => rolType.catalogus && rolType.catalogus.includes(catalogusUuid));
      if (!inWhitelist) {
        logger.info('Catalogus of roltype is not in the configured whitelist of catalogi, ignoring notification');
        return;
      }
    }

    // Annotate trace if we're tracing
    if (this.configuration.tracer) {
      this.configuration.tracer.getSegment()?.addAnnotation('BETROKKENE_ALREADY_SET', !!rol.betrokkene);
    }

    if (rol.betrokkene) {
      logger.info('Rol alreay had betrokkene url set. Skipping update...');
      return;
    }

    // Check if role is of the target role type, otherwise return 200 but do not handle the notification
    const isTargetRolType = this.configuration.roltypesToRegister.includes(rolType.omschrijvingGeneriek.toLocaleLowerCase());
    if (!isTargetRolType) {
      logger.info('Role is not of the type to forward to open klant. Ignoring this notification.');
      return;
    }
    logger.info('Found a rol of the target type to forward to open klant.');

    let partij: OpenKlantPartijWithUuid | undefined = undefined;
    if (rol.betrokkeneType == 'natuurlijk_persoon') {
      partij = await this.handleNatuurlijkPersoon(rol);
      logger.info('Registratie van partij als natuurlijk_persoon is afgerond.');
    }

    if (rol.betrokkeneType == 'niet_natuurlijk_persoon') {
      partij = await this.handleNietNatuurlijkPersoon(rol);
      logger.info('Registratie van partij als niet_natuurlijk_persoon is afgerond.');
    }

    if (!partij) {
      throw new ErrorResponse(500, 'No partij was found or created');
    }

    if (this.updateRolInZaakApi == true) {
      await this.updateRolWithParijUrl(partij.uuid, rol);
      logger.info('Update van de rol met partij url is uitgevoerd.');
    } else {
      logger.info('Skipping update of role in zaken api as updateRolInZaakApi is false');
    }

    return;
  }

  private async handleNatuurlijkPersoon(rol: Rol) {
    // Create the partij
    const partijInput = OpenKlantMapper.persoonPartijFromRol(rol);
    const persoon = await this.configuration.openKlantApi.registerPartij(partijInput);
    logger.debug('Persoon partij created', persoon);
    // Create the partij identificatie
    const identificatieInput = this.createTemporaryPartijIdentificatie(persoon.uuid);
    const identificatie = await this.configuration.openKlantApi.addPartijIdentificatie(identificatieInput);
    logger.debug('Persoon partij identificatie created', identificatie);
    // Add the digitale adressen (and select voorkeur)
    await this.setDigitaleAdressenForPartijFromRol(persoon, rol);
    logger.debug('Digitale addressen created');
    return persoon;
  }

  private async handleNietNatuurlijkPersoon(rol: Rol) {
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
    // Add the digitale adressen (and select voorkeur)
    await this.setDigitaleAdressenForPartijFromRol(persoon, localRol);
    logger.debug('Digitale addressen created (for kvk in partij per rol strategy)');
    return persoon;

  }

  private async updateRolWithParijUrl(partijUuid: string, rol: Rol) {
    const partijUrl = this.configuration.openKlantApi.getEndpoint() + `/partijen/${partijUuid}`;
    rol.betrokkene = partijUrl;
    const updatedRole = await this.configuration.zakenApi.updateRol(rol);
    logger.debug('Rol updated with betrokkene', { updatedRole });
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
