import type { FastifyInstance } from "fastify";
import { getContext, getGlobalContext, putContext, deleteContext } from "../store.js";

export function registerContextRoutes(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>("/projects/:id/context", (req) => {
    return getContext(req.params.id);
  });

  app.get("/global/context", () => {
    return getGlobalContext();
  });

  app.put<{ Params: { id: string; file: string }; Body: { content: string } }>(
    "/projects/:id/context/:file", (req) => {
      putContext(req.params.id, req.params.file, req.body.content);
      return { ok: true };
    }
  );

  app.delete<{ Params: { id: string; file: string } }>(
    "/projects/:id/context/:file", (req) => {
      return { deleted: deleteContext(req.params.id, req.params.file) };
    }
  );
}
