// Mock Supabase module for testing
const mockData = {
  events: [],
  subscriptions: [],
  nextId: 1
};

const createEvent = jest.fn().mockImplementation(async (eventData, userId) => {
  const event = {
    id: mockData.nextId++,
    ...eventData,
    user_id: userId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  mockData.events.push(event);
  return event;
});

const getCalendarEvents = jest.fn().mockImplementation(async (startDate, endDate, userId) => {
  return mockData.events.filter(event => 
    event.user_id === userId &&
    new Date(event.start) >= startDate &&
    new Date(event.end) <= endDate
  );
});

const updateEvent = jest.fn().mockImplementation(async (eventId, updateData, userId) => {
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
});

const deleteEvent = jest.fn().mockImplementation(async (eventId, userId) => {
  const eventIndex = mockData.events.findIndex(e => e.id === eventId && e.user_id === userId);
  if (eventIndex === -1) {
    throw new Error('Event not found');
  }
  
  mockData.events.splice(eventIndex, 1);
  return { success: true };
});

const createCalendarSubscription = jest.fn().mockImplementation(async (subscriptionData, userId) => {
  const subscription = {
    id: mockData.nextId++,
    ...subscriptionData,
    user_id: userId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  mockData.subscriptions.push(subscription);
  return subscription;
});

const getCalendarSubscriptions = jest.fn().mockImplementation(async (userId) => {
  return mockData.subscriptions.filter(sub => sub.user_id === userId);
});

const deleteCalendarSubscription = jest.fn().mockImplementation(async (subscriptionId, userId) => {
  const subIndex = mockData.subscriptions.findIndex(s => s.id === subscriptionId && s.user_id === userId);
  if (subIndex === -1) {
    throw new Error('Subscription not found');
  }
  
  mockData.subscriptions.splice(subIndex, 1);
  return { success: true };
});

// Reset function for tests
const resetMockData = jest.fn().mockImplementation(() => {
  mockData.events = [];
  mockData.subscriptions = [];
  mockData.nextId = 1;
});

module.exports = {
  createEvent,
  getCalendarEvents,
  updateEvent,
  deleteEvent,
  createCalendarSubscription,
  getCalendarSubscriptions,
  deleteCalendarSubscription,
  resetMockData
}; 