import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import { scheduleTaskJob, cancelTaskJob } from '../taskScheduler.js';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

/**
 * GET /
 * List tasks for the authenticated user.
 * Query params: status, priority, workspace_id
 */
router.get('/', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const userId = req.user!.userId;
    const { status, priority, workspace_id } = req.query;

    let query = 'SELECT * FROM tasks WHERE user_id = ?';
    const params: any[] = [userId];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    if (priority) {
      query += ' AND priority = ?';
      params.push(priority);
    }

    if (workspace_id) {
      query += ' AND workspace_id = ?';
      params.push(workspace_id);
    }

    query += ' ORDER BY created_at DESC';

    const tasks = db.prepare(query).all(...params);
    res.json({ success: true, data: tasks });
  } catch (error) {
    console.error('List tasks error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch tasks.' });
  }
});

/**
 * POST /
 * Create a new task.
 */
router.post('/', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const userId = req.user!.userId;
    const {
      id,
      note_id,
      title,
      status,
      priority,
      due_date,
      workspace_id,
      project_id,
      source,
      external_id,
      external_url,
      external_status,
      created_at,
      updated_at,
    } = req.body;

    // Input validation
    const VALID_STATUSES = ['todo', 'in_progress', 'done', 'blocked'];
    const VALID_PRIORITIES = ['low', 'medium', 'high'];
    if (status && !VALID_STATUSES.includes(status)) {
      res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
      return;
    }
    if (priority && !VALID_PRIORITIES.includes(priority)) {
      res.status(400).json({ success: false, error: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}` });
      return;
    }

    const taskId = id || uuidv4();

    db.prepare(`
      INSERT INTO tasks (id, user_id, note_id, title, status, priority, due_date, workspace_id, project_id, source, external_id, external_url, external_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))
    `).run(
      taskId, userId,
      note_id || null,
      title || '',
      status || 'todo',
      priority || 'medium',
      due_date || null,
      workspace_id || null,
      project_id || null,
      source || 'local',
      external_id || null,
      external_url || null,
      external_status || null,
      created_at || null,
      updated_at || null,
    );

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    if (task) {
      scheduleTaskJob(task as any);
    }
    res.status(201).json({ success: true, data: task });
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ success: false, error: 'Failed to create task.' });
  }
});

/**
 * PUT /:id
 * Update an existing task, verifying user ownership.
 */
router.put('/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const userId = req.user!.userId;
    const { id } = req.params;

    // Verify ownership
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, userId);
    if (!existing) {
      res.status(404).json({ success: false, error: 'Task not found.' });
      return;
    }

    const {
      note_id,
      title,
      status,
      priority,
      due_date,
      workspace_id,
      project_id,
      source,
      external_id,
      external_url,
      external_status,
      updated_at,
    } = req.body;

    // Input validation
    const VALID_STATUSES = ['todo', 'in_progress', 'done', 'blocked'];
    const VALID_PRIORITIES = ['low', 'medium', 'high'];
    if (status && !VALID_STATUSES.includes(status)) {
      res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
      return;
    }
    if (priority && !VALID_PRIORITIES.includes(priority)) {
      res.status(400).json({ success: false, error: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}` });
      return;
    }

    db.prepare(`
      UPDATE tasks SET
        note_id = COALESCE(?, note_id),
        title = COALESCE(?, title),
        status = COALESCE(?, status),
        priority = COALESCE(?, priority),
        due_date = COALESCE(?, due_date),
        workspace_id = COALESCE(?, workspace_id),
        project_id = COALESCE(?, project_id),
        source = COALESCE(?, source),
        external_id = COALESCE(?, external_id),
        external_url = COALESCE(?, external_url),
        external_status = COALESCE(?, external_status),
        updated_at = COALESCE(?, datetime('now'))
      WHERE id = ? AND user_id = ?
    `).run(
      note_id ?? null,
      title ?? null,
      status ?? null,
      priority ?? null,
      due_date ?? null,
      workspace_id ?? null,
      project_id ?? null,
      source ?? null,
      external_id ?? null,
      external_url ?? null,
      external_status ?? null,
      updated_at ?? null,
      id,
      userId,
    );

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    if (task) {
      scheduleTaskJob(task as any);
    }
    res.json({ success: true, data: task });
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ success: false, error: 'Failed to update task.' });
  }
});

/**
 * DELETE /:id
 * Delete a task, verifying user ownership.
 */
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const userId = req.user!.userId;
    const { id } = req.params;

    const result = db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').run(id, userId);

    if (result.changes === 0) {
      res.status(404).json({ success: false, error: 'Task not found.' });
      return;
    }

    cancelTaskJob(id);
    res.json({ success: true, data: { id } });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete task.' });
  }
});

export default router;
