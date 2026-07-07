// App sync service — Delta Sync implementation
// Uses delta push/pull for incremental sync, falls back to full sync for first-time devices.
import { getDatabase } from "../database/db";
import { getNotes, Note } from "../database/queries/notes";
import { getTasks, Task } from "../database/queries/tasks";
import { getCalendarEvents, CalendarEvent } from "../database/queries/calendarEvents";
import { getAISessions, AISession } from "../database/queries/aiChat";
import { generateSyncIdFromEmail, getStoredUser } from "./shareService";
import { apiRequest, clearAuthToken, getAuthToken, setAuthToken } from "./apiClient";
import { encryptText, decryptText, isEncrypted } from "../utils/crypto";

function getE2eePassphrase(): string | null {
  const enabled = localStorage.getItem("e2ee_enabled") === "true";
  const passphrase = localStorage.getItem("e2ee_passphrase");
  return enabled && passphrase ? passphrase : null;
}

async function encryptRecord(table: string, data: Record<string, any>, passphrase: string | null): Promise<Record<string, any>> {
  if (!passphrase) return data;
  const cloned = { ...data };
  try {
    if (table === "notes") {
      cloned.title = await encryptText(cloned.title, passphrase);
      cloned.content = await encryptText(cloned.content || "", passphrase);
    } else if (table === "tasks") {
      cloned.title = await encryptText(cloned.title, passphrase);
    } else if (table === "calendar_events") {
      cloned.title = await encryptText(cloned.title, passphrase);
      cloned.notes = await encryptText(cloned.notes || "", passphrase);
    } else if (table === "ai_sessions") {
      cloned.title = await encryptText(cloned.title || "", passphrase);
    } else if (table === "ai_messages") {
      cloned.text = await encryptText(cloned.text || "", passphrase);
    }
  } catch (e) {
    console.error(`[AppSync] Encryption of ${table} failed:`, e);
  }
  return cloned;
}

async function decryptRecord(table: string, data: Record<string, any>, passphrase: string | null): Promise<Record<string, any>> {
  if (!passphrase) return data;
  const cloned = { ...data };
  try {
    if (table === "notes") {
      cloned.title = await decryptText(cloned.title || "", passphrase);
      cloned.content = await decryptText(cloned.content || "", passphrase);
    } else if (table === "tasks") {
      cloned.title = await decryptText(cloned.title || "", passphrase);
    } else if (table === "calendar_events") {
      cloned.title = await decryptText(cloned.title || "", passphrase);
      cloned.notes = await decryptText(cloned.notes || "", passphrase);
    } else if (table === "ai_sessions") {
      cloned.title = await decryptText(cloned.title || "", passphrase);
    } else if (table === "ai_messages") {
      cloned.text = await decryptText(cloned.text || "", passphrase);
    }
  } catch (e) {
    console.warn(`[AppSync] Decryption of ${table} failed:`, e);
  }
  return cloned;
}

// ---------------------------------------------------------------------------
// Local deletion tracking for delta sync
// ---------------------------------------------------------------------------

type PendingDeletion = { table: string; id: string; deletedAt?: string };
type PendingUpsert = { table: string; id: string; updatedAt?: string };

// Track deleted records for sync
function trackDeletion(table: string, id: string): void {
  const deletions = getPendingDeletions();
  deletions.push({ table, id, deletedAt: new Date().toISOString() });
  localStorage.setItem('sync_deletions', JSON.stringify(deletions));
}

function getPendingDeletions(): PendingDeletion[] {
  return readJsonArray<PendingDeletion>('sync_deletions');
}

function clearPendingDeletions(): void {
  localStorage.removeItem('sync_deletions');
}

