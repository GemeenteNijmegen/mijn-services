import { ErrorResponse } from './ErrorResponse';
import { logger } from './Logger';
import { OpenKlantDigitaalAdres, OpenKlantPartij, OpenKlantPartijIdentificiatie } from './model/Partij';
import { Rol } from './model/Rol';
import { StrategyStatics } from './strategies/StrategyStatics';

/**
 * Mapping functinos to convert from zaken API to
 * OpenKlant objects.
 */
export class OpenKlantMapper {

  static readonly TELEFOONNUMMER = 'Telefoon'; // Expected by OMC
  static readonly EMAIL = 'Email'; // Expected by OMC

  /**
   * Map a rol to a open-klant persoon (subtype of partij)
   * @param rol
   * @returns
   */
  static persoonPartijFromRol(rol: Rol): OpenKlantPartij {
    logger.debug('Mapping rol to persoon partij', rol);
    if (rol.betrokkeneType != 'natuurlijk_persoon') {
      throw Error('Can only map natuurlijk_persoon rollen to persoon partij');
    }
    const usedName = rol.contactpersoonRol?.naam ?? rol?.betrokkeneIdentificatie.geslachtsnaam;
    if (!usedName) {
      throw new ErrorResponse(400, 'No name found in rol');
    }

    // Map to correct partijIdentificatie
    // This field must be filled differently for organisatie or persoon...
    // See: https://github.com/maykinmedia/open-klant/issues/227
    const persoonPartij: OpenKlantPartij = {
      digitaleAdressen: [],
      indicatieActief: true,
      partijIdentificatie: {
        volledigeNaam: usedName,
        contactnaam: {
          voornaam: usedName,
          achternaam: '',
        },
      },
      rekeningnummers: [],
      soortPartij: 'persoon',
      voorkeursDigitaalAdres: null,
      voorkeursRekeningnummer: null,
      voorkeurstaal: 'dut',
      indicatieGeheimhouding: false,
    };
    logger.debug('Persoon partij', { data: persoonPartij });
    return persoonPartij;
  }

  /**
   * Map a rol to a open-klant organisatie (subtype of partij)
   * @param rol
   * @returns
   */
  static organisatiePartijFromRol(rol: Rol): OpenKlantPartij {
    logger.debug('Mapping rol to organisatie partij', rol);
    if (rol.betrokkeneType != 'niet_natuurlijk_persoon') {
      throw Error('Can only map niet_natuurlijk_persoon rollen to organisatie partij');
    }
    const usedName = rol.betrokkeneIdentificatie.statutaireNaam;
    if (!usedName) {
      throw new ErrorResponse(400, 'No orgnisatie name found in rol');
    }

    // Map to correct partijIdentificatie
    // This field must be filled differently for organisatie or persoon...
    // See: https://github.com/maykinmedia/open-klant/issues/227
    const organisatiePartij: OpenKlantPartij = {
      digitaleAdressen: [],
      indicatieActief: true,
      partijIdentificatie: {
        naam: usedName,
      },
      rekeningnummers: [],
      soortPartij: 'organisatie',
      voorkeursDigitaalAdres: null,
      voorkeursRekeningnummer: null,
      voorkeurstaal: 'dut',
      indicatieGeheimhouding: false,
    };
    logger.debug('Orgnisatie partij', { data: organisatiePartij });
    return organisatiePartij;

  }

  /**
   * Map a rol to a open-klant contactpersoon (subtype of partij)
   * Note: a contactpersoon is related to a organisatie.
   * @param rol
   * @param organisatieUrl
   * @param organisatieUuid
   * @returns
   */
  static contactpersoonPartijFromRol(rol: Rol, organisatieUrl: string, organisatieUuid: string): OpenKlantPartij {
    logger.debug('Mapping rol to contactpersoon partij', rol);

    if (rol.betrokkeneType != 'niet_natuurlijk_persoon') {
      throw Error('Can only map niet_natuurlijk_persoon rollen to contactpersoon partij');
    }
    const usedName = rol.contactpersoonRol?.naam ?? rol?.betrokkeneIdentificatie.geslachtsnaam;
    if (!usedName) {
      throw new ErrorResponse(400, 'No orgnisatie name found in rol');
    }

    // Map to correct partijIdentificatie
    // This field must be filled differently for organisatie or persoon...
    // See: https://github.com/maykinmedia/open-klant/issues/227
    const contactpersoon: OpenKlantPartij = {
      digitaleAdressen: [],
      indicatieActief: true,
      partijIdentificatie: {
        volledigeNaam: usedName,
        contactnaam: {
          voornaam: usedName,
          achternaam: '',
        },
        werkteVoorPartij: {
          uuid: organisatieUuid,
          url: organisatieUrl,
        },
      },
      rekeningnummers: [],
      soortPartij: 'contactpersoon',
      voorkeursDigitaalAdres: null,
      voorkeursRekeningnummer: null,
      voorkeurstaal: 'dut',
      indicatieGeheimhouding: false,
    };
    logger.debug('Contactpersoon partij', { data: contactpersoon });
    return contactpersoon;
  }

