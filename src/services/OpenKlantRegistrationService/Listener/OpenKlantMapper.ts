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

  static partijFromRol(rol: Rol) : OpenKlantPartij {

    if (process.env.DEBUG === 'true') {
      console.debug('Mapping rol to partij', rol);
    }

    // Map correct name depending on information in rol.
    // TODO we need to verify and expend this logic later on.
    let name = undefined;
    if (rol?.contactpersoonRol?.naam) {
      name = rol.contactpersoonRol.naam;
    } else if (rol?.betrokkeneIdentificatie.geslachtsnaam) {
      console.warn('Using geslachtsnaam!'); // TODO figure out if we need to do something else here?
      name = rol?.betrokkeneIdentificatie.geslachtsnaam;
    }

    if (!name) {
      console.log('Returning 400 no name found');
      throw new ErrorResponse(400, 'Expected name to be set in rol.');
    }

    // Map to correct partijSoort
    let partijSoort : 'persoon'|'organisatie' = 'persoon';
    if (rol.betrokkeneType === 'niet_natuurlijk_persoon') {
      partijSoort = 'organisatie';
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
    if (partijSoort == 'organisatie') {
      partijIdentificatie = {
        naam: name,
      };
    }

    return {
      digitaleAdressen: [],
      indicatieActief: true,
      partijIdentificatie: partijIdentificatie,
      rekeningnummers: [],
      soortPartij: partijSoort,
      voorkeursDigitaalAdres: null,
      voorkeursRekeningnummer: null,
      voorkeurstaal: 'dut',
      indicatieGeheimhouding: false,
    };
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
      codeObjecttype: 'INGESCHREVEN NATUURLIJK PERSOON', // Type van het object, bijvoorbeeld: 'INGESCHREVEN NATUURLIJK PERSOON'.
      codeSoortObjectId: 'Burgerservicenummer', // Naam van de eigenschap die het object identificeert, bijvoorbeeld: 'Burgerservicenummer'.
      objectId: bsn, // Waarde van de eigenschap die het object identificeert, bijvoorbeeld: '123456788'.
      codeRegister: 'BRP', // Binnen het landschap van registers unieke omschrijving van het register waarin het object is geregistreerd, bijvoorbeeld: 'BRP'.
    };

    if (kvk) {
      partijIdentificator = {
        codeObjecttype: 'NIET NATUURLIJK PERSOON', // Type van het object, bijvoorbeeld: 'INGESCHREVEN NATUURLIJK PERSOON'.
        codeSoortObjectId: 'Kvknummer', // Naam van de eigenschap die het object identificeert, bijvoorbeeld: 'Burgerservicenummer'.
        objectId: kvk, // Waarde van de eigenschap die het object identificeert, bijvoorbeeld: '123456788'.
        codeRegister: 'KVK', // Binnen het landschap van registers unieke omschrijving van het register waarin het object is geregistreerd, bijvoorbeeld: 'BRP'.
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


}
