import { getDatabase } from "../db";

export interface Note {
  id: string;
  workspace_id: string | null;
  project_id: string | null;
  title: string;
  content: string;
  type: 'quick' | 'command' | 'workflow' | 'error_fix' | 'prompt' | 'daily';
  is_locked: number; // 0 or 1
  is_pending_sync: number; // 0 or 1
  created_at?: string;
  updated_at?: string;
}

// Fetch all notes (ordered by updated_at desc)
export async function getNotes(workspaceId?: string | null): Promise<Note[]> {
  const db = await getDatabase();
  if (workspaceId) {
    return await db.select<Note[]>(
      "SELECT * FROM notes WHERE workspace_id = ? ORDER BY updated_at DESC",
      [workspaceId]
    );
  }
  return await db.select<Note[]>("SELECT * FROM notes ORDER BY updated_at DESC");
}

// Fetch single note by id
export async function getNoteById(id: string): Promise<Note | null> {
  const db = await getDatabase();
  const results = await db.select<Note[]>("SELECT * FROM notes WHERE id = ?", [id]);
  return results.length > 0 ? results[0] : null;
}

// Create new note
export async function createNote(note: Note): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT INTO notes (id, workspace_id, project_id, title, content, type, is_locked, is_pending_sync) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      note.id,
      note.workspace_id,
      note.project_id,
      note.title,
      note.content || "",
      note.type || "quick",
      note.is_locked || 0,
      note.is_pending_sync || 0
    ]
  );
  
  // Log activity
  await logActivity("note", note.id, "created", `Created new note: ${note.title}`);
}

// Update note content and title
export async function updateNote(
  id: string,
  title: string,
  content: string,
  type?: string,
  isPendingSync: number = 1
): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  
  if (type) {
    await db.execute(
      `UPDATE notes SET title = ?, content = ?, type = ?, is_pending_sync = ?, updated_at = ? WHERE id = ?`,
      [title, content, type, isPendingSync, now, id]
    );
  } else {
    await db.execute(
      `UPDATE notes SET title = ?, content = ?, is_pending_sync = ?, updated_at = ? WHERE id = ?`,
      [title, content, isPendingSync, now, id]
    );
  }

  // Log activity
  await logActivity("note", id, "updated", `Updated note: ${title}`);
}

// Delete note
export async function deleteNote(id: string): Promise<void> {
  const db = await getDatabase();
  const note = await getNoteById(id);
  const title = note ? note.title : "Unknown Note";
  
  await db.execute("DELETE FROM notes WHERE id = ?", [id]);
  
  // Log activity
  await logActivity("note", id, "deleted", `Deleted note: ${title}`);
}

// Search notes by title or content
export async function searchNotes(query: string): Promise<Note[]> {
  const db = await getDatabase();
  const searchPattern = `%${query}%`;
  return await db.select<Note[]>(
    "SELECT * FROM notes WHERE title LIKE ? OR content LIKE ? ORDER BY updated_at DESC",
    [searchPattern, searchPattern]
  );
}

// Helper to log activity (circular dependency safe import alternative)
async function logActivity(targetType: string, targetId: string, action: string, description: string): Promise<void> {
  const db = await getDatabase();
  const id = Math.random().toString(36).substring(2, 11);
  await db.execute(
    `INSERT INTO activity_logs (id, target_type, target_id, action, description) VALUES (?, ?, ?, ?, ?)`,
    [id, targetType, targetId, action, description]
  );
}
