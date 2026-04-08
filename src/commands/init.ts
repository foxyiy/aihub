import type { Command } from "commander";
import chalk from "chalk";
import * as api from "../client/api.js";
import { detectAvailable } from "../drivers/registry.js";
import * as log from "../utils/logger.js";

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Register current project with AIHub server")
    .action(async () => {
      if (!(await api.health())) {
        log.error("Server not running. Start with: aihub server start");
        process.exit(1);
      }

      const projectPath = process.cwd();
      const project = await api.registerProject(projectPath);
      log.success(`Project registered: ${chalk.bold(project.id as string)}`);

      const agents = await detectAvailable();
      if (agents.length > 0) {
        log.info(`Detected agents: ${agents.map(a => chalk.cyan(a.displayName)).join(", ")}`);
      }

      console.log();
      log.dim("Next steps:");
      log.dim("  aihub memory add \"your first memory\"");
      log.dim("  aihub chat \"your task\" --agent claude");
    });
}
