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
  const imp = program.command("import").description("Import local agent data (MCP, rules, context, skills, memories) into AIHub server");

  imp.command("mcp")
    .description("Scan ~/.claude/ and ~/.codebuddy/plugins/ → import MCP configs to server (global→global, project→project)")
    .action(async () => {
      if (!(await api.health())) { log.error("Server not running."); process.exit(1); }

      const globalCollected: Record<string, unknown> = {};
      const projectCollected: Record<string, unknown> = {};

      // 1. Claude global MCP → global
      const claudeGlobal = path.join(os.homedir(), ".claude", "settings.local.json");
      if (fs.existsSync(claudeGlobal)) {
        try {
          const config = JSON.parse(fs.readFileSync(claudeGlobal, "utf-8"));
          if (config.mcpServers) {
            Object.assign(globalCollected, config.mcpServers);
            log.dim(`Claude global: ${Object.keys(config.mcpServers).length} MCP servers`);
          }
        } catch { /* skip */ }
      }

      // 2. CodeBuddy plugins → global
      const pluginsDir = path.join(os.homedir(), ".codebuddy", "plugins", "marketplaces");
      if (fs.existsSync(pluginsDir)) {
        const mcpFiles = findFiles(pluginsDir, ".mcp.json");
        for (const f of mcpFiles) {
          try {
            const data = JSON.parse(fs.readFileSync(f, "utf-8"));
            const servers = data.mcpServers ?? data;
            Object.assign(globalCollected, servers);
          } catch { /* skip */ }
        }
        if (mcpFiles.length > 0) {
          log.dim(`CodeBuddy plugins: ${mcpFiles.length} MCP config files`);
        }
      }

      // 3. Claude project-level MCP → project
      const claudeProject = path.join(process.cwd(), ".claude", "settings.local.json");
      if (fs.existsSync(claudeProject)) {
        try {
          const config = JSON.parse(fs.readFileSync(claudeProject, "utf-8"));
          if (config.mcpServers) {
            Object.assign(projectCollected, config.mcpServers);
            log.dim(`Claude project: ${Object.keys(config.mcpServers).length} MCP servers`);
          }
        } catch { /* skip */ }
      }

      const totalCollected = Object.keys(globalCollected).length + Object.keys(projectCollected).length;
      if (totalCollected === 0) {
        log.info("No MCP configs found locally.");
        return;
      }

      // Merge global
      if (Object.keys(globalCollected).length > 0) {
        const current = await api.getGlobalMcp();
        const existing = (current.servers ?? {}) as Record<string, unknown>;
        const merged = { ...existing, ...globalCollected };
        await api.putGlobalMcp({ servers: merged });

        console.log(chalk.bold(`\nImported ${Object.keys(globalCollected).length} global MCP servers:\n`));
        for (const name of Object.keys(globalCollected)) {
          const srv = globalCollected[name] as Record<string, unknown>;
          const cmd = srv.command ?? srv.url ?? "";
          console.log(`  ${chalk.cyan(name)}  ${chalk.dim(String(cmd))}`);
        }
      }

      // Merge project
      if (Object.keys(projectCollected).length > 0) {
        const projectId = getProjectId();
        const current = await api.getMcp(projectId);
        const existing = (current.servers ?? {}) as Record<string, unknown>;
        const merged = { ...existing, ...projectCollected };
        await api.putMcp(projectId, { servers: merged });

        console.log(chalk.bold(`\nImported ${Object.keys(projectCollected).length} project MCP servers:\n`));
        for (const name of Object.keys(projectCollected)) {
          const srv = projectCollected[name] as Record<string, unknown>;
          const cmd = srv.command ?? srv.url ?? "";
          console.log(`  ${chalk.cyan(name)}  ${chalk.dim(String(cmd))}`);
        }
      }

      console.log();
      log.success(`Total imported: ${totalCollected} MCP servers (${Object.keys(globalCollected).length} global, ${Object.keys(projectCollected).length} project)`);
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

      // 4. CodeBuddy global skills: ~/.codebuddy/skills/*/SKILL.md
      const cbGlobalSkillsDir = path.join(os.homedir(), ".codebuddy", "skills");
      if (fs.existsSync(cbGlobalSkillsDir) && cbGlobalSkillsDir !== cbSkillsDir) {
        const dirs = fs.readdirSync(cbGlobalSkillsDir, { withFileTypes: true }).filter(d => d.isDirectory());
        for (const d of dirs) {
          const skillFile = path.join(cbGlobalSkillsDir, d.name, "SKILL.md");
          if (fs.existsSync(skillFile)) {
            const content = fs.readFileSync(skillFile, "utf-8");
            await api.putSkill(projectId, `${d.name}.md`, content);
            log.dim(`  CodeBuddy global skill: ${d.name}`);
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

  imp.command("rules")
    .description("Scan CLAUDE.md, .claude/, .codebuddy/ → import rule files to server")
    .action(async () => {
      if (!(await api.health())) { log.error("Server not running."); process.exit(1); }

      const projectId = getProjectId();
      const projectDir = process.cwd();
      const homeDir = os.homedir();
      let imported = 0;

      // ── Project-level rules ──

      // 1. Root CLAUDE.md (case-insensitive)
      const rootClaudeMd = findCaseInsensitive(projectDir, "CLAUDE.md");
      if (rootClaudeMd) {
        const content = fs.readFileSync(rootClaudeMd, "utf-8");
        await api.putRule(projectId, "CLAUDE.md", content);
        log.dim(`  Project: ${path.basename(rootClaudeMd)}`);
        imported++;
      }

      // 2. .claude/CLAUDE.md (skip if root already found)
      if (!rootClaudeMd) {
        const dotClaudeMd = findCaseInsensitive(path.join(projectDir, ".claude"), "CLAUDE.md");
        if (dotClaudeMd) {
          const content = fs.readFileSync(dotClaudeMd, "utf-8");
          await api.putRule(projectId, "CLAUDE.md", content);
          log.dim(`  Project: .claude/${path.basename(dotClaudeMd)}`);
          imported++;
        }
      }

      // 3. Other .md files in .claude/ (excluding CLAUDE.md)
      const dotClaudeDir = path.join(projectDir, ".claude");
      if (fs.existsSync(dotClaudeDir)) {
        const files = fs.readdirSync(dotClaudeDir).filter(f => f.endsWith(".md") && f.toUpperCase() !== "CLAUDE.MD");
        for (const filename of files) {
          const content = fs.readFileSync(path.join(dotClaudeDir, filename), "utf-8");
          await api.putRule(projectId, filename, content);
          log.dim(`  Project: .claude/${filename}`);
          imported++;
        }
      }

      // 4. .codebuddy/CODEBUDDY.md (case-insensitive)
      const cbMd = findCaseInsensitive(path.join(projectDir, ".codebuddy"), "CODEBUDDY.md");
      if (cbMd) {
        const content = fs.readFileSync(cbMd, "utf-8");
        await api.putRule(projectId, "CODEBUDDY.md", content);
        log.dim(`  Project: .codebuddy/${path.basename(cbMd)}`);
        imported++;
      }

      // 5. .codebuddy/rules/*.md
      const cbRulesDir = path.join(projectDir, ".codebuddy", "rules");
      if (fs.existsSync(cbRulesDir)) {
        const files = fs.readdirSync(cbRulesDir).filter(f => f.endsWith(".md"));
        for (const filename of files) {
          const content = fs.readFileSync(path.join(cbRulesDir, filename), "utf-8");
          await api.putRule(projectId, filename, content);
          log.dim(`  Project: .codebuddy/rules/${filename}`);
          imported++;
        }
      }

      // ── Global rules ──

      // 6. ~/.claude/CLAUDE.md (case-insensitive)
      const globalClaudeMd = findCaseInsensitive(path.join(homeDir, ".claude"), "CLAUDE.md");
      if (globalClaudeMd) {
        const content = fs.readFileSync(globalClaudeMd, "utf-8");
        await api.putGlobalRule("CLAUDE.md", content);
        log.dim(`  Global: ~/.claude/${path.basename(globalClaudeMd)}`);
        imported++;
      }

      // 7. Other .md in ~/.claude/ (excluding CLAUDE.md)
      const globalClaudeDir = path.join(homeDir, ".claude");
      if (fs.existsSync(globalClaudeDir)) {
        const files = fs.readdirSync(globalClaudeDir).filter(f => f.endsWith(".md") && f.toUpperCase() !== "CLAUDE.MD");
        for (const filename of files) {
          const content = fs.readFileSync(path.join(globalClaudeDir, filename), "utf-8");
          await api.putGlobalRule(filename, content);
          log.dim(`  Global: ~/.claude/${filename}`);
          imported++;
        }
      }

      // 8. ~/.codebuddy/CODEBUDDY.md (case-insensitive)
      const globalCbMd = findCaseInsensitive(path.join(homeDir, ".codebuddy"), "CODEBUDDY.md");
      if (globalCbMd) {
        const content = fs.readFileSync(globalCbMd, "utf-8");
        await api.putGlobalRule("CODEBUDDY.md", content);
        log.dim(`  Global: ~/.codebuddy/${path.basename(globalCbMd)}`);
        imported++;
      }

      if (imported > 0) {
        log.success(`Imported ${imported} rule files.`);
      } else {
        log.info("No rule files found locally.");
      }
    });

  imp.command("context")
    .description("Scan .claude/context/ and .codebuddy/context/ → import context files to server")
    .action(async () => {
      if (!(await api.health())) { log.error("Server not running."); process.exit(1); }

      const projectId = getProjectId();
      const projectDir = process.cwd();
      let imported = 0;

      // ── Project-level context ──

      // 1. .claude/context/*.md
      const claudeCtxDir = path.join(projectDir, ".claude", "context");
      if (fs.existsSync(claudeCtxDir)) {
        const files = fs.readdirSync(claudeCtxDir).filter(f => f.endsWith(".md"));
        for (const filename of files) {
          const content = fs.readFileSync(path.join(claudeCtxDir, filename), "utf-8");
          await api.putContext(projectId, filename, content);
          log.dim(`  Project: .claude/context/${filename}`);
          imported++;
        }
      }

      // 2. .codebuddy/context/*.md
      const cbCtxDir = path.join(projectDir, ".codebuddy", "context");
      if (fs.existsSync(cbCtxDir)) {
        const files = fs.readdirSync(cbCtxDir).filter(f => f.endsWith(".md"));
        for (const filename of files) {
          const content = fs.readFileSync(path.join(cbCtxDir, filename), "utf-8");
          await api.putContext(projectId, filename, content);
          log.dim(`  Project: .codebuddy/context/${filename}`);
          imported++;
        }
      }

      // ── Global context ──

      // 3. ~/.claude/context/*.md
      const globalCtxDir = path.join(os.homedir(), ".claude", "context");
      if (fs.existsSync(globalCtxDir)) {
        const files = fs.readdirSync(globalCtxDir).filter(f => f.endsWith(".md"));
        for (const filename of files) {
          const content = fs.readFileSync(path.join(globalCtxDir, filename), "utf-8");
          await api.putGlobalContext(filename, content);
          log.dim(`  Global: ~/.claude/context/${filename}`);
          imported++;
        }
      }

      if (imported > 0) {
        log.success(`Imported ${imported} context files.`);
      } else {
        log.info("No context files found locally.");
      }
    });

  imp.command("all")
    .description("Import everything: MCP + rules + context + skills + memories (one-time historical data migration)")
    .action(async () => {
      if (!(await api.health())) { log.error("Server not running."); process.exit(1); }

      console.log(chalk.bold("\n=== Importing MCP configs ===\n"));
      await imp.commands.find(c => c.name() === "mcp")?.parseAsync([], { from: "user" });

      console.log(chalk.bold("\n=== Importing rules ===\n"));
      await imp.commands.find(c => c.name() === "rules")?.parseAsync([], { from: "user" });

      console.log(chalk.bold("\n=== Importing context ===\n"));
      await imp.commands.find(c => c.name() === "context")?.parseAsync([], { from: "user" });

      console.log(chalk.bold("\n=== Importing skills ===\n"));
      await imp.commands.find(c => c.name() === "skills")?.parseAsync([], { from: "user" });

      console.log(chalk.bold("\n=== Importing memories ===\n"));
      await imp.commands.find(c => c.name() === "memories")?.parseAsync([], { from: "user" });

      console.log();
      log.success("Import complete.");
    });
}

// ─── Helpers ──────────────────────────────────

/** Find a file in dir by case-insensitive name match, return full path or null */
function findCaseInsensitive(dir: string, target: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const upper = target.toUpperCase();
  const match = fs.readdirSync(dir).find(f => f.toUpperCase() === upper);
  return match ? path.join(dir, match) : null;
}

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
