# Database Documentation

## Database Overview

Tilly uses Supabase (PostgreSQL) as its primary database with built-in authentication, real-time features, and Row Level Security (RLS) for data isolation.

## Connection Configuration

### Supabase Setup

**Environment Variables:**
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anonymous-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**Client Configuration:**
```javascript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)
```

## Schema Design

### Core Tables

#### auth.users (Supabase built-in)
User authentication and profile data managed by Supabase Auth.

```sql
-- Built-in Supabase table (read-only reference)
auth.users (
  id UUID PRIMARY KEY,
  email VARCHAR UNIQUE,
  encrypted_password VARCHAR,
  email_confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  -- Additional fields managed by Supabase
)
```

#### events
Stores calendar events for all users with RLS isolation.

```sql
CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) <= 255),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  color TEXT DEFAULT '#4A7C2A' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_time_range CHECK (end_time > start_time),
  CONSTRAINT valid_title CHECK (length(trim(title)) > 0)
);

-- Indexes for performance
CREATE INDEX idx_events_user_id ON events(user_id);
CREATE INDEX idx_events_time_range ON events(start_time, end_time);
CREATE INDEX idx_events_user_time ON events(user_id, start_time);
```

#### calendar_subscriptions
External calendar subscriptions with automatic synchronization.

```sql
CREATE TABLE calendar_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) <= 100),
  url TEXT NOT NULL CHECK (url ~ '^https?://'),
  color TEXT DEFAULT '#4A7C2A' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  sync_enabled BOOLEAN DEFAULT true,
  last_sync TIMESTAMPTZ,
  sync_frequency INTEGER DEFAULT 86400, -- seconds (24 hours)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT unique_user_subscription UNIQUE(user_id, url)
);

-- Indexes
CREATE INDEX idx_subscriptions_user_id ON calendar_subscriptions(user_id);
CREATE INDEX idx_subscriptions_sync ON calendar_subscriptions(sync_enabled, last_sync);
```

## Row Level Security (RLS)

### Security Policies

#### Events Table RLS
```sql
-- Enable RLS
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- User can only access their own events
CREATE POLICY "events_user_isolation" ON events
  FOR ALL USING (auth.uid() = user_id);

-- Insert policy (ensures user_id matches authenticated user)
CREATE POLICY "events_insert_own" ON events
  FOR INSERT WITH CHECK (auth.uid() = user_id);
```

#### Calendar Subscriptions RLS
```sql
-- Enable RLS
ALTER TABLE calendar_subscriptions ENABLE ROW LEVEL SECURITY;

-- User isolation for subscriptions
CREATE POLICY "subscriptions_user_isolation" ON calendar_subscriptions
  FOR ALL USING (auth.uid() = user_id);

-- Insert policy
CREATE POLICY "subscriptions_insert_own" ON calendar_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
```

### RLS Benefits

- **Automatic user isolation**: Database enforces data separation
- **No application-level filtering**: Security at database level
- **Performance**: Efficient queries with built-in filtering
- **Compliance**: Meets data protection requirements

## Database Operations

### Event Operations

#### Create Event
```sql
INSERT INTO events (user_id, title, start_time, end_time, color)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;
```

#### Get User Events
```sql
SELECT * FROM events 
WHERE user_id = $1 
  AND start_time >= $2 
  AND start_time <= $3
ORDER BY start_time ASC;
```

#### Update Event
```sql
UPDATE events 
SET title = $2, start_time = $3, end_time = $4, color = $5, updated_at = NOW()
WHERE id = $1 AND user_id = $6
RETURNING *;
```

#### Delete Event
```sql
DELETE FROM events 
WHERE id = $1 AND user_id = $2;
```

### Subscription Operations

#### Add Subscription
```sql
INSERT INTO calendar_subscriptions (user_id, name, url, color, sync_enabled)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;
```

#### Get Subscriptions Due for Sync
```sql
SELECT * FROM calendar_subscriptions
WHERE sync_enabled = true
  AND (last_sync IS NULL OR last_sync < NOW() - INTERVAL '1 day');
```

## Performance Optimization

### Indexing Strategy

**Primary indexes:**
- `events(user_id)`: User data isolation
- `events(start_time, end_time)`: Time-based queries
- `events(user_id, start_time)`: Combined user and time filtering

**Query optimization:**
- Use composite indexes for common query patterns
- Monitor query performance with Supabase analytics
- Consider partial indexes for large datasets

