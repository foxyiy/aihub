import type { FastifyInstance } from "fastify";
import type { SqlJsDatabase } from "../db.js";
import { all, one, run } from "../db.js";
import { nanoid } from "nanoid";

export function registerMemoryRoutes(app: FastifyInstance, db: SqlJsDatabase): void {
  app.get<{ Params: { id: string }; Querystring: { limit?: string; offset?: string } }>(
    "/projects/:id/memory", (req) => {
      const limit = parseInt(req.query.limit ?? "20");
      const offset = parseInt(req.query.offset ?? "0");
      return all(db, "SELECT * FROM memories WHERE project_id = ? ORDER BY created DESC LIMIT ? OFFSET ?",
        [req.params.id, limit, offset]);
    });

  app.get<{ Params: { id: string }; Querystring: { q: string; limit?: string } }>(
    "/projects/:id/memory/search", (req) => {
      const q = req.query.q ?? "";
      const limit = parseInt(req.query.limit ?? "10");
      const words = q.toLowerCase().split(/\s+/).filter(w => w.length > 1);
      if (words.length === 0) {
        return all(db, "SELECT * FROM memories WHERE project_id = ? ORDER BY created DESC LIMIT ?",
          [req.params.id, limit]);
      }
      const clauses = words.map(() => "LOWER(content) LIKE ?").join(" OR ");
      return all(db,
        `SELECT * FROM memories WHERE project_id = ? AND (${clauses}) ORDER BY created DESC LIMIT ?`,
        [req.params.id, ...words.map(w => `%${w}%`), limit]);
    });

  app.post<{ Params: { id: string }; Body: { content: string; type?: string; tags?: string[]; source_agent?: string; source_session?: string } }>(
    "/projects/:id/memory", (req) => {
      const memId = nanoid(12);
      const now = new Date().toISOString();
      run(db,
        "INSERT INTO memories (id, project_id, content, type, tags, source_agent, source_session, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [memId, req.params.id, req.body.content, req.body.type ?? "learned",
         JSON.stringify(req.body.tags ?? []), req.body.source_agent ?? "unknown",
         req.body.source_session ?? null, now]);
      return one(db, "SELECT * FROM memories WHERE id = ?", [memId]);
    });

  app.delete<{ Params: { id: string; memId: string } }>(
    "/projects/:id/memory/:memId", (req) => {
      const before = one(db, "SELECT id FROM memories WHERE id = ? AND project_id = ?", [req.params.memId, req.params.id]);
      if (!before) return { deleted: false };
      run(db, "DELETE FROM memories WHERE id = ? AND project_id = ?", [req.params.memId, req.params.id]);
      return { deleted: true };
    });

  app.get<{ Params: { id: string } }>(
    "/projects/:id/memory/count", (req) => {
      const row = one(db, "SELECT COUNT(*) as count FROM memories WHERE project_id = ?", [req.params.id]);
      return { count: row?.count ?? 0 };
    });

  app.get<{ Querystring: { limit?: string } }>("/global/memory", (req) => {
    const limit = parseInt(req.query.limit ?? "20");
    return all(db, "SELECT * FROM memories WHERE project_id = 'global' ORDER BY created DESC LIMIT ?", [limit]);
  });
}
