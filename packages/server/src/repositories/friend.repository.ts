import { SupabaseClient } from '@supabase/supabase-js';
import type { FriendWithProfile, FriendRequest, FriendStatus, UserProfile } from '@tilly/shared';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('FriendRepository');

interface FriendshipRow {
  id: string;
  user_id: string;
  friend_id: string;
  status: FriendStatus;
  created_at: string;
}

interface FriendRequestRow {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: FriendStatus;
  created_at: string;
}

/**
 * Friend repository for friend relationships
 */
export class FriendRepository {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Get all friends for a user
   */
  async getFriends(userId: string): Promise<FriendWithProfile[]> {
    const { data, error } = await this.supabase
      .from('friendships')
      .select(`
        id,
        user_id,
        friend_id,
        status,
        created_at,
        friend:user_profiles!friend_id(id, email, display_name, avatar_url)
      `)
      .eq('user_id', userId)
      .eq('status', 'accepted');

    if (error) {
      logger.error({ error, userId }, 'Error getting friends');
      throw error;
    }

    return (data || []).map(row => ({
      id: row.id,
      userId: row.user_id,
      friendId: row.friend_id,
      status: row.status as FriendStatus,
      createdAt: new Date(row.created_at),
      friend: row.friend ? {
        id: (row.friend as unknown as { id: string }).id,
        email: (row.friend as unknown as { email: string }).email,
        displayName: (row.friend as unknown as { display_name: string }).display_name,
        avatarUrl: (row.friend as unknown as { avatar_url?: string }).avatar_url,
      } : undefined,
    })) as FriendWithProfile[];
  }

  /**
   * Send a friend request
   */
  async sendRequest(senderId: string, receiverId: string): Promise<FriendRequest> {
    // Check if request already exists
    const { data: existing } = await this.supabase
      .from('friend_requests')
      .select('*')
      .eq('sender_id', senderId)
      .eq('receiver_id', receiverId)
      .single();

    if (existing) {
      throw new Error('Friend request already exists');
    }

    // Check if already friends
    const { data: friendship } = await this.supabase
      .from('friendships')
      .select('*')
      .eq('user_id', senderId)
      .eq('friend_id', receiverId)
      .single();

    if (friendship) {
      throw new Error('Already friends');
    }

    const { data, error } = await this.supabase
      .from('friend_requests')
      .insert({
        sender_id: senderId,
        receiver_id: receiverId,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      logger.error({ error, senderId, receiverId }, 'Error sending friend request');
      throw error;
    }

    logger.info({ senderId, receiverId }, 'Friend request sent');
    return {
      id: data.id,
      senderId: data.sender_id,
      receiverId: data.receiver_id,
      status: data.status,
      createdAt: new Date(data.created_at),
    };
  }

  /**
   * Get pending friend requests for a user
   */
  async getPendingRequests(userId: string): Promise<FriendRequest[]> {
    const { data, error } = await this.supabase
      .from('friend_requests')
      .select(`
        id,
        sender_id,
        receiver_id,
        status,
        created_at,
        sender:user_profiles!sender_id(id, email, display_name, avatar_url)
      `)
      .eq('receiver_id', userId)
      .eq('status', 'pending');

    if (error) {
      logger.error({ error, userId }, 'Error getting friend requests');
      throw error;
    }

    return (data || []).map(row => ({
      id: row.id,
      senderId: row.sender_id,
      receiverId: row.receiver_id,
      status: row.status as FriendStatus,
      createdAt: new Date(row.created_at),
      sender: row.sender ? {
        id: (row.sender as unknown as { id: string }).id,
        email: (row.sender as unknown as { email: string }).email,
        displayName: (row.sender as unknown as { display_name: string }).display_name,
        avatarUrl: (row.sender as unknown as { avatar_url?: string }).avatar_url,
      } : undefined,
    }));
  }

  /**
   * Accept a friend request
   */
  async acceptRequest(requestId: string, userId: string): Promise<void> {
    // Get the request
    const { data: request, error: fetchError } = await this.supabase
      .from('friend_requests')
      .select('*')
      .eq('id', requestId)
      .eq('receiver_id', userId)
      .single();

    if (fetchError || !request) {
      throw new Error('Friend request not found');
    }

    // Update request status
    const { error: updateError } = await this.supabase
      .from('friend_requests')
      .update({ status: 'accepted' })
      .eq('id', requestId);

    if (updateError) {
      logger.error({ error: updateError, requestId }, 'Error updating friend request');
      throw updateError;
    }

    // Create bidirectional friendship
    const { error: friendshipError } = await this.supabase
      .from('friendships')
      .insert([
        { user_id: request.sender_id, friend_id: request.receiver_id, status: 'accepted' },
        { user_id: request.receiver_id, friend_id: request.sender_id, status: 'accepted' },
      ]);

    if (friendshipError) {
      logger.error({ error: friendshipError, requestId }, 'Error creating friendship');
      throw friendshipError;
    }

    logger.info({ requestId, userId }, 'Friend request accepted');
  }

  /**
   * Decline a friend request
   */
  async declineRequest(requestId: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('friend_requests')
      .update({ status: 'declined' })
      .eq('id', requestId)
      .eq('receiver_id', userId);

    if (error) {
      logger.error({ error, requestId }, 'Error declining friend request');
      throw error;
    }

    logger.info({ requestId, userId }, 'Friend request declined');
  }

  /**
   * Remove a friend
   */
  async removeFriend(userId: string, friendId: string): Promise<void> {
    // Delete both directions of friendship
    const { error } = await this.supabase
      .from('friendships')
      .delete()
      .or(`and(user_id.eq.${userId},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${userId})`);

    if (error) {
      logger.error({ error, userId, friendId }, 'Error removing friend');
      throw error;
    }

    logger.info({ userId, friendId }, 'Friend removed');
  }

  /**
   * Block a user
   */
  async blockUser(userId: string, blockedId: string): Promise<void> {
    // Remove friendship if exists
    await this.removeFriend(userId, blockedId).catch(() => {});

    // Add block record
    const { error } = await this.supabase
      .from('friendships')
      .insert({
        user_id: userId,
        friend_id: blockedId,
        status: 'blocked',
      });

    if (error) {
      logger.error({ error, userId, blockedId }, 'Error blocking user');
      throw error;
    }

    logger.info({ userId, blockedId }, 'User blocked');
  }

  /**
   * Find a friend by name or email
   */
  async findFriendByNameOrEmail(userId: string, query: string): Promise<FriendWithProfile | null> {
    const friends = await this.getFriends(userId);
    const lowerQuery = query.toLowerCase();

    return friends.find(f =>
      f.friend?.displayName?.toLowerCase().includes(lowerQuery) ||
      f.friend?.email?.toLowerCase().includes(lowerQuery)
    ) || null;
  }
}
