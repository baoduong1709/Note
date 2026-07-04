import { getDatabase } from "../database/db";
import { getNotes, Note } from "../database/queries/notes";
import { getTasks, Task } from "../database/queries/tasks";
import { generateSyncIdFromEmail, getStoredUser } from "./shareService";

export interface SyncPayload {
  notes: Note[];
  tasks: Task[];
  lastUpdated: number;
}

// Lấy Sync ID cho app data (thêm hậu tố _app để phân biệt với quick_share)
export async function getAppSyncId(): Promise<string | null> {
  const user = getStoredUser();
  if (!user) return null;
  const baseId = await generateSyncIdFromEmail(user.email);
  return `${baseId}_app`;
}

// Đẩy dữ liệu SQLite local lên Cloud
export async function pushLocalDataToCloud(): Promise<void> {
  const syncId = await getAppSyncId();
  if (!syncId) return;

  try {
    const notes = await getNotes();
    const tasks = await getTasks();
    
    const payload: SyncPayload = {
      notes,
      tasks,
      lastUpdated: Date.now()
    };

    localStorage.setItem("local_last_updated", payload.lastUpdated.toString());

    const isTauri = typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__ !== undefined;
    
    let response;
    if (isTauri) {
      const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
      response = await tauriFetch(`https://jsonblob.com/api/jsonBlob/${syncId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(payload)
      });
    } else {
      response = await fetch(`https://jsonblob.com/api/jsonBlob/${syncId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(payload)
      });
    }

    if (response.status === 404) {
      // Nếu chưa tồn tại blob này, tạo mới bằng POST
      if (isTauri) {
        const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
        await tauriFetch(`https://jsonblob.com/api/jsonBlob`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify(payload)
        });
      } else {
        await fetch(`https://jsonblob.com/api/jsonBlob`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify(payload)
        });
      }
    }
    console.log("[AppSync] Successfully pushed local SQLite data to Cloud.");
  } catch (err) {
    console.error("[AppSync] Failed to push local data to Cloud:", err);
  }
}

// Tải dữ liệu từ Cloud về ghi đè vào SQLite local
export async function pullCloudDataToLocal(): Promise<boolean> {
  const syncId = await getAppSyncId();
  if (!syncId) return false;

  const isTauri = typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__ !== undefined;
  let response;
  try {
    if (isTauri) {
      const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
      response = await tauriFetch(`https://jsonblob.com/api/jsonBlob/${syncId}`, {
        method: "GET",
        headers: {
          "Accept": "application/json"
        }
      });
    } else {
      response = await fetch(`https://jsonblob.com/api/jsonBlob/${syncId}`, {
        method: "GET",
        headers: {
          "Accept": "application/json"
        }
      });
    }

    if (!response.ok) {
      if (response.status === 404) {
        // Chưa có dữ liệu trên cloud, đẩy local lên để khởi tạo
        await pushLocalDataToCloud();
      }
      return false;
    }

    const cloudPayload = await response.json() as SyncPayload;
    if (!cloudPayload || !cloudPayload.notes || !cloudPayload.tasks) return false;

    const localLastUpdated = parseInt(localStorage.getItem("local_last_updated") || "0");

    // Nếu dữ liệu trên Cloud mới hơn dữ liệu Local, ghi đè Local SQLite
    if (cloudPayload.lastUpdated > localLastUpdated) {
      const db = await getDatabase();
      
      // Xóa toàn bộ note và task cũ
      await db.execute("DELETE FROM notes");
      await db.execute("DELETE FROM tasks");

      // Ghi note mới
      for (const note of cloudPayload.notes) {
        await db.execute(
          `INSERT INTO notes (id, workspace_id, project_id, title, content, type, is_locked, is_pending_sync, created_at, updated_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            note.id, note.workspace_id, note.project_id, note.title, note.content, note.type, 
            note.is_locked, 0, note.created_at || new Date().toISOString(), note.updated_at || new Date().toISOString()
          ]
        );
      }

      // Ghi task mới
      for (const task of cloudPayload.tasks) {
        await db.execute(
          `INSERT INTO tasks (id, note_id, title, status, priority, due_date, workspace_id, project_id, source, external_id, external_url, external_status, is_pending_sync, created_at, updated_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            task.id, task.note_id, task.title, task.status, task.priority, task.due_date,
            task.workspace_id, task.project_id, task.source, task.external_id, task.external_url,
            task.external_status, 0, task.created_at || new Date().toISOString(), task.updated_at || new Date().toISOString()
          ]
        );
      }

      localStorage.setItem("local_last_updated", cloudPayload.lastUpdated.toString());
      console.log("[AppSync] Successfully pulled cloud data to Local and updated SQLite.");
      return true; // đã cập nhật dữ liệu
    } else if (cloudPayload.lastUpdated < localLastUpdated) {
      // Nếu local mới hơn, đẩy lên cloud
      await pushLocalDataToCloud();
    }
  } catch (err) {
    console.error("[AppSync] Sync failed:", err);
  }
  return false;
}