  /**
   * Map a rol to one or more open-klant digitaal adres objecten.
   * Two types are supported: email and telefoonummer.
   * Note: a digitaal adres is related to a partij (persoon, organisatie or contactpersoon).
   * @param rol
   * @param partijUuid
   * @returns
   */
  static digitaalAdressenFromRol(rol: Rol, partijUuid: string): OpenKlantDigitaalAdres[] {
    logger.debug('Mapping rol to digitaal adres', rol);

    if (!rol?.contactpersoonRol) {
      throw new ErrorResponse(400, 'No contactgegevens in rol');
    }

    if (!rol.contactpersoonRol.emailadres && !rol.contactpersoonRol.telefoonnummer) {
      throw new ErrorResponse(400, 'No email or telephonenumber in rol at least one is required');
    }

    const adressen: OpenKlantDigitaalAdres[] = [];

    if (rol.contactpersoonRol.emailadres) {
      adressen.push({
        adres: rol.contactpersoonRol.emailadres,
        omschrijving: 'Email adres',
        soortDigitaalAdres: OpenKlantMapper.EMAIL,
        verstrektDoorBetrokkene: null, // I think this someone else but not the indiener
        verstrektDoorPartij: { uuid: partijUuid },
      });
    }

    if (rol.contactpersoonRol.telefoonnummer) {
      adressen.push({
        adres: rol.contactpersoonRol.telefoonnummer,
        omschrijving: 'Telefoonnummer',
        soortDigitaalAdres: OpenKlantMapper.TELEFOONNUMMER,
        verstrektDoorBetrokkene: null, // I think this someone else but not the indiener
        verstrektDoorPartij: { uuid: partijUuid },
      });
    }

    logger.debug('Adressen', { data: adressen });
    return adressen;
  }

  /**
   * Map a rol a open-klant persoon identificatie (identifies a persoon partij).
   * I.e. store the BSN to identify a persoon.
   * @param rol
   * @param partijUuid
   * @returns
   */
  static persoonIdentificatieFromRol(rol: Rol, partijUuid: string): OpenKlantPartijIdentificiatie {
    logger.debug('Mapping rol to persoon partij identificatie', rol);
    const bsn = rol.betrokkeneIdentificatie.inpBsn;
    if (!bsn) {
      throw new ErrorResponse(400, 'Could not map rol to partijIdentificatie: no identification information found in rol');
    }
    const persoonIdentificatie = {
      identificeerdePartij: {
        uuid: partijUuid,
      },
      partijIdentificator: {
        codeObjecttype: 'INGESCHREVEN NATUURLIJK PERSOON',
        codeSoortObjectId: 'Burgerservicenummer',
        objectId: bsn ?? undefined, // Maps null | undefined to undefined...
        codeRegister: 'BRP',
      },
    };
    logger.debug('Persoon identificatie', { data: persoonIdentificatie });
    return persoonIdentificatie;
  }

  /**
   * Map a rol a open-klant organisatie identificatie (identifies a organisatie partij).
   * I.e. store the kvk to identify a organisatie.
   * @param rol
   * @param partijUuid
   * @returns
   */
  static organisatieIdentificatieFromRol(rol: Rol, partijUuid: string): OpenKlantPartijIdentificiatie {
    logger.debug('Mapping rol to persoon partij identificatie', rol);
    const kvk = rol.betrokkeneIdentificatie.annIdentificatie;
    if (!kvk) {
      throw new ErrorResponse(400, 'Could not map rol to organisatie partijIdentificatie: no annIdentificatie field found in rol');
    }
    const organisatieIdentificatie = {
      identificeerdePartij: {
        uuid: partijUuid,
      },
      partijIdentificator: {
        codeObjecttype: 'NIET NATUURLIJK PERSOON',
        codeSoortObjectId: 'Kvknummer',
        objectId: kvk,
        codeRegister: 'KVK',
      },
    };
    logger.debug('organisatie identificatie', { dat: organisatieIdentificatie });
    return organisatieIdentificatie;
  }

  /**
   * Create a contacptersoon identificatie based on a Pseudo ID. The Pseudo ID
   * can be used by the registration service to do first order retreival of
   * a contactpersoon.
   * @param rol
   * @param partijUuid
   * @param pseudoId
   * @returns
   */
  static contactpersoonIdentificatieFromPseudoId(rol: Rol, partijUuid: string, pseudoId: string): OpenKlantPartijIdentificiatie {
    logger.debug('Mapping rol to contactpersoon partij identificatie', rol);
    const contactpersoonIdentificatie = {
      identificeerdePartij: {
        uuid: partijUuid,
      },
      partijIdentificator: {
        codeObjecttype: 'REGISTRATION SERVICE PSUEOID REGISTER',
        codeSoortObjectId: 'pseudoid',
        objectId: pseudoId, // Maps null | undefined to undefined...
        codeRegister: StrategyStatics.PSUEDOID_REGISTER,
      },
    };
    logger.debug('contactpersoon partij identificatie', { data: contactpersoonIdentificatie });
    return contactpersoonIdentificatie;
  }

