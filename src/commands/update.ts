import type { Command } from "commander";
import { execSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as api from "../client/api.js";
import * as log from "../utils/logger.js";

export function registerUpdateCommand(program: Command): void {
  program
    .command("update")
    .description("Update AIHub to the latest version and restart server")
    .action(async () => {
      // 从 dist/src/commands/update.js 找到项目根目录
      let aihubDir = path.dirname(new URL(".", import.meta.url).pathname);
      // 往上找直到找到 package.json
      while (!fs.existsSync(path.join(aihubDir, "package.json"))) {
        const parent = path.dirname(aihubDir);
        if (parent === aihubDir) break; // reached root
        aihubDir = parent;
      }

      try {
        log.info("Checking for updates...");

        // git pull
        const pullResult = execSync("git pull", { cwd: aihubDir, encoding: "utf-8", timeout: 30000 }).trim();
        if (pullResult.includes("Already up to date")) {
          log.success("Already up to date.");
          return;
        }
        console.log(pullResult);

        // npm install (include devDependencies for typescript)
        log.info("Installing dependencies...");
        execSync("npm install --include=dev", { cwd: aihubDir, encoding: "utf-8", timeout: 60000, stdio: "pipe" });

        // build
        log.info("Building...");
        execSync("node node_modules/typescript/bin/tsc", { cwd: aihubDir, encoding: "utf-8", timeout: 30000 });

        log.success("AIHub updated successfully!");

        // Restart server if running
        const serverWasRunning = await api.health();
        if (serverWasRunning) {
          log.info("Restarting server...");

          // Stop
          try {
            const pids = execSync("lsof -ti :8642", { encoding: "utf-8" }).trim();
            if (pids) {
              for (const pid of pids.split("\n")) {
                process.kill(parseInt(pid), "SIGTERM");
              }
            }
          } catch { /* no process */ }

          // Wait a moment for port release
          await new Promise(r => setTimeout(r, 1000));

          // Start in background
          const child = spawn("node", [path.join(aihubDir, "dist", "bin", "aihub.js"), "server", "start"], {
            cwd: aihubDir,
            detached: true,
            stdio: "ignore",
          });
          child.unref();

          // Verify
          await new Promise(r => setTimeout(r, 2000));
          if (await api.health()) {
            log.success("Server restarted.");
          } else {
            log.warn("Server may need manual restart: aihub server start &");
          }
        }
      } catch (e) {
        log.error(`Update failed: ${(e as Error).message}`);
        process.exit(1);
      }
    });
}
