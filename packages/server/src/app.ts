import express, { Express } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import { config } from './config/index.js';
import { createServiceClient } from './config/database.js';
import { createApiRouter } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { createLogger } from './utils/logger.js';

// Repositories
import { EventRepository } from './repositories/event.repository.js';
import { MeetingRepository } from './repositories/meeting.repository.js';
import { FriendRepository } from './repositories/friend.repository.js';
import { SubscriptionRepository } from './repositories/subscription.repository.js';
import { FeedTokenRepository } from './repositories/feed-token.repository.js';

// Services
import { EventService } from './services/event.service.js';
import { AIService } from './services/ai.service.js';
import { StreamingAIService } from './services/streaming-ai.service.js';
import { ICalService } from './services/ical.service.js';
import { SubscriptionService } from './services/subscription.service.js';
import { FeedService } from './services/feed.service.js';

// Controllers
import { EventsController } from './controllers/events.controller.js';
import { AIController } from './controllers/ai.controller.js';
import { ICalController } from './controllers/ical.controller.js';
import { SubscriptionController } from './controllers/subscription.controller.js';
import { FeedController } from './controllers/feed.controller.js';

const logger = createLogger('App');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Application context with services for WebSocket and sync integration
 */
export interface AppContext {
  app: Express;
  streamingAIService: StreamingAIService;
  subscriptionService: SubscriptionService;
}

/**
 * Create and configure Express application
 */
export function createApp(): AppContext {
  const app = express();

  // Basic middleware
  app.use(cors());
  app.use(express.json({ limit: '20mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Request logging (only in development)
  if (config.isDevelopment) {
    app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        logger.debug({
          method: req.method,
          url: req.url,
          status: res.statusCode,
          duration: `${duration}ms`,
        }, 'request');
      });
      next();
    });
  }

  // Initialize dependencies
  const supabase = createServiceClient();

  // Repositories
  const eventRepository = new EventRepository(supabase);
  const meetingRepository = new MeetingRepository(supabase);
  const friendRepository = new FriendRepository(supabase);
  const subscriptionRepository = new SubscriptionRepository(supabase);
  const feedTokenRepository = new FeedTokenRepository(supabase);

  // Services
  const eventService = new EventService(eventRepository, meetingRepository);
  const aiService = new AIService(eventService, friendRepository, meetingRepository);
  const streamingAIService = new StreamingAIService(eventService, friendRepository, meetingRepository);
  const icalService = new ICalService(eventRepository);
  const subscriptionService = new SubscriptionService(subscriptionRepository, eventRepository);
  const feedService = new FeedService(feedTokenRepository, icalService);

  // Controllers
  const eventsController = new EventsController(eventService);
  const aiController = new AIController(aiService);
  const icalController = new ICalController(icalService);
  const subscriptionController = new SubscriptionController(subscriptionService);
  const feedController = new FeedController(feedService);

  // API routes
  const apiRouter = createApiRouter({
    eventsController,
    aiController,
    icalController,
    subscriptionController,
    feedController,
  });
  app.use('/api', apiRouter);

  // Serve static files in production
  if (config.isProduction) {
    const clientDistPath = path.resolve(__dirname, '../../client/dist');
    app.use(express.static(clientDistPath));

    // SPA fallback
    app.get('*', (req, res) => {
      if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(clientDistPath, 'index.html'));
      }
    });
  }

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return { app, streamingAIService, subscriptionService };
}
