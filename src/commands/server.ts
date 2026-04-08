import type { Command } from "commander";
import { spawn, execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as api from "../client/api.js";
import * as log from "../utils/logger.js";

const PID_FILE = path.join(os.homedir(), ".aihub-server.pid");

export function registerServerCommand(program: Command): void {
  const srv = program.command("server").description("Manage the AIHub server");

  srv.command("start")
    .description("Start the AIHub server")
    .option("-p, --port <port>", "Port", "8642")
    .option("-f, --foreground", "Run in foreground")
    .action(async (opts: { port: string; foreground?: boolean }) => {
      if (await api.health()) {
        log.info("Server is already running.");
        return;
      }

      if (opts.foreground) {
        const { startServer } = await import("../server/index.js");
        await startServer(parseInt(opts.port));
      } else {
        // Find the run.js entry point
        const candidates = [
          path.resolve(import.meta.dirname, "../server/run.js"),
          path.resolve(import.meta.dirname, "../../src/server/run.js"),
          path.resolve(import.meta.dirname, "../src/server/run.js"),
        ];
        const entry = candidates.find(f => fs.existsSync(f));
        if (!entry) {
          log.error("Cannot find server entry point. Try: aihub server start -f");
          return;
        }

        const child = spawn("node", [entry, opts.port], {
          detached: true,
          stdio: "ignore",
        });
        child.unref();

        // Save PID
        fs.writeFileSync(PID_FILE, String(child.pid), "utf-8");
        log.success(`Server started on port ${opts.port} (PID: ${child.pid})`);
      }
    });

  srv.command("stop")
    .description("Stop the AIHub server")
    .action(async () => {
      // Try PID file first
      if (fs.existsSync(PID_FILE)) {
        const pid = parseInt(fs.readFileSync(PID_FILE, "utf-8").trim());
        try {
          process.kill(pid, "SIGTERM");
          fs.unlinkSync(PID_FILE);
          log.success(`Server stopped (PID: ${pid})`);
          return;
        } catch {
          fs.unlinkSync(PID_FILE);
        }
      }

      // Fallback: find by port
      try {
        const pids = execSync("lsof -ti :8642", { encoding: "utf-8" }).trim();
        if (pids) {
          for (const pid of pids.split("\n")) {
            process.kill(parseInt(pid), "SIGTERM");
          }
          log.success("Server stopped.");
          return;
        }
      } catch { /* no process found */ }

      log.info("Server is not running.");
    });

  srv.command("status")
    .description("Check server status")
    .action(async () => {
      const ok = await api.health();
      if (ok) {
        let pidInfo = "";
        if (fs.existsSync(PID_FILE)) {
          pidInfo = ` (PID: ${fs.readFileSync(PID_FILE, "utf-8").trim()})`;
        }
        log.success(`Server is running${pidInfo}.`);
      } else {
        log.error("Server is not running. Start with: aihub server start");
      }
    });
}
