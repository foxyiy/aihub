import type { Command } from "commander";
import { execSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as api from "../client/api.js";
import * as log from "../utils/logger.js";

export function registerServerCommand(program: Command): void {
  const srv = program.command("server").description("Manage the AIHub server");

  srv.command("start")
    .description("Start the AIHub server")
    .option("-p, --port <port>", "Port", "8642")
    .option("-d, --daemon", "Run in background")
    .action(async (opts: { port: string; daemon?: boolean }) => {
      if (await api.health()) {
        log.info("Server is already running.");
        return;
      }

      if (opts.daemon) {
        // Find project root
        let aihubDir = path.dirname(new URL(".", import.meta.url).pathname);
        while (!fs.existsSync(path.join(aihubDir, "package.json"))) {
          const parent = path.dirname(aihubDir);
          if (parent === aihubDir) break;
          aihubDir = parent;
        }

        const logFile = path.join(aihubDir, "server.log");
        const out = fs.openSync(logFile, "a");
        const err = fs.openSync(logFile, "a");
        const child = spawn("node", [path.join(aihubDir, "dist", "bin", "aihub.js"), "server", "start", "-p", opts.port], {
          cwd: aihubDir,
          detached: true,
          stdio: ["ignore", out, err],
        });
        child.unref();

        // Verify
        await new Promise(r => setTimeout(r, 2000));
        if (await api.health()) {
          log.success(`Server started in background (port ${opts.port}, log: ${logFile})`);
        } else {
          log.error("Server failed to start. Check server.log");
        }
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
