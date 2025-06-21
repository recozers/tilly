// Real Database Integration Tests - Testing actual supabase.js functions
const { v4: uuidv4 } = require('uuid');
const {
  createEvent,
  getEventsByDateRange,
  updateEvent,
  deleteEvent,
  addCalendarSubscription,
  getCalendarSubscriptions,
  deleteCalendarSubscription
} = require('../supabase');

describe('Real Database Integration', () => {
  let testUserId;
  let createdEventIds = [];
  let createdSubscriptionIds = [];

  beforeAll(() => {
    // Use proper UUID format for test user ID
    testUserId = uuidv4();
    console.log(`Running tests with test user: ${testUserId}`);
  });

  afterAll(async () => {
    // Clean up all test data
    console.log('Cleaning up test data...');
    
    // Delete all created events
    for (const eventId of createdEventIds) {
      try {
        await deleteEvent(eventId, testUserId);
      } catch (error) {
        console.warn(`Failed to cleanup event ${eventId}:`, error.message);
      }
    }
    
    // Delete all created subscriptions
    for (const subId of createdSubscriptionIds) {
      try {
        await deleteCalendarSubscription(subId, testUserId);
      } catch (error) {
        console.warn(`Failed to cleanup subscription ${subId}:`, error.message);
      }
    }
    
    console.log('Test cleanup completed');
  });

  describe('Real Event Operations', () => {
    test('should create, retrieve, update, and delete real events', async () => {
      // Create a real event
      const eventData = {
        title: 'Real Integration Test Event',
        start: new Date('2025-06-25T10:00:00Z'),
        end: new Date('2025-06-25T11:00:00Z'),
        color: '#4A7C2A'
      };

      console.log('Creating real event...');
      const createdEvent = await createEvent(eventData, testUserId);
      createdEventIds.push(createdEvent.id);

      expect(createdEvent).toBeDefined();
      expect(createdEvent.id).toBeDefined();
      expect(createdEvent.title).toBe(eventData.title);
      expect(createdEvent.color).toBe('#4A7C2A');

      // Retrieve the event
      console.log('Retrieving real events...');
      const startDate = new Date('2025-06-25T00:00:00Z');
      const endDate = new Date('2025-06-25T23:59:59Z');
      const events = await getEventsByDateRange(startDate, endDate, testUserId);

      expect(Array.isArray(events)).toBe(true);
      const foundEvent = events.find(event => event.id === createdEvent.id);
      expect(foundEvent).toBeDefined();
      expect(foundEvent.title).toBe(eventData.title);

      // Update the event
      console.log('Updating real event...');
      const updateData = {
        title: 'Updated Real Test Event',
        start: new Date('2025-06-25T14:00:00Z'),
        end: new Date('2025-06-25T15:00:00Z'),
        color: '#4A7C2A'
      };

      const updatedEvent = await updateEvent(createdEvent.id, updateData, testUserId);
      expect(updatedEvent.title).toBe('Updated Real Test Event');
      expect(new Date(updatedEvent.start).getTime()).toBe(updateData.start.getTime());

      // Delete the event
      console.log('Deleting real event...');
      await deleteEvent(createdEvent.id, testUserId);
      
      // Verify it's deleted
      const eventsAfterDelete = await getEventsByDateRange(startDate, endDate, testUserId);
      const deletedEvent = eventsAfterDelete.find(event => event.id === createdEvent.id);
      expect(deletedEvent).toBeUndefined();

      // Remove from cleanup list since we deleted it
      createdEventIds = createdEventIds.filter(id => id !== createdEvent.id);
    }, 30000); // 30 second timeout for real DB operations

    test('should handle event creation with default color', async () => {
      const eventData = {
        title: 'Test Event Without Color',
        start: new Date('2025-06-26T10:00:00Z'),
        end: new Date('2025-06-26T11:00:00Z')
        // No color specified - should get default
      };

      const createdEvent = await createEvent(eventData, testUserId);
      createdEventIds.push(createdEvent.id);

      expect(createdEvent.color).toBe('#4A7C2A'); // Should get default color
    }, 10000);
  });

  describe('Real Calendar Subscription Operations', () => {
    test('should create, retrieve, and delete real subscriptions', async () => {
      const subscriptionData = {
        name: 'Real Test Calendar',
        url: 'https://example.com/test-calendar.ics',
        color: '#4A7C2A'
      };

      console.log('Creating real subscription...');
      const createdSub = await addCalendarSubscription(subscriptionData, testUserId);
      createdSubscriptionIds.push(createdSub.id);

      expect(createdSub).toBeDefined();
      expect(createdSub.id).toBeDefined();
      expect(createdSub.name).toBe(subscriptionData.name);

      // Retrieve subscriptions
      console.log('Retrieving real subscriptions...');
      const subscriptions = await getCalendarSubscriptions(testUserId);
      expect(Array.isArray(subscriptions)).toBe(true);
      
      const foundSub = subscriptions.find(sub => sub.id === createdSub.id);
      expect(foundSub).toBeDefined();
      expect(foundSub.name).toBe(subscriptionData.name);

      // Delete the subscription
      console.log('Deleting real subscription...');
      await deleteCalendarSubscription(createdSub.id, testUserId);

      // Verify it's deleted
      const subsAfterDelete = await getCalendarSubscriptions(testUserId);
      const deletedSub = subsAfterDelete.find(sub => sub.id === createdSub.id);
      expect(deletedSub).toBeUndefined();

      // Remove from cleanup list since we deleted it
      createdSubscriptionIds = createdSubscriptionIds.filter(id => id !== createdSub.id);
    }, 20000);
  });

  describe('Real Data Isolation', () => {
    test('should enforce user isolation in real database', async () => {
      const otherUserId = uuidv4(); // Another UUID user
      
      // Create event for another user
      const otherUserEvent = await createEvent({
        title: 'Other User Private Event',
        start: new Date('2025-06-27T10:00:00Z'),
        end: new Date('2025-06-27T11:00:00Z'),
        color: '#4A7C2A'
      }, otherUserId);

      try {
        // Our test user should not see the other user's event
        const startDate = new Date('2025-06-27T00:00:00Z');
        const endDate = new Date('2025-06-27T23:59:59Z');
        const events = await getEventsByDateRange(startDate, endDate, testUserId);
        
        const foundOtherEvent = events.find(event => event.id === otherUserEvent.id);
        expect(foundOtherEvent).toBeUndefined();

        console.log(`✅ Data isolation working: ${events.length} events found for ${testUserId}, none belong to ${otherUserId}`);
      } finally {
        // Clean up other user's event
        await deleteEvent(otherUserEvent.id, otherUserId);
      }
    }, 15000);
  });

  describe('Real Error Handling', () => {
    test('should handle non-existent event updates gracefully', async () => {
      const nonExistentId = 999999999;
      
      await expect(updateEvent(nonExistentId, {
        title: 'This should fail',
        start: new Date(),
        end: new Date(),
        color: '#4A7C2A'
      }, testUserId)).rejects.toThrow();
    });

    test('should handle non-existent event deletion gracefully', async () => {
      const nonExistentId = 999999999;
      
      // The actual deleteEvent function might not throw for non-existent IDs
      // Let's test what it actually does
      const result = await deleteEvent(nonExistentId, testUserId);
      expect(result).toBeDefined();
      expect(result.deletedId).toBe(nonExistentId);
    });

    test('should enforce userId requirement', async () => {
      await expect(createEvent({
        title: 'Test Event',
        start: new Date(),
        end: new Date()
      }, null)).rejects.toThrow('SECURITY: userId is required');
    });
  });

  describe('Real Date and Time Handling', () => {
    test('should handle different date formats correctly', async () => {
      const testDates = [
        new Date('2025-06-28T10:00:00Z'),
        new Date('2025-06-28T10:00:00.000Z'),
        new Date(Date.UTC(2025, 5, 28, 12, 0, 0)) // June is month 5 (0-indexed)
      ];

      for (let i = 0; i < testDates.length; i++) {
        const eventData = {
          title: `Date Test Event ${i + 1}`,
          start: testDates[i],
          end: new Date(testDates[i].getTime() + 60 * 60 * 1000), // +1 hour
          color: '#4A7C2A'
        };

        const createdEvent = await createEvent(eventData, testUserId);
        createdEventIds.push(createdEvent.id);

        expect(createdEvent.start).toBeDefined();
        expect(createdEvent.end).toBeDefined();
        
        // Ensure dates are properly stored and retrievable
        const startDate = new Date('2025-06-28T00:00:00Z');
        const endDate = new Date('2025-06-28T23:59:59Z');
        const events = await getEventsByDateRange(startDate, endDate, testUserId);
        
        const foundEvent = events.find(event => event.id === createdEvent.id);
        expect(foundEvent).toBeDefined();
      }
    }, 20000);
  });
}); 