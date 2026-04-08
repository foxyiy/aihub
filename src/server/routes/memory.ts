import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import { nanoid } from "nanoid";

export function registerMemoryRoutes(app: FastifyInstance, db: Database.Database): void {
  // List memories
  app.get<{ Params: { id: string }; Querystring: { limit?: string; offset?: string } }>(
    "/projects/:id/memory", (req) => {
      const limit = parseInt(req.query.limit ?? "20");
      const offset = parseInt(req.query.offset ?? "0");
      return db.prepare(
        "SELECT * FROM memories WHERE project_id = ? ORDER BY created DESC LIMIT ? OFFSET ?"
      ).all(req.params.id, limit, offset);
    }
  );

  // Search memories
  app.get<{ Params: { id: string }; Querystring: { q: string; limit?: string } }>(
    "/projects/:id/memory/search", (req) => {
      const q = req.query.q ?? "";
      const limit = parseInt(req.query.limit ?? "10");
      const words = q.toLowerCase().split(/\s+/).filter(w => w.length > 1);
      if (words.length === 0) {
        return db.prepare(
          "SELECT * FROM memories WHERE project_id = ? ORDER BY created DESC LIMIT ?"
        ).all(req.params.id, limit);
      }
      const clauses = words.map(() => "LOWER(content) LIKE ?").join(" OR ");
      return db.prepare(
        `SELECT * FROM memories WHERE project_id = ? AND (${clauses}) ORDER BY created DESC LIMIT ?`
      ).all(req.params.id, ...words.map(w => `%${w}%`), limit);
    }
  );

  // Add memory
  app.post<{ Params: { id: string }; Body: { content: string; type?: string; tags?: string[]; source_agent?: string; source_session?: string } }>(
    "/projects/:id/memory", (req) => {
      const memId = nanoid(12);
      const now = new Date().toISOString();
      db.prepare(
        "INSERT INTO memories (id, project_id, content, type, tags, source_agent, source_session, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        memId, req.params.id, req.body.content,
        req.body.type ?? "learned",
        JSON.stringify(req.body.tags ?? []),
        req.body.source_agent ?? "unknown",
        req.body.source_session ?? null,
        now
      );
      return db.prepare("SELECT * FROM memories WHERE id = ?").get(memId);
    }
  );

  // Delete memory
  app.delete<{ Params: { id: string; memId: string } }>(
    "/projects/:id/memory/:memId", (req) => {
      const result = db.prepare("DELETE FROM memories WHERE id = ? AND project_id = ?").run(req.params.memId, req.params.id);
      return { deleted: result.changes > 0 };
    }
  );

  // Count
  app.get<{ Params: { id: string } }>(
    "/projects/:id/memory/count", (req) => {
      const row = db.prepare("SELECT COUNT(*) as count FROM memories WHERE project_id = ?").get(req.params.id) as { count: number };
      return { count: row.count };
    }
  );

  // Global memory
  app.get<{ Querystring: { limit?: string } }>("/global/memory", (req) => {
    const limit = parseInt(req.query.limit ?? "20");
    return db.prepare(
      "SELECT * FROM memories WHERE project_id = 'global' ORDER BY created DESC LIMIT ?"
    ).all(limit);
  });
}
