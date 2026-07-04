import { Router, Request, Response } from 'express';
import { getDatabase } from '../database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// ---------------------------------------------------------------------------
// Whitelist of tables that can be synced via delta endpoints.
// Maps table name to its column list (used for INSERT OR REPLACE).
// ---------------------------------------------------------------------------
const SYNCABLE_TABLES: Record<string, string[]> = {
  notes: [
    'id', 'user_id', 'workspace_id', 'project_id', 'title', 'content',
    'type', 'is_locked', 'created_at', 'updated_at',
  ],
  tasks: [
    'id', 'user_id', 'note_id', 'title', 'status', 'priority', 'due_date',
    'workspace_id', 'project_id', 'source', 'external_id', 'external_url',
    'external_status', 'created_at', 'updated_at',
  ],
  calendar_events: [
    'id', 'user_id', 'title', 'event_type', 'date_type', 'solar_date',
    'lunar_day', 'lunar_month', 'lunar_year', 'is_lunar_leap',
    'repeat_yearly', 'is_important', 'notes', 'created_at', 'updated_at',
  ],
  ai_sessions: [
    'id', 'user_id', 'title', 'created_at',
  ],
  ai_messages: [
    'id', 'session_id', 'sender', 'text', 'created_at',
  ],
};

// Tables that use user_id for ownership
const TABLES_WITH_USER_ID = ['notes', 'tasks', 'calendar_events', 'ai_sessions'];

// ---------------------------------------------------------------------------
// Helper: map camelCase keys from client to snake_case columns
// ---------------------------------------------------------------------------
function camelToSnake(key: string): string {
  return key.replace(/([A-Z])/g, '_$1').toLowerCase();
}

function normalizeRecord(data: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    result[camelToSnake(key)] = value;
  }
  return result;
}

// =====================================================================
// POST /push — Full sync push (existing, for initial sync / new device)
// =====================================================================
router.post('/push', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const userId = req.user!.userId;
    const {
      notes = [],
      tasks = [],
      calendarEvents = [],
      aiSessions = [],
      aiMessages = [],
    } = req.body;

    const syncTransaction = db.transaction(() => {
      // Delete all existing user data
      db.prepare('DELETE FROM ai_messages WHERE session_id IN (SELECT id FROM ai_sessions WHERE user_id = ?)').run(userId);
      db.prepare('DELETE FROM ai_sessions WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM tasks WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM notes WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM calendar_events WHERE user_id = ?').run(userId);

      // Re-insert notes
      const insertNote = db.prepare(`
        INSERT INTO notes (id, user_id, workspace_id, project_id, title, content, type, is_locked, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const note of notes) {
        insertNote.run(
          note.id, userId,
          note.workspace_id || note.workspaceId || null,
          note.project_id || note.projectId || null,
          note.title || '',
          note.content || '',
          note.type || null,
          note.is_locked || note.isLocked ? 1 : 0,
          note.created_at || note.createdAt || new Date().toISOString(),
          note.updated_at || note.updatedAt || new Date().toISOString(),
        );
      }

      // Re-insert tasks
      const insertTask = db.prepare(`
        INSERT INTO tasks (id, user_id, note_id, title, status, priority, due_date, workspace_id, project_id, source, external_id, external_url, external_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const task of tasks) {
        insertTask.run(
          task.id, userId,
          task.note_id || task.noteId || null,
          task.title || '',
          task.status || 'todo',
          task.priority || 'medium',
          task.due_date || task.dueDate || null,
          task.workspace_id || task.workspaceId || null,
          task.project_id || task.projectId || null,
          task.source || 'local',
          task.external_id || task.externalId || null,
          task.external_url || task.externalUrl || null,
          task.external_status || task.externalStatus || null,
          task.created_at || task.createdAt || new Date().toISOString(),
          task.updated_at || task.updatedAt || new Date().toISOString(),
        );
      }

      // Re-insert calendar events
      const insertEvent = db.prepare(`
        INSERT INTO calendar_events (id, user_id, title, event_type, date_type, solar_date, lunar_day, lunar_month, lunar_year, is_lunar_leap, repeat_yearly, is_important, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const event of calendarEvents) {
        insertEvent.run(
          event.id, userId,
          event.title || '',
          event.event_type || event.eventType || 'other',
          event.date_type || event.dateType || 'solar',
          event.solar_date || event.solarDate || null,
          event.lunar_day ?? event.lunarDay ?? null,
          event.lunar_month ?? event.lunarMonth ?? null,
          event.lunar_year ?? event.lunarYear ?? null,
          event.is_lunar_leap || event.isLunarLeap ? 1 : 0,
          (event.repeat_yearly !== undefined ? event.repeat_yearly : event.repeatYearly !== undefined ? event.repeatYearly : 1) ? 1 : 0,
          (event.is_important !== undefined ? event.is_important : event.isImportant !== undefined ? event.isImportant : 1) ? 1 : 0,
          event.notes || null,
          event.created_at || event.createdAt || new Date().toISOString(),
          event.updated_at || event.updatedAt || new Date().toISOString(),
        );
      }

      // Re-insert AI sessions
      const insertSession = db.prepare(`
        INSERT INTO ai_sessions (id, user_id, title, created_at)
        VALUES (?, ?, ?, ?)
      `);
      for (const session of aiSessions) {
        insertSession.run(
          session.id, userId,
          session.title || 'New Chat',
          session.created_at || session.createdAt || new Date().toISOString(),
        );
      }

      // Re-insert AI messages
      const insertMessage = db.prepare(`
        INSERT INTO ai_messages (id, session_id, sender, text, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const msg of aiMessages) {
        insertMessage.run(
          msg.id,
          msg.session_id || msg.sessionId,
          msg.sender || 'user',
          msg.text || '',
          msg.created_at || msg.createdAt || new Date().toISOString(),
        );
      }
    });

    syncTransaction();

    res.json({
      success: true,
      data: {
        synced: {
          notes: notes.length,
          tasks: tasks.length,
          calendarEvents: calendarEvents.length,
          aiSessions: aiSessions.length,
          aiMessages: aiMessages.length,
        },
      },
    });
  } catch (error) {
    console.error('Sync push error:', error);
    res.status(500).json({ success: false, error: 'Failed to push sync data.' });
  }
});