function readJsonArray<T>(key: string): T[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function trackUpsert(table: string, id: string): void {
  const upserts = getPendingUpserts().filter(
    (item) => !(item.table === table && item.id === id),
  );
  upserts.push({ table, id, updatedAt: new Date().toISOString() });
  localStorage.setItem("sync_upserts", JSON.stringify(upserts));
}

function getPendingUpserts(): PendingUpsert[] {
  return readJsonArray<PendingUpsert>("sync_upserts");
}

function clearPendingUpserts(): void {
  localStorage.removeItem("sync_upserts");
}

function removeSentPendingUpserts(sent: PendingUpsert[]): void {
  if (sent.length === 0) return;
  const remaining = getPendingUpserts().filter(
    (pending) =>
      !sent.some(
        (item) =>
          item.table === pending.table &&
          item.id === pending.id &&
          item.updatedAt === pending.updatedAt,
      ),
  );
  if (remaining.length > 0) {
    localStorage.setItem("sync_upserts", JSON.stringify(remaining));
  } else {
    clearPendingUpserts();
  }
}

function removeSentPendingDeletions(sent: PendingDeletion[]): void {
  if (sent.length === 0) return;
  const remaining = getPendingDeletions().filter(
    (pending) =>
      !sent.some(
        (item) =>
          item.table === pending.table &&
          item.id === pending.id &&
          item.deletedAt === pending.deletedAt,
      ),
  );
  if (remaining.length > 0) {
    localStorage.setItem("sync_deletions", JSON.stringify(remaining));
  } else {
    clearPendingDeletions();
  }
}

async function ensureCloudAuth(): Promise<boolean> {
  const user = getStoredUser();
  if (!user) return false;

  const existingToken = getAuthToken();
  if (existingToken) {
    const tokenEmail = getTokenEmail(existingToken);
    if (tokenEmail && tokenEmail.trim().toLowerCase() === user.email.trim().toLowerCase()) {
      return true;
    }
    clearAuthToken();
  }

  try {
    const result = await apiRequest<{ success: boolean; token?: string }>("/api/auth/google", {
      method: "POST",
      body: JSON.stringify({ email: user.email, name: user.name }),
    });

    if (result.success && result.token) {
      setAuthToken(result.token);
      return true;
    }
  } catch (err) {
    console.warn("[AppSync] Unable to restore cloud auth token:", err);
  }

  return Boolean(getAuthToken());
}

function getTokenEmail(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = JSON.parse(atob(padded)) as { email?: string };
    return decoded.email || null;
  } catch {
    return null;
  }
}

function getAIChatBackfillKey(): string | null {
  const user = getStoredUser();
  if (!user) return null;
  return `ai_chat_sync_backfill_done:${user.email.trim().toLowerCase()}`;
}

function isAIChatBackfillDone(): boolean {
  const key = getAIChatBackfillKey();
  return key ? localStorage.getItem(key) === "true" : true;
}

function markAIChatBackfillDone(): void {
  const key = getAIChatBackfillKey();
  if (key) {
    localStorage.setItem(key, "true");
  }
}

export { trackDeletion, trackUpsert, isAIChatBackfillDone, markAIChatBackfillDone };

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

async function upsertAISessionPreservingMessages(
  db: Awaited<ReturnType<typeof getDatabase>>,
  session: { id?: string; title?: string; created_at?: string; createdAt?: string },
): Promise<void> {
  if (!session.id) return;

  const existing = await db.select<any[]>(
    "SELECT id FROM ai_sessions WHERE id = ?",
    [session.id],
  );

  if (existing.length > 0) {
    await db.execute("UPDATE ai_sessions SET title = ? WHERE id = ?", [
      session.title || "New Chat",
      session.id,
    ]);
    return;
  }

  await db.execute(
    "INSERT INTO ai_sessions (id, title, created_at) VALUES (?, ?, ?)",
    [
      session.id,
      session.title || "New Chat",
      session.created_at || session.createdAt || new Date().toISOString(),
    ],
  );
}

// ---------------------------------------------------------------------------
// Delta Push — send only pending local changes to server
// ---------------------------------------------------------------------------

