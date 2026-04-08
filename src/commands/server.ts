import type { Command } from "commander";
import { execSync } from "node:child_process";
import * as api from "../client/api.js";
import * as log from "../utils/logger.js";

export function registerServerCommand(program: Command): void {
  const srv = program.command("server").description("Manage the AIHub server");

  srv.command("start")
    .description("Start the AIHub server (foreground, use & or nohup for background)")
    .option("-p, --port <port>", "Port", "8642")
    .action(async (opts: { port: string }) => {
      if (await api.health()) {
        log.info("Server is already running.");
        return;
      }

      const { startServer } = await import("../server/index.js");
      await startServer(parseInt(opts.port));
    });

  srv.command("stop")
    .description("Stop the AIHub server")
    .action(async () => {
      try {
        const pids = execSync("lsof -ti :8642", { encoding: "utf-8" }).trim();
        if (pids) {
          for (const pid of pids.split("\n")) {
            process.kill(parseInt(pid), "SIGTERM");
          }
          log.success("Server stopped.");
          return;
        }
      } catch { /* no process */ }

      log.info("Server is not running.");
    });

  srv.command("status")
    .description("Check server status")
    .action(async () => {
      if (await api.health()) {
        log.success("Server is running.");
      } else {
        log.error("Server is not running. Start with: aihub server start");
      }
    });
}
