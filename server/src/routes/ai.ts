import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

/**
 * GET /sessions
 * List all AI chat sessions for the authenticated user.
 */
router.get('/sessions', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const userId = req.user!.userId;

    const sessions = db.prepare('SELECT * FROM ai_sessions WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId);

    res.json({ success: true, data: sessions });
  } catch (error) {
    console.error('List AI sessions error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch AI sessions.' });
  }
});

/**
 * POST /sessions
 * Create a new AI chat session.
 */
router.post('/sessions', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const userId = req.user!.userId;
    const { id, title, created_at } = req.body;

    const sessionId = id || uuidv4();

    db.prepare(`
      INSERT INTO ai_sessions (id, user_id, title, created_at)
      VALUES (?, ?, ?, COALESCE(?, datetime('now')))
    `).run(sessionId, userId, title || 'New Chat', created_at || null);

    const session = db.prepare('SELECT * FROM ai_sessions WHERE id = ?').get(sessionId);
    res.status(201).json({ success: true, data: session });
  } catch (error) {
    console.error('Create AI session error:', error);
    res.status(500).json({ success: false, error: 'Failed to create AI session.' });
  }
});

/**
 * DELETE /sessions/:id
 * Delete an AI chat session and cascade delete all its messages.
 */
router.delete('/sessions/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const userId = req.user!.userId;
    const { id } = req.params;

    // Verify ownership
    const session = db.prepare('SELECT * FROM ai_sessions WHERE id = ? AND user_id = ?').get(id, userId);
    if (!session) {
      res.status(404).json({ success: false, error: 'AI session not found.' });
      return;
    }

    // Delete messages first, then the session (cascade should handle this, but be explicit)
    const deleteTransaction = db.transaction(() => {
      db.prepare('DELETE FROM ai_messages WHERE session_id = ?').run(id);
      db.prepare('DELETE FROM ai_sessions WHERE id = ?').run(id);
    });

    deleteTransaction();

    res.json({ success: true, data: { id } });
  } catch (error) {
    console.error('Delete AI session error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete AI session.' });
  }
});

/**
 * GET /sessions/:id/messages
 * Get all messages for a specific AI chat session.
 */
router.get('/sessions/:id/messages', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const userId = req.user!.userId;
    const { id } = req.params;

    // Verify session ownership
    const session = db.prepare('SELECT * FROM ai_sessions WHERE id = ? AND user_id = ?').get(id, userId);
    if (!session) {
      res.status(404).json({ success: false, error: 'AI session not found.' });
      return;
    }

    const messages = db.prepare('SELECT * FROM ai_messages WHERE session_id = ? ORDER BY created_at ASC')
      .all(id);

    res.json({ success: true, data: messages });
  } catch (error) {
    console.error('Get AI messages error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch AI messages.' });
  }
});

/**
 * POST /sessions/:id/messages
 * Add a new message to an AI chat session.
 */
router.post('/sessions/:id/messages', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const userId = req.user!.userId;
    const { id: sessionId } = req.params;

    // Verify session ownership
    const session = db.prepare('SELECT * FROM ai_sessions WHERE id = ? AND user_id = ?').get(sessionId, userId);
    if (!session) {
      res.status(404).json({ success: false, error: 'AI session not found.' });
      return;
    }

    const { id, sender, text, created_at } = req.body;
    const messageId = id || uuidv4();

    db.prepare(`
      INSERT INTO ai_messages (id, session_id, sender, text, created_at)
      VALUES (?, ?, ?, ?, COALESCE(?, datetime('now')))
    `).run(messageId, sessionId, sender || 'user', text || '', created_at || null);

    const message = db.prepare('SELECT * FROM ai_messages WHERE id = ?').get(messageId);
    res.status(201).json({ success: true, data: message });
  } catch (error) {
    console.error('Create AI message error:', error);
    res.status(500).json({ success: false, error: 'Failed to create AI message.' });
  }
});

export default router;
