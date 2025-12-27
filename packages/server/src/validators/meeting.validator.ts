import { z } from 'zod';

/**
 * Meeting request validation schemas
 */

const proposedTimeSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime().optional(),
});

export const createMeetingRequestSchema = z.object({
  friendId: z.string().uuid(),
  title: z.string().min(1).max(200),
  message: z.string().max(1000).optional(),
  durationMinutes: z.number().int().min(5).max(480).default(30),
  proposedTimes: z.array(proposedTimeSchema).min(1).max(10),
});

export const respondMeetingRequestSchema = z.object({
  status: z.enum(['accepted', 'declined']),
  selectedTime: proposedTimeSchema.optional(),
});

export const meetingRequestIdSchema = z.object({
  id: z.string().uuid(),
});

// AI tool schemas
export const requestMeetingWithFriendSchema = z.object({
  friend_name: z.string().min(1),
  meeting_title: z.string().min(1).max(200),
  message: z.string().max(1000).optional().default(''),
  duration_minutes: z.number().int().min(5).max(480).optional().default(30),
  proposed_times: z.array(z.object({
    start: z.string(),
    end: z.string().optional(),
  })).min(1),
});

export type CreateMeetingRequestInput = z.infer<typeof createMeetingRequestSchema>;
export type RespondMeetingRequestInput = z.infer<typeof respondMeetingRequestSchema>;
export type RequestMeetingWithFriendInput = z.infer<typeof requestMeetingWithFriendSchema>;
