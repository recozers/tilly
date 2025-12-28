import { Router } from 'express';
import multer from 'multer';
import { ICalController } from '../controllers/ical.controller.js';
import { authenticate } from '../middleware/auth.js';

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  },
  fileFilter: (_req, file, cb) => {
    // Accept .ics and .ical files
    const allowedMimes = ['text/calendar', 'application/ics', 'text/ics'];
    const allowedExts = ['.ics', '.ical'];

    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));

    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only iCal files (.ics, .ical) are allowed'));
    }
  },
});

/**
 * Create iCal routes
 */
export function createICalRouter(icalController: ICalController): Router {
  const router = Router();

  // All routes require authentication
  router.use(authenticate);

  // Import from raw iCal data
  router.post('/import', icalController.import);

  // Import from uploaded file
  router.post('/import/file', upload.single('file'), icalController.importFile);

  // Export calendar to iCal
  router.get('/export', icalController.export);

  // Export single event to iCal
  router.get('/event/:id', icalController.exportEvent);

  // Parse iCal data (preview without importing)
  router.post('/parse', icalController.parse);

  return router;
}
