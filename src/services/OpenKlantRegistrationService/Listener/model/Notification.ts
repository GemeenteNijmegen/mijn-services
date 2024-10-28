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
    'partial_update',
    'destroy',
  ]),
  aanmaakdatum: z.string(),
  kenmerken: z.object({}).nullish(), // any
});

export type Notification = z.infer<typeof NotificationSchema>;
