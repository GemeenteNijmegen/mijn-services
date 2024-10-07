import { z } from 'zod';

export const RolSchema = z.object({

  url: z.string(),
  uuid: z.string(),
  zaak: z.string(),
  betrokkeneType: z.enum([
    'natuurlijk_persoon',
    'niet_natuurlijk_persoon',
    'vestiging',
    'organisatorische_eenheid',
    'medewerker',
  ]),
  roltype: z.string(),
  contactpersoonRol: z.object({
    naam: z.string(),
    emailadres: z.string().optional(),
    functie: z.string().optional(),
    telefoonnummer: z.string().optional(),
  }).optional(),
  betrokkeneIdentificatie: z.object({
    inpBsn: z.string().optional(),
    inpA_nummer: z.string().optional(),
    anpIdentificatie: z.string().optional(),
    geslachtsnaam: z.string().optional(),
    voorvoegselGeslachtsnaam: z.string().optional(),
    voorletters: z.string().optional(),
    voornamen: z.string().optional(),
    // geslachtsaanduiding: z.enum(['m', 'v', 'o']).optional(), // TODO check if we can add this back in later
    geboortedatum: z.string().optional(),
    // "verblijfsadres": {},
    // "subVerblijfBuitenland": {}
  }),

});

export type Rol = z.infer<typeof RolSchema>;
