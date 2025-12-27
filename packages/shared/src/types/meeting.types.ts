import type { UserProfile } from './user.types.js';

/**
 * Meeting request status
 */
export type MeetingRequestStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

/**
 * Proposed time slot for a meeting
 */
export interface ProposedTime {
  start: string | Date;
  end?: string | Date;
}

/**
 * Meeting request between users
 */
export interface MeetingRequest {
  id: string;
  requesterId: string;
  friendId: string;
  title: string;
  message?: string;
  durationMinutes: number;
  proposedTimes: ProposedTime[];
  status: MeetingRequestStatus;
  selectedTime?: ProposedTime;
  createdAt: Date;
  updatedAt?: Date;
  requester?: UserProfile;
  friend?: UserProfile;
}

/**
 * Database row representation of a meeting request
 */
export interface MeetingRequestRow {
  id: string;
  requester_id: string;
  friend_id: string;
  title: string;
  message?: string;
  duration_minutes: number;
  proposed_times: ProposedTime[];
  status: MeetingRequestStatus;
  selected_time?: ProposedTime;
  created_at: string;
  updated_at?: string;
}

/**
 * DTO for creating a meeting request
 */
export interface CreateMeetingRequestDto {
  friendId: string;
  title: string;
  message?: string;
  durationMinutes?: number;
  proposedTimes: ProposedTime[];
}

/**
 * DTO for responding to a meeting request
 */
export interface RespondMeetingRequestDto {
  status: 'accepted' | 'declined';
  selectedTime?: ProposedTime;
}
