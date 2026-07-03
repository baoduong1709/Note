export interface DatabaseConnection {
  execute(query: string, values?: any[]): Promise<any>;
  select<T>(query: string, values?: any[]): Promise<T>;
}

let dbInstance: DatabaseConnection | null = null;
let isWebFallback = false;

// Mock WebDatabase class simulating SQLite operations over LocalStorage for Browser mode
class WebDatabase {
  async execute(query: string, values: any[] = []): Promise<any> {
    const q = query.trim().toLowerCase();
    
    if (q.startsWith("insert into notes")) {
      const notes = this.getTable("notes");
      const [id, workspace_id, project_id, title, content, type, is_locked, is_pending_sync] = values;
      notes.push({ 
        id, 
        workspace_id, 
        project_id, 
        title, 
        content, 
        type, 
        is_locked, 
        is_pending_sync, 
        created_at: new Date().toISOString(), 
        updated_at: new Date().toISOString() 
      });
      this.saveTable("notes", notes);
    } 
    else if (q.startsWith("update notes")) {
      const notes = this.getTable("notes");
      if (values.length === 6) {
        const [title, content, type, is_pending_sync, updated_at, id] = values;
        const idx = notes.findIndex((n: any) => n.id === id);
        if (idx !== -1) {
          notes[idx] = { ...notes[idx], title, content, type, is_pending_sync, updated_at };
        }
      } else {
        const [title, content, is_pending_sync, updated_at, id] = values;
        const idx = notes.findIndex((n: any) => n.id === id);
        if (idx !== -1) {
          notes[idx] = { ...notes[idx], title, content, is_pending_sync, updated_at };
        }
      }
      this.saveTable("notes", notes);
    }
    else if (q.startsWith("delete from notes")) {
      const id = values[0];
      let notes = this.getTable("notes");
      notes = notes.filter((n: any) => n.id !== id);
      this.saveTable("notes", notes);
    }
    else if (q.startsWith("update notes set content = ?, updated_at = ? where title = ?")) {
      const [content, updatedAt, title] = values;
      const notes = this.getTable("notes");
      const idx = notes.findIndex((n: any) => n.title === title);
      if (idx !== -1) {
        notes[idx] = { ...notes[idx], content, updated_at: updatedAt };
      }
      this.saveTable("notes", notes);
    }
    else if (q.startsWith("insert into tasks")) {
      const tasks = this.getTable("tasks");
      const [id, note_id, title, status, priority, due_date, workspace_id, project_id, source, external_id, external_url, is_pending_sync] = values;
      tasks.push({ 
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
        is_pending_sync, 
        created_at: new Date().toISOString(), 
        updated_at: new Date().toISOString() 
      });
      this.saveTable("tasks", tasks);
    }
    else if (q.startsWith("update tasks set status = ?")) {
      const [status, updated_at, id] = values;
      const tasks = this.getTable("tasks");
      const idx = tasks.findIndex((t: any) => t.id === id);
      if (idx !== -1) {
        tasks[idx] = { ...tasks[idx], status, updated_at };
      }
      this.saveTable("tasks", tasks);
    }
    else if (q.startsWith("update tasks set")) {
      // Full task update
      const [note_id, title, status, priority, due_date, workspace_id, project_id, source, external_id, external_url, is_pending_sync, updated_at, id] = values;
      const tasks = this.getTable("tasks");
      const idx = tasks.findIndex((t: any) => t.id === id);
      if (idx !== -1) {
        tasks[idx] = { ...tasks[idx], note_id, title, status, priority, due_date, workspace_id, project_id, source, external_id, external_url, is_pending_sync, updated_at };
      }
      this.saveTable("tasks", tasks);
    }
    else if (q.startsWith("delete from tasks")) {
      const id = values[0];
      let tasks = this.getTable("tasks");
      tasks = tasks.filter((t: any) => t.id !== id);
      this.saveTable("tasks", tasks);
    }
    else if (q.startsWith("insert into activity_logs")) {
      const logs = this.getTable("activity_logs");
      const [id, target_type, target_id, action, description] = values;
      logs.push({ id, target_type, target_id, action, description, created_at: new Date().toISOString() });
      this.saveTable("activity_logs", logs);
    }
    else if (q.startsWith("delete from activity_logs")) {
      this.saveTable("activity_logs", []);
    }
    else if (q.startsWith("insert into ai_sessions")) {
      const sessions = this.getTable("ai_sessions");
      const [id, title, created_at] = values;
      sessions.push({ id, title, created_at });
      this.saveTable("ai_sessions", sessions);
    }
    else if (q.startsWith("delete from ai_sessions")) {
      const id = values[0];
      let sessions = this.getTable("ai_sessions");
      sessions = sessions.filter((s: any) => s.id !== id);
      this.saveTable("ai_sessions", sessions);
    }
    else if (q.startsWith("update ai_sessions set title = ?")) {
      const [title, id] = values;
      const sessions = this.getTable("ai_sessions");
      const idx = sessions.findIndex((s: any) => s.id === id);
      if (idx !== -1) {
        sessions[idx] = { ...sessions[idx], title };
      }
      this.saveTable("ai_sessions", sessions);
    }
    else if (q.startsWith("insert into ai_messages")) {
      const messages = this.getTable("ai_messages");
      const [id, session_id, sender, text, created_at] = values;
      messages.push({ id, session_id, sender, text, created_at });
      this.saveTable("ai_messages", messages);
    }
    else if (q.startsWith("delete from ai_messages")) {
      const sessionId = values[0];
      let messages = this.getTable("ai_messages");
      messages = messages.filter((m: any) => m.session_id !== sessionId);
      this.saveTable("ai_messages", messages);
    }
    else if (q.startsWith("insert into ai_memories")) {
      const memories = this.getTable("ai_memories");
      const [id, content, created_at] = values;
      memories.push({ id, content, created_at });
      this.saveTable("ai_memories", memories);
    }
    else if (q.startsWith("delete from ai_memories")) {
      const id = values[0];
      let memories = this.getTable("ai_memories");
      memories = memories.filter((m: any) => m.id !== id);
      this.saveTable("ai_memories", memories);
    }
    
    return true;
  }