// =====================================================================
// GET /pull — Full pull (existing, for initial sync / new device)
// =====================================================================
router.get('/pull', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const userId = req.user!.userId;

    const notes = db.prepare('SELECT * FROM notes WHERE user_id = ? ORDER BY updated_at DESC').all(userId);
    const tasks = db.prepare('SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC').all(userId);
    const calendarEvents = db.prepare('SELECT * FROM calendar_events WHERE user_id = ? ORDER BY solar_date ASC').all(userId);
    const aiSessions = db.prepare('SELECT * FROM ai_sessions WHERE user_id = ? ORDER BY created_at DESC').all(userId);

    // Get all messages for the user's sessions
    const sessionIds = (aiSessions as any[]).map((s: any) => s.id);
    let aiMessages: any[] = [];
    if (sessionIds.length > 0) {
      const placeholders = sessionIds.map(() => '?').join(',');
      aiMessages = db.prepare(`SELECT * FROM ai_messages WHERE session_id IN (${placeholders}) ORDER BY created_at ASC`)
        .all(...sessionIds);
    }

    res.json({
      success: true,
      data: {
        notes,
        tasks,
        calendarEvents,
        aiSessions,
        aiMessages,
        serverTime: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Sync pull error:', error);
    res.status(500).json({ success: false, error: 'Failed to pull sync data.' });
  }
});

// =====================================================================
// GET /status — Sync status (includes all tables)
// =====================================================================
router.get('/status', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const userId = req.user!.userId;

    const noteMax = db.prepare('SELECT MAX(updated_at) as max_updated FROM notes WHERE user_id = ?')
      .get(userId) as any;
    const taskMax = db.prepare('SELECT MAX(updated_at) as max_updated FROM tasks WHERE user_id = ?')
      .get(userId) as any;
    const calendarMax = db.prepare('SELECT MAX(updated_at) as max_updated FROM calendar_events WHERE user_id = ?')
      .get(userId) as any;
    const aiSessionMax = db.prepare('SELECT MAX(created_at) as max_updated FROM ai_sessions WHERE user_id = ?')
      .get(userId) as any;

    const dates = [
      noteMax?.max_updated,
      taskMax?.max_updated,
      calendarMax?.max_updated,
      aiSessionMax?.max_updated,
    ].filter(Boolean);
    const lastUpdated = dates.length > 0 ? dates.sort().pop() : null;

    res.json({ success: true, data: { lastUpdated } });
  } catch (error) {
    console.error('Sync status error:', error);
    res.status(500).json({ success: false, error: 'Failed to get sync status.' });
  }
});

// =====================================================================
// POST /delta-push — Receive an array of granular changes (upsert/delete)
// =====================================================================
interface DeltaChange {
  action: 'upsert' | 'delete';
  table: string;
  id?: string;            // required for delete
  data?: Record<string, any>; // required for upsert
}

