import type { FastifyInstance } from "fastify";
import type { SqlJsDatabase } from "../db.js";
import { all, one, run } from "../db.js";
import { nanoid } from "nanoid";

export function registerSessionRoutes(app: FastifyInstance, db: SqlJsDatabase): void {
  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    "/projects/:id/sessions", (req) => {
      const limit = parseInt(req.query.limit ?? "20");
      const sessions = all(db, "SELECT * FROM sessions WHERE project_id = ? ORDER BY created DESC LIMIT ?",
        [req.params.id, limit]);
      for (const s of sessions) {
        s.segments = all(db, "SELECT * FROM session_segments WHERE session_id = ? ORDER BY started", [s.id as string]);
      }
      return sessions;
    });

  app.post<{ Params: { id: string }; Body: { task: string; agent: string } }>(
    "/projects/:id/sessions", (req) => {
      const sessionId = nanoid(10);
      const segId = nanoid(8);
      const now = new Date().toISOString();
      run(db, "INSERT INTO sessions (id, project_id, task, status, created) VALUES (?, ?, ?, 'active', ?)",
        [sessionId, req.params.id, req.body.task, now]);
      run(db, "INSERT INTO session_segments (id, session_id, agent, started) VALUES (?, ?, ?, ?)",
        [segId, sessionId, req.body.agent, now]);
      return { id: sessionId, segmentId: segId };
    });

  app.put<{ Params: { id: string; sessionId: string }; Body: Record<string, unknown> }>(
    "/projects/:id/sessions/:sessionId", (req) => {
      const body = req.body;
      const now = new Date().toISOString();

      if (body.status === "completed") {
        run(db, "UPDATE sessions SET status = 'completed', ended = ? WHERE id = ?", [now, req.params.sessionId]);
        run(db, "UPDATE session_segments SET ended = ? WHERE session_id = ? AND ended IS NULL", [now, req.params.sessionId]);
      }

      if (body.newAgent) {
        run(db, "UPDATE session_segments SET ended = ?, handoff = ? WHERE session_id = ? AND ended IS NULL",
          [now, (body.handoff as string) ?? "", req.params.sessionId]);
        const segId = nanoid(8);
        run(db, "INSERT INTO session_segments (id, session_id, agent, started) VALUES (?, ?, ?, ?)",
          [segId, req.params.sessionId, body.newAgent, now]);
        return { segmentId: segId };
      }

      if (body.git_changes) {
        run(db, "UPDATE session_segments SET git_changes = ? WHERE session_id = ? AND ended IS NULL",
          [JSON.stringify(body.git_changes), req.params.sessionId]);
      }

      return { ok: true };
    });

  app.get<{ Params: { id: string; sessionId: string } }>(
    "/projects/:id/sessions/:sessionId", (req) => {
      const session = one(db, "SELECT * FROM sessions WHERE id = ?", [req.params.sessionId]);
      if (!session) return { error: "not found" };
      session.segments = all(db, "SELECT * FROM session_segments WHERE session_id = ? ORDER BY started", [req.params.sessionId]);
      return session;
    });
}