  async select<T>(query: string, values: any[] = []): Promise<T> {
    const q = query.trim().toLowerCase();
    
    if (q.includes("from workspaces")) {
      return this.getTable("workspaces") as unknown as T;
    }
    
    if (q.includes("from notes")) {
      const notes = this.getTable("notes");
      
      if (q.includes("title = ?")) {
        const titleVal = values[0];
        return notes.filter((n: any) => n.title === titleVal) as unknown as T;
      }
      
      if (q.includes("workspace_id = ?")) {
        const wsId = values[0];
        return notes.filter((n: any) => n.workspace_id === wsId).sort((a: any, b: any) => b.updated_at.localeCompare(a.updated_at)) as unknown as T;
      }
      
      if (q.includes("title like ? or content like ?")) {
        const term = values[0].replaceAll("%", "").toLowerCase();
        return notes.filter((n: any) => 
          n.title.toLowerCase().includes(term) || 
          n.content.toLowerCase().includes(term)
        ).sort((a: any, b: any) => b.updated_at.localeCompare(a.updated_at)) as unknown as T;
      }

      if (q.includes("id = ?")) {
        const id = values[0];
        return notes.filter((n: any) => n.id === id) as unknown as T;
      }
      
      if (q.includes("type = 'daily'")) {
        const titlePattern = values[0].replaceAll("%", "").toLowerCase();
        return notes.filter((n: any) => 
          n.type === 'daily' && n.title.toLowerCase().includes(titlePattern)
        ) as unknown as T;
      }

      return notes.sort((a: any, b: any) => b.updated_at.localeCompare(a.updated_at)) as unknown as T;
    }
    
    if (q.includes("from tasks")) {
      const tasks = this.getTable("tasks");
      
      if (q.includes("workspace_id = ?")) {
        const wsId = values[0];
        return tasks.filter((t: any) => t.workspace_id === wsId).sort((a: any, b: any) => b.updated_at.localeCompare(a.updated_at)) as unknown as T;
      }

      if (q.includes("status != 'done'")) {
        const today = new Date().toISOString().split('T')[0];
        return tasks.filter((t: any) => 
          t.status !== 'done' && (t.due_date <= today || t.due_date === null)
        ).sort((a: any, b: any) => b.priority.localeCompare(a.priority)) as unknown as T;
      }
      
      if (q.includes("status = 'done' and updated_at >= ?")) {
        const startOfDay = values[0];
        return tasks.filter((t: any) => 
          t.status === 'done' && t.updated_at >= startOfDay
        ) as unknown as T;
      }

      return tasks.sort((a: any, b: any) => b.updated_at.localeCompare(a.updated_at)) as unknown as T;
    }
    
    if (q.includes("from activity_logs")) {
      const logs = this.getTable("activity_logs");
      return logs.sort((a: any, b: any) => b.created_at.localeCompare(a.created_at)).slice(0, 100) as unknown as T;
    }
    
    if (q.includes("from ai_sessions")) {
      const sessions = this.getTable("ai_sessions");
      return sessions.sort((a: any, b: any) => b.created_at.localeCompare(a.created_at)) as unknown as T;
    }
    
    if (q.includes("from ai_messages")) {
      const messages = this.getTable("ai_messages");
      if (q.includes("session_id = ?")) {
        const sId = values[0];
        return messages.filter((m: any) => m.session_id === sId).sort((a: any, b: any) => a.created_at.localeCompare(b.created_at)) as unknown as T;
      }
      return messages as unknown as T;
    }
    
    if (q.includes("from ai_memories")) {
      const memories = this.getTable("ai_memories");
      return memories.sort((a: any, b: any) => b.created_at.localeCompare(a.created_at)) as unknown as T;
    }
    
    return [] as unknown as T;
  }

