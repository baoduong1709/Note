import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

/**
 * GET /
 * List calendar events for the authenticated user.
 */
router.get('/', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const userId = req.user!.userId;

    const events = db.prepare('SELECT * FROM calendar_events WHERE user_id = ? ORDER BY solar_date ASC, created_at DESC')
      .all(userId);

    res.json({ success: true, data: events });
  } catch (error) {
    console.error('List calendar events error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch calendar events.' });
  }
});

/**
 * GET /:id
 * Get a single calendar event by ID, verifying user ownership.
 */
router.get('/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const userId = req.user!.userId;
    const { id } = req.params;

    const event = db.prepare('SELECT * FROM calendar_events WHERE id = ? AND user_id = ?')
      .get(id, userId);

    if (!event) {
      res.status(404).json({ success: false, error: 'Calendar event not found.' });
      return;
    }

    res.json({ success: true, data: event });
  } catch (error) {
    console.error('Get calendar event error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch calendar event.' });
  }
});

/**
 * POST /
 * Create a new calendar event.
 */
router.post('/', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const userId = req.user!.userId;
    const {
      id,
      title,
      event_type,
      date_type,
      solar_date,
      lunar_day,
      lunar_month,
      lunar_year,
      is_lunar_leap,
      repeat_yearly,
      is_important,
      notes,
      created_at,
      updated_at,
    } = req.body;

    // Input validation
    const VALID_EVENT_TYPES = ['birthday', 'holiday', 'anniversary', 'other'];
    const VALID_DATE_TYPES = ['solar', 'lunar'];
    if (event_type && !VALID_EVENT_TYPES.includes(event_type)) {
      res.status(400).json({ success: false, error: `Invalid event_type.` });
      return;
    }
    if (!date_type || !VALID_DATE_TYPES.includes(date_type)) {
      res.status(400).json({ success: false, error: 'date_type is required (solar or lunar).' });
      return;
    }

    const eventId = id || uuidv4();

    db.prepare(`
      INSERT INTO calendar_events (id, user_id, title, event_type, date_type, solar_date, lunar_day, lunar_month, lunar_year, is_lunar_leap, repeat_yearly, is_important, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))
    `).run(
      eventId, userId,
      title || '',
      event_type || 'other',
      date_type || 'solar',
      solar_date || null,
      lunar_day ?? null,
      lunar_month ?? null,
      lunar_year ?? null,
      is_lunar_leap ? 1 : 0,
      repeat_yearly !== undefined ? (repeat_yearly ? 1 : 0) : 1,
      is_important !== undefined ? (is_important ? 1 : 0) : 1,
      notes || null,
      created_at || null,
      updated_at || null,
    );

    const event = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(eventId);
    res.status(201).json({ success: true, data: event });
  } catch (error) {
    console.error('Create calendar event error:', error);
    res.status(500).json({ success: false, error: 'Failed to create calendar event.' });
  }
});

/**
 * PUT /:id
 * Update an existing calendar event, verifying user ownership.
 */
router.put('/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const userId = req.user!.userId;
    const { id } = req.params;

    // Verify ownership
    const existing = db.prepare('SELECT * FROM calendar_events WHERE id = ? AND user_id = ?').get(id, userId);
    if (!existing) {
      res.status(404).json({ success: false, error: 'Calendar event not found.' });
      return;
    }

    const {
      title,
      event_type,
      date_type,
      solar_date,
      lunar_day,
      lunar_month,
      lunar_year,
      is_lunar_leap,
      repeat_yearly,
      is_important,
      notes,
      updated_at,
    } = req.body;

    // Input validation
    const VALID_EVENT_TYPES = ['birthday', 'holiday', 'anniversary', 'other'];
    const VALID_DATE_TYPES = ['solar', 'lunar'];
    if (event_type && !VALID_EVENT_TYPES.includes(event_type)) {
      res.status(400).json({ success: false, error: `Invalid event_type.` });
      return;
    }
    if (date_type && !VALID_DATE_TYPES.includes(date_type)) {
      res.status(400).json({ success: false, error: 'date_type must be solar or lunar.' });
      return;
    }

    db.prepare(`
      UPDATE calendar_events SET
        title = COALESCE(?, title),
        event_type = COALESCE(?, event_type),
        date_type = COALESCE(?, date_type),
        solar_date = COALESCE(?, solar_date),
        lunar_day = COALESCE(?, lunar_day),
        lunar_month = COALESCE(?, lunar_month),
        lunar_year = COALESCE(?, lunar_year),
        is_lunar_leap = COALESCE(?, is_lunar_leap),
        repeat_yearly = COALESCE(?, repeat_yearly),
        is_important = COALESCE(?, is_important),
        notes = COALESCE(?, notes),
        updated_at = COALESCE(?, datetime('now'))
      WHERE id = ? AND user_id = ?
    `).run(
      title ?? null,
      event_type ?? null,
      date_type ?? null,
      solar_date ?? null,
      lunar_day ?? null,
      lunar_month ?? null,
      lunar_year ?? null,
      is_lunar_leap !== undefined ? (is_lunar_leap ? 1 : 0) : null,
      repeat_yearly !== undefined ? (repeat_yearly ? 1 : 0) : null,
      is_important !== undefined ? (is_important ? 1 : 0) : null,
      notes ?? null,
      updated_at ?? null,
      id,
      userId,
    );

    const event = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(id);
    res.json({ success: true, data: event });
  } catch (error) {
    console.error('Update calendar event error:', error);
    res.status(500).json({ success: false, error: 'Failed to update calendar event.' });
  }
});

/**
 * DELETE /:id
 * Delete a calendar event, verifying user ownership.
 */
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const userId = req.user!.userId;
    const { id } = req.params;

    const result = db.prepare('DELETE FROM calendar_events WHERE id = ? AND user_id = ?').run(id, userId);

    if (result.changes === 0) {
      res.status(404).json({ success: false, error: 'Calendar event not found.' });
      return;
    }

    res.json({ success: true, data: { id } });
  } catch (error) {
    console.error('Delete calendar event error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete calendar event.' });
  }
});

export default router;
