import * as z from 'zod';

export const SubmissionSchema = z.object({
  userId: z.string(),
  userType: z.enum([
    'person', 'organization',
  ]),
  key: z.string(),
  formName: z.string(),
  formTitle: z.string(),
  submission: z.any(),
});

export type Submission = z.infer<typeof SubmissionSchema>;