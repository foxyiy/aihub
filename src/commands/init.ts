import type { Command } from "commander";
import chalk from "chalk";
import * as api from "../client/api.js";
import { autoImportMcp, autoImportSkills } from "../core/auto-import.js";
import { detectAvailable } from "../drivers/registry.js";
import * as log from "../utils/logger.js";

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Register project + auto-import local agent configs (MCP, skills) to AIHub server")
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

      // Auto-import
      const projectId = projectPath.split("/").pop()!;
      console.log(chalk.bold("\nScanning local agent configs:"));

      const mcp = await autoImportMcp(projectId);
      if (mcp.imported > 0) {
        console.log(`  ${chalk.green("✓")} MCP:    ${mcp.imported} servers imported (${mcp.names.join(", ")})`);
      } else {
        console.log(`  ${chalk.dim("–")} MCP:    ${chalk.dim("no new servers found")}`);
      }

      const skills = await autoImportSkills(projectId);
      if (skills.imported > 0) {
        console.log(`  ${chalk.green("✓")} Skills: ${skills.imported} imported (${skills.names.join(", ")})`);
      } else {
        console.log(`  ${chalk.dim("–")} Skills: ${chalk.dim("no new skills found")}`);
      }

      console.log(chalk.bold("\nWhat init does:"));
      console.log(chalk.dim("  1. Register project with AIHub server"));
      console.log(chalk.dim("  2. Scan ~/.claude/ and ~/.codebuddy/ for MCP configs → upload to server"));
      console.log(chalk.dim("  3. Scan .claude/commands/ and .codebuddy/skills/ → upload to server"));

      console.log(chalk.bold("\nNext steps:"));
      console.log(chalk.dim("  aihub status                        View project data overview"));
      console.log(chalk.dim("  aihub import all                    Import historical memories from agent logs"));
      console.log(chalk.dim("  aihub chat \"task\" --agent claude     Start a session"));
      console.log();
    });
}
