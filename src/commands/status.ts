import type { Command } from "commander";
import chalk from "chalk";
import * as api from "../client/api.js";
import { detectAvailable } from "../drivers/registry.js";
import * as log from "../utils/logger.js";

interface ProjectRecord {
  id: string;
  path?: string;
  description?: string;
}

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Show AIHub status (all projects + global configs)")
    .action(async () => {
      const serverOk = await api.health();
      if (!serverOk) {
        log.error("Server not running. Start with: aihub server start");
        return;
      }

      // ── Global data ──
      const [globalRules, globalContext, globalMcp, globalSkills, agents, projects] = await Promise.all([
        api.getGlobalRules().catch(() => []),
        api.getGlobalContext().catch(() => []),
        api.getGlobalMcp().catch(() => ({ servers: {} })),
        api.getGlobalSkills().catch(() => []),
        detectAvailable(),
        api.listProjects().catch(() => []),
      ]);

      const globalMcpNames = Object.keys((globalMcp.servers ?? {}) as Record<string, unknown>);

      // ── Header ──
      console.log();
      console.log(chalk.bold("  AIHub Server Status"));
      console.log(chalk.dim("  ═══════════════════════════════════════"));

      // ── Global section ──
      console.log();
      console.log(chalk.bold("  🌐 Global"));
      console.log(chalk.dim("  ─────────────────────────────────"));
      console.log(`  📋 Rules:     ${fmtCount(globalRules.length, globalRules.map(r => r.filename))}`);
      console.log(`  📝 Context:   ${fmtCount(globalContext.length, globalContext.map(c => c.filename))}`);
      console.log(`  🔌 MCP:       ${fmtCount(globalMcpNames.length, globalMcpNames)}`);
      console.log(`  ⚡ Skills:    ${fmtCount(globalSkills.length, globalSkills.map((s: { filename: string }) => s.filename.replace(/\.md$/, "")))}`);
      console.log(`  🤖 Agents:    ${agents.length > 0 ? agents.map(a => chalk.cyan(a.displayName)).join(", ") : chalk.dim("none")}`);

      // ── Per-project sections ──
      const currentProjectId = process.cwd().split("/").pop()!;
      const projs = (projects as ProjectRecord[]).sort((a, b) => {
        // Current project first
        if (a.id === currentProjectId) return -1;
        if (b.id === currentProjectId) return 1;
        return a.id.localeCompare(b.id);
      });

      for (const proj of projs) {
        const pid = proj.id;
        const isCurrent = pid === currentProjectId;

        const [rules, context, mcp, skills, sessions, memCount] = await Promise.all([
          api.getRules(pid).catch(() => []),
          api.getProjectContext(pid).catch(() => []),
          api.getMcp(pid).catch(() => ({ servers: {} })),
          api.getSkills(pid).catch(() => []),
          api.listSessions(pid, 5).catch(() => []),
          api.memoryCount(pid).catch(() => 0),
        ]);

        const mcpNames = Object.keys((mcp.servers ?? {}) as Record<string, unknown>);

        console.log();
        console.log(chalk.bold(`  📁 ${pid}`) + (isCurrent ? chalk.green(" ← current") : "") + (proj.path ? chalk.dim(`  ${proj.path}`) : ""));
        console.log(chalk.dim("  ─────────────────────────────────"));
        console.log(`  📋 Rules:     ${fmtCount(rules.length, rules.map(r => r.filename))}`);
        console.log(`  📝 Context:   ${fmtCount(context.length, context.map(c => c.filename))}`);
        console.log(`  🔌 MCP:       ${fmtCount(mcpNames.length, mcpNames)}`);
        console.log(`  ⚡ Skills:    ${fmtCount(skills.length, skills.map((s: { filename: string }) => s.filename.replace(/\.md$/, "")))}`);
        console.log(`  🧠 Memories:  ${memCount} entries`);
        console.log(`  💬 Sessions:  ${sessions.length} recent`);
      }

      if (projs.length === 0) {
        console.log();
        console.log(chalk.dim("  No projects registered. Run `aihub import all` in a project directory."));
      }

      // ── Footer ──
      console.log();
      console.log(`  🖥  Server:    ${chalk.green("running")}  ${chalk.dim(`(${projs.length} projects)`)}`);
      console.log();
    });
}

function fmtCount(count: number, names: string[]): string {
  if (count === 0) return chalk.dim("none");
  const joined = names.join(", ");
  return `${count} — ${joined}`;
}
