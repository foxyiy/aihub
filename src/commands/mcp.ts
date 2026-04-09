import type { Command } from "commander";
import chalk from "chalk";
import * as api from "../client/api.js";
import { syncMcpToAgent } from "../core/mcp-injector.js";
import type { McpServers } from "../core/mcp-injector.js";
import * as log from "../utils/logger.js";

function getProjectId(): string {
  return process.cwd().split("/").pop()!;
}

export function registerMcpCommand(program: Command): void {
  const mcp = program.command("mcp").description("Manage MCP server configurations");

  mcp.command("show")
    .description("Show current MCP configuration")
    .action(async () => {
      if (!(await api.health())) { log.error("Server not running."); process.exit(1); }
      const config = await api.getMcp(getProjectId());
      const servers = (config.servers ?? {}) as Record<string, unknown>;
      const names = Object.keys(servers);
      if (names.length === 0) {
        log.info("No MCP servers configured.");
        return;
      }
      console.log(chalk.bold("\nMCP Servers:\n"));
      for (const name of names) {
        const srv = servers[name] as Record<string, unknown>;
        const cmd = srv.command ?? "";
        const args = Array.isArray(srv.args) ? srv.args.join(" ") : "";
        console.log(`  ${chalk.cyan(name)}  ${chalk.dim(`${cmd} ${args}`.trim())}`);
      }
      console.log();
    });

  mcp.command("set <json>")
    .description("Set entire MCP configuration (JSON string)")
    .action(async (jsonStr: string) => {
      if (!(await api.health())) { log.error("Server not running."); process.exit(1); }
      try {
        const data = JSON.parse(jsonStr);
        await api.putMcp(getProjectId(), data);
        log.success("MCP configuration updated.");
      } catch (e) {
        log.error(`Invalid JSON: ${(e as Error).message}`);
      }
    });

  mcp.command("add <name> <json>")
    .description("Add a single MCP server")
    .action(async (name: string, jsonStr: string) => {
      if (!(await api.health())) { log.error("Server not running."); process.exit(1); }
      try {
        const serverConfig = JSON.parse(jsonStr);
        const current = await api.getMcp(getProjectId());
        const servers = (current.servers ?? {}) as Record<string, unknown>;
        servers[name] = serverConfig;
        await api.putMcp(getProjectId(), { servers });
        log.success(`MCP server added: ${chalk.cyan(name)}`);
      } catch (e) {
        log.error(`Invalid JSON: ${(e as Error).message}`);
      }
    });

  mcp.command("remove <name>")
    .description("Remove a MCP server")
    .action(async (name: string) => {
      if (!(await api.health())) { log.error("Server not running."); process.exit(1); }
      const current = await api.getMcp(getProjectId());
      const servers = (current.servers ?? {}) as Record<string, unknown>;
      if (!(name in servers)) {
        log.error(`MCP server not found: ${name}`);
        return;
      }
      delete servers[name];
      await api.putMcp(getProjectId(), { servers });
      log.success(`MCP server removed: ${name}`);
    });

  mcp.command("sync")
    .description("Sync MCP config to agent config files (permanent)")
    .option("-a, --agent <agents>", "Comma-separated agents (default: all detected)")
    .action(async (opts: { agent?: string }) => {
      if (!(await api.health())) { log.error("Server not running."); process.exit(1); }
      const config = await api.getMcp(getProjectId());
      const servers = (config.servers ?? {}) as McpServers;
      if (Object.keys(servers).length === 0) {
        log.info("No MCP servers to sync.");
        return;
      }

      const projectDir = process.cwd();
      const agents = opts.agent
        ? opts.agent.split(",").map(a => a.trim())
        : ["claude", "claude-internal", "codebuddy"];

      for (const agent of agents) {
        const result = syncMcpToAgent(agent, projectDir, servers);
        if (result) {
          log.success(`${chalk.cyan(agent)} → ${result.path} (${result.action})`);
        }
      }
    });
}
