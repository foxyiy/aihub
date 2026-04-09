import type { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import chalk from "chalk";
import * as api from "../client/api.js";
import { extractMemoriesFromLogs } from "../core/memory-extractor.js";
import * as log from "../utils/logger.js";

function getProjectId(): string {
  return process.cwd().split("/").pop()!;
}

export function registerImportCommand(program: Command): void {
  const imp = program.command("import").description("Import local agent data (MCP, skills, memories) into AIHub server");

  imp.command("mcp")
    .description("Scan ~/.claude/ and ~/.codebuddy/plugins/ → import MCP configs to server (global→global, project→project)")
    .action(async () => {
      if (!(await api.health())) { log.error("Server not running."); process.exit(1); }

      const collected: Record<string, unknown> = {};

      // 1. Claude global MCP
      const claudeGlobal = path.join(os.homedir(), ".claude", "settings.local.json");
      if (fs.existsSync(claudeGlobal)) {
        try {
          const config = JSON.parse(fs.readFileSync(claudeGlobal, "utf-8"));
          if (config.mcpServers) {
            Object.assign(collected, config.mcpServers);
            log.dim(`Claude global: ${Object.keys(config.mcpServers).length} MCP servers`);
          }
        } catch { /* skip */ }
      }

      // 2. Claude project-level MCP
      const claudeProject = path.join(process.cwd(), ".claude", "settings.local.json");
      if (fs.existsSync(claudeProject)) {
        try {
          const config = JSON.parse(fs.readFileSync(claudeProject, "utf-8"));
          if (config.mcpServers) {
            Object.assign(collected, config.mcpServers);
            log.dim(`Claude project: ${Object.keys(config.mcpServers).length} MCP servers`);
          }
        } catch { /* skip */ }
      }

      // 3. CodeBuddy plugins with .mcp.json
      const pluginsDir = path.join(os.homedir(), ".codebuddy", "plugins", "marketplaces");
      if (fs.existsSync(pluginsDir)) {
        const mcpFiles = findFiles(pluginsDir, ".mcp.json");
        for (const f of mcpFiles) {
          try {
            const data = JSON.parse(fs.readFileSync(f, "utf-8"));
            // Two formats: { "name": {...} } or { "mcpServers": { "name": {...} } }
            const servers = data.mcpServers ?? data;
            Object.assign(collected, servers);
          } catch { /* skip */ }
        }
        if (mcpFiles.length > 0) {
          log.dim(`CodeBuddy plugins: ${mcpFiles.length} MCP config files`);
        }
      }

      if (Object.keys(collected).length === 0) {
        log.info("No MCP configs found locally.");
        return;
      }

      // Merge into server
      const projectId = getProjectId();
      const current = await api.getMcp(projectId);
      const existing = (current.servers ?? {}) as Record<string, unknown>;
      const merged = { ...existing, ...collected };
      await api.putMcp(projectId, { servers: merged });

      console.log(chalk.bold(`\nImported ${Object.keys(collected).length} MCP servers:\n`));
      for (const name of Object.keys(collected)) {
        const srv = collected[name] as Record<string, unknown>;
        const cmd = srv.command ?? srv.url ?? "";
        console.log(`  ${chalk.cyan(name)}  ${chalk.dim(String(cmd))}`);
      }
      console.log();
      log.success(`Total on server: ${Object.keys(merged).length} MCP servers`);
    });

  imp.command("memories")
    .description("Parse agent JSONL session logs → extract memories via LLM summarization")
    .option("-a, --agent <agents>", "Agents to scan (comma-separated)", "claude-internal,codebuddy")
    .option("-n, --limit <n>", "Max memories per session", "5")
    .action(async (opts: { agent: string; limit: string }) => {
      if (!(await api.health())) { log.error("Server not running."); process.exit(1); }

      const projectPath = process.cwd();
      const projectId = getProjectId();
      await api.registerProject(projectPath);

      const agents = opts.agent.split(",").map(a => a.trim());
      const maxPerSession = parseInt(opts.limit);
      let total = 0;

      for (const agent of agents) {
        log.dim(`Scanning ${agent} logs...`);
        // extractMemoriesFromLogs with timestamp 0 → scan all sessions
        const memories = await extractMemoriesFromLogs(agent, projectPath, 0);
        const toImport = memories.slice(0, maxPerSession * 5); // reasonable cap

        for (const mem of toImport) {
          await api.addMemory(projectId, mem.content, {
            type: mem.type,
            tags: [...mem.tags, "imported"],
            source_agent: agent,
          });
          total++;
        }

        if (toImport.length > 0) {
          log.info(`${agent}: imported ${toImport.length} memories`);
        } else {
          log.dim(`${agent}: no memories found`);
        }
      }

      if (total > 0) {
        log.success(`Total imported: ${total} memories`);
      } else {
        log.info("No memories found to import.");
      }
    });

  imp.command("skills")
    .description("Scan .claude/commands/ and .codebuddy/skills/ → import custom skills to server")
    .action(async () => {
      if (!(await api.health())) { log.error("Server not running."); process.exit(1); }

      const projectId = getProjectId();
      const projectDir = process.cwd();
      let imported = 0;

      // 1. Claude commands: .claude/commands/*.md (project-level)
      const claudeCmdDir = path.join(projectDir, ".claude", "commands");
      if (fs.existsSync(claudeCmdDir)) {
        const files = fs.readdirSync(claudeCmdDir).filter(f => f.endsWith(".md"));
        for (const filename of files) {
          const content = fs.readFileSync(path.join(claudeCmdDir, filename), "utf-8");
          await api.putSkill(projectId, filename, content);
          log.dim(`  Claude command: ${filename}`);
          imported++;
        }
      }

      // 2. Claude global commands: ~/.claude/commands/*.md
      const claudeGlobalCmdDir = path.join(os.homedir(), ".claude", "commands");
      if (fs.existsSync(claudeGlobalCmdDir)) {
        const files = fs.readdirSync(claudeGlobalCmdDir).filter(f => f.endsWith(".md"));
        for (const filename of files) {
          const content = fs.readFileSync(path.join(claudeGlobalCmdDir, filename), "utf-8");
          await api.putSkill(projectId, filename, content);
          log.dim(`  Claude global command: ${filename}`);
          imported++;
        }
      }

      // 3. CodeBuddy custom skills in project: .codebuddy/skills/*/SKILL.md
      const cbSkillsDir = path.join(projectDir, ".codebuddy", "skills");
      if (fs.existsSync(cbSkillsDir)) {
        const dirs = fs.readdirSync(cbSkillsDir, { withFileTypes: true }).filter(d => d.isDirectory());
        for (const d of dirs) {
          const skillFile = path.join(cbSkillsDir, d.name, "SKILL.md");
          if (fs.existsSync(skillFile)) {
            const content = fs.readFileSync(skillFile, "utf-8");
            await api.putSkill(projectId, `${d.name}.md`, content);
            log.dim(`  CodeBuddy skill: ${d.name}`);
            imported++;
          }
        }
      }

      if (imported > 0) {
        log.success(`Imported ${imported} skills.`);
      } else {
        log.info("No custom skills found locally.");
      }
    });

  imp.command("all")
    .description("Import everything: MCP + skills + memories (one-time historical data migration)")
    .action(async () => {
      if (!(await api.health())) { log.error("Server not running."); process.exit(1); }

      console.log(chalk.bold("\n=== Importing MCP configs ===\n"));
      await imp.commands.find(c => c.name() === "mcp")?.parseAsync([], { from: "user" });

      console.log(chalk.bold("\n=== Importing skills ===\n"));
      await imp.commands.find(c => c.name() === "skills")?.parseAsync([], { from: "user" });

      console.log(chalk.bold("\n=== Importing memories ===\n"));
      await imp.commands.find(c => c.name() === "memories")?.parseAsync([], { from: "user" });

      console.log();
      log.success("Import complete.");
    });
}

// ─── Helpers ──────────────────────────────────

function findFiles(dir: string, name: string): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findFiles(fullPath, name));
      } else if (entry.name === name) {
        results.push(fullPath);
      }
    }
  } catch { /* permission denied etc */ }
  return results;
}
