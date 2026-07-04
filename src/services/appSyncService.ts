// App sync service — Delta Sync implementation
// Uses delta push/pull for incremental sync, falls back to full sync for first-time devices.
import { getDatabase } from "../database/db";
import { getNotes, Note } from "../database/queries/notes";
import { getTasks, Task } from "../database/queries/tasks";
import { getCalendarEvents, CalendarEvent } from "../database/queries/calendarEvents";
import { getAISessions, AISession } from "../database/queries/aiChat";
import { generateSyncIdFromEmail, getStoredUser } from "./shareService";
import { apiRequest, getAuthToken } from "./apiClient";

// ---------------------------------------------------------------------------
// Local deletion tracking for delta sync
// ---------------------------------------------------------------------------

// Track deleted records for sync
function trackDeletion(table: string, id: string): void {
  const deletions = JSON.parse(localStorage.getItem('sync_deletions') || '[]');
  deletions.push({ table, id, deletedAt: new Date().toISOString() });
  localStorage.setItem('sync_deletions', JSON.stringify(deletions));
}

function getPendingDeletions(): Array<{ table: string; id: string }> {
  return JSON.parse(localStorage.getItem('sync_deletions') || '[]');
}

function clearPendingDeletions(): void {
  localStorage.removeItem('sync_deletions');
}

export { trackDeletion };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncPayload {
  notes: Note[];
  tasks: Task[];
  calendarEvents?: CalendarEvent[];
  aiSessions?: AISession[];
  aiMessages?: any[];
  lastUpdated: number;
}

interface DeltaChange {
  action: "upsert" | "delete";
  table: string;
  id?: string;
  data?: Record<string, any>;
}

interface DeltaPullResponse {
  success: boolean;
  data: {
    notes: any[];
    tasks: any[];
    calendarEvents: any[];
    aiSessions: any[];
    aiMessages: any[];
    deletions: Array<{ id: string; table: string }>;
    serverTime: string;
  };
}

// ---------------------------------------------------------------------------
// Sync ID helper (kept for backward compatibility)
// ---------------------------------------------------------------------------

export async function getAppSyncId(): Promise<string | null> {
  const user = getStoredUser();
  if (!user) return null;
  const baseId = await generateSyncIdFromEmail(user.email);
  return `${baseId}_app`;
}

// ---------------------------------------------------------------------------
// Last sync time helpers
// ---------------------------------------------------------------------------

function getLastSyncTime(): string | null {
  return localStorage.getItem("last_sync_time");
}

function setLastSyncTime(isoTimestamp: string): void {
  localStorage.setItem("last_sync_time", isoTimestamp);
}

// ---------------------------------------------------------------------------
// Delta Push — send only pending local changes to server
// ---------------------------------------------------------------------------

async function pushChanges(): Promise<void> {
  const db = await getDatabase();
  const changes: DeltaChange[] = [];

  // Collect pending notes
  const pendingNotes = await db.select<Note[]>(
    "SELECT * FROM notes WHERE is_pending_sync = 1",
  );
  for (const note of pendingNotes) {
    changes.push({ action: "upsert", table: "notes", data: { ...note } });
  }

  // Collect pending tasks
  const pendingTasks = await db.select<Task[]>(
    "SELECT * FROM tasks WHERE is_pending_sync = 1",
  );
  for (const task of pendingTasks) {
    changes.push({ action: "upsert", table: "tasks", data: { ...task } });
  }

  // Calendar events, AI sessions, and AI messages don't have is_pending_sync.
  // They are only synced via full sync. Future improvement: add is_pending_sync
  // to these tables as well.

  // Collect pending deletions tracked locally
  const deletions = getPendingDeletions();
  for (const del of deletions) {
    changes.push({ action: 'delete' as const, table: del.table, id: del.id });
  }

  if (changes.length === 0) {
    console.log("[AppSync] No pending changes to push.");
    return;
  }

  console.log(`[AppSync] Delta pushing ${changes.length} change(s)...`);

  await apiRequest("/api/sync/delta-push", {
    method: "POST",
    body: JSON.stringify({ changes }),
  });

  // Mark records as synced after successful push
  for (const note of pendingNotes) {
    await db.execute("UPDATE notes SET is_pending_sync = 0 WHERE id = ?", [
      note.id,
    ]);
  }
  for (const task of pendingTasks) {
    await db.execute("UPDATE tasks SET is_pending_sync = 0 WHERE id = ?", [
      task.id,
    ]);
  }

  // Clear deletion tracking after successful push
  clearPendingDeletions();

  console.log("[AppSync] Delta push completed successfully.");
}

