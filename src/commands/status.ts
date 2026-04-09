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
      const [
        rules, globalRules, context, globalContext,
        memCount, sessions, agents, mcp, globalMcp, skills, globalSkills,
      ] = await Promise.all([
        api.getRules(projectId).catch(() => []),
        api.getGlobalRules().catch(() => []),
        api.getProjectContext(projectId).catch(() => []),
        api.getGlobalContext().catch(() => []),
        api.memoryCount(projectId).catch(() => 0),
        api.listSessions(projectId, 5).catch(() => []),
        detectAvailable(),
        api.getMcp(projectId).catch(() => ({ servers: {} })),
        api.getGlobalMcp().catch(() => ({ servers: {} })),
        api.getSkills(projectId).catch(() => []),
        api.getGlobalSkills().catch(() => []),
      ]);

      const projMcpServers = Object.keys((mcp.servers ?? {}) as Record<string, unknown>);
      const globalMcpServers = Object.keys((globalMcp.servers ?? {}) as Record<string, unknown>);
      const totalMcp = projMcpServers.length + globalMcpServers.length;
      const allMcpNames = [...globalMcpServers, ...projMcpServers];
      const totalRules = rules.length + globalRules.length;
      const totalContext = context.length + globalContext.length;
      const totalSkills = [...skills, ...globalSkills];

      console.log();
      console.log(chalk.bold(`  AIHub — ${projectId}`));
      console.log(chalk.dim("  ─────────────────────────────────"));
      console.log(`  📋 Rules:     ${totalRules} files${globalRules.length > 0 ? chalk.dim(` (${globalRules.length} global)`) : ""}`);
      console.log(`  📝 Context:   ${totalContext} files${globalContext.length > 0 ? chalk.dim(` (${globalContext.length} global)`) : ""}`);
      console.log(`  🧠 Memories:  ${memCount} entries`);
      console.log(`  🔌 MCP:       ${totalMcp > 0 ? allMcpNames.join(", ") : chalk.dim("none")}${globalMcpServers.length > 0 ? chalk.dim(` (${globalMcpServers.length} global)`) : ""}`);
      console.log(`  ⚡ Skills:    ${totalSkills.length > 0 ? totalSkills.map(s => s.filename.replace(/\.md$/, "")).join(", ") : chalk.dim("none")}${globalSkills.length > 0 ? chalk.dim(` (${globalSkills.length} global)`) : ""}`);
      console.log(`  💬 Sessions:  ${sessions.length} recent`);
      console.log(`  🤖 Agents:    ${agents.length > 0 ? agents.map(a => chalk.cyan(a.displayName)).join(", ") : chalk.dim("none")}`);
      console.log(`  🖥  Server:    ${chalk.green("running")}`);
      console.log();
    });
}
