import type { FastifyInstance } from "fastify";
import { getSkills, getGlobalSkills, putSkill, deleteSkill } from "../store.js";

export function registerSkillsRoutes(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>("/projects/:id/skills", (req) => {
    return getSkills(req.params.id);
  });

  app.get("/global/skills", () => {
    return getGlobalSkills();
  });

  app.put<{ Params: { id: string; file: string }; Body: { content: string } }>(
    "/projects/:id/skills/:file", (req) => {
      putSkill(req.params.id, req.params.file, req.body.content);
      return { ok: true };
    }
  );

  app.delete<{ Params: { id: string; file: string } }>(
    "/projects/:id/skills/:file", (req) => {
      return { deleted: deleteSkill(req.params.id, req.params.file) };
    }
  );
}
