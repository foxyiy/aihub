import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import { nanoid } from "nanoid";
import { initProjectDirs } from "../store.js";

export function registerProjectRoutes(app: FastifyInstance, db: Database.Database): void {
  // List projects
  app.get("/projects", () => {
    return db.prepare("SELECT * FROM projects ORDER BY created DESC").all();
  });

  // Get project by id
  app.get<{ Params: { id: string } }>("/projects/:id", (req) => {
    const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id);
    if (!row) return { error: "not found" };
    return row;
  });

  // Register project (by path, auto-generates id from dir name)
  app.post<{ Body: { path: string; description?: string } }>("/projects", (req) => {
    const projectPath = req.body.path;
    const id = projectPath.split("/").pop() ?? nanoid(8);

    // Check if already exists
    const existing = db.prepare("SELECT * FROM projects WHERE id = ? OR path = ?").get(id, projectPath);
    if (existing) return existing;

    db.prepare("INSERT INTO projects (id, path, description, created) VALUES (?, ?, ?, ?)").run(
      id, projectPath, req.body.description ?? "", new Date().toISOString()
    );

    initProjectDirs(id);
    return db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
  });
}
