import Fastify from "fastify";
import { initDatabase } from "./db.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerRulesRoutes } from "./routes/rules.js";
import { registerContextRoutes } from "./routes/context.js";
import { registerMemoryRoutes } from "./routes/memory.js";
import { registerSessionRoutes } from "./routes/sessions.js";

export async function startServer(port = 8642): Promise<void> {
  const db = await initDatabase();
  const app = Fastify({ logger: false });

  app.get("/health", () => ({ status: "ok", version: "0.2.0" }));

  registerProjectRoutes(app, db);
  registerRulesRoutes(app);
  registerContextRoutes(app);
  registerMemoryRoutes(app, db);
  registerSessionRoutes(app, db);

  await app.listen({ port, host: "0.0.0.0" });
  console.log(`AIHub server running on http://0.0.0.0:${port}`);

  const shutdown = () => { db.close(); process.exit(0); };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