// ---------------------------------------------------------------------------
// Delta Pull — fetch only records changed since last sync
// ---------------------------------------------------------------------------

async function pullChanges(): Promise<boolean> {
  const lastSyncTime = getLastSyncTime() || "1970-01-01T00:00:00.000Z";

  const result = await apiRequest<DeltaPullResponse>(
    `/api/sync/delta-pull?since=${encodeURIComponent(lastSyncTime)}`,
    { method: "GET" },
  );

  if (!result.success || !result.data) {
    console.warn("[AppSync] Delta pull returned no data.");
    return false;
  }

  const {
    notes,
    tasks,
    calendarEvents,
    aiSessions,
    aiMessages,
    deletions,
    serverTime,
  } = result.data;

  const db = await getDatabase();
  let hasChanges = false;

  // Upsert notes
  for (const note of notes) {
    await db.execute(
      `INSERT OR REPLACE INTO notes (id, workspace_id, project_id, title, content, type, is_locked, is_pending_sync, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        note.id,
        note.workspace_id || null,
        note.project_id || null,
        note.title || "",
        note.content || "",
        note.type || null,
        note.is_locked ?? 0,
        note.created_at || new Date().toISOString(),
        note.updated_at || new Date().toISOString(),
      ],
    );
    hasChanges = true;
  }

  // Upsert tasks
  for (const task of tasks) {
    await db.execute(
      `INSERT OR REPLACE INTO tasks (id, note_id, title, status, priority, due_date, workspace_id, project_id, source, external_id, external_url, external_status, is_pending_sync, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        task.id,
        task.note_id || null,
        task.title || "",
        task.status || "todo",
        task.priority || "medium",
        task.due_date || null,
        task.workspace_id || null,
        task.project_id || null,
        task.source || "local",
        task.external_id || null,
        task.external_url || null,
        task.external_status || null,
        task.created_at || new Date().toISOString(),
        task.updated_at || new Date().toISOString(),
      ],
    );
    hasChanges = true;
  }

  // Upsert calendar events
  for (const event of calendarEvents) {
    await db.execute(
      `INSERT OR REPLACE INTO calendar_events (id, title, event_type, date_type, solar_date, lunar_day, lunar_month, lunar_year, is_lunar_leap, repeat_yearly, is_important, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.id,
        event.title || "",
        event.event_type || "other",
        event.date_type || "solar",
        event.solar_date || null,
        event.lunar_day ?? null,
        event.lunar_month ?? null,
        event.lunar_year ?? null,
        event.is_lunar_leap ?? 0,
        event.repeat_yearly ?? 1,
        event.is_important ?? 1,
        event.notes || null,
        event.created_at || new Date().toISOString(),
        event.updated_at || new Date().toISOString(),
      ],
    );
    hasChanges = true;
  }

  // Upsert AI sessions
  for (const session of aiSessions) {
    await db.execute(
      `INSERT OR REPLACE INTO ai_sessions (id, title, created_at)
       VALUES (?, ?, ?)`,
      [
        session.id,
        session.title || "New Chat",
        session.created_at || new Date().toISOString(),
      ],
    );
    hasChanges = true;
  }

  // Upsert AI messages
  for (const msg of aiMessages) {
    await db.execute(
      `INSERT OR REPLACE INTO ai_messages (id, session_id, sender, text, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        msg.id,
        msg.session_id || null,
        msg.sender || "user",
        msg.text || "",
        msg.created_at || new Date().toISOString(),
      ],
    );
    hasChanges = true;
  }

  // Process deletions from tombstones
  for (const deletion of deletions) {
    const tableMap: Record<string, string> = {
      notes: "notes",
      tasks: "tasks",
      calendar_events: "calendar_events",
      ai_sessions: "ai_sessions",
      ai_messages: "ai_messages",
    };
    const localTable = tableMap[deletion.table];
    if (localTable) {
      await db.execute(`DELETE FROM ${localTable} WHERE id = ?`, [deletion.id]);
      hasChanges = true;
    }
  }

  // Persist the server timestamp so the next pull only fetches newer records
  setLastSyncTime(serverTime);
  console.log(`[AppSync] Delta pull completed. Server time: ${serverTime}`);

  return hasChanges;
}