async function pushChanges(): Promise<void> {
  const db = await getDatabase();
  const changes: DeltaChange[] = [];
  const sentUpserts: PendingUpsert[] = [];
  const seenUpsertKeys = new Set<string>();

  const passphrase = getE2eePassphrase();

  const addUpsertChange = async (table: string, data: Record<string, any>) => {
    if (!data.id) return;
    const key = `${table}:${data.id}`;
    if (seenUpsertKeys.has(key)) return;
    seenUpsertKeys.add(key);
    const encryptedData = await encryptRecord(table, data, passphrase);
    changes.push({ action: "upsert", table, data: encryptedData });
  };

  // Collect pending notes
  const pendingNotes = await db.select<Note[]>(
    "SELECT * FROM notes WHERE is_pending_sync = 1",
  );
  for (const note of pendingNotes) {
    await addUpsertChange("notes", note);
  }

  // Collect pending tasks
  const pendingTasks = await db.select<Task[]>(
    "SELECT * FROM tasks WHERE is_pending_sync = 1",
  );
  for (const task of pendingTasks) {
    await addUpsertChange("tasks", task);
  }

  const shouldBackfillAIChat = !isAIChatBackfillDone();
  if (shouldBackfillAIChat) {
    const aiSessions = await db.select<Record<string, any>[]>(
      "SELECT * FROM ai_sessions ORDER BY created_at ASC",
    );
    for (const session of aiSessions) {
      await addUpsertChange("ai_sessions", session);
    }

    const aiMessages = await db.select<Record<string, any>[]>(
      "SELECT * FROM ai_messages ORDER BY created_at ASC",
    );
    for (const message of aiMessages) {
      await addUpsertChange("ai_messages", message);
    }
  }

  // Calendar events, AI sessions, and AI messages don't have is_pending_sync.
  // They are tracked through localStorage pending-upsert markers.
  const pendingUpserts = getPendingUpserts();
  const trackedTables = new Set(["calendar_events", "ai_sessions", "ai_messages"]);
  for (const item of pendingUpserts) {
    if (!trackedTables.has(item.table)) continue;

    const rows = await db.select<Record<string, any>[]>(
      `SELECT * FROM ${item.table} WHERE id = ?`,
      [item.id],
    );
    if (rows.length > 0) {
      if (item.table === "ai_messages" && rows[0].session_id) {
        const sessions = await db.select<Record<string, any>[]>(
          "SELECT * FROM ai_sessions WHERE id = ?",
          [rows[0].session_id],
        );
        if (sessions.length > 0) {
          await addUpsertChange("ai_sessions", sessions[0]);
        }
      }
      await addUpsertChange(item.table, rows[0]);
      sentUpserts.push(item);
    }
  }

  // Collect pending deletions tracked locally
  const deletions = getPendingDeletions();
  for (const del of deletions) {
    changes.push({ action: 'delete' as const, table: del.table, id: del.id });
  }

  if (changes.length === 0) {
    if (shouldBackfillAIChat) {
      markAIChatBackfillDone();
    }
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
    await db.execute("UPDATE notes SET is_pending_sync = 0 WHERE id = ? AND updated_at = ?", [
      note.id,
      note.updated_at || null,
    ]);
  }
  for (const task of pendingTasks) {
    await db.execute("UPDATE tasks SET is_pending_sync = 0 WHERE id = ? AND updated_at = ?", [
      task.id,
      task.updated_at || null,
    ]);
  }

  // Clear only markers included in this request. New markers created while
  // this request was in flight must stay queued for the next run.
  removeSentPendingUpserts(sentUpserts);
  removeSentPendingDeletions(deletions);
  if (shouldBackfillAIChat) {
    markAIChatBackfillDone();
  }

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
  const passphrase = getE2eePassphrase();

  // Upsert notes
  for (const note of notes) {
    const decrypted = await decryptRecord("notes", note, passphrase);
    await db.execute(
      `INSERT OR REPLACE INTO notes (id, workspace_id, project_id, title, content, type, is_locked, is_pending_sync, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        decrypted.id,
        decrypted.workspace_id || null,
        decrypted.project_id || null,
        decrypted.title || "",
        decrypted.content || "",
        decrypted.type || null,
        decrypted.is_locked ?? 0,
        decrypted.created_at || new Date().toISOString(),
        decrypted.updated_at || new Date().toISOString(),
      ],
    );
    hasChanges = true;
  }

  // Upsert tasks
  for (const task of tasks) {
    const decrypted = await decryptRecord("tasks", task, passphrase);
    await db.execute(
      `INSERT OR REPLACE INTO tasks (id, note_id, title, status, priority, due_date, workspace_id, project_id, source, external_id, external_url, external_status, is_pending_sync, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        decrypted.id,
        decrypted.note_id || null,
        decrypted.title || "",
        decrypted.status || "todo",
        decrypted.priority || "medium",
        decrypted.due_date || null,
        decrypted.workspace_id || null,
        decrypted.project_id || null,
        decrypted.source || "local",
        decrypted.external_id || null,
        decrypted.external_url || null,
        decrypted.external_status || null,
        decrypted.created_at || new Date().toISOString(),
        decrypted.updated_at || new Date().toISOString(),
      ],
    );
    hasChanges = true;
  }

  // Upsert calendar events
  for (const event of calendarEvents) {
    const decrypted = await decryptRecord("calendar_events", event, passphrase);
    await db.execute(
      `INSERT OR REPLACE INTO calendar_events (id, title, event_type, date_type, solar_date, lunar_day, lunar_month, lunar_year, is_lunar_leap, repeat_yearly, is_important, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        decrypted.id,
        decrypted.title || "",
        decrypted.event_type || "other",
        decrypted.date_type || "solar",
        decrypted.solar_date || null,
        decrypted.lunar_day ?? null,
        decrypted.lunar_month ?? null,
        decrypted.lunar_year ?? null,
        decrypted.is_lunar_leap ?? 0,
        decrypted.repeat_yearly ?? 1,
        decrypted.is_important ?? 1,
        decrypted.notes || null,
        decrypted.created_at || new Date().toISOString(),
        decrypted.updated_at || new Date().toISOString(),
      ],
    );
    hasChanges = true;
  }

  // Upsert AI sessions
  for (const session of aiSessions) {
    const decrypted = await decryptRecord("ai_sessions", session, passphrase);
    await upsertAISessionPreservingMessages(db, decrypted);
    hasChanges = true;
  }

  // Upsert AI messages
  for (const msg of aiMessages) {
    const decrypted = await decryptRecord("ai_messages", msg, passphrase);
    await db.execute(
      `INSERT OR REPLACE INTO ai_messages (id, session_id, sender, text, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        decrypted.id,
        decrypted.session_id || null,
        decrypted.sender || "user",
        decrypted.text || "",
        decrypted.created_at || new Date().toISOString(),
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
      if (localTable === "ai_sessions") {
        await db.execute("DELETE FROM ai_messages WHERE session_id = ?", [deletion.id]);
      }
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
  const db = await getDatabase();
  const aiMessages = await db.select<any[]>("SELECT * FROM ai_messages ORDER BY created_at ASC");

  const passphrase = getE2eePassphrase();

  const encryptedNotes = await Promise.all(notes.map(n => encryptRecord("notes", n, passphrase)));
  const encryptedTasks = await Promise.all(tasks.map(t => encryptRecord("tasks", t, passphrase)));
  const encryptedEvents = await Promise.all(calendarEvents.map(e => encryptRecord("calendar_events", e, passphrase)));
  const encryptedSessions = await Promise.all(aiSessions.map(s => encryptRecord("ai_sessions", s, passphrase)));
  const encryptedMessages = await Promise.all(aiMessages.map(m => encryptRecord("ai_messages", m, passphrase)));

  await apiRequest("/api/sync/push", {
    method: "POST",
    body: JSON.stringify({
      notes: encryptedNotes,
      tasks: encryptedTasks,
      calendarEvents: encryptedEvents,
      aiSessions: encryptedSessions,
      aiMessages: encryptedMessages,
      lastUpdated: Date.now(),
    }),
  });

  // Mark only records captured by this full-push snapshot. Anything changed
  // while the request was in flight must remain pending for the queued delta run.
  for (const note of notes) {
    await db.execute("UPDATE notes SET is_pending_sync = 0 WHERE id = ? AND updated_at = ?", [
      note.id,
      note.updated_at || null,
    ]);
  }
  for (const task of tasks) {
    await db.execute("UPDATE tasks SET is_pending_sync = 0 WHERE id = ? AND updated_at = ?", [
      task.id,
      task.updated_at || null,
    ]);
  }

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
  const passphrase = getE2eePassphrase();

  // Clear existing local data. AI chat is merged below instead of cleared:
  // cloud snapshots can lag behind the local conversation and wiping these
  // tables makes reopened chat sessions appear to lose history.
  await db.execute("DELETE FROM tasks");
  await db.execute("DELETE FROM notes");
  await db.execute("DELETE FROM calendar_events");

  // Insert notes from cloud
  for (const note of cloudData.notes || []) {
    const decrypted = await decryptRecord("notes", note, passphrase);
    await db.execute(
      `INSERT INTO notes (id, workspace_id, project_id, title, content, type, is_locked, is_pending_sync, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        decrypted.id,
        decrypted.workspace_id || null,
        decrypted.project_id || null,
        decrypted.title || "",
        decrypted.content || "",
        decrypted.type || null,
        decrypted.is_locked ?? 0,
        decrypted.created_at || new Date().toISOString(),
        decrypted.updated_at || new Date().toISOString(),
      ],
    );
  }

  // Insert tasks from cloud
  for (const task of cloudData.tasks || []) {
    const decrypted = await decryptRecord("tasks", task, passphrase);
    await db.execute(
      `INSERT INTO tasks (id, note_id, title, status, priority, due_date, workspace_id, project_id, source, external_id, external_url, external_status, is_pending_sync, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        decrypted.id,
        decrypted.note_id || null,
        decrypted.title || "",
        decrypted.status || "todo",
        decrypted.priority || "medium",
        decrypted.due_date || null,
        decrypted.workspace_id || null,
        decrypted.project_id || null,
        decrypted.source || "local",
        decrypted.external_id || null,
        decrypted.external_url || null,
        decrypted.external_status || null,
        decrypted.created_at || new Date().toISOString(),
        decrypted.updated_at || new Date().toISOString(),
      ],
    );
  }

  // Insert calendar events from cloud
  for (const event of cloudData.calendarEvents || []) {
    const decrypted = await decryptRecord("calendar_events", event, passphrase);
    await db.execute(
      `INSERT INTO calendar_events (id, title, event_type, date_type, solar_date, lunar_day, lunar_month, lunar_year, is_lunar_leap, repeat_yearly, is_important, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        decrypted.id,
        decrypted.title || "",
        decrypted.event_type || "other",
        decrypted.date_type || "solar",
        decrypted.solar_date || null,
        decrypted.lunar_day ?? null,
        decrypted.lunar_month ?? null,
        decrypted.lunar_year ?? null,
        decrypted.is_lunar_leap ?? 0,
        decrypted.repeat_yearly ?? 1,
        decrypted.is_important ?? 1,
        decrypted.notes || null,
        decrypted.created_at || new Date().toISOString(),
        decrypted.updated_at || new Date().toISOString(),
      ],
    );
  }

  // Insert AI sessions from cloud
  for (const session of cloudData.aiSessions || []) {
    const decrypted = await decryptRecord("ai_sessions", session, passphrase);
    await upsertAISessionPreservingMessages(db, decrypted);
  }

  // Insert AI messages from cloud
  for (const msg of cloudData.aiMessages || []) {
    const decrypted = await decryptRecord("ai_messages", msg, passphrase);
    await db.execute(
      `INSERT OR REPLACE INTO ai_messages (id, session_id, sender, text, created_at) VALUES (?, ?, ?, ?, ?)`,
      [
        decrypted.id,
        decrypted.session_id || null,
        decrypted.sender || "user",
        decrypted.text || "",
        decrypted.created_at || new Date().toISOString(),
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
  const syncId = await getAppSyncId();
  if (!syncId || !(await ensureCloudAuth())) return false;

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
  const syncId = await getAppSyncId();
  if (!syncId || !(await ensureCloudAuth())) return false;

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

let pushInFlight: Promise<void> | null = null;
let pushQueued = false;

async function pushLocalDataToCloudOnce(): Promise<void> {
  const syncId = await getAppSyncId();
  if (!syncId || !(await ensureCloudAuth())) return;

  const isFirstSync = getLastSyncTime() === null;
  if (isFirstSync) {
    await fullPush();
    setLastSyncTime(new Date().toISOString());
  } else {
    await pushChanges();
  }
}

/**
 * Push local data to cloud.
 * Uses delta push if a previous sync exists, otherwise performs a full push.
 */
export async function pushLocalDataToCloud(): Promise<void> {
  pushQueued = true;
  if (pushInFlight) return pushInFlight;

  pushInFlight = (async () => {
    while (pushQueued) {
      pushQueued = false;
      try {
        await pushLocalDataToCloudOnce();
      } catch (err) {
        console.error("[AppSync] Failed to push local data to Cloud:", err);
      }
    }
  })().finally(() => {
    pushInFlight = null;
  });

  return pushInFlight;
}

/**
 * Scans the local SQLite database for E2EE encrypted records,
 * decrypts them using the provided passphrase, and updates them to plaintext.
 * Returns true if any records were successfully decrypted.
 */
export async function decryptLocalDatabase(passphrase: string): Promise<boolean> {
  const db = await getDatabase();
  let decryptedCount = 0;

  // 1. Decrypt notes
  const notes = await db.select<Note[]>("SELECT * FROM notes");
  for (const note of notes) {
    if (isEncrypted(note.title) || isEncrypted(note.content)) {
      try {
        const decryptedTitle = isEncrypted(note.title) 
          ? await decryptText(note.title, passphrase) 
          : note.title;
        const decryptedContent = isEncrypted(note.content) 
          ? await decryptText(note.content || "", passphrase) 
          : note.content;
        
        await db.execute(
          "UPDATE notes SET title = ?, content = ? WHERE id = ?",
          [decryptedTitle, decryptedContent, note.id]
        );
        decryptedCount++;
      } catch (err) {
        console.warn(`[AppSync] Failed to decrypt note ${note.id}:`, err);
      }
    }
  }

  // 2. Decrypt tasks
  const tasks = await db.select<Task[]>("SELECT * FROM tasks");
  for (const task of tasks) {
    if (isEncrypted(task.title)) {
      try {
        const decryptedTitle = await decryptText(task.title, passphrase);
        await db.execute(
          "UPDATE tasks SET title = ? WHERE id = ?",
          [decryptedTitle, task.id]
        );
        decryptedCount++;
      } catch (err) {
        console.warn(`[AppSync] Failed to decrypt task ${task.id}:`, err);
      }
    }
  }

  // 3. Decrypt calendar events
  const events = await db.select<CalendarEvent[]>("SELECT * FROM calendar_events");
  for (const event of events) {
    if (isEncrypted(event.title) || isEncrypted(event.notes)) {
      try {
        const decryptedTitle = isEncrypted(event.title)
          ? await decryptText(event.title, passphrase)
          : event.title;
        const decryptedNotes = isEncrypted(event.notes)
          ? await decryptText(event.notes || "", passphrase)
          : event.notes;
        
        await db.execute(
          "UPDATE calendar_events SET title = ?, notes = ? WHERE id = ?",
          [decryptedTitle, decryptedNotes, event.id]
        );
        decryptedCount++;
      } catch (err) {
        console.warn(`[AppSync] Failed to decrypt calendar event ${event.id}:`, err);
      }
    }
  }

  // 4. Decrypt AI sessions
  const sessions = await db.select<AISession[]>("SELECT * FROM ai_sessions");
  for (const session of sessions) {
    if (isEncrypted(session.title)) {
      try {
        const decryptedTitle = await decryptText(session.title || "", passphrase);
        await db.execute(
          "UPDATE ai_sessions SET title = ? WHERE id = ?",
          [decryptedTitle, session.id]
        );
        decryptedCount++;
      } catch (err) {
        console.warn(`[AppSync] Failed to decrypt AI session ${session.id}:`, err);
      }
    }
  }

  // 5. Decrypt AI messages
  const messages = await db.select<any[]>("SELECT * FROM ai_messages");
  for (const msg of messages) {
    if (isEncrypted(msg.text)) {
      try {
        const decryptedText = await decryptText(msg.text, passphrase);
        await db.execute(
          "UPDATE ai_messages SET text = ? WHERE id = ?",
          [decryptedText, msg.id]
        );
        decryptedCount++;
      } catch (err) {
        console.warn(`[AppSync] Failed to decrypt AI message ${msg.id}:`, err);
      }
    }
  }

  console.log(`[AppSync] Decrypted ${decryptedCount} local records successfully.`);
  return decryptedCount > 0;
}

/**
 * Check if there is any E2EE encrypted data in the local database.
 */
export async function hasEncryptedDataInLocal(): Promise<boolean> {
  const db = await getDatabase();
  
  // Check notes
  const noteSample = await db.select<Note[]>("SELECT title, content FROM notes LIMIT 100");
  if (noteSample.some(n => isEncrypted(n.title) || isEncrypted(n.content))) return true;

  // Check tasks
  const taskSample = await db.select<Task[]>("SELECT title FROM tasks LIMIT 100");
  if (taskSample.some(t => isEncrypted(t.title))) return true;

  // Check calendar events
  const eventSample = await db.select<CalendarEvent[]>("SELECT title, notes FROM calendar_events LIMIT 100");
  if (eventSample.some(e => isEncrypted(e.title) || isEncrypted(e.notes))) return true;

  // Check AI messages
  const msgSample = await db.select<any[]>("SELECT text FROM ai_messages LIMIT 100");
  if (msgSample.some(m => isEncrypted(m.text))) return true;

  return false;
}

/**
 * Pull cloud data to local.
 * Uses delta pull if a previous sync exists, otherwise performs a full pull.
 */
export async function pullCloudDataToLocal(): Promise<boolean> {
  const syncId = await getAppSyncId();
  if (!syncId || !(await ensureCloudAuth())) return false;

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