  /**
   * @deprecated Use specific functions instead e.g. persoonIdentificatieFromRol
   * This used a more generic approch, however this approach is abondoned as it let to complex code
   */
  static partijIdentificatieFromRol(rol: Rol, partijUuid: string): OpenKlantPartijIdentificiatie {
    logger.debug('Mapping rol to partij identificaties', rol);
    const bsn = rol.betrokkeneIdentificatie.inpBsn;
    const kvk = rol.betrokkeneIdentificatie.annIdentificatie;
    if (!bsn && !kvk) {
      throw new ErrorResponse(400, 'Could not map rol to partijIdentificatie: no identification information found in rol');
    }
    let partijIdentificator = {
      codeObjecttype: 'INGESCHREVEN NATUURLIJK PERSOON',
      codeSoortObjectId: 'Burgerservicenummer',
      objectId: bsn ?? undefined, // Maps null | undefined to undefined...
      codeRegister: 'BRP',
    };

    if (kvk) {
      partijIdentificator = {
        codeObjecttype: 'NIET NATUURLIJK PERSOON',
        codeSoortObjectId: 'Kvknummer',
        objectId: kvk ?? undefined, // Maps null | undefined to undefined...
        codeRegister: 'KVK',
      };
    }

    const identificatie = {
      identificeerdePartij: {
        uuid: partijUuid,
      },
      partijIdentificator,
      // anderePartijIdentificator: 'string', // Vrij tekstveld om de verwijzing naar een niet-voorgedefinieerd objecttype, soort objectID of Register vast te leggen.
    };
    logger.debug('Partijidentificaties', { data: identificatie });
    return identificatie;
  }

  /**
   * @deprecated Use individual mapping fuctions instead persoonPartijFromRol contactpersoonPartijFromRol or organisatiePartijFromRol
   * This used a more generic approch, however this approach is abondoned as it let to complex code
   */
  static partijFromRol(rol: Rol, name?: string): OpenKlantPartij {
    const isOrganization = rol.betrokkeneIdentificatie.annIdentificatie != undefined;
    const isPersoon = rol.betrokkeneType == 'natuurlijk_persoon';

    // Map correct name depending on information in rol.
    // TODO we need to verify and expend this logic later on.
    if (isOrganization) {
      const usedName = name ?? rol.betrokkeneIdentificatie.statutaireNaam;
      return this.partijFromRolWithName(rol, usedName, 'organisatie');
    } else if (isPersoon) {
      const usedName = name ?? rol.contactpersoonRol?.naam ?? rol?.betrokkeneIdentificatie.geslachtsnaam;
      return this.partijFromRolWithName(rol, usedName, 'persoon');
    }

    throw Error('Rol is not a organisation or a person.');
  }

  /**
   * @deprecated Use contactPersoonPartijFromRol instead
   * This used a more generic approch, however this approach is abondoned as it let to complex code
   */
  static contactpersoonFromRol(rol: Rol, organisatiePartijUrl: string, organisatiePartijUuid: string): OpenKlantPartij {
    const name = rol.contactpersoonRol?.naam;
    const contactpersoon = this.partijFromRolWithName(rol, name, 'contactpersoon');
    contactpersoon.partijIdentificatie.werkteVoorPartij = {
      uuid: organisatiePartijUuid,
      url: organisatiePartijUrl,
    };
    logger.debug('Contactpersoon', { data: contactpersoon });
    return contactpersoon;
  }

  /**
   * @deprecated Used by other deprecated functions only
   * This used a more generic approch, however this approach is abondoned as it let to complex code
   */
  private static partijFromRolWithName(rol: Rol, name: string | undefined | null, soortPartij: 'persoon' | 'organisatie' | 'contactpersoon') {
    logger.debug('Mapping rol to partij', rol);
    if (!name) {
      logger.info('Returning 400 no name found');
      throw new ErrorResponse(400, 'Expected name to be set in rol.');
    }

    // Map to correct partijIdentificatie
    // This field must be filled differently for organisatie or persoon...
    // See: https://github.com/maykinmedia/open-klant/issues/227
    let partijIdentificatie: any = {
      volledigeNaam: name,
      contactnaam: {
        voornaam: name,
        achternaam: '',
      },
    };
    if (soortPartij == 'organisatie') {
      partijIdentificatie = { // Only organisations are different
        naam: name,
      };
    }

    const partij = {
      digitaleAdressen: [],
      indicatieActief: true,
      partijIdentificatie: partijIdentificatie,
      rekeningnummers: [],
      soortPartij: soortPartij,
      voorkeursDigitaalAdres: null,
      voorkeursRekeningnummer: null,
      voorkeurstaal: 'dut',
      indicatieGeheimhouding: false,
    };
    logger.debug('Partij', { data: partij });
    return partij;
  }


}
