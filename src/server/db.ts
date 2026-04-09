import initSqlJs from "sql.js";
import type { Database as SqlJsDatabase } from "sql.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const DATA_DIR = path.join(os.homedir(), ".aihub-server");
const DB_PATH = path.join(DATA_DIR, "db", "aihub.db");

let _db: SqlJsDatabase | null = null;

export type { SqlJsDatabase };

export function getDataDir(): string {
  return DATA_DIR;
}

export function getProjectsDir(): string {
  return path.join(DATA_DIR, "projects");
}

export async function initDatabase(): Promise<SqlJsDatabase> {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, "projects"), { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, "global", "rules"), { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, "global", "context"), { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, "global", "skills"), { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, "global", "mcp"), { recursive: true });

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    _db = new SQL.Database(buf);
  } else {
    _db = new SQL.Database();
  }

  _db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, path TEXT, description TEXT, created TEXT NOT NULL
    )
  `);
  _db.run(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, content TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'learned', tags TEXT NOT NULL DEFAULT '[]',
      source_agent TEXT NOT NULL DEFAULT 'unknown', source_session TEXT,
      created TEXT NOT NULL, updated TEXT
    )
  `);
  _db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, task TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active', created TEXT NOT NULL, ended TEXT
    )
  `);
  _db.run(`
    CREATE TABLE IF NOT EXISTS session_segments (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, agent TEXT NOT NULL,
      started TEXT NOT NULL, ended TEXT, git_changes TEXT, handoff TEXT
    )
  `);

  persist();
  return _db;
}

function persist(): void {
  if (!_db) return;
  const data = _db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// ─── Query helpers ─────────────────────────────

export function all(db: SqlJsDatabase, sql: string, params: unknown[] = []): Record<string, unknown>[] {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params as any[]);
  const rows: Record<string, unknown>[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject() as Record<string, unknown>);
  stmt.free();
  return rows;
}

export function one(db: SqlJsDatabase, sql: string, params: unknown[] = []): Record<string, unknown> | undefined {
  return all(db, sql, params)[0];
}

export function run(db: SqlJsDatabase, sql: string, params: unknown[] = []): void {
  db.run(sql, params as any[]);
  persist();
}
