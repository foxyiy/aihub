import type { Command } from "commander";
import { execSync } from "node:child_process";
import * as path from "node:path";
import * as log from "../utils/logger.js";

export function registerUpdateCommand(program: Command): void {
  program
    .command("update")
    .description("Update AIHub to the latest version")
    .action(async () => {
      // aihub 的安装目录（bin/aihub.js 往上两级）
      const aihubDir = path.resolve(new URL(".", import.meta.url).pathname, "..", "..");

      try {
        log.info("Checking for updates...");

        // git pull
        const pullResult = execSync("git pull", { cwd: aihubDir, encoding: "utf-8", timeout: 30000 }).trim();
        if (pullResult.includes("Already up to date")) {
          log.success("Already up to date.");
          return;
        }
        console.log(pullResult);

        // npm install (in case dependencies changed)
        log.info("Installing dependencies...");
        execSync("npm install", { cwd: aihubDir, encoding: "utf-8", timeout: 60000, stdio: "pipe" });

        // build
        log.info("Building...");
        execSync("./node_modules/.bin/tsc", { cwd: aihubDir, encoding: "utf-8", timeout: 30000 });

        log.success("AIHub updated successfully!");
        log.dim("If server is running, restart it: aihub server stop && aihub server start &");
      } catch (e) {
        log.error(`Update failed: ${(e as Error).message}`);
        process.exit(1);
      }
    });
}
