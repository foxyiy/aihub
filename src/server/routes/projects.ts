import type { FastifyInstance } from "fastify";
import type { SqlJsDatabase } from "../db.js";
import { all, one, run } from "../db.js";
import { nanoid } from "nanoid";
import { initProjectDirs } from "../store.js";

export function registerProjectRoutes(app: FastifyInstance, db: SqlJsDatabase): void {
  app.get("/projects", () => all(db, "SELECT * FROM projects ORDER BY created DESC"));

  app.get<{ Params: { id: string } }>("/projects/:id", (req) => {
    return one(db, "SELECT * FROM projects WHERE id = ?", [req.params.id]) ?? { error: "not found" };
  });

  app.post<{ Body: { path: string; description?: string } }>("/projects", (req) => {
    const projectPath = req.body.path;
    const id = projectPath.split("/").pop() ?? nanoid(8);
    const existing = one(db, "SELECT * FROM projects WHERE id = ? OR path = ?", [id, projectPath]);
    if (existing) return existing;
    run(db, "INSERT INTO projects (id, path, description, created) VALUES (?, ?, ?, ?)",
      [id, projectPath, req.body.description ?? "", new Date().toISOString()]);
    initProjectDirs(id);
    return one(db, "SELECT * FROM projects WHERE id = ?", [id]);
  });
}
