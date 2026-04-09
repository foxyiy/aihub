import type { Command } from "commander";
import chalk from "chalk";
import * as api from "../client/api.js";
import { autoImportMcp, autoImportSkills } from "../core/auto-import.js";
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

      // Auto-import MCP and skills from local agents
      const projectId = projectPath.split("/").pop()!;
      const mcp = await autoImportMcp(projectId);
      if (mcp.imported > 0) {
        log.info(`Auto-imported ${mcp.imported} MCP servers: ${mcp.names.join(", ")}`);
      }
      const skills = await autoImportSkills(projectId);
      if (skills.imported > 0) {
        log.info(`Auto-imported ${skills.imported} skills: ${skills.names.join(", ")}`);
      }

      console.log();
      log.dim("Next steps:");
      log.dim("  aihub memory add \"your first memory\"");
      log.dim("  aihub chat \"your task\" --agent claude");
    });
}
