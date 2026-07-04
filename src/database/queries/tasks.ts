import { getDatabase } from "../db";

export interface Task {
  id: string;
  note_id: string | null;
  title: string;
  status: 'todo' | 'in_progress' | 'done' | 'blocked';
  priority: 'low' | 'medium' | 'high';
  due_date: string | null;
  workspace_id: string | null;
  project_id: string | null;
  source: 'local';
  external_id: string | null;
  external_url: string | null;
  external_status?: string | null;
  is_pending_sync: number; // 0 or 1
  created_at?: string;
  updated_at?: string;
}

// Fetch all tasks
export async function getTasks(workspaceId?: string | null): Promise<Task[]> {
  const db = await getDatabase();
  if (workspaceId) {
    return await db.select<Task[]>(
      "SELECT * FROM tasks WHERE workspace_id = ? ORDER BY updated_at DESC",
      [workspaceId]
    );
  }
  return await db.select<Task[]>("SELECT * FROM tasks ORDER BY updated_at DESC");
}

// Fetch single task by id
export async function getTaskById(id: string): Promise<Task | null> {
  const db = await getDatabase();
  const results = await db.select<Task[]>("SELECT * FROM tasks WHERE id = ?", [id]);
  return results.length > 0 ? results[0] : null;
}

// Create new task
export async function createTask(task: Task): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT INTO tasks (id, note_id, title, status, priority, due_date, workspace_id, project_id, source, external_id, external_url, external_status, is_pending_sync) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      task.id,
      task.note_id,
      task.title,
      task.status || "todo",
      task.priority || "medium",
      task.due_date,
      task.workspace_id,
      task.project_id,
      task.source || "local",
      task.external_id,
      task.external_url,
      task.external_status || null,
      task.is_pending_sync || 0
    ]
  );

  // Log activity
  await logActivity("task", task.id, "created", `Created task: ${task.title}`);

  // Cloud sync
  import("../../services/appSyncService").then(m => m.pushLocalDataToCloud()).catch(console.error);
}

// Update task status
export async function updateTaskStatus(id: string, status: Task['status']): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const task = await getTaskById(id);
  const title = task ? task.title : "Unknown Task";
  
  await db.execute(
    `UPDATE tasks SET status = ?, is_pending_sync = 1, updated_at = ? WHERE id = ?`,
    [status, now, id]
  );

  // Log activity
  await logActivity("task", id, "status_changed", `Changed task "${title}" status to ${status}`);

  // Cloud sync
  import("../../services/appSyncService").then(m => m.pushLocalDataToCloud()).catch(console.error);
}

// Update complete task data
export async function updateTask(task: Task): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  
  await db.execute(
    `UPDATE tasks SET 
      note_id = ?, 
      title = ?, 
      status = ?, 
      priority = ?, 
      due_date = ?, 
      workspace_id = ?, 
      project_id = ?, 
      source = ?, 
      external_id = ?, 
      external_url = ?, 
      external_status = ?,
      is_pending_sync = 1,
      updated_at = ? 
     WHERE id = ?`,
    [
      task.note_id,
      task.title,
      task.status,
      task.priority,
      task.due_date,
      task.workspace_id,
      task.project_id,
      task.source,
      task.external_id,
      task.external_url,
      task.external_status || null,
      now,
      task.id
    ]
  );

  // Log activity
  await logActivity("task", task.id, "updated", `Updated task details for: ${task.title}`);

  // Cloud sync
  import("../../services/appSyncService").then(m => m.pushLocalDataToCloud()).catch(console.error);
}

// Delete task
export async function deleteTask(id: string): Promise<void> {
  const db = await getDatabase();
  const task = await getTaskById(id);
  const title = task ? task.title : "Unknown Task";
  
  await db.execute("DELETE FROM tasks WHERE id = ?", [id]);
  
  // Log activity
  await logActivity("task", id, "deleted", `Deleted task: ${title}`);

  // Cloud sync
  import("../../services/appSyncService").then(m => m.pushLocalDataToCloud()).catch(console.error);
}

// Get tasks due today or overdue
export async function getTodayTasks(): Promise<Task[]> {
  const db = await getDatabase();
  const today = new Date().toISOString().split('T')[0];
  return await db.select<Task[]>(
    "SELECT * FROM tasks WHERE status != 'done' AND (substr(due_date, 1, 10) <= ? OR due_date IS NULL) ORDER BY priority DESC",
    [today]
  );
}

// Search tasks
export async function searchTasks(query: string): Promise<Task[]> {
  const db = await getDatabase();
  const searchPattern = `%${query}%`;
  return await db.select<Task[]>(
    "SELECT * FROM tasks WHERE title LIKE ? ORDER BY updated_at DESC",
    [searchPattern]
  );
}

// Fetch tasks that are High priority or due within 2 days (48 hours) and not Done
export async function getImportantTasks(): Promise<Task[]> {
  const db = await getDatabase();
  const twoDaysLater = new Date();
  twoDaysLater.setDate(twoDaysLater.getDate() + 2);
  const dateLimit = twoDaysLater.toISOString().split('T')[0];
  
  return await db.select<Task[]>(
    `SELECT * FROM tasks 
     WHERE status != 'done' 
       AND (priority = 'high' OR (due_date IS NOT NULL AND substr(due_date, 1, 10) <= ?))
     ORDER BY due_date ASC, priority DESC`,
    [dateLimit]
  );
}

// Helper to log activity
async function logActivity(targetType: string, targetId: string, action: string, description: string): Promise<void> {
  const db = await getDatabase();
  const id = Math.random().toString(36).substring(2, 11);
  await db.execute(
    `INSERT INTO activity_logs (id, target_type, target_id, action, description) VALUES (?, ?, ?, ?, ?)`,
    [id, targetType, targetId, action, description]
  );
}
