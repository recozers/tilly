import { Router } from 'express';
import { EventsController } from '../controllers/events.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { createEventSchema, updateEventSchema, eventIdSchema } from '../validators/event.validator.js';

/**
 * Create events router
 */
export function createEventsRouter(controller: EventsController): Router {
  const router = Router();

  // All routes require authentication
  router.use(authenticate);

  // GET /api/events - Get all events
  router.get('/', controller.getAll);

  // GET /api/events/range - Get events by date range
  router.get('/range', controller.getByRange);

  // GET /api/events/upcoming - Get upcoming events
  router.get('/upcoming', controller.getUpcoming);

  // GET /api/events/search - Search events
  router.get('/search', controller.search);

  // GET /api/events/stats - Get calendar statistics
  router.get('/stats', controller.getStats);

  // POST /api/events/check-conflicts - Check for time conflicts
  router.post('/check-conflicts', controller.checkConflicts);

  // GET /api/events/:id - Get event by ID
  router.get('/:id', validate(eventIdSchema, 'params'), controller.getById);

  // POST /api/events - Create new event
  router.post('/', validate(createEventSchema), controller.create);

  // PUT /api/events/:id - Update event
  router.put('/:id', validate(eventIdSchema, 'params'), validate(updateEventSchema), controller.update);

  // DELETE /api/events/:id - Delete event
  router.delete('/:id', validate(eventIdSchema, 'params'), controller.delete);

  return router;
}
