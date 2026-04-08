import type { FastifyInstance } from "fastify";
import { getRules, getGlobalRules, putRule, deleteRule } from "../store.js";

export function registerRulesRoutes(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>("/projects/:id/rules", (req) => {
    return getRules(req.params.id);
  });

  app.get("/global/rules", () => {
    return getGlobalRules();
  });

  app.put<{ Params: { id: string; file: string }; Body: { content: string } }>(
    "/projects/:id/rules/:file", (req) => {
      putRule(req.params.id, req.params.file, req.body.content);
      return { ok: true };
    }
  );

  app.delete<{ Params: { id: string; file: string } }>(
    "/projects/:id/rules/:file", (req) => {
      return { deleted: deleteRule(req.params.id, req.params.file) };
    }
  );
}