// ---------------------------------------------------------------------------
// Full Sync — used for initial sync or new device (no last_sync_time)
// ---------------------------------------------------------------------------

async function fullPush(): Promise<void> {
  const notes = await getNotes();
  const tasks = await getTasks();
  const calendarEvents = await getCalendarEvents();
  const aiSessions = await getAISessions();

  await apiRequest("/api/sync/push", {
    method: "POST",
    body: JSON.stringify({
      notes,
      tasks,
      calendarEvents,
      aiSessions,
      aiMessages: [],
      lastUpdated: Date.now(),
    }),
  });

  // Mark everything as synced
  const db = await getDatabase();
  await db.execute("UPDATE notes SET is_pending_sync = 0 WHERE is_pending_sync = 1");
  await db.execute("UPDATE tasks SET is_pending_sync = 0 WHERE is_pending_sync = 1");

  localStorage.setItem("local_last_updated", Date.now().toString());
  console.log("[AppSync] Full push completed successfully.");
}

async function fullPull(): Promise<boolean> {
  const result = await apiRequest<{ success: boolean; data: any }>(
    "/api/sync/pull",
    { method: "GET" },
  );

  if (!result.success || !result.data) {
    // No data on server — push local data to initialize
    await fullPush();
    return false;
  }

  const cloudData = result.data;
  if (!cloudData.notes && !cloudData.tasks) return false;

  const db = await getDatabase();

  // Clear existing local data
  await db.execute("DELETE FROM ai_messages");
  await db.execute("DELETE FROM ai_sessions");
  await db.execute("DELETE FROM tasks");
  await db.execute("DELETE FROM notes");
  await db.execute("DELETE FROM calendar_events");

  // Insert notes from cloud
  for (const note of cloudData.notes || []) {
    await db.execute(
      `INSERT INTO notes (id, workspace_id, project_id, title, content, type, is_locked, is_pending_sync, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        note.id,
        note.workspace_id || null,
        note.project_id || null,
        note.title || "",
        note.content || "",
        note.type || null,
        note.is_locked ?? 0,
        note.created_at || new Date().toISOString(),
        note.updated_at || new Date().toISOString(),
      ],
    );
  }

  // Insert tasks from cloud
  for (const task of cloudData.tasks || []) {
    await db.execute(
      `INSERT INTO tasks (id, note_id, title, status, priority, due_date, workspace_id, project_id, source, external_id, external_url, external_status, is_pending_sync, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        task.id,
        task.note_id || null,
        task.title || "",
        task.status || "todo",
        task.priority || "medium",
        task.due_date || null,
        task.workspace_id || null,
        task.project_id || null,
        task.source || "local",
        task.external_id || null,
        task.external_url || null,
        task.external_status || null,
        task.created_at || new Date().toISOString(),
        task.updated_at || new Date().toISOString(),
      ],
    );
  }

  // Insert calendar events from cloud
  for (const event of cloudData.calendarEvents || []) {
    await db.execute(
      `INSERT INTO calendar_events (id, title, event_type, date_type, solar_date, lunar_day, lunar_month, lunar_year, is_lunar_leap, repeat_yearly, is_important, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.id,
        event.title || "",
        event.event_type || "other",
        event.date_type || "solar",
        event.solar_date || null,
        event.lunar_day ?? null,
        event.lunar_month ?? null,
        event.lunar_year ?? null,
        event.is_lunar_leap ?? 0,
        event.repeat_yearly ?? 1,
        event.is_important ?? 1,
        event.notes || null,
        event.created_at || new Date().toISOString(),
        event.updated_at || new Date().toISOString(),
      ],
    );
  }

  // Insert AI sessions from cloud
  for (const session of cloudData.aiSessions || []) {
    await db.execute(
      `INSERT INTO ai_sessions (id, title, created_at) VALUES (?, ?, ?)`,
      [
        session.id,
        session.title || "New Chat",
        session.created_at || new Date().toISOString(),
      ],
    );
  }

  // Insert AI messages from cloud
  for (const msg of cloudData.aiMessages || []) {
    await db.execute(
      `INSERT INTO ai_messages (id, session_id, sender, text, created_at) VALUES (?, ?, ?, ?, ?)`,
      [
        msg.id,
        msg.session_id || null,
        msg.sender || "user",
        msg.text || "",
        msg.created_at || new Date().toISOString(),
      ],
    );
  }

  // Set the sync time to now so subsequent syncs use delta
  setLastSyncTime(cloudData.serverTime || new Date().toISOString());
  localStorage.setItem("local_last_updated", Date.now().toString());
  console.log("[AppSync] Full pull completed successfully.");

  return true;
}

// ---------------------------------------------------------------------------
// Orchestrated sync — the main entry point used by the app
// ---------------------------------------------------------------------------

/**
 * Run a complete sync cycle: push local changes, then pull remote changes.
 * Automatically falls back to full sync when no previous sync timestamp exists.
 */
export async function syncAll(): Promise<boolean> {
  const isFirstSync = getLastSyncTime() === null;

  try {
    if (isFirstSync) {
      console.log("[AppSync] First sync detected — running full sync...");
      return await fullSync();
    }

    // Delta sync: push then pull
    await pushChanges();
    const hasChanges = await pullChanges();
    return hasChanges;
  } catch (error) {
    console.error("[AppSync] Sync failed:", error);
    return false;
  }
}

/**
 * Full sync for initial setup or device migration.
 * Pulls all data from server. If server has nothing, pushes local data first.
 */
export async function fullSync(): Promise<boolean> {
  try {
    const pulled = await fullPull();
    if (!pulled) {
      // Server was empty — we pushed. Now set the sync time.
      setLastSyncTime(new Date().toISOString());
    }
    return pulled;
  } catch (error) {
    console.error("[AppSync] Full sync failed:", error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Backward-compatible exports
// ---------------------------------------------------------------------------

/**
 * Push local data to cloud.
 * Uses delta push if a previous sync exists, otherwise performs a full push.
 */
export async function pushLocalDataToCloud(): Promise<void> {
  const syncId = await getAppSyncId();
  if (!syncId || !getAuthToken()) return;

  try {
    const isFirstSync = getLastSyncTime() === null;
    if (isFirstSync) {
      await fullPush();
      setLastSyncTime(new Date().toISOString());
    } else {
      await pushChanges();
    }
  } catch (err) {
    console.error("[AppSync] Failed to push local data to Cloud:", err);
  }
}

/**
 * Pull cloud data to local.
 * Uses delta pull if a previous sync exists, otherwise performs a full pull.
 */
export async function pullCloudDataToLocal(): Promise<boolean> {
  const syncId = await getAppSyncId();
  if (!syncId || !getAuthToken()) return false;

  try {
    const isFirstSync = getLastSyncTime() === null;
    if (isFirstSync) {
      return await fullPull();
    } else {
      return await pullChanges();
    }
  } catch (err) {
    console.error("[AppSync] Sync failed:", err);
    return false;
  }
}
