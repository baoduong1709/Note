import { getDatabase } from "../db";

export interface AISession {
  id: string;
  title: string;
  created_at: string;
}

export interface AIMessage {
  id: string;
  session_id: string;
  sender: "user" | "ai";
  text: string;
  created_at: string;
}

function syncUpsert(table: "ai_sessions" | "ai_messages", id: string): void {
  import("../../services/appSyncService")
    .then((m) => {
      m.trackUpsert(table, id);
      m.pushLocalDataToCloud().catch(console.error);
    })
    .catch(console.error);
}

function syncDeletion(table: "ai_sessions" | "ai_messages", id: string): void {
  import("../../services/appSyncService")
    .then((m) => {
      m.trackDeletion(table, id);
      m.pushLocalDataToCloud().catch(console.error);
    })
    .catch(console.error);
}

// 1. Get all AI Chat Sessions ordered by newest
export async function getAISessions(): Promise<AISession[]> {
  try {
    const db = await getDatabase();
    return await db.select<AISession[]>("SELECT * FROM ai_sessions ORDER BY created_at DESC");
  } catch (err) {
    console.error("Failed to get AI sessions:", err);
    return [];
  }
}

// 2. Create new AI Chat Session
export async function createAISession(id: string, title: string): Promise<void> {
  try {
    const db = await getDatabase();
    await db.execute(
      "INSERT INTO ai_sessions (id, title, created_at) VALUES (?, ?, ?)",
      [id, title, new Date().toISOString()]
    );
    syncUpsert("ai_sessions", id);
  } catch (err) {
    console.error("Failed to create AI session:", err);
  }
}

// 3. Delete AI Chat Session (cascade deletes messages)
export async function deleteAISession(id: string): Promise<void> {
  try {
    const db = await getDatabase();
    await db.execute("DELETE FROM ai_sessions WHERE id = ?", [id]);
    // Also delete messages in WebDatabase mode manually (SQLite real handles ON DELETE CASCADE)
    await db.execute("DELETE FROM ai_messages WHERE session_id = ?", [id]);
    syncDeletion("ai_sessions", id);
  } catch (err) {
    console.error("Failed to delete AI session:", err);
  }
}

// 4. Update session title
export async function updateAISessionTitle(id: string, title: string): Promise<void> {
  try {
    const db = await getDatabase();
    await db.execute("UPDATE ai_sessions SET title = ? WHERE id = ?", [title, id]);
    syncUpsert("ai_sessions", id);
  } catch (err) {
    console.error("Failed to update AI session title:", err);
  }
}

export async function updateAIMessage(id: string, text: string): Promise<void> {
  try {
    const db = await getDatabase();
    await db.execute("UPDATE ai_messages SET text = ? WHERE id = ?", [text, id]);
    syncUpsert("ai_messages", id);
  } catch (err) {
    console.error("Failed to update AI message:", err);
  }
}

// 5. Get all messages for a specific session
export async function getAIMessages(sessionId: string): Promise<AIMessage[]> {
  try {
    const db = await getDatabase();
    return await db.select<AIMessage[]>(
      "SELECT * FROM ai_messages WHERE session_id = ? ORDER BY created_at ASC",
      [sessionId]
    );
  } catch (err) {
    console.error("Failed to get AI messages:", err);
    return [];
  }
}

// 6. Add a message to a session
export async function addAIMessage(
  id: string,
  sessionId: string,
  sender: "user" | "ai",
  text: string
): Promise<void> {
  try {
    const db = await getDatabase();
    await db.execute(
      "INSERT INTO ai_messages (id, session_id, sender, text, created_at) VALUES (?, ?, ?, ?, ?)",
      [id, sessionId, sender, text, new Date().toISOString()]
    );
    syncUpsert("ai_messages", id);
  } catch (err) {
    console.error("Failed to add AI message:", err);
  }
}
