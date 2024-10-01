import { z } from 'zod';

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
 * Partij schema based on OpenKlant 2.0 (API response includes uuid)
 */
export const OpenKlantPartijSchemaWithUuid = OpenKlantPartijSchema.extend({
  uuid: z.string(),
});

/**
 * A OpenKlant 2.0 Partij
 */
export type OpenKlantPartij = z.infer<typeof OpenKlantPartijSchema>;

/**
 * A OpenKlant 2.0 Partij (API response includes uuid)
 */
export type OpenKlantPartijWithUuid = z.infer<typeof OpenKlantPartijSchemaWithUuid>;


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
 * Digitaal adres schema based on OpenKlant 2.0 (API returns a uuid)
 */
export const OpenKlantDigitaalAdresSchemaWithUuid = OpenKlantDigitaalAdresSchema.extend({
  uuid: z.string(),
});

/**
 * A OpenKlant 2.0 digitaal adres
 */
export type OpenKlantDigitaalAdres = z.infer<typeof OpenKlantDigitaalAdresSchema>;

/**
 * A OpenKlant 2.0 digitaal adres (API returns a uuid)
 */
export type OpenKlantDigitaalAdresWithUuid = z.infer<typeof OpenKlantDigitaalAdresSchemaWithUuid>;


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
 * Partij identificatie schema based on OpenKlant 2.0 (API response includes uuid)
 */
export const OpenKlantPartijIdentificiatieSchemaWithUuid = OpenKlantPartijIdentificiatieSchema.extend({
  uuid: z.string(),
});


/**
 * A OpenKlant 2.0 partij identificatie
 */
export type OpenKlantPartijIdentificiatie = z.infer<typeof OpenKlantPartijIdentificiatieSchema>;

/**
 * A OpenKlant 2.0 partij identificatie (API response includes uuid)
 */
export type OpenKlantPartijIdentificiatieWithUuid = z.infer<typeof OpenKlantPartijIdentificiatieSchemaWithUuid>;


