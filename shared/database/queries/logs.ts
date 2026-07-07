import { getDatabase } from "../db";

export interface ActivityLog {
  id: string;
  target_type: 'note' | 'task' | 'copy_block' | 'sync' | 'ai';
  target_id: string | null;
  action: string;
  description: string;
  created_at: string;
}

// Fetch activity logs (latest first, limit to 100 entries)
export async function getActivityLogs(
  targetType?: string,
  targetId?: string
): Promise<ActivityLog[]> {
  const db = await getDatabase();
  
  if (targetType && targetId) {
    return await db.select<ActivityLog[]>(
      "SELECT * FROM activity_logs WHERE target_type = ? AND target_id = ? ORDER BY created_at DESC LIMIT 100",
      [targetType, targetId]
    );
  } else if (targetType) {
    return await db.select<ActivityLog[]>(
      "SELECT * FROM activity_logs WHERE target_type = ? ORDER BY created_at DESC LIMIT 100",
      [targetType]
    );
  }
  
  return await db.select<ActivityLog[]>(
    "SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 100"
  );
}

// Add a new activity log
export async function addActivityLog(
  targetType: ActivityLog['target_type'],
  targetId: string | null,
  action: string,
  description: string
): Promise<void> {
  const db = await getDatabase();
  const id = Math.random().toString(36).substring(2, 11);
  
  await db.execute(
    "INSERT INTO activity_logs (id, target_type, target_id, action, description) VALUES (?, ?, ?, ?, ?)",
    [id, targetType, targetId, action, description]
  );
}

// Clear all activity logs (useful for database maintenance)
export async function clearActivityLogs(): Promise<void> {
  const db = await getDatabase();
  await db.execute("DELETE FROM activity_logs");
  await addActivityLog("sync", null, "maintenance", "Cleared all activity logs.");
}
