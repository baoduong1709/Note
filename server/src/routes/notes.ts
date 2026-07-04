import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

/**
 * GET /
 * List notes for the authenticated user.
 * Query params: workspace_id, type, search
 */
router.get('/', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const userId = req.user!.userId;
    const { workspace_id, type, search } = req.query;

    let query = 'SELECT * FROM notes WHERE user_id = ?';
    const params: any[] = [userId];

    if (workspace_id) {
      query += ' AND workspace_id = ?';
      params.push(workspace_id);
    }

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    if (search) {
      query += ' AND (title LIKE ? OR content LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }

    query += ' ORDER BY updated_at DESC';

    const notes = db.prepare(query).all(...params);
    res.json({ success: true, data: notes });
  } catch (error) {
    console.error('List notes error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch notes.' });
  }
});

/**
 * GET /:id
 * Get a single note by ID, verifying user ownership.
 */
router.get('/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const userId = req.user!.userId;
    const { id } = req.params;

    const note = db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(id, userId);

    if (!note) {
      res.status(404).json({ success: false, error: 'Note not found.' });
      return;
    }

    res.json({ success: true, data: note });
  } catch (error) {
    console.error('Get note error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch note.' });
  }
});

/**
 * POST /
 * Create a new note. Generates UUID if no id provided in body.
 */
router.post('/', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const userId = req.user!.userId;
    const {
      id,
      workspace_id,
      project_id,
      title,
      content,
      type,
      is_locked,
      created_at,
      updated_at,
    } = req.body;

    // Input validation
    const VALID_NOTE_TYPES = ['quick', 'command', 'workflow', 'error_fix', 'prompt', 'daily'];
    if (type && !VALID_NOTE_TYPES.includes(type)) {
      res.status(400).json({ success: false, error: `Invalid note type. Must be one of: ${VALID_NOTE_TYPES.join(', ')}` });
      return;
    }
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      res.status(400).json({ success: false, error: 'Title is required.' });
      return;
    }

    const noteId = id || uuidv4();

    db.prepare(`
      INSERT INTO notes (id, user_id, workspace_id, project_id, title, content, type, is_locked, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))
    `).run(
      noteId, userId,
      workspace_id || null,
      project_id || null,
      title || '',
      content || '',
      type || null,
      is_locked ? 1 : 0,
      created_at || null,
      updated_at || null,
    );

    const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(noteId);
    res.status(201).json({ success: true, data: note });
  } catch (error) {
    console.error('Create note error:', error);
    res.status(500).json({ success: false, error: 'Failed to create note.' });
  }
});

/**
 * PUT /:id
 * Update an existing note, verifying user ownership.
 */
router.put('/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const userId = req.user!.userId;
    const { id } = req.params;

    // Verify ownership
    const existing = db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(id, userId);
    if (!existing) {
      res.status(404).json({ success: false, error: 'Note not found.' });
      return;
    }

    const {
      workspace_id,
      project_id,
      title,
      content,
      type,
      is_locked,
      updated_at,
    } = req.body;

    // Input validation
    const VALID_NOTE_TYPES = ['quick', 'command', 'workflow', 'error_fix', 'prompt', 'daily'];
    if (type && !VALID_NOTE_TYPES.includes(type)) {
      res.status(400).json({ success: false, error: `Invalid note type. Must be one of: ${VALID_NOTE_TYPES.join(', ')}` });
      return;
    }

    db.prepare(`
      UPDATE notes SET
        workspace_id = COALESCE(?, workspace_id),
        project_id = COALESCE(?, project_id),
        title = COALESCE(?, title),
        content = COALESCE(?, content),
        type = COALESCE(?, type),
        is_locked = COALESCE(?, is_locked),
        updated_at = COALESCE(?, datetime('now'))
      WHERE id = ? AND user_id = ?
    `).run(
      workspace_id ?? null,
      project_id ?? null,
      title ?? null,
      content ?? null,
      type ?? null,
      is_locked !== undefined ? (is_locked ? 1 : 0) : null,
      updated_at ?? null,
      id,
      userId,
    );

    const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
    res.json({ success: true, data: note });
  } catch (error) {
    console.error('Update note error:', error);
    res.status(500).json({ success: false, error: 'Failed to update note.' });
  }
});

/**
 * DELETE /:id
 * Delete a note, verifying user ownership.
 */
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const userId = req.user!.userId;
    const { id } = req.params;

    const result = db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').run(id, userId);

    if (result.changes === 0) {
      res.status(404).json({ success: false, error: 'Note not found.' });
      return;
    }

    res.json({ success: true, data: { id } });
  } catch (error) {
    console.error('Delete note error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete note.' });
  }
});

export default router;
