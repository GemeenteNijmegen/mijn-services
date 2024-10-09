import { z } from 'zod';

export const RolTypeSchema = z.object({
  zaaktype: z.string(),
  omschrijving: z.string(),
  omschrijvingGeneriek: z.enum([
    'adviseur',
    'behandelaar',
    'belanghebbende',
    'beslisser',
    'initiator',
    'klantcontacter',
    'zaakcoordinator',
    'mede_initiator',
  ]),
  zaaktypeIdentificatie: z.string().nullish(),
  catalogus: z.string().nullish(),
  beginGeldigheid: z.string().nullish(),
  eindeGeldigheid: z.string().nullish(),
  beginObject: z.string().nullish(),
  eindeObject: z.string().nullish(),
});

export const RolTypeWithUrlSchema = RolTypeSchema.extend({
  url: z.string(),
});

export type RolType = z.infer<typeof RolTypeSchema>;

export type RolTypeWithUrl = z.infer<typeof RolTypeWithUrlSchema>;
