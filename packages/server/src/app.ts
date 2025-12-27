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

// Services
import { EventService } from './services/event.service.js';
import { AIService } from './services/ai.service.js';

// Controllers
import { EventsController } from './controllers/events.controller.js';
import { AIController } from './controllers/ai.controller.js';

const logger = createLogger('App');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Create and configure Express application
 */
export function createApp(): Express {
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

  // Services
  const eventService = new EventService(eventRepository, meetingRepository);
  const aiService = new AIService(eventService, friendRepository, meetingRepository);

  // Controllers
  const eventsController = new EventsController(eventService);
  const aiController = new AIController(aiService);

  // API routes
  const apiRouter = createApiRouter({
    eventsController,
    aiController,
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

  return app;
}
