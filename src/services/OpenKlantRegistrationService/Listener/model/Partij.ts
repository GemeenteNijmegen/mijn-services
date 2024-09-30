import { z } from 'zod';
import { Rol } from './Rol';

const uuidSchema = z.object({ uuid: z.string() });

/**
 * Partij schema based on OpenKlant 2.0
 */
export const OpenKlantPartijSchema = z.object({
  digitaleAdressen: z.array(uuidSchema),
  voorkeursDigitaalAdres: z.union([z.null(), uuidSchema]),
  rekeningnummers: z.array(uuidSchema),
  voorkeursRekeningnummer: z.union([z.null(), uuidSchema]),
  soortPartij: z.enum([
    'persoon',
    'organisatie',
    'contactpersoon',
  ]),
  indicatieActief: z.boolean({
    description: 'Geeft aan of de contactgegevens van de partij nog gebruikt morgen worden om contact op te nemen. Gegevens van niet-actieve partijen mogen hiervoor niet worden gebruikt.',
  }),
  voorkeurstaal: z.string(),
  partijIdentificatie: z.object({ // Staat niet in de docs maar is wel nodig?
    // contactnaam: { // TODO figure out if we need this?
    //   voorletters: 'H',
    //   voornaam: 'Hans',
    //   voorvoegselAchternaam: 'de',
    //   achternaam: 'Jong',
    // },
    volledigeNaam: z.string(),
  }),
});

/**
 * A OpenKlant 2.0 Partij
 */
export type OpenKlantPartij = z.infer<typeof OpenKlantPartijSchema>;

/**
 * Digitaal adres schema based on OpenKlant 2.0
 */
export const OpenKlantDigitaalAdresSchema = z.object({
  verstrektDoorBetrokkene: z.union([z.null(), uuidSchema]),
  verstrektDoorPartij: z.union([z.null(), uuidSchema]),
  adres: z.string(),
  soortDigitaalAdres: z.string(),
  omschrijving: z.string(),
});

/**
 * A OpenKlant 2.0 digitaal adres
 */
export type OpenKlantDigitaalAdres = z.infer<typeof OpenKlantDigitaalAdresSchema>;

/**
 * Partij identificatie schema based on OpenKlant 2.0
 */
export const OpenKlantPartijIdentificiatieSchema = z.object({
  identificeerdePartij: z.union([z.null(), uuidSchema]),
  partijIdentificator: z.union([z.null(), z.object({
    codeObjecttype: z.string().optional(),
    codeSoortObjectId: z.string().optional(),
    objectId: z.string().optional(),
    codeRegister: z.string().optional(),
  })]),
  anderePartijIdentificator: z.string().optional(),
});

/**
 * A OpenKlant 2.0 partij identificatie
 */
export type OpenKlantPartijIdentificiatie = z.infer<typeof OpenKlantPartijIdentificiatieSchema>;


/**
 * Mapping functinos to convert from zaken API to
 * OpenKlant objects.
 */
export class OpenKlantMapper {

  static partijFromRol(rol: Rol) : OpenKlantPartij {

    if (process.env.DEBUG === 'true') {
      console.debug('Mapping rol to partij', rol);
    }

    if (!rol?.contactpersoonRol?.naam) {
      throw Error('Expected name to be set in rol');
    }

    return {
      digitaleAdressen: [],
      indicatieActief: true,
      partijIdentificatie: {
        volledigeNaam: rol?.contactpersoonRol?.naam,
      },
      rekeningnummers: [],
      soortPartij: 'persoon',
      voorkeursDigitaalAdres: null,
      voorkeursRekeningnummer: null,
      voorkeurstaal: 'dut',
    };
  }

  static digitaalAdressenFromRol(rol: Rol) : OpenKlantDigitaalAdres[] {

    if (process.env.DEBUG === 'true') {
      console.debug('Mapping rol to digitaal adres', rol);
    }

    if (!rol?.contactpersoonRol) {
      throw Error('No contactgegevens in rol');
    }

    const adressen: OpenKlantDigitaalAdres[] = [];

    if (rol.contactpersoonRol.emailadres) {
      adressen.push({
        adres: '',
        omschrijving: '',
        soortDigitaalAdres: '',
        verstrektDoorBetrokkene: {
          uuid: '',
        },
        verstrektDoorPartij: {
          uuid: '',
        },
      });
    }

    if (rol.contactpersoonRol.telefoonnummer) {
      adressen.push({
        adres: '',
        omschrijving: '',
        soortDigitaalAdres: '',
        verstrektDoorBetrokkene: {
          uuid: '',
        },
        verstrektDoorPartij: {
          uuid: '',
        },
      });
    }

    return adressen;
  }

  static partijIdentificatiesFromRol(rol: Rol) : OpenKlantPartijIdentificiatie {

    if (process.env.DEBUG === 'true') {
      console.debug('Mapping rol to partij identificaties', rol);
    }

    return {
      identificeerdePartij: null,
      partijIdentificator: {
        codeObjecttype: '',
        codeRegister: '',
        codeSoortObjectId: '',
        objectId: '',
      },
    };
  }

}


