import { Response } from 'express';
import { ICalService } from '../services/ical.service.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { createLogger } from '../utils/logger.js';
import { BadRequestError } from '../middleware/error-handler.js';

const logger = createLogger('ICalController');

/**
 * iCal controller - handles calendar import/export
 */
export class ICalController {
  constructor(private icalService: ICalService) {}

  /**
   * POST /api/ical/import - Import events from iCal data
   */
  import = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { icalData } = req.body as { icalData?: string };

    if (!icalData || typeof icalData !== 'string') {
      throw new BadRequestError('iCal data is required');
    }

    logger.info({ userId: req.userId }, 'Importing iCal data');

    const result = await this.icalService.importEvents(icalData, req.userId);

    res.json({
      success: true,
      imported: result.imported,
      skipped: result.skipped,
      errors: result.errors,
    });
  });

  /**
   * POST /api/ical/import/file - Import events from uploaded iCal file
   */
  importFile = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const file = req.file;

    if (!file) {
      throw new BadRequestError('No file uploaded');
    }

    const icalData = file.buffer.toString('utf-8');
    logger.info({ userId: req.userId, fileName: file.originalname }, 'Importing iCal file');

    const result = await this.icalService.importEvents(icalData, req.userId);

    res.json({
      success: true,
      imported: result.imported,
      skipped: result.skipped,
      errors: result.errors,
    });
  });

  /**
   * GET /api/ical/export - Export events to iCal format
   */
  export = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };

    let start: Date | undefined;
    let end: Date | undefined;

    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new BadRequestError('Invalid date format');
      }
    }

    logger.info({ userId: req.userId, startDate, endDate }, 'Exporting iCal data');

    const icalData = await this.icalService.exportEvents(req.userId, start, end);

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="tilly-calendar.ics"');
    res.send(icalData);
  });

  /**
   * GET /api/ical/event/:id - Export a single event to iCal format
   */
  exportEvent = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const eventId = parseInt(id, 10);

    if (isNaN(eventId)) {
      throw new BadRequestError('Invalid event ID');
    }

    // Get the event from the repository (via service)
    const { EventService } = await import('../services/event.service.js');
    const { EventRepository } = await import('../repositories/event.repository.js');
    const { MeetingRepository } = await import('../repositories/meeting.repository.js');
    const { createServiceClient } = await import('../config/database.js');

    const supabase = createServiceClient();
    const eventRepository = new EventRepository(supabase);
    const meetingRepository = new MeetingRepository(supabase);
    const eventService = new EventService(eventRepository, meetingRepository);

    const event = await eventService.getEventById(eventId, req.userId);

    const icalData = this.icalService.generateEventICS(event);

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${event.title.replace(/[^a-z0-9]/gi, '-')}.ics"`);
    res.send(icalData);
  });

  /**
   * POST /api/ical/parse - Parse iCal data without importing (preview)
   */
  parse = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { icalData } = req.body as { icalData?: string };

    if (!icalData || typeof icalData !== 'string') {
      throw new BadRequestError('iCal data is required');
    }

    logger.info({ userId: req.userId }, 'Parsing iCal data (preview)');

    const events = this.icalService.parseICalData(icalData);

    res.json({
      success: true,
      events: events.map(e => ({
        title: e.title,
        start: e.start,
        end: e.end,
        description: e.description,
        location: e.location,
        allDay: e.allDay,
        hasRecurrence: !!e.rrule,
      })),
    });
  });
}
