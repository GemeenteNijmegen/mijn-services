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
  zaaktypeIdentificatie: z.union([z.null(), z.string()]).optional(),
  catalogus: z.union([z.null(), z.string()]).optional(),
  beginGeldigheid: z.union([z.null(), z.string()]).optional(),
  eindeGeldigheid: z.union([z.null(), z.string()]).optional(),
  beginObject: z.union([z.null(), z.string()]).optional(),
  eindeObject: z.union([z.null(), z.string()]).optional(),
});

export const RolTypeWithUrlSchema = RolTypeSchema.extend({
  url: z.string(),
});

export type RolType = z.infer<typeof RolTypeSchema>;

export type RolTypeWithUrl = z.infer<typeof RolTypeWithUrlSchema>;
