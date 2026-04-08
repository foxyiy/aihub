import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const DATA_DIR = path.join(os.homedir(), ".aihub-server");
const DB_PATH = path.join(DATA_DIR, "db", "aihub.db");

export function getDataDir(): string {
  return DATA_DIR;
}

export function getProjectsDir(): string {
  return path.join(DATA_DIR, "projects");
}

export function initDatabase(): Database.Database {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, "projects"), { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, "global", "rules"), { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, "global", "context"), { recursive: true });

  const db = new Database(DB_PATH, { verbose: undefined });
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id          TEXT PRIMARY KEY,
      path        TEXT,
      description TEXT,
      created     TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memories (
      id              TEXT PRIMARY KEY,
      project_id      TEXT NOT NULL,
      content         TEXT NOT NULL,
      type            TEXT NOT NULL DEFAULT 'learned',
      tags            TEXT NOT NULL DEFAULT '[]',
      source_agent    TEXT NOT NULL DEFAULT 'unknown',
      source_session  TEXT,
      created         TEXT NOT NULL,
      updated         TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_mem_project ON memories(project_id);
    CREATE INDEX IF NOT EXISTS idx_mem_created ON memories(created);

    CREATE TABLE IF NOT EXISTS sessions (
      id          TEXT PRIMARY KEY,
      project_id  TEXT NOT NULL,
      task        TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'active',
      created     TEXT NOT NULL,
      ended       TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sess_project ON sessions(project_id);

    CREATE TABLE IF NOT EXISTS session_segments (
      id            TEXT PRIMARY KEY,
      session_id    TEXT NOT NULL,
      agent         TEXT NOT NULL,
      started       TEXT NOT NULL,
      ended         TEXT,
      git_changes   TEXT,
      handoff       TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_seg_session ON session_segments(session_id);
  `);

  return db;
}
