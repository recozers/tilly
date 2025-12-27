/**
 * User profile information
 */
export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Database row representation of a user profile
 */
export interface UserProfileRow {
  id: string;
  email: string;
  display_name: string;
  avatar_url?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Friend relationship
 */
export interface Friend {
  id: string;
  userId: string;
  friendId: string;
  status: FriendStatus;
  createdAt: Date;
}

export type FriendStatus = 'pending' | 'accepted' | 'declined' | 'blocked';

/**
 * Friend with profile information
 */
export interface FriendWithProfile extends Friend {
  friend: UserProfile;
}

/**
 * Friend request
 */
export interface FriendRequest {
  id: string;
  senderId: string;
  receiverId: string;
  status: FriendStatus;
  createdAt: Date;
  sender?: UserProfile;
  receiver?: UserProfile;
}
