import { z } from 'zod';

export const RolTypeSchema = z.object({
  url: z.string().optional(),
  zaaktype: z.string(),
  omschrijving: z.string(),
  omschrijvingGeneriek: z.string(),
  zaaktypeIdentificatie: z.string().optional(),
  catalogus: z.string().optional(),
  beginGeldigheid: z.string().optional(),
  eindeGeldigheid: z.string().optional(),
  beginObject: z.string().optional(),
  eindeObject: z.string().optional(),
});

export type RolType = z.infer<typeof RolTypeSchema>;
