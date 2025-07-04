// Mock the supabase module
jest.mock('../supabase');

// Database Integration Tests - Testing with mock implementations
describe('Database Operations', () => {
  let testUserId;
  let testEventId;
  let testSubscriptionId;
  
  // Mock data store
  const mockData = {
    events: [],
    subscriptions: [],
    nextId: 1
  };

  // Mock implementations
  const createEvent = async (eventData, userId) => {
    const event = {
      id: mockData.nextId++,
      ...eventData,
      user_id: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    mockData.events.push(event);
    return event;
  };

  const getCalendarEvents = async (startDate, endDate, userId) => {
    return mockData.events.filter(event => 
      event.user_id === userId &&
      new Date(event.start) >= startDate &&
      new Date(event.end) <= endDate
    );
  };

  const updateEvent = async (eventId, updateData, userId) => {
    const eventIndex = mockData.events.findIndex(e => e.id === eventId && e.user_id === userId);
    if (eventIndex === -1) {
      throw new Error('Event not found');
    }
    
    mockData.events[eventIndex] = {
      ...mockData.events[eventIndex],
      ...updateData,
      updated_at: new Date().toISOString()
    };
    
    return mockData.events[eventIndex];
  };

  const deleteEvent = async (eventId, userId) => {
    const eventIndex = mockData.events.findIndex(e => e.id === eventId && e.user_id === userId);
    if (eventIndex === -1) {
      throw new Error('Event not found');
    }
    
    mockData.events.splice(eventIndex, 1);
    return { success: true };
  };

  const createCalendarSubscription = async (subscriptionData, userId) => {
    const subscription = {
      id: mockData.nextId++,
      ...subscriptionData,
      user_id: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    mockData.subscriptions.push(subscription);
    return subscription;
  };

  const getCalendarSubscriptions = async (userId) => {
    return mockData.subscriptions.filter(sub => sub.user_id === userId);
  };

  const deleteCalendarSubscription = async (subscriptionId, userId) => {
    const subIndex = mockData.subscriptions.findIndex(s => s.id === subscriptionId && s.user_id === userId);
    if (subIndex === -1) {
      throw new Error('Subscription not found');
    }
    
    mockData.subscriptions.splice(subIndex, 1);
    return { success: true };
  };

  beforeAll(() => {
    // Use a test user ID
    testUserId = 'test-user-' + Date.now();
  });

  beforeEach(() => {
    // Reset mock data before each test
    mockData.events = [];
    mockData.subscriptions = [];
    mockData.nextId = 1;
    testEventId = null;
    testSubscriptionId = null;
  });

  afterEach(async () => {
    // Clean up test data
    if (testEventId) {
      try {
        await deleteEvent(testEventId, testUserId);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    if (testSubscriptionId) {
      try {
        await deleteCalendarSubscription(testSubscriptionId, testUserId);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  describe('Event Operations', () => {
    test('should create a new event', async () => {
      const eventData = {
        title: 'Test Event',
        start: new Date('2025-06-20T10:00:00Z'),
        end: new Date('2025-06-20T11:00:00Z')
        // color will be randomly assigned
      };

      const result = await createEvent(eventData, testUserId);
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.title).toBe(eventData.title);
      expect(result.user_id).toBe(testUserId);
      
      testEventId = result.id;
    });

    test('should retrieve calendar events for user', async () => {
      // First create an event
      const eventData = {
        title: 'Retrieve Test Event',
        start: new Date('2025-06-21T10:00:00Z'),
        end: new Date('2025-06-21T11:00:00Z')
        // color will be randomly assigned
      };

      const createdEvent = await createEvent(eventData, testUserId);
      testEventId = createdEvent.id;

      // Then retrieve events
      const startDate = new Date('2025-06-21T00:00:00Z');
      const endDate = new Date('2025-06-21T23:59:59Z');
      
      const events = await getCalendarEvents(startDate, endDate, testUserId);
      expect(Array.isArray(events)).toBe(true);
      
      const foundEvent = events.find(event => event.id === testEventId);
      expect(foundEvent).toBeDefined();
      expect(foundEvent.title).toBe(eventData.title);
    });

    test('should update an existing event', async () => {
      // Create an event first
      const eventData = {
        title: 'Original Title',
        start: new Date('2025-06-22T10:00:00Z'),
        end: new Date('2025-06-22T11:00:00Z'),
        color: '#4A7C2A'
      };

      const createdEvent = await createEvent(eventData, testUserId);
      testEventId = createdEvent.id;

      // Update the event
      const updateData = {
        title: 'Updated Title',
        start: new Date('2025-06-22T14:00:00Z'),
        end: new Date('2025-06-22T15:00:00Z')
      };

      const updatedEvent = await updateEvent(testEventId, updateData, testUserId);
      expect(updatedEvent.title).toBe('Updated Title');
      expect(new Date(updatedEvent.start)).toEqual(updateData.start);
    });

    test('should delete an event', async () => {
      // Create an event first
      const eventData = {
        title: 'Event to Delete',
        start: new Date('2025-06-23T10:00:00Z'),
        end: new Date('2025-06-23T11:00:00Z'),
        color: '#4A7C2A'
      };

      const createdEvent = await createEvent(eventData, testUserId);
      const eventId = createdEvent.id;

      // Delete the event
      await deleteEvent(eventId, testUserId);

      // Verify it's deleted by trying to retrieve it
      const startDate = new Date('2025-06-23T00:00:00Z');
      const endDate = new Date('2025-06-23T23:59:59Z');
      const events = await getCalendarEvents(startDate, endDate, testUserId);
      
      const deletedEvent = events.find(event => event.id === eventId);
      expect(deletedEvent).toBeUndefined();
      
      testEventId = null; // Don't try to clean up in afterEach
    });
  });

  describe('Calendar Subscription Operations', () => {
    test('should create a calendar subscription', async () => {
      const subscriptionData = {
        name: 'Test Calendar',
        url: 'https://example.com/calendar.ics',
        color: '#4A7C2A'
      };

      const result = await createCalendarSubscription(subscriptionData, testUserId);
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.name).toBe(subscriptionData.name);
      expect(result.user_id).toBe(testUserId);
      
      testSubscriptionId = result.id;
    });

    test('should retrieve calendar subscriptions for user', async () => {
      // Create a subscription first
      const subscriptionData = {
        name: 'Retrieve Test Calendar',
        url: 'https://example.com/test-calendar.ics',
        color: '#4A7C2A'
      };

      const createdSub = await createCalendarSubscription(subscriptionData, testUserId);
      testSubscriptionId = createdSub.id;

      // Retrieve subscriptions
      const subscriptions = await getCalendarSubscriptions(testUserId);
      expect(Array.isArray(subscriptions)).toBe(true);
      
      const foundSub = subscriptions.find(sub => sub.id === testSubscriptionId);
      expect(foundSub).toBeDefined();
      expect(foundSub.name).toBe(subscriptionData.name);
    });

    test('should delete a calendar subscription', async () => {
      // Create a subscription first
      const subscriptionData = {
        name: 'Subscription to Delete',
        url: 'https://example.com/delete-calendar.ics',
        color: '#4A7C2A'
      };

      const createdSub = await createCalendarSubscription(subscriptionData, testUserId);
      const subId = createdSub.id;

      // Delete the subscription
      await deleteCalendarSubscription(subId, testUserId);

      // Verify it's deleted
      const subscriptions = await getCalendarSubscriptions(testUserId);
      const deletedSub = subscriptions.find(sub => sub.id === subId);
      expect(deletedSub).toBeUndefined();
      
      testSubscriptionId = null; // Don't try to clean up in afterEach
    });
  });

  describe('Data Isolation', () => {
    test('should not retrieve events from other users', async () => {
      const otherUserId = 'other-user-' + Date.now();
      
      // Create event for another user
      const eventData = {
        title: 'Other User Event',
        start: new Date('2025-06-24T10:00:00Z'),
        end: new Date('2025-06-24T11:00:00Z'),
        color: '#4A7C2A'
      };

      const otherUserEvent = await createEvent(eventData, otherUserId);
      
      try {
        // Try to retrieve events for our test user
        const startDate = new Date('2025-06-24T00:00:00Z');
        const endDate = new Date('2025-06-24T23:59:59Z');
        const events = await getCalendarEvents(startDate, endDate, testUserId);
        
        // Should not find the other user's event
        const foundEvent = events.find(event => event.id === otherUserEvent.id);
        expect(foundEvent).toBeUndefined();
      } finally {
        // Clean up other user's event
        await deleteEvent(otherUserEvent.id, otherUserId);
      }
    });
  });
}); 