### Query Patterns

**Efficient event retrieval:**
```sql
-- Good: Uses index on user_id and start_time
SELECT * FROM events 
WHERE user_id = $1 AND start_time >= $2 AND start_time <= $3;

-- Avoid: No user filter (RLS will handle but less efficient)
SELECT * FROM events WHERE start_time >= $1;
```

**Bulk operations:**
```sql
-- Batch insert for imports
INSERT INTO events (user_id, title, start_time, end_time, color)
SELECT $1, unnest($2::text[]), unnest($3::timestamptz[]), 
       unnest($4::timestamptz[]), unnest($5::text[]);
```

## Data Validation

### Application-Level Validation

```javascript
const validateEventData = (data) => {
  // Title validation
  if (!data.title || data.title.trim().length === 0) {
    throw new Error('Title is required');
  }
  if (data.title.length > 255) {
    throw new Error('Title too long');
  }
  
  // Date validation
  const start = new Date(data.start_time);
  const end = new Date(data.end_time);
  if (start >= end) {
    throw new Error('End time must be after start time');
  }
  
  // Color validation
  if (data.color && !/^#[0-9A-Fa-f]{6}$/.test(data.color)) {
    throw new Error('Invalid color format');
  }
  
  return data;
};
```

### Database-Level Constraints

**Data integrity constraints:**
- `NOT NULL` for required fields
- `CHECK` constraints for data validation
- `REFERENCES` for foreign key integrity
- `UNIQUE` constraints for data uniqueness

## Backup and Recovery

### Supabase Backup Features

**Automatic backups:**
- Daily automated backups
- Point-in-time recovery
- Cross-region backup replication
- Backup retention policies

**Manual backups:**
```sql
-- Export events for a user
\copy (SELECT * FROM events WHERE user_id = 'user-id') TO 'events_backup.csv' CSV HEADER;

-- Export subscriptions
\copy (SELECT * FROM calendar_subscriptions WHERE user_id = 'user-id') TO 'subscriptions_backup.csv' CSV HEADER;
```

### Recovery Procedures

**Point-in-time recovery:**
1. Access Supabase dashboard
2. Navigate to backup section
3. Select recovery point
4. Initiate recovery process

**Data restoration:**
```sql
-- Restore events from backup
\copy events(user_id, title, start_time, end_time, color) FROM 'events_backup.csv' CSV HEADER;
```

## Monitoring and Maintenance

### Performance Monitoring

**Key metrics to monitor:**
- Query execution time
- Index usage statistics
- Connection pool utilization
- Storage usage growth

**Supabase monitoring:**
- Dashboard analytics
- Query performance insights
- Real-time metrics
- Alert configuration

### Maintenance Tasks

**Regular maintenance:**
- Monitor index usage and optimization
- Review and update RLS policies
- Cleanup old data (if applicable)
- Monitor storage usage

**Query optimization:**
```sql
-- Analyze query performance
EXPLAIN ANALYZE SELECT * FROM events 
WHERE user_id = $1 AND start_time >= $2;

-- Check index usage
SELECT schemaname, tablename, indexname, idx_usage
FROM pg_stat_user_indexes 
WHERE schemaname = 'public';
```

## Migration Procedures

### Schema Changes

**Adding new columns:**
```sql
-- Add new column safely
ALTER TABLE events ADD COLUMN description TEXT;

-- Add with default for existing rows
ALTER TABLE events ADD COLUMN location TEXT DEFAULT '';
```

**Creating new indexes:**
```sql
-- Create index concurrently (non-blocking)
CREATE INDEX CONCURRENTLY idx_events_location 
ON events(location) WHERE location IS NOT NULL;
```

### Data Migration

**Safe migration patterns:**
1. Create new table structure
2. Migrate data in batches
3. Validate data integrity
4. Switch application to new structure
5. Drop old structure after verification

## Security Considerations

### Data Protection

**Encryption:**
- Data encrypted at rest (Supabase managed)
- SSL/TLS for data in transit
- API key protection
- Environment variable security

**Access Control:**
- RLS policies enforce user isolation
- Minimal privilege principle
- Regular security audits
- Input sanitization

### Compliance

**Data privacy:**
- User data isolation through RLS
- No cross-user data access
- Secure deletion procedures
- Audit trail capabilities

This database documentation ensures proper understanding and maintenance of the Tilly application's data layer. 