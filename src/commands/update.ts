import type { Command } from "commander";
import { execSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as api from "../client/api.js";
import * as log from "../utils/logger.js";

function findProjectRoot(): string {
  let dir = path.dirname(new URL(".", import.meta.url).pathname);
  while (!fs.existsSync(path.join(dir, "package.json"))) {
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dir;
}

function pullAndBuild(aihubDir: string): boolean {
  log.info("Checking for updates...");

  const pullResult = execSync("git pull", { cwd: aihubDir, encoding: "utf-8", timeout: 30000 }).trim();
  if (pullResult.includes("Already up to date")) {
    log.success("Already up to date.");
    return false;
  }
  console.log(pullResult);

  log.info("Installing dependencies...");
  execSync("npm install --include=dev", { cwd: aihubDir, encoding: "utf-8", timeout: 60000, stdio: "pipe" });

  log.info("Building...");
  execSync("node node_modules/typescript/bin/tsc", { cwd: aihubDir, encoding: "utf-8", timeout: 30000 });

  return true;
}

export function registerUpdateCommand(program: Command): void {
  const update = program.command("update").description("Update AIHub CLI or server");

  // aihub update client — 只拉代码编译，不碰 server
  update.command("client")
    .description("Update CLI only (git pull + build)")
    .action(async () => {
      try {
        const updated = pullAndBuild(findProjectRoot());
        if (updated) log.success("CLI updated.");
      } catch (e) {
        log.error(`Update failed: ${(e as Error).message}`);
        process.exit(1);
      }
    });

  // aihub update server — 拉代码编译 + 重启 server
  update.command("server")
    .description("Update and restart the AIHub server")
    .action(async () => {
      const aihubDir = findProjectRoot();
      try {
        const updated = pullAndBuild(aihubDir);

        // Restart server
        const serverWasRunning = await api.health();
        if (serverWasRunning || updated) {
          log.info("Restarting server...");

          // Stop
          try {
            const pids = execSync("lsof -ti :8642 || fuser 8642/tcp 2>/dev/null", {
              encoding: "utf-8", timeout: 5000,
            }).trim();
            if (pids) {
              for (const pid of pids.split(/\s+/)) {
                const n = parseInt(pid);
                if (n > 0) process.kill(n, "SIGTERM");
              }
            }
          } catch { /* no process */ }

          await new Promise(r => setTimeout(r, 1500));

          // Start in background
          const child = spawn("node", [path.join(aihubDir, "dist", "bin", "aihub.js"), "server", "start"], {
            cwd: aihubDir,
            detached: true,
            stdio: "ignore",
          });
          child.unref();

          await new Promise(r => setTimeout(r, 2000));
          if (await api.health()) {
            log.success("Server restarted.");
          } else {
            log.warn("Server may need manual restart: aihub server start &");
          }
        } else {
          log.info("Server not running, skipping restart.");
        }
      } catch (e) {
        log.error(`Update failed: ${(e as Error).message}`);
        process.exit(1);
      }
    });
}
