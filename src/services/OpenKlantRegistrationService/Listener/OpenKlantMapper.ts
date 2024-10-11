import { ErrorResponse } from './ErrorResponse';
import { OpenKlantDigitaalAdres, OpenKlantPartij, OpenKlantPartijIdentificiatie } from './model/Partij';
import { Rol } from './model/Rol';

/**
 * Mapping functinos to convert from zaken API to
 * OpenKlant objects.
 */
export class OpenKlantMapper {

  static readonly TELEFOONNUMMER = 'Telefoon'; // Expected by OMC
  static readonly EMAIL = 'Email'; // Expected by OMC


  static partijFromRol(rol: Rol, name?: string) : OpenKlantPartij {
    if (process.env.DEBUG === 'true') {
      console.debug('Mapping rol to partij', rol);
    }
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

  static contactpersoonFromRol(rol: Rol, organisatiePartijUrl: string, organisatiePartijUuid: string) : OpenKlantPartij {
    const name = rol.contactpersoonRol?.naam;
    const contactpersoon = this.partijFromRolWithName(rol, name, 'contactpersoon');
    contactpersoon.partijIdentificatie.werkteVoorPartij = {
      uuid: organisatiePartijUuid,
      url: organisatiePartijUrl,
    };
    return contactpersoon;
  }

  static digitaalAdressenFromRol(rol: Rol, partijUuid: string) : OpenKlantDigitaalAdres[] {

    if (process.env.DEBUG === 'true') {
      console.debug('Mapping rol to digitaal adres', rol);
    }

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

    return adressen;
  }

  /**
   *
   * TODO make this configurable so we can use this for organizations as well...
   * @param rol
   * @param partijUuid
   * @returns
   */
  static partijIdentificatieFromRol(rol: Rol, partijUuid: string) : OpenKlantPartijIdentificiatie {

    if (process.env.DEBUG === 'true') {
      console.debug('Mapping rol to partij identificaties', rol);
    }

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

    return {
      identificeerdePartij: {
        uuid: partijUuid,
      },
      partijIdentificator,
      // anderePartijIdentificator: 'string', // Vrij tekstveld om de verwijzing naar een niet-voorgedefinieerd objecttype, soort objectID of Register vast te leggen.
    };

  }

  private static partijFromRolWithName(rol: Rol, name: string | undefined | null, soortPartij: 'persoon' | 'organisatie' | 'contactpersoon') {
    if (process.env.DEBUG === 'true') {
      console.debug('Mapping rol to partij', rol);
    }

    if (!name) {
      console.log('Returning 400 no name found');
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

    return {
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
  }


}
