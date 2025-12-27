import { Router } from 'express';
import { AIController } from '../controllers/ai.controller.js';
import { authenticate } from '../middleware/auth.js';

/**
 * Create AI router
 */
export function createAIRouter(controller: AIController): Router {
  const router = Router();

  // All routes require authentication
  router.use(authenticate);

  // POST /api/ai/chat - Process a chat message
  router.post('/chat', controller.chat);

  // POST /api/ai/proxy - Proxy to OpenAI (legacy compatibility)
  router.post('/proxy', controller.proxy);

  // Legacy endpoint compatibility
  router.post('/', async (req, res, next) => {
    const { action } = req.body || {};

    switch (action) {
      case 'openai_proxy':
        return controller.proxy(req, res, next);
      case 'chat':
      case 'smart_chat':
        return controller.chat(req, res, next);
      default:
        res.status(400).json({ error: `Unknown AI action: ${action}` });
    }
  });

  return router;
}
