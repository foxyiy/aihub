import type { Command } from "commander";
import chalk from "chalk";
import * as api from "../client/api.js";
import { detectAvailable } from "../drivers/registry.js";
import * as log from "../utils/logger.js";

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Show AIHub status")
    .action(async () => {
      const serverOk = await api.health();
      if (!serverOk) {
        log.error("Server not running. Start with: aihub server start");
        return;
      }

      const projectId = process.cwd().split("/").pop()!;
      const [rules, context, memCount, sessions, agents, mcp, skills] = await Promise.all([
        api.getRules(projectId).catch(() => []),
        api.getProjectContext(projectId).catch(() => []),
        api.memoryCount(projectId).catch(() => 0),
        api.listSessions(projectId, 5).catch(() => []),
        detectAvailable(),
        api.getMcp(projectId).catch(() => ({ servers: {} })),
        api.getSkills(projectId).catch(() => []),
      ]);

      const mcpServers = Object.keys((mcp.servers ?? {}) as Record<string, unknown>);

      console.log();
      console.log(chalk.bold(`  AIHub — ${projectId}`));
      console.log(chalk.dim("  ─────────────────────────────────"));
      console.log(`  📋 Rules:     ${rules.length} files`);
      console.log(`  📝 Context:   ${context.length} files`);
      console.log(`  🧠 Memories:  ${memCount} entries`);
      console.log(`  🔌 MCP:       ${mcpServers.length > 0 ? mcpServers.join(", ") : chalk.dim("none")}`);
      console.log(`  ⚡ Skills:    ${skills.length > 0 ? skills.map(s => s.filename.replace(/\.md$/, "")).join(", ") : chalk.dim("none")}`);
      console.log(`  💬 Sessions:  ${sessions.length} recent`);
      console.log(`  🤖 Agents:    ${agents.length > 0 ? agents.map(a => chalk.cyan(a.displayName)).join(", ") : chalk.dim("none")}`);
      console.log(`  🖥  Server:    ${chalk.green("running")}`);
      console.log();
    });
}
