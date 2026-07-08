import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

let db: Database.Database | null = null;

/**
 * Initialize the SQLite database, creating the data directory and all tables if they don't exist.
 */
export function initDatabase(): Database.Database {
  const dbPath = process.env.DATABASE_PATH || './data/notebook.db';

  // Ensure the directory for the database file exists
  const dir = dirname(dbPath);
  mkdirSync(dir, { recursive: true });

  db = new Database(dbPath);

  // Disable foreign keys enforcement on server sync database
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = OFF');

  // Create all tables
  db.exec(`
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      avatar_url TEXT,
      telegram_chat_id TEXT,
      ai_config TEXT,
      search_config TEXT,
      telegram_config TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Workspaces table
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      icon TEXT,
      color TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Notes table
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      workspace_id TEXT,
      project_id TEXT,
      title TEXT,
      content TEXT,
      type TEXT CHECK(type IN ('quick', 'command', 'workflow', 'error_fix', 'prompt', 'daily')),
      is_locked INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
    );

    -- Tasks table
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      note_id TEXT,
      title TEXT NOT NULL,
      status TEXT CHECK(status IN ('todo', 'in_progress', 'done', 'blocked')) DEFAULT 'todo',
      priority TEXT CHECK(priority IN ('low', 'medium', 'high')) DEFAULT 'medium',
      due_date TEXT,
      workspace_id TEXT,
      project_id TEXT,
      source TEXT DEFAULT 'local',
      external_id TEXT,
      external_url TEXT,
      external_status TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE SET NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
    );

    -- Calendar events table
    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      event_type TEXT CHECK(event_type IN ('birthday', 'holiday', 'anniversary', 'other')) DEFAULT 'other',
      date_type TEXT CHECK(date_type IN ('solar', 'lunar')) DEFAULT 'solar',
      solar_date TEXT,
      lunar_day INTEGER,
      lunar_month INTEGER,
      lunar_year INTEGER,
      is_lunar_leap INTEGER DEFAULT 0,
      repeat_yearly INTEGER DEFAULT 1,
      is_important INTEGER DEFAULT 1,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- AI chat sessions table
    CREATE TABLE IF NOT EXISTS ai_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- AI chat messages table
    CREATE TABLE IF NOT EXISTS ai_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      sender TEXT CHECK(sender IN ('user', 'ai')) NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES ai_sessions(id) ON DELETE CASCADE
    );

    -- Activity logs table
    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      action TEXT,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Share data table (supports multiple entries per sync channel)
    CREATE TABLE IF NOT EXISTS share_data (
      id TEXT PRIMARY KEY,
      sync_id TEXT NOT NULL,
      type TEXT CHECK(type IN ('text', 'image')) DEFAULT 'text',
      content TEXT,
      user_email TEXT,
      user_name TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Sync tombstones: tracks deleted records for delta sync
    CREATE TABLE IF NOT EXISTS sync_tombstones (
      id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      table_name TEXT NOT NULL,
      deleted_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (id, table_name)
    );
  `);

  // Safe migration to add new columns if they don't exist
  try {
    db.exec("ALTER TABLE users ADD COLUMN telegram_chat_id TEXT");
    console.log("⚡ Database migrated: added telegram_chat_id to users table.");
  } catch (err) {
    // Column already exists, ignore
  }

  try {
    db.exec("ALTER TABLE users ADD COLUMN ai_config TEXT");
    console.log("⚡ Database migrated: added ai_config to users table.");
  } catch (err) {}

  try {
    db.exec("ALTER TABLE users ADD COLUMN search_config TEXT");
    console.log("⚡ Database migrated: added search_config to users table.");
  } catch (err) {}

  try {
    db.exec("ALTER TABLE users ADD COLUMN telegram_config TEXT");
    console.log("⚡ Database migrated: added telegram_config to users table.");
  } catch (err) {}

  // Create indexes for query performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);
    CREATE INDEX IF NOT EXISTS idx_notes_workspace ON notes(user_id, workspace_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_calendar_user_id ON calendar_events(user_id);
    CREATE INDEX IF NOT EXISTS idx_ai_sessions_user_id ON ai_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_ai_messages_session ON ai_messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_tombstones_user ON sync_tombstones(user_id, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_share_data_sync_id ON share_data(sync_id);
  `);

  return db;
}

/**
 * Get the current database instance. Throws if not initialized.
 */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}
