import type { Command } from "commander";
import chalk from "chalk";
import * as api from "../client/api.js";
import { syncMcpToAgent } from "../core/mcp-injector.js";
import type { McpServers } from "../core/mcp-injector.js";
import * as log from "../utils/logger.js";

function getProjectId(): string {
  return process.cwd().split("/").pop()!;
}

async function getServers(global?: boolean): Promise<Record<string, unknown>> {
  const config = global ? await api.getGlobalMcp() : await api.getMcp(getProjectId());
  return (config.servers ?? {}) as Record<string, unknown>;
}

async function putServers(servers: Record<string, unknown>, global?: boolean): Promise<void> {
  if (global) {
    await api.putGlobalMcp({ servers });
  } else {
    await api.putMcp(getProjectId(), { servers });
  }
}

export function registerMcpCommand(program: Command): void {
  const mcp = program.command("mcp").description("Manage MCP server configurations");

  mcp.command("show")
    .description("Show MCP configuration")
    .option("-g, --global", "Show global MCP config")
    .action(async (opts: { global?: boolean }) => {
      if (!(await api.health())) { log.error("Server not running."); process.exit(1); }
      const servers = await getServers(opts.global);
      const names = Object.keys(servers);
      if (names.length === 0) {
        log.info(opts.global ? "No global MCP servers." : "No project MCP servers.");
        return;
      }
      console.log(chalk.bold(`\n${opts.global ? "Global" : "Project"} MCP Servers:\n`));
      for (const name of names) {
        const srv = servers[name] as Record<string, unknown>;
        const cmd = srv.command ?? srv.url ?? "";
        const args = Array.isArray(srv.args) ? srv.args.join(" ") : "";
        console.log(`  ${chalk.cyan(name)}  ${chalk.dim(`${cmd} ${args}`.trim())}`);
      }
      console.log();
    });

  mcp.command("add <name> <json>")
    .description("Add a single MCP server")
    .option("-g, --global", "Add to global config")
    .action(async (name: string, jsonStr: string, opts: { global?: boolean }) => {
      if (!(await api.health())) { log.error("Server not running."); process.exit(1); }
      try {
        const serverConfig = JSON.parse(jsonStr);
        const servers = await getServers(opts.global);
        servers[name] = serverConfig;
        await putServers(servers, opts.global);
        log.success(`MCP server added${opts.global ? " (global)" : ""}: ${chalk.cyan(name)}`);
      } catch (e) {
        log.error(`Invalid JSON: ${(e as Error).message}`);
      }
    });

  mcp.command("remove <name>")
    .description("Remove a MCP server")
    .option("-g, --global", "Remove from global config")
    .action(async (name: string, opts: { global?: boolean }) => {
      if (!(await api.health())) { log.error("Server not running."); process.exit(1); }
      const servers = await getServers(opts.global);
      if (!(name in servers)) {
        log.error(`MCP server not found: ${name}`);
        return;
      }
      delete servers[name];
      await putServers(servers, opts.global);
      log.success(`MCP server removed: ${name}`);
    });

  mcp.command("set <json>")
    .description("Set entire MCP configuration (JSON string)")
    .option("-g, --global", "Set global config")
    .action(async (jsonStr: string, opts: { global?: boolean }) => {
      if (!(await api.health())) { log.error("Server not running."); process.exit(1); }
      try {
        const data = JSON.parse(jsonStr);
        if (opts.global) {
          await api.putGlobalMcp(data);
        } else {
          await api.putMcp(getProjectId(), data);
        }
        log.success("MCP configuration updated.");
      } catch (e) {
        log.error(`Invalid JSON: ${(e as Error).message}`);
      }
    });

  mcp.command("sync")
    .description("Sync MCP config to agent config files (permanent)")
    .option("-a, --agent <agents>", "Comma-separated agents (default: all detected)")
    .action(async (opts: { agent?: string }) => {
      if (!(await api.health())) { log.error("Server not running."); process.exit(1); }

      // Merge global + project
      const globalServers = await getServers(true);
      const projectServers = await getServers(false);
      const allServers = { ...globalServers, ...projectServers } as McpServers;

      if (Object.keys(allServers).length === 0) {
        log.info("No MCP servers to sync.");
        return;
      }

      log.info(`Syncing ${Object.keys(allServers).length} MCP servers (${Object.keys(globalServers).length} global + ${Object.keys(projectServers).length} project)`);

      const projectDir = process.cwd();
      const agents = opts.agent
        ? opts.agent.split(",").map(a => a.trim())
        : ["claude", "claude-internal", "codebuddy"];

      for (const agent of agents) {
        const result = syncMcpToAgent(agent, projectDir, allServers);
        if (result) {
          log.success(`${chalk.cyan(agent)} → ${result.path} (${result.action})`);
        }
      }
    });
}
