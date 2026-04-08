import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import { nanoid } from "nanoid";

export function registerSessionRoutes(app: FastifyInstance, db: Database.Database): void {
  // List sessions
  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    "/projects/:id/sessions", (req) => {
      const limit = parseInt(req.query.limit ?? "20");
      const sessions = db.prepare(
        "SELECT * FROM sessions WHERE project_id = ? ORDER BY created DESC LIMIT ?"
      ).all(req.params.id, limit) as Array<Record<string, unknown>>;

      // Attach segments to each session
      for (const s of sessions) {
        s.segments = db.prepare(
          "SELECT * FROM session_segments WHERE session_id = ? ORDER BY started"
        ).all(s.id);
      }
      return sessions;
    }
  );

  // Create session
  app.post<{ Params: { id: string }; Body: { task: string; agent: string } }>(
    "/projects/:id/sessions", (req) => {
      const sessionId = nanoid(10);
      const segId = nanoid(8);
      const now = new Date().toISOString();

      db.prepare(
        "INSERT INTO sessions (id, project_id, task, status, created) VALUES (?, ?, ?, 'active', ?)"
      ).run(sessionId, req.params.id, req.body.task, now);

      db.prepare(
        "INSERT INTO session_segments (id, session_id, agent, started) VALUES (?, ?, ?, ?)"
      ).run(segId, sessionId, req.body.agent, now);

      return { id: sessionId, segmentId: segId };
    }
  );

  // Update session (complete, add segment, etc)
  app.put<{ Params: { id: string; sessionId: string }; Body: Record<string, unknown> }>(
    "/projects/:id/sessions/:sessionId", (req) => {
      const body = req.body;

      if (body.status === "completed") {
        const now = new Date().toISOString();
        db.prepare("UPDATE sessions SET status = 'completed', ended = ? WHERE id = ?").run(now, req.params.sessionId);
        // Close open segments
        db.prepare(
          "UPDATE session_segments SET ended = ? WHERE session_id = ? AND ended IS NULL"
        ).run(now, req.params.sessionId);
      }

      if (body.newAgent) {
        const now = new Date().toISOString();
        // Close current segment
        db.prepare(
          "UPDATE session_segments SET ended = ?, handoff = ? WHERE session_id = ? AND ended IS NULL"
        ).run(now, (body.handoff as string) ?? "", req.params.sessionId);
        // New segment
        const segId = nanoid(8);
        db.prepare(
          "INSERT INTO session_segments (id, session_id, agent, started) VALUES (?, ?, ?, ?)"
        ).run(segId, req.params.sessionId, body.newAgent, now);
        return { segmentId: segId };
      }

      if (body.git_changes) {
        db.prepare(
          "UPDATE session_segments SET git_changes = ? WHERE session_id = ? AND ended IS NULL"
        ).run(JSON.stringify(body.git_changes), req.params.sessionId);
      }

      return { ok: true };
    }
  );

  // Get single session
  app.get<{ Params: { id: string; sessionId: string } }>(
    "/projects/:id/sessions/:sessionId", (req) => {
      const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(req.params.sessionId) as Record<string, unknown> | undefined;
      if (!session) return { error: "not found" };
      session.segments = db.prepare(
        "SELECT * FROM session_segments WHERE session_id = ? ORDER BY started"
      ).all(req.params.sessionId);
      return session;
    }
  );
}
