import { ErrorResponse } from './ErrorResponse';
import { OpenKlantDigitaalAdres, OpenKlantPartij, OpenKlantPartijIdentificiatie } from './model/Partij';
import { Rol } from './model/Rol';

/**
 * Mapping functinos to convert from zaken API to
 * OpenKlant objects.
 */
export class OpenKlantMapper {

  static readonly TELEFOONNUMMER = 'Telefoon';
  static readonly EMAIL = 'Email';

  static partijFromRol(rol: Rol) : OpenKlantPartij {

    if (process.env.DEBUG === 'true') {
      console.debug('Mapping rol to partij', rol);
    }

    let name = undefined;

    if (rol?.contactpersoonRol?.naam) {
      name = rol.contactpersoonRol.naam;
    } else if (rol?.betrokkeneIdentificatie.geslachtsnaam) {
      console.warn('Using geslachtsnaam!'); // TODO figure out if we need to do something else here?
      name = rol?.betrokkeneIdentificatie.geslachtsnaam;
    }

    if (!name) {
      throw new ErrorResponse(400, 'Expected name to be set in rol.');
    }

    return {
      digitaleAdressen: [],
      indicatieActief: true,
      partijIdentificatie: {
        volledigeNaam: name,
        contactnaam: {
          voornaam: name,
          achternaam: 'Leeg',
        },
      },
      rekeningnummers: [],
      soortPartij: 'persoon',
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
    if (!bsn) {
      throw new ErrorResponse(400, 'Could not map rol to partijIdentificatie: no BSN found in rol');
    }

    return {
      identificeerdePartij: {
        uuid: partijUuid,
      },
      partijIdentificator: {
        codeObjecttype: 'INGESCHREVEN NATUURLIJK PERSOON', // Type van het object, bijvoorbeeld: 'INGESCHREVEN NATUURLIJK PERSOON'.
        codeSoortObjectId: 'Burgerservicenummer', // Naam van de eigenschap die het object identificeert, bijvoorbeeld: 'Burgerservicenummer'.
        objectId: bsn, // Waarde van de eigenschap die het object identificeert, bijvoorbeeld: '123456788'.
        codeRegister: 'BRP', // Binnen het landschap van registers unieke omschrijving van het register waarin het object is geregistreerd, bijvoorbeeld: 'BRP'.
      },
      // anderePartijIdentificator: 'string', // Vrij tekstveld om de verwijzing naar een niet-voorgedefinieerd objecttype, soort objectID of Register vast te leggen.
    };
  }


}
