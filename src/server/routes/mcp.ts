import type { FastifyInstance } from "fastify";
import { getMcp, putMcp, getGlobalMcp, putGlobalMcp } from "../store.js";

export function registerMcpRoutes(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>("/projects/:id/mcp", (req) => {
    return getMcp(req.params.id);
  });

  app.put<{ Params: { id: string }; Body: Record<string, unknown> }>(
    "/projects/:id/mcp", (req) => {
      putMcp(req.params.id, req.body);
      return { ok: true };
    }
  );

  app.get("/global/mcp", () => {
    return getGlobalMcp();
  });

  app.put<{ Body: Record<string, unknown> }>("/global/mcp", (req) => {
    putGlobalMcp(req.body);
    return { ok: true };
  });
}
