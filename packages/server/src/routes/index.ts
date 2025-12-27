import { Router } from 'express';
import { createEventsRouter } from './events.routes.js';
import { createAIRouter } from './ai.routes.js';
import { EventsController } from '../controllers/events.controller.js';
import { AIController } from '../controllers/ai.controller.js';

export interface RouterDependencies {
  eventsController: EventsController;
  aiController: AIController;
}

/**
 * Create all API routes
 */
export function createApiRouter(deps: RouterDependencies): Router {
  const router = Router();

  // Mount route modules
  router.use('/events', createEventsRouter(deps.eventsController));
  router.use('/ai', createAIRouter(deps.aiController));

  // Legacy endpoint compatibility
  router.use('/claude', createAIRouter(deps.aiController));
  router.use('/openai', createAIRouter(deps.aiController));

  // Health check
  router.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return router;
}

export { createEventsRouter } from './events.routes.js';
export { createAIRouter } from './ai.routes.js';
