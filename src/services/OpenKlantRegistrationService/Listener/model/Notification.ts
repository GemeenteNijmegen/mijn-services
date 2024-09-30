import { z } from 'zod';

/**
 * Schema based on the notification playload defined by the
 * notications API.
 */
export const NotificationSchema = z.object({
  kanaal: z.string(),
  hoofdObject: z.string(),
  resource: z.string(),
  resourceUrl: z.string(),
  actie: z.enum([
    'create',
    'update',
    'delete',
  ]),
  aanmaakdatum: z.string(),
  kenmerken: z.object({}).passthrough(), // any
});

export type Notification = z.infer<typeof NotificationSchema>;
