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
  }),

}).optional();

export type Rol = z.infer<typeof RolSchema>;
