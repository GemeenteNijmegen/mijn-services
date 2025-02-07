import { z } from 'zod';

export const RolSchema = z.object({

  url: z.string(),
  uuid: z.string(),
  zaak: z.string(),
  betrokkene: z.string().nullish(), // TODO we will be using this to store the reference to open klant
  betrokkeneType: z.enum([
    'natuurlijk_persoon',
    'niet_natuurlijk_persoon',
    'vestiging',
    'organisatorische_eenheid',
    'medewerker',
  ]),
  roltype: z.string(),
  contactpersoonRol: z.object({
    naam: z.string().nullish(),
    emailadres: z.string().nullish(),
    functie: z.string().nullish(),
    telefoonnummer: z.string().nullish(),
  }).optional(),
  betrokkeneIdentificatie: z.object({
    inpBsn: z.string().nullish(),
    annIdentificatie: z.string().nullish(), // TODO this depends on betrokkeneType. For now combine all fields in the object as optional. Fix later.
    geslachtsnaam: z.string().nullish(), // TODO used by Woweb
    statutaireNaam: z.string().nullish(),
    // Unsued fields by this service
    // inpA_nummer: vrijbrpStringOptional,
    // anpIdentificatie: vrijbrpStringOptional,
    // voorvoegselGeslachtsnaam: vrijbrpStringOptional,
    // voorletters: vrijbrpStringOptional,
    // voornamen: vrijbrpStringOptional,
    // geslachtsaanduiding: z.enum(['m', 'v', 'o']).optional(),
    // geboortedatum: vrijbrpStringOptional,
    // "verblijfsadres": {},
    // "subVerblijfBuitenland": {}
  }),

}).passthrough();

export type Rol = z.infer<typeof RolSchema>;
