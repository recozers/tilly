import { z } from 'zod';

/**
 * Calendar subscription validation schemas
 */

export const createSubscriptionSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  autoSync: z.boolean().optional().default(true),
  syncIntervalMinutes: z.number().int().min(5).max(1440).optional().default(60),
});

export const updateSubscriptionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  autoSync: z.boolean().optional(),
  syncIntervalMinutes: z.number().int().min(5).max(1440).optional(),
});

export const subscriptionIdSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;
