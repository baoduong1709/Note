import { getDatabase } from "./db";
import { addActivityLog } from "./queries/logs";

export interface SyncQueueItem {
  id: number;
  action_type: 'create_note' | 'update_note' | 'delete_note' | 'create_task' | 'update_task' | 'delete_task';
  payload: string; // JSON string
  status: 'pending' | 'processing' | 'failed';
  retry_count: number;
  created_at: string;
}

// Add action to the sync queue
export async function addToSyncQueue(
  actionType: SyncQueueItem['action_type'],
  payload: any
): Promise<void> {
  const db = await getDatabase();
  const payloadStr = JSON.stringify(payload);
  
  await db.execute(
    "INSERT INTO sync_queue (action_type, payload, status, retry_count) VALUES (?, ?, 'pending', 0)",
    [actionType, payloadStr]
  );
  
  console.log(`[SyncQueue] Added action ${actionType} to sync queue.`);
}

// Get all items in the queue that need processing
export async function getPendingSyncItems(): Promise<SyncQueueItem[]> {
  const db = await getDatabase();
  return await db.select<SyncQueueItem[]>(
    "SELECT * FROM sync_queue WHERE status = 'pending' OR status = 'failed' ORDER BY created_at ASC"
  );
}

// Update sync queue item status (e.g. when processing or failed)
export async function updateSyncItemStatus(
  id: number,
  status: SyncQueueItem['status'],
  retryCount: number
): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    "UPDATE sync_queue SET status = ?, retry_count = ? WHERE id = ?",
    [status, retryCount, id]
  );
}

// Remove item from queue (after successful sync)
export async function removeFromSyncQueue(id: number): Promise<void> {
  const db = await getDatabase();
  await db.execute("DELETE FROM sync_queue WHERE id = ?", [id]);
}

// Process sync queue (mock logic for offline-first, to be integrated with backend API in Phase 9)
export async function processSyncQueue(isOnline: boolean): Promise<void> {
  if (!isOnline) {
    console.log("[SyncQueue] Device is offline. Sync suspended.");
    return;
  }

  const items = await getPendingSyncItems();
  if (items.length === 0) return;

  console.log(`[SyncQueue] Found ${items.length} pending items to sync. Processing...`);

  for (const item of items) {
    try {
      await updateSyncItemStatus(item.id, 'processing', item.retry_count);
      
      // Simulating backend call here
      // const payloadObj = JSON.parse(item.payload);
      // await axios.post('/api/sync', { action: item.action_type, data: payloadObj });
      
      // Delay to simulate network latency
      await new Promise(resolve => setTimeout(resolve, 500));

      // Successfully synced
      await removeFromSyncQueue(item.id);
      console.log(`[SyncQueue] Synced successfully item ID: ${item.id} (${item.action_type})`);
      
      // Update local pending sync indicator if applicable
      // This is a placeholder for actual local update (e.g. set is_pending_sync = 0 for notes/tasks)
      
    } catch (error) {
      console.error(`[SyncQueue] Failed to sync item ID ${item.id}:`, error);
      const nextRetry = item.retry_count + 1;
      await updateSyncItemStatus(item.id, 'failed', nextRetry);
      await addActivityLog(
        "sync", 
        item.id.toString(), 
        "sync_failed", 
        `Sync failed for ${item.action_type}. Attempt ${nextRetry}.`
      );
    }
  }
}
