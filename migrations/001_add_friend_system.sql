-- Migration: Add Friend-Based Meeting Booking System
-- Version: 001
-- Created: 2025-01-04

-- Enable RLS for all new tables
SET row_security = on;

-- 1. User Profiles Table - Public user information for friend discovery
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  avatar_url TEXT,
  bio TEXT,
  timezone TEXT DEFAULT 'UTC',
  -- Privacy settings
  allow_friend_requests BOOLEAN DEFAULT true,
  public_availability BOOLEAN DEFAULT false,
  default_meeting_duration INTEGER DEFAULT 30, -- minutes
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Friendships Table - Manages friend relationships
CREATE TABLE friendships (
  id SERIAL PRIMARY KEY,
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'blocked')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Ensure no duplicate friend requests
  UNIQUE(requester_id, addressee_id),
  -- Ensure users can't friend themselves
  CHECK (requester_id != addressee_id)
);

-- 3. Meeting Requests Table - Handles meeting booking requests
CREATE TABLE meeting_requests (
  id SERIAL PRIMARY KEY,
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  proposed_times JSONB NOT NULL, -- Array of proposed time slots
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  selected_time TIMESTAMPTZ, -- The chosen time slot when accepted
  created_event_id INTEGER REFERENCES events(id), -- Link to created calendar event
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Ensure users can't request meetings with themselves
  CHECK (requester_id != friend_id)
);

-- 4. Availability Sharing Table - Controls what availability info is shared
CREATE TABLE availability_sharing (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  share_level TEXT NOT NULL CHECK (share_level IN ('none', 'busy_free', 'basic_details', 'full_details')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, friend_id)
);

-- 5. Extend events table with sharing metadata
ALTER TABLE events ADD COLUMN shared_with JSONB DEFAULT NULL;
ALTER TABLE events ADD COLUMN meeting_request_id INTEGER REFERENCES meeting_requests(id);

-- Create indexes for performance
CREATE INDEX idx_user_profiles_email ON user_profiles(email);
CREATE INDEX idx_user_profiles_display_name ON user_profiles(display_name);
CREATE INDEX idx_friendships_requester ON friendships(requester_id);
CREATE INDEX idx_friendships_addressee ON friendships(addressee_id);
CREATE INDEX idx_friendships_status ON friendships(status);
CREATE INDEX idx_meeting_requests_requester ON meeting_requests(requester_id);
CREATE INDEX idx_meeting_requests_friend ON meeting_requests(friend_id);
CREATE INDEX idx_meeting_requests_status ON meeting_requests(status);
CREATE INDEX idx_availability_sharing_user ON availability_sharing(user_id);
CREATE INDEX idx_availability_sharing_friend ON availability_sharing(friend_id);
CREATE INDEX idx_events_meeting_request ON events(meeting_request_id);

-- Row Level Security Policies

-- User Profiles: Users can read profiles of friends, update their own
CREATE POLICY "Users can view their own profile" ON user_profiles
  FOR ALL USING (auth.uid() = id);

CREATE POLICY "Users can view profiles of friends" ON user_profiles
  FOR SELECT USING (
    id IN (
      SELECT CASE 
        WHEN requester_id = auth.uid() THEN addressee_id
        WHEN addressee_id = auth.uid() THEN requester_id
      END
      FROM friendships 
      WHERE status = 'accepted' 
      AND (requester_id = auth.uid() OR addressee_id = auth.uid())
    )
  );

CREATE POLICY "Users can search public profiles" ON user_profiles
  FOR SELECT USING (allow_friend_requests = true);

-- Friendships: Users can only see their own friendship relationships
CREATE POLICY "Users can manage their friendships" ON friendships
  FOR ALL USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- Meeting Requests: Users can only see requests they're involved in
CREATE POLICY "Users can manage their meeting requests" ON meeting_requests
  FOR ALL USING (auth.uid() = requester_id OR auth.uid() = friend_id);

-- Availability Sharing: Users control their own sharing settings
CREATE POLICY "Users can manage their availability sharing" ON availability_sharing
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view sharing settings for their data" ON availability_sharing
  FOR SELECT USING (auth.uid() = friend_id);

-- Functions for common operations

-- Function to check if two users are friends
CREATE OR REPLACE FUNCTION are_friends(user1_id UUID, user2_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM friendships 
    WHERE status = 'accepted'
    AND ((requester_id = user1_id AND addressee_id = user2_id)
         OR (requester_id = user2_id AND addressee_id = user1_id))
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's availability sharing level for a friend
CREATE OR REPLACE FUNCTION get_sharing_level(user_id UUID, friend_id UUID)
RETURNS TEXT AS $$
DECLARE
  level TEXT;
BEGIN
  SELECT share_level INTO level
  FROM availability_sharing
  WHERE availability_sharing.user_id = get_sharing_level.user_id 
  AND availability_sharing.friend_id = get_sharing_level.friend_id;
  
  -- Default to 'busy_free' if no specific setting and they are friends
  IF level IS NULL AND are_friends(user_id, friend_id) THEN
    RETURN 'busy_free';
  END IF;
  
  RETURN COALESCE(level, 'none');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create mutual friendship (when accepted)
CREATE OR REPLACE FUNCTION accept_friend_request(request_id INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
  req_record friendships%ROWTYPE;
BEGIN
  -- Get the request
  SELECT * INTO req_record FROM friendships WHERE id = request_id;
  
  -- Verify the current user is the addressee
  IF req_record.addressee_id != auth.uid() THEN
    RETURN FALSE;
  END IF;
  
  -- Update status to accepted
  UPDATE friendships 
  SET status = 'accepted', updated_at = NOW()
  WHERE id = request_id;
  
  -- Create default availability sharing (busy_free level)
  INSERT INTO availability_sharing (user_id, friend_id, share_level)
  VALUES 
    (req_record.requester_id, req_record.addressee_id, 'busy_free'),
    (req_record.addressee_id, req_record.requester_id, 'busy_free')
  ON CONFLICT (user_id, friend_id) DO NOTHING;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_friendships_updated_at
  BEFORE UPDATE ON friendships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_meeting_requests_updated_at
  BEFORE UPDATE ON meeting_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_availability_sharing_updated_at
  BEFORE UPDATE ON availability_sharing
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create initial user profile for existing users
INSERT INTO user_profiles (id, display_name, email)
SELECT 
  id,
  COALESCE(raw_user_meta_data->>'full_name', email),
  email
FROM auth.users
ON CONFLICT (id) DO NOTHING;