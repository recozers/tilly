import { Response, NextFunction } from 'express';
import { EventService } from '../services/event.service.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error-handler.js';
import type { CreateEventInput, UpdateEventInput } from '../validators/event.validator.js';

/**
 * Events controller - handles HTTP requests for calendar events
 */
export class EventsController {
  constructor(private eventService: EventService) {}

  /**
   * GET /api/events - Get all events
   */
  getAll = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const events = await this.eventService.getAllEvents(req.userId);
    res.json(events);
  });

  /**
   * GET /api/events/:id - Get event by ID
   */
  getById = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const id = parseInt(req.params.id, 10);
    const event = await this.eventService.getEventById(id, req.userId);
    res.json(event);
  });

  /**
   * GET /api/events/range - Get events by date range
   */
  getByRange = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { start, end } = req.query as { start: string; end: string };
    const events = await this.eventService.getEventsByDateRange(
      new Date(start),
      new Date(end),
      req.userId
    );
    res.json(events);
  });

  /**
   * GET /api/events/upcoming - Get upcoming events
   */
  getUpcoming = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const days = parseInt(req.query.days as string, 10) || 7;
    const events = await this.eventService.getUpcomingEvents(req.userId, days);
    res.json(events);
  });

  /**
   * GET /api/events/search - Search events
   */
  search = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const query = req.query.q as string;
    const events = await this.eventService.searchEvents(query, req.userId);
    res.json(events);
  });

  /**
   * POST /api/events - Create new event
   */
  create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const dto = req.body as CreateEventInput;
    const event = await this.eventService.createEvent(
      {
        title: dto.title,
        start: dto.start,
        end: dto.end,
        color: dto.color,
        description: dto.description,
        location: dto.location,
      },
      req.userId
    );
    res.status(201).json(event);
  });

  /**
   * PUT /api/events/:id - Update event
   */
  update = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const id = parseInt(req.params.id, 10);
    const dto = req.body as UpdateEventInput;
    const event = await this.eventService.updateEvent(id, dto, req.userId);
    res.json(event);
  });

  /**
   * DELETE /api/events/:id - Delete event
   */
  delete = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const id = parseInt(req.params.id, 10);
    await this.eventService.deleteEvent(id, req.userId);
    res.status(204).send();
  });

  /**
   * POST /api/events/check-conflicts - Check for time conflicts
   */
  checkConflicts = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { start, end, excludeEventId } = req.body as {
      start: string;
      end: string;
      excludeEventId?: number;
    };
    const result = await this.eventService.checkTimeConflicts(
      new Date(start),
      new Date(end),
      req.userId,
      excludeEventId
    );
    res.json(result);
  });

  /**
   * GET /api/events/stats - Get calendar statistics
   */
  getStats = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const stats = await this.eventService.getCalendarStats(req.userId);
    res.json(stats);
  });
}
