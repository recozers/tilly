import { z } from 'zod';

/**
 * Event validation schemas
 */

export const createEventSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  start: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)),
  end: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  description: z.string().max(5000).optional(),
  location: z.string().max(500).optional(),
});

export const updateEventSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  start: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)).optional(),
  end: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  description: z.string().max(5000).optional(),
  location: z.string().max(500).optional(),
});

export const dateRangeSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
});

export const eventIdSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type DateRangeInput = z.infer<typeof dateRangeSchema>;
