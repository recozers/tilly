// Real Server Integration Tests - Testing actual Express server
const request = require('supertest');
const { spawn } = require('child_process');
const path = require('path');

describe('Real Server Integration', () => {
  let serverProcess;
  let serverUrl = 'http://localhost:8081'; // Use different port for testing
  let testUserId;

  beforeAll(async () => {
    // Generate unique test user ID
    testUserId = `test-user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Start the actual server on a test port
    console.log('Starting test server...');
    serverProcess = spawn('node', ['server.js'], {
      env: {
        ...process.env,
        PORT: '8081',
        NODE_ENV: 'test'
      },
      cwd: path.resolve(__dirname, '..')
    });

    // Wait for server to start
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Server startup timeout'));
      }, 10000);

      serverProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('Server output:', output);
        if (output.includes('running on port 8081')) {
          clearTimeout(timeout);
          resolve();
        }
      });

      serverProcess.stderr.on('data', (data) => {
        console.error('Server error:', data.toString());
      });

      serverProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    console.log('Test server started successfully');
  }, 30000);

  afterAll(async () => {
    if (serverProcess) {
      console.log('Stopping test server...');
      serverProcess.kill('SIGTERM');
      
      // Wait for process to exit
      await new Promise((resolve) => {
        serverProcess.on('exit', resolve);
        setTimeout(resolve, 2000); // Force resolve after 2 seconds
      });
    }
  });

  describe('Server Health and Basic Endpoints', () => {
    test('should respond to health check', async () => {
      const response = await request(serverUrl)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('OK');
      expect(response.body.timestamp).toBeDefined();
    }, 10000);

    test('should handle CORS properly', async () => {
      const response = await request(serverUrl)
        .options('/health')
        .set('Origin', 'http://localhost:3000')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBeDefined();
    }, 10000);
  });

  describe('Real Events API', () => {
    let createdEventId;

    afterEach(async () => {
      // Clean up created events
      if (createdEventId) {
        try {
          await request(serverUrl)
            .delete(`/api/events/${createdEventId}`)
            .set('x-user-id', testUserId);
        } catch (error) {
          console.warn('Cleanup failed:', error.message);
        }
        createdEventId = null;
      }
    });

    test('should create a real event via API', async () => {
      const eventData = {
        title: 'Real API Test Event',
        start: '2025-06-29T10:00:00Z',
        end: '2025-06-29T11:00:00Z',
        color: '#4A7C2A'
      };

      const response = await request(serverUrl)
        .post('/api/events')
        .set('x-user-id', testUserId)
        .send(eventData)
        .expect(201);

      expect(response.body).toBeDefined();
      expect(response.body.id).toBeDefined();
      expect(response.body.title).toBe(eventData.title);
      expect(response.body.user_id).toBe(testUserId);

      createdEventId = response.body.id;
    }, 15000);

    test('should retrieve real events via API', async () => {
      // First create an event
      const eventData = {
        title: 'Retrieve Test Event',
        start: '2025-06-30T10:00:00Z',
        end: '2025-06-30T11:00:00Z',
        color: '#4A7C2A'
      };

      const createResponse = await request(serverUrl)
        .post('/api/events')
        .set('x-user-id', testUserId)
        .send(eventData);

      createdEventId = createResponse.body.id;

      // Then retrieve events
      const response = await request(serverUrl)
        .get('/api/events')
        .set('x-user-id', testUserId)
        .query({
          start_date: '2025-06-30T00:00:00Z',
          end_date: '2025-06-30T23:59:59Z'
        })
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      const foundEvent = response.body.find(event => event.id === createdEventId);
      expect(foundEvent).toBeDefined();
      expect(foundEvent.title).toBe(eventData.title);
    }, 15000);

    test('should enforce user isolation via API', async () => {
      const otherUserId = `other-${testUserId}`;
      
      // Create event for another user
      const eventData = {
        title: 'Other User API Event',
        start: '2025-07-01T10:00:00Z',
        end: '2025-07-01T11:00:00Z',
        color: '#4A7C2A'
      };

      const createResponse = await request(serverUrl)
        .post('/api/events')
        .set('x-user-id', otherUserId)
        .send(eventData);

      const otherEventId = createResponse.body.id;

      try {
        // Our test user should not see the other user's event
        const response = await request(serverUrl)
          .get('/api/events')
          .set('x-user-id', testUserId)
          .query({
            start_date: '2025-07-01T00:00:00Z',
            end_date: '2025-07-01T23:59:59Z'
          })
          .expect(200);

        const foundOtherEvent = response.body.find(event => event.id === otherEventId);
        expect(foundOtherEvent).toBeUndefined();

        console.log(`✅ API Data isolation working: ${response.body.length} events found for ${testUserId}`);
      } finally {
        // Clean up other user's event
        await request(serverUrl)
          .delete(`/api/events/${otherEventId}`)
          .set('x-user-id', otherUserId);
      }
    }, 20000);
  });

  describe('Real Calendar Subscriptions API', () => {
    let createdSubscriptionId;

    afterEach(async () => {
      // Clean up created subscriptions
      if (createdSubscriptionId) {
        try {
          await request(serverUrl)
            .delete(`/api/calendar-subscriptions/${createdSubscriptionId}`)
            .set('x-user-id', testUserId);
        } catch (error) {
          console.warn('Subscription cleanup failed:', error.message);
        }
        createdSubscriptionId = null;
      }
    });

    test('should create and retrieve calendar subscriptions via API', async () => {
      const subscriptionData = {
        name: 'Real API Test Calendar',
        url: 'https://example.com/test-api-calendar.ics',
        color: '#4A7C2A'
      };

      // Create subscription
      const createResponse = await request(serverUrl)
        .post('/api/calendar-subscriptions')
        .set('x-user-id', testUserId)
        .send(subscriptionData)
        .expect(201);

      expect(createResponse.body).toBeDefined();
      expect(createResponse.body.id).toBeDefined();
      expect(createResponse.body.name).toBe(subscriptionData.name);

      createdSubscriptionId = createResponse.body.id;

      // Retrieve subscriptions
      const getResponse = await request(serverUrl)
        .get('/api/calendar-subscriptions')
        .set('x-user-id', testUserId)
        .expect(200);

      expect(Array.isArray(getResponse.body)).toBe(true);
      const foundSub = getResponse.body.find(sub => sub.id === createdSubscriptionId);
      expect(foundSub).toBeDefined();
      expect(foundSub.name).toBe(subscriptionData.name);
    }, 15000);
  });

  describe('Real Error Handling', () => {
    test('should handle malformed JSON gracefully', async () => {
      await request(serverUrl)
        .post('/api/events')
        .set('x-user-id', testUserId)
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);
    }, 10000);

    test('should handle missing user ID', async () => {
      const eventData = {
        title: 'Test Event',
        start: '2025-07-02T10:00:00Z',
        end: '2025-07-02T11:00:00Z'
      };

      // Should still work with default handling or return appropriate error
      const response = await request(serverUrl)
        .post('/api/events')
        .send(eventData);

      // Either succeeds with default user handling or fails appropriately
      expect([200, 201, 400, 401]).toContain(response.status);
    }, 10000);

    test('should handle invalid event data', async () => {
      const invalidEventData = {
        // Missing required fields
        title: '',
        start: 'invalid-date',
        end: 'invalid-date'
      };

      await request(serverUrl)
        .post('/api/events')
        .set('x-user-id', testUserId)
        .send(invalidEventData)
        .expect(400);
    }, 10000);
  });

  describe('Real Performance', () => {
    test('should respond to requests within reasonable time', async () => {
      const startTime = Date.now();
      
      await request(serverUrl)
        .get('/health')
        .expect(200);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(2000); // Should respond within 2 seconds
    }, 10000);

    test('should handle concurrent requests', async () => {
      const concurrentRequests = Array(5).fill().map(() =>
        request(serverUrl)
          .get('/health')
          .expect(200)
      );

      const responses = await Promise.all(concurrentRequests);
      expect(responses).toHaveLength(5);
      responses.forEach(response => {
        expect(response.body.status).toBe('OK');
      });
    }, 15000);
  });
}); 