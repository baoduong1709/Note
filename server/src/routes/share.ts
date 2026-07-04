import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database.js';
import { broadcastShare } from '../websocket.js';

const router = Router();

// No authentication required — share data is public by syncId

/**
 * GET /:syncId
 * Get ALL share entries for a sync channel, ordered by newest first.
 */
router.get('/:syncId', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { syncId } = req.params;

    const items = db.prepare(
      'SELECT * FROM share_data WHERE sync_id = ? ORDER BY created_at DESC LIMIT 50'
    ).all(syncId);

    // Return the latest item as `data` (backward-compatible) + full history
    res.json({
      success: true,
      data: items.length > 0 ? items[0] : null,
      history: items,
    });
  } catch (error) {
    console.error('Get share data error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch share data.' });
  }
});

/**
 * PUT /:syncId
 * Append new share entry to the sync channel (no longer overwrites).
 */
router.put('/:syncId', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { syncId } = req.params;
    const { type, content, user_email, user_name } = req.body;

    const id = uuidv4();

    // Always insert a new record — keep history
    db.prepare(`
      INSERT INTO share_data (id, sync_id, type, content, user_email, user_name)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      syncId,
      type || 'text',
      content || '',
      user_email || null,
      user_name || null,
    );

    // Clean up old entries — keep latest 50 per channel
    db.prepare(`
      DELETE FROM share_data WHERE sync_id = ? AND id NOT IN (
        SELECT id FROM share_data WHERE sync_id = ? ORDER BY created_at DESC LIMIT 50
      )
    `).run(syncId, syncId);

    const data = db.prepare('SELECT * FROM share_data WHERE id = ?').get(id);
    // Broadcast new share to all WebSocket subscribers
    broadcastShare(syncId, data);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Create share data error:', error);
    res.status(500).json({ success: false, error: 'Failed to save share data.' });
  }
});

/**
 * DELETE /:syncId/:id
 * Delete a specific share entry.
 */
router.delete('/:syncId/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { syncId, id } = req.params;

    const result = db.prepare('DELETE FROM share_data WHERE id = ? AND sync_id = ?').run(id, syncId);

    if (result.changes === 0) {
      res.status(404).json({ success: false, error: 'Share data not found.' });
      return;
    }

    res.json({ success: true, data: { id, syncId } });
  } catch (error) {
    console.error('Delete share data error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete share data.' });
  }
});

/**
 * DELETE /:syncId
 * Delete ALL share entries for a channel.
 */
router.delete('/:syncId', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { syncId } = req.params;

    db.prepare('DELETE FROM share_data WHERE sync_id = ?').run(syncId);
    res.json({ success: true, data: { syncId } });
  } catch (error) {
    console.error('Delete share channel error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete share data.' });
  }
});

export default router;
