import type { Command } from "commander";
import { spawn } from "node:child_process";
import * as path from "node:path";
import * as api from "../client/api.js";
import * as log from "../utils/logger.js";

export function registerServerCommand(program: Command): void {
  const srv = program.command("server").description("Manage the AIHub server");

  srv.command("start")
    .description("Start the AIHub server")
    .option("-p, --port <port>", "Port", "8642")
    .option("-f, --foreground", "Run in foreground")
    .action(async (opts: { port: string; foreground?: boolean }) => {
      // Check if already running
      if (await api.health()) {
        log.info("Server is already running.");
        return;
      }

      if (opts.foreground) {
        // Import and run directly
        const { startServer } = await import("../server/index.js");
        await startServer(parseInt(opts.port));
      } else {
        // Spawn detached
        const entry = path.resolve(import.meta.dirname, "../src/server/run.js");
        const child = spawn("node", [entry, opts.port], {
          detached: true,
          stdio: "ignore",
        });
        child.unref();
        log.success(`Server started on port ${opts.port} (PID: ${child.pid})`);
      }
    });

  srv.command("stop")
    .description("Stop the AIHub server")
    .action(async () => {
      log.warn("Send SIGTERM to server process or use Ctrl+C if foreground.");
    });

  srv.command("status")
    .description("Check server status")
    .action(async () => {
      const ok = await api.health();
      if (ok) log.success("Server is running.");
      else log.error("Server is not running. Start with: aihub server start");
    });
}