router.post('/delta-push', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const userId = req.user!.userId;
    const { changes } = req.body as { changes: DeltaChange[] };

    if (!Array.isArray(changes) || changes.length === 0) {
      res.status(400).json({ success: false, error: 'No changes provided.' });
      return;
    }

    const stats = { upserted: 0, deleted: 0, skipped: 0 };

    const deltaTransaction = db.transaction(() => {
      for (const change of changes) {
        const tableName = change.table;

        // Validate table name against whitelist
        if (!SYNCABLE_TABLES[tableName]) {
          console.warn(`[DeltaPush] Skipping unknown table: ${tableName}`);
          continue;
        }

        if (change.action === 'upsert' && change.data) {
          const normalized = normalizeRecord(change.data);

          // --- Ownership check for tables with user_id ---
          if (TABLES_WITH_USER_ID.includes(tableName)) {
            normalized.user_id = userId;

            // Check if record already exists and belongs to another user
            if (normalized.id) {
              const existing = db.prepare(`SELECT user_id FROM ${tableName} WHERE id = ?`).get(normalized.id) as any;
              if (existing && existing.user_id !== userId) {
                console.warn(`[DeltaPush] Ownership mismatch: ${tableName}/${normalized.id} belongs to another user, skipping.`);
                stats.skipped++;
                continue;
              }
            }
          }

          // --- Ownership check for ai_messages: session must belong to current user ---
          if (tableName === 'ai_messages') {
            const sessionId = normalized.session_id;
            if (sessionId) {
              const sessionOwner = db.prepare('SELECT user_id FROM ai_sessions WHERE id = ?').get(sessionId) as any;
              if (!sessionOwner || sessionOwner.user_id !== userId) {
                console.warn(`[DeltaPush] ai_messages: session ${sessionId} does not belong to user ${userId}, skipping.`);
                stats.skipped++;
                continue;
              }
            }
          }

          // Always refresh updated_at for tables that have it
          const cols = SYNCABLE_TABLES[tableName];
          if (cols.includes('updated_at')) {
            normalized.updated_at = new Date().toISOString();
          }

          // Build column list from the table schema, only include columns that have values
          const columnsToInsert = cols.filter(
            (col) => normalized[col] !== undefined,
          );
          const placeholders = columnsToInsert.map(() => '?').join(', ');
          const values = columnsToInsert.map((col) => normalized[col] ?? null);

          const sql = `INSERT OR REPLACE INTO ${tableName} (${columnsToInsert.join(', ')}) VALUES (${placeholders})`;
          db.prepare(sql).run(...values);
          stats.upserted++;

        } else if (change.action === 'delete') {
          const recordId = change.id || change.data?.id;
          if (!recordId) {
            console.warn(`[DeltaPush] Delete missing id for table: ${tableName}`);
            continue;
          }

          // Delete the actual record (with ownership check)
          if (tableName === 'ai_messages') {
            // Only delete if the message's session belongs to the current user
            db.prepare(`DELETE FROM ai_messages WHERE id = ? AND session_id IN (SELECT id FROM ai_sessions WHERE user_id = ?)`).run(recordId, userId);
          } else {
            db.prepare(`DELETE FROM ${tableName} WHERE id = ? AND user_id = ?`).run(recordId, userId);
          }

          // Record deletion in tombstones for other devices to pick up
          db.prepare(`
            INSERT OR REPLACE INTO sync_tombstones (id, user_id, table_name, deleted_at)
            VALUES (?, ?, ?, datetime('now'))
          `).run(recordId, userId, tableName);

          stats.deleted++;
        }
      }
    });

    deltaTransaction();

    res.json({
      success: true,
      data: {
        ...stats,
        serverTime: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Delta push error:', error);
    res.status(500).json({ success: false, error: 'Failed to process delta push.' });
  }
});

// =====================================================================
// GET /delta-pull?since=<ISO_TIMESTAMP> — Pull only records changed
// after the given timestamp
// =====================================================================
router.get('/delta-pull', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const userId = req.user!.userId;
    const since = (req.query.since as string) || '1970-01-01T00:00:00.000Z';

    // Fetch changed records per table
    const notes = db.prepare(
      'SELECT * FROM notes WHERE user_id = ? AND updated_at > ? ORDER BY updated_at DESC',
    ).all(userId, since);

    const tasks = db.prepare(
      'SELECT * FROM tasks WHERE user_id = ? AND updated_at > ? ORDER BY updated_at DESC',
    ).all(userId, since);

    const calendarEvents = db.prepare(
      'SELECT * FROM calendar_events WHERE user_id = ? AND updated_at > ? ORDER BY updated_at DESC',
    ).all(userId, since);

    const aiSessions = db.prepare(
      'SELECT * FROM ai_sessions WHERE user_id = ? AND created_at > ? ORDER BY created_at DESC',
    ).all(userId, since);

    // For ai_messages, fetch messages belonging to this user's sessions that are newer
    let aiMessages: any[] = [];
    const userSessionIds = (
      db.prepare('SELECT id FROM ai_sessions WHERE user_id = ?').all(userId) as any[]
    ).map((s) => s.id);

    if (userSessionIds.length > 0) {
      const placeholders = userSessionIds.map(() => '?').join(',');
      aiMessages = db.prepare(
        `SELECT * FROM ai_messages WHERE session_id IN (${placeholders}) AND created_at > ? ORDER BY created_at ASC`,
      ).all(...userSessionIds, since);
    }

    // Fetch tombstones (deletions) since the given timestamp
    const deletions = db.prepare(
      'SELECT id, table_name AS "table" FROM sync_tombstones WHERE user_id = ? AND deleted_at > ?',
    ).all(userId, since);

    const serverTime = new Date().toISOString();

    res.json({
      success: true,
      data: {
        notes,
        tasks,
        calendarEvents,
        aiSessions,
        aiMessages,
        deletions,
        serverTime,
      },
    });
  } catch (error) {
    console.error('Delta pull error:', error);
    res.status(500).json({ success: false, error: 'Failed to process delta pull.' });
  }
});

export default router;
