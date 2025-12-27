import { SupabaseClient } from '@supabase/supabase-js';
import type {
  MeetingRequest,
  MeetingRequestRow,
  MeetingRequestStatus,
  CreateMeetingRequestDto,
  ProposedTime,
} from '@tilly/shared';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('MeetingRepository');

/**
 * Meeting request repository
 */
export class MeetingRepository {
  constructor(private supabase: SupabaseClient) {}

  private mapToEntity(row: MeetingRequestRow): MeetingRequest {
    return {
      id: row.id,
      requesterId: row.requester_id,
      friendId: row.friend_id,
      title: row.title,
      message: row.message,
      durationMinutes: row.duration_minutes,
      proposedTimes: row.proposed_times,
      status: row.status,
      selectedTime: row.selected_time,
      createdAt: new Date(row.created_at),
      updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
    };
  }

  /**
   * Create a meeting request
   */
  async create(dto: CreateMeetingRequestDto, requesterId: string): Promise<MeetingRequest> {
    const { data, error } = await this.supabase
      .from('meeting_requests')
      .insert({
        requester_id: requesterId,
        friend_id: dto.friendId,
        title: dto.title,
        message: dto.message,
        duration_minutes: dto.durationMinutes || 30,
        proposed_times: dto.proposedTimes,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      logger.error({ error, requesterId }, 'Error creating meeting request');
      throw error;
    }

    logger.info({ meetingId: data.id, title: dto.title }, 'Meeting request created');
    return this.mapToEntity(data as MeetingRequestRow);
  }

  /**
   * Get meeting requests where user is the recipient
   */
  async getReceivedRequests(userId: string, status?: MeetingRequestStatus): Promise<MeetingRequest[]> {
    let query = this.supabase
      .from('meeting_requests')
      .select(`
        *,
        requester:user_profiles!requester_id(id, email, display_name)
      `)
      .eq('friend_id', userId);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      logger.error({ error, userId }, 'Error getting received meeting requests');
      throw error;
    }

    return (data || []).map(row => ({
      ...this.mapToEntity(row as MeetingRequestRow),
      requester: row.requester ? {
        id: row.requester.id,
        email: row.requester.email,
        displayName: row.requester.display_name,
      } : undefined,
    }));
  }

  /**
   * Get meeting requests where user is the requester
   */
  async getSentRequests(userId: string, status?: MeetingRequestStatus): Promise<MeetingRequest[]> {
    let query = this.supabase
      .from('meeting_requests')
      .select(`
        *,
        friend:user_profiles!friend_id(id, email, display_name)
      `)
      .eq('requester_id', userId);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      logger.error({ error, userId }, 'Error getting sent meeting requests');
      throw error;
    }

    return (data || []).map(row => ({
      ...this.mapToEntity(row as MeetingRequestRow),
      friend: row.friend ? {
        id: row.friend.id,
        email: row.friend.email,
        displayName: row.friend.display_name,
      } : undefined,
    }));
  }

  /**
   * Get a meeting request by ID
   */
  async getById(id: string, userId: string): Promise<MeetingRequest | null> {
    const { data, error } = await this.supabase
      .from('meeting_requests')
      .select('*')
      .eq('id', id)
      .or(`requester_id.eq.${userId},friend_id.eq.${userId}`)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      logger.error({ error, id, userId }, 'Error getting meeting request');
      throw error;
    }

    return this.mapToEntity(data as MeetingRequestRow);
  }

  /**
   * Respond to a meeting request (accept or decline)
   */
  async respond(
    id: string,
    userId: string,
    response: { status: 'accepted' | 'declined'; selectedTime?: ProposedTime }
  ): Promise<MeetingRequest> {
    const updateData: Record<string, unknown> = {
      status: response.status,
      updated_at: new Date().toISOString(),
    };

    if (response.selectedTime) {
      updateData.selected_time = response.selectedTime;
    }

    const { data, error } = await this.supabase
      .from('meeting_requests')
      .update(updateData)
      .eq('id', id)
      .eq('friend_id', userId)
      .eq('status', 'pending')
      .select()
      .single();

    if (error) {
      logger.error({ error, id, userId }, 'Error responding to meeting request');
      throw error;
    }

    logger.info({ meetingId: id, status: response.status }, 'Meeting request responded');
    return this.mapToEntity(data as MeetingRequestRow);
  }

  /**
   * Cancel a meeting request
   */
  async cancel(id: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('meeting_requests')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('requester_id', userId);

    if (error) {
      logger.error({ error, id, userId }, 'Error cancelling meeting request');
      throw error;
    }

    logger.info({ meetingId: id }, 'Meeting request cancelled');
  }

  /**
   * Get pending meeting requests for display in calendar
   */
  async getPendingForCalendar(userId: string): Promise<MeetingRequest[]> {
    const [received, sent] = await Promise.all([
      this.getReceivedRequests(userId, 'pending'),
      this.getSentRequests(userId, 'pending'),
    ]);

    return [...received, ...sent];
  }
}
