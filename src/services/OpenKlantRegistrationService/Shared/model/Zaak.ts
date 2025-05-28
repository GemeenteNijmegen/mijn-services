import { z } from 'zod';

export const ZaakSchema = z.object({
  url: z.string(),
  uuid: z.string(),
  zaaktype: z.string(),
  _expand: z.object({
    eigenschappen: z.array(
      z.object({
        url: z.string(),
        uuid: z.string(),
        eigenschap: z.string(),
        naam: z.string(),
        waarde: z.string(),
      }),
    ).optional().nullable(),
  }).optional().nullable(),

}).passthrough();

export type Zaak = z.infer<typeof ZaakSchema>;
