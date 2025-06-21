// API Endpoint Tests
const request = require('supertest');
const express = require('express');

describe('API Endpoints', () => {
  let app;
  
  // Mock data store
  const mockData = {
    events: [],
    subscriptions: [],
    nextId: 1
  };

  // Mock Supabase functions
  const mockSupabase = {
    getCalendarEvents: jest.fn(async (startDate, endDate, userId) => {
      return mockData.events.filter(event => 
        event.user_id === userId &&
        new Date(event.start) >= startDate &&
        new Date(event.end) <= endDate
      );
    }),
    
    createEvent: jest.fn(async (eventData, userId) => {
      const event = {
        id: mockData.nextId++,
        ...eventData,
        user_id: userId,
        created_at: new Date().toISOString()
      };
      mockData.events.push(event);
      return event;
    }),
    
    getCalendarSubscriptions: jest.fn(async (userId) => {
      return mockData.subscriptions.filter(sub => sub.user_id === userId);
    })
  };

  beforeAll(() => {
    // Create a test version of the server
    app = express();
    app.use(express.json());
    
    // Add basic health check route for testing
    app.get('/health', (req, res) => {
      res.json({ status: 'OK', timestamp: new Date().toISOString() });
    });

    // Mock events endpoint
    app.get('/api/events', async (req, res) => {
      try {
        const { start_date, end_date } = req.query;
        const userId = req.headers['x-user-id'] || 'test-user';
        
        const events = await mockSupabase.getCalendarEvents(
          new Date(start_date),
          new Date(end_date),
          userId
        );
        res.json(events);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.post('/api/events', async (req, res) => {
      try {
        const userId = req.headers['x-user-id'] || 'test-user';
        const event = await mockSupabase.createEvent(req.body, userId);
        res.status(201).json(event);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Mock calendar subscriptions endpoint
    app.get('/api/calendar-subscriptions', async (req, res) => {
      try {
        const userId = req.headers['x-user-id'] || 'test-user';
        const subscriptions = await mockSupabase.getCalendarSubscriptions(userId);
        res.json(subscriptions);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  });

  beforeEach(() => {
    // Reset mocks and data before each test
    jest.clearAllMocks();
    mockData.events = [];
    mockData.subscriptions = [];
    mockData.nextId = 1;
  });

  describe('Health Check', () => {
    test('GET /health should return OK status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('OK');
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('Events API', () => {
    test('GET /api/events should retrieve events', async () => {
      const mockEvents = [
        {
          id: 1,
          title: 'Test Event',
          start: '2025-06-20T10:00:00Z',
          end: '2025-06-20T11:00:00Z',
          color: '#4A7C2A'
        }
      ];

      mockSupabase.getCalendarEvents.mockResolvedValue(mockEvents);

      const response = await request(app)
        .get('/api/events')
        .query({
          start_date: '2025-06-20T00:00:00Z',
          end_date: '2025-06-20T23:59:59Z'
        })
        .set('x-user-id', 'test-user')
        .expect(200);

      expect(response.body).toEqual(mockEvents);
      expect(mockSupabase.getCalendarEvents).toHaveBeenCalledWith(
        new Date('2025-06-20T00:00:00Z'),
        new Date('2025-06-20T23:59:59Z'),
        'test-user'
      );
    });

    test('POST /api/events should create a new event', async () => {
      const newEvent = {
        title: 'New Test Event',
        start: '2025-06-21T14:00:00Z',
        end: '2025-06-21T15:00:00Z',
        color: '#4A7C2A'
      };

      const createdEvent = { id: 123, ...newEvent };
      mockSupabase.createEvent.mockResolvedValue(createdEvent);

      const response = await request(app)
        .post('/api/events')
        .set('x-user-id', 'test-user')
        .send(newEvent)
        .expect(201);

      expect(response.body).toEqual(createdEvent);
      expect(mockSupabase.createEvent).toHaveBeenCalledWith(newEvent, 'test-user');
    });

    test('GET /api/events should handle errors gracefully', async () => {
      mockSupabase.getCalendarEvents.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/events')
        .query({
          start_date: '2025-06-20T00:00:00Z',
          end_date: '2025-06-20T23:59:59Z'
        })
        .set('x-user-id', 'test-user')
        .expect(500);

      expect(response.body.error).toBe('Database error');
    });
  });

  describe('Calendar Subscriptions API', () => {
    test('GET /api/calendar-subscriptions should retrieve subscriptions', async () => {
      const mockSubscriptions = [
        {
          id: 1,
          name: 'Test Calendar',
          url: 'https://example.com/calendar.ics',
          color: '#4A7C2A'
        }
      ];

      mockSupabase.getCalendarSubscriptions.mockResolvedValue(mockSubscriptions);

      const response = await request(app)
        .get('/api/calendar-subscriptions')
        .set('x-user-id', 'test-user')
        .expect(200);

      expect(response.body).toEqual(mockSubscriptions);
      expect(mockSupabase.getCalendarSubscriptions).toHaveBeenCalledWith('test-user');
    });

    test('GET /api/calendar-subscriptions should handle errors gracefully', async () => {
      mockSupabase.getCalendarSubscriptions.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/calendar-subscriptions')
        .set('x-user-id', 'test-user')
        .expect(500);

      expect(response.body.error).toBe('Database error');
    });
  });

  describe('Request Validation', () => {
    test('should handle missing user ID', async () => {
      mockSupabase.getCalendarEvents.mockResolvedValue([]);

      await request(app)
        .get('/api/events')
        .query({
          start_date: '2025-06-20T00:00:00Z',
          end_date: '2025-06-20T23:59:59Z'
        })
        .expect(200);

      // Should use default user ID when header is missing
      expect(mockSupabase.getCalendarEvents).toHaveBeenCalledWith(
        new Date('2025-06-20T00:00:00Z'),
        new Date('2025-06-20T23:59:59Z'),
        'test-user'
      );
    });

    test('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/events')
        .set('x-user-id', 'test-user')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);
    });
  });
}); 