  private getTable(name: string): any[] {
    const data = localStorage.getItem(`db_web_${name}`);
    if (data) return JSON.parse(data);
    
    if (name === "workspaces") {
      const defaultWs = [
        { id: "work", name: "GL Work", icon: "briefcase", color: "#8b5cf6" },
        { id: "personal", name: "Personal", icon: "user", color: "#0d9488" },
        { id: "gamedev", name: "Game Dev", icon: "gamepad-2", color: "#f59e0b" }
      ];
      this.saveTable(name, defaultWs);
      return defaultWs;
    }
    return [];
  }

  private saveTable(name: string, data: any[]) {
    localStorage.setItem(`db_web_${name}`, JSON.stringify(data));
  }
}

// Initialize Database connection
export async function initDatabase(): Promise<DatabaseConnection> {
  if (dbInstance) return dbInstance;

  // Check if we are running in Tauri desktop environment or Web Browser
  const isTauri = typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__ !== undefined;

  if (!isTauri) {
    console.log("[Database] Tauri environment not detected. Initializing LocalStorage simulated database.");
    isWebFallback = true;
    dbInstance = new WebDatabase();
    return dbInstance;
  }

  try {
    const DatabasePlugin = await import("@tauri-apps/plugin-sql");
    const db = await DatabasePlugin.default.load("sqlite:personal_notebook.db");
    
    // Create workspaces table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT,
        color TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create projects table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      );
    `);

    // Create notes table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        workspace_id TEXT,
        project_id TEXT,
        title TEXT NOT NULL,
        content TEXT,
        type TEXT CHECK(type IN ('quick', 'command', 'workflow', 'error_fix', 'prompt', 'daily')) DEFAULT 'quick',
        is_locked INTEGER DEFAULT 0,
        is_pending_sync INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
      );
    `);

    // Create copy_blocks table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS copy_blocks (
        id TEXT PRIMARY KEY,
        note_id TEXT NOT NULL,
        content TEXT NOT NULL,
        type TEXT CHECK(type IN ('text', 'command', 'code', 'sql', 'prompt', 'config')) DEFAULT 'text',
        usage_count INTEGER DEFAULT 0,
        last_copied_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
      );
    `);

    // Create tasks table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        note_id TEXT,
        title TEXT NOT NULL,
        status TEXT CHECK(status IN ('todo', 'in_progress', 'done', 'blocked')) DEFAULT 'todo',
        priority TEXT CHECK(priority IN ('low', 'medium', 'high')) DEFAULT 'medium',
        due_date DATE,
        workspace_id TEXT,
        project_id TEXT,
        source TEXT CHECK(source IN ('local', 'jira')) DEFAULT 'local',
        external_id TEXT,
        external_url TEXT,
        is_pending_sync INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE SET NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
      );
    `);

    // Create activity_logs table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id TEXT PRIMARY KEY,
        target_type TEXT CHECK(target_type IN ('note', 'task', 'copy_block', 'jira', 'sync', 'ai')) NOT NULL,
        target_id TEXT,
        action TEXT NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create settings table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // Create sync_queue table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action_type TEXT CHECK(action_type IN ('create_note', 'update_note', 'delete_note', 'create_task', 'update_task', 'delete_task')) NOT NULL,
        payload TEXT NOT NULL,
        status TEXT CHECK(status IN ('pending', 'processing', 'failed')) DEFAULT 'pending',
        retry_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create ai_sessions table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS ai_sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create ai_messages table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS ai_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        sender TEXT CHECK(sender IN ('user', 'ai')) NOT NULL,
        text TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES ai_sessions(id) ON DELETE CASCADE
      );
    `);

    // Create ai_memories table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS ai_memories (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insert Default Workspaces if empty
    const workspaces = await db.select<any[]>("SELECT * FROM workspaces LIMIT 1");
    if (workspaces.length === 0) {
      await db.execute(`
        INSERT INTO workspaces (id, name, icon, color) VALUES
        ('work', 'GL Work', 'briefcase', '#8b5cf6'),
        ('personal', 'Personal', 'user', '#0d9488'),
        ('gamedev', 'Game Dev', 'gamepad-2', '#f59e0b')
      `);
    }

    dbInstance = db;
    console.log("SQLite Database initialized successfully with 8 tables.");
    return db;
  } catch (error) {
    console.error("Failed to initialize SQLite database. Falling back to Web simulation:", error);
    isWebFallback = true;
    dbInstance = new WebDatabase();
    return dbInstance;
  }
}

// Get initialized database instance
export async function getDatabase(): Promise<DatabaseConnection> {
  if (!dbInstance) {
    return await initDatabase();
  }
  return dbInstance;
}
