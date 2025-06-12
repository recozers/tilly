-- Supabase database schema for Tilly Calendar App
-- Run this in your Supabase SQL editor to set up the database

-- Enable RLS (Row Level Security)
-- This is important for Supabase security
-- We'll start with permissive policies and can tighten them later

-- Calendar subscriptions table (create this FIRST)
CREATE TABLE IF NOT EXISTS calendar_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  color TEXT DEFAULT '#3b82f6',
  last_sync TIMESTAMPTZ DEFAULT NULL,
  sync_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID DEFAULT auth.uid(), -- For multi-user support later
  UNIQUE(url, user_id) -- Prevent duplicate subscriptions per user
);

-- Events table (create this AFTER calendar_subscriptions)
CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  color TEXT DEFAULT '#3b82f6',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  source_calendar_id BIGINT DEFAULT NULL REFERENCES calendar_subscriptions(id) ON DELETE CASCADE,
  source_event_uid TEXT DEFAULT NULL,
  user_id UUID DEFAULT auth.uid() -- For multi-user support later
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_events_start_time ON events(start_time);
CREATE INDEX IF NOT EXISTS idx_events_user_id ON events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_source_calendar_id ON events(source_calendar_id);
CREATE INDEX IF NOT EXISTS idx_calendar_subscriptions_user_id ON calendar_subscriptions(user_id);

-- Enable Row Level Security
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for events table
-- Allow public access for now (you can tighten this later with authentication)
CREATE POLICY "Allow all operations on events" ON events
  FOR ALL USING (true) WITH CHECK (true);

-- RLS Policies for calendar_subscriptions table
CREATE POLICY "Allow all operations on calendar_subscriptions" ON calendar_subscriptions
  FOR ALL USING (true) WITH CHECK (true);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at on events
CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Optional: Create a view for events with readable data
CREATE OR REPLACE VIEW events_view AS
SELECT 
  e.id,
  e.title,
  e.start_time,
  e.end_time,
  e.color,
  e.created_at,
  e.updated_at,
  e.source_event_uid,
  cs.name as subscription_name,
  cs.url as subscription_url
FROM events e
LEFT JOIN calendar_subscriptions cs ON e.source_calendar_id = cs.id;

-- Function to get events for a date range (for performance)
CREATE OR REPLACE FUNCTION get_events_by_date_range(
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ
)
RETURNS TABLE (
  id BIGINT,
  title TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  color TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT e.id, e.title, e.start_time, e.end_time, e.color
  FROM events e
  WHERE e.start_time >= start_date AND e.start_time <= end_date
  ORDER BY e.start_time;
END;
$$ LANGUAGE plpgsql;

-- Insert some sample data (optional)
-- You can remove this if you don't want sample data
INSERT INTO events (title, start_time, end_time, color) VALUES
  ('Welcome to Supabase!', NOW() + INTERVAL '1 hour', NOW() + INTERVAL '2 hours', '#10b981'),
  ('Sample Meeting', NOW() + INTERVAL '1 day', NOW() + INTERVAL '1 day 1 hour', '#3b82f6')
ON CONFLICT DO NOTHING; 