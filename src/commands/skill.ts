import type { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import chalk from "chalk";
import * as api from "../client/api.js";
import * as log from "../utils/logger.js";

function getProjectId(): string {
  return process.cwd().split("/").pop()!;
}

export function registerSkillCommand(program: Command): void {
  const skill = program.command("skill").description("Manage custom skills/commands");

  skill.command("list")
    .option("-g, --global", "Show global skills")
    .action(async (opts: { global?: boolean }) => {
      if (!(await api.health())) { log.error("Server not running."); process.exit(1); }
      const items = opts.global
        ? await api.getGlobalSkills()
        : await api.getSkills(getProjectId());
      if (items.length === 0) {
        log.info(opts.global ? "No global skills." : "No project skills.");
        return;
      }
      console.log(chalk.bold(`\n${opts.global ? "Global" : "Project"} Skills:\n`));
      for (const s of items) {
        console.log(`  ${chalk.cyan(s.filename)}  ${chalk.dim(s.content.slice(0, 60))}${s.content.length > 60 ? "..." : ""}`);
      }
      console.log();
    });

  skill.command("show <filename>")
    .action(async (filename: string) => {
      if (!(await api.health())) { log.error("Server not running."); process.exit(1); }
      const items = await api.getSkills(getProjectId());
      const s = items.find(i => i.filename === filename);
      if (!s) { log.error(`Skill not found: ${filename}`); return; }
      console.log(`\n${chalk.bold(s.filename)}\n`);
      console.log(s.content);
      console.log();
    });

  skill.command("add <filename> <content>")
    .description("Add or update a skill")
    .action(async (filename: string, content: string) => {
      if (!(await api.health())) { log.error("Server not running."); process.exit(1); }
      if (!filename.endsWith(".md")) filename += ".md";
      await api.putSkill(getProjectId(), filename, content);
      log.success(`Skill saved: ${chalk.cyan(filename)}`);
    });

  skill.command("delete <filename>")
    .action(async (filename: string) => {
      if (!(await api.health())) { log.error("Server not running."); process.exit(1); }
      const res = await api.deleteSkill(getProjectId(), filename);
      if (res.deleted) log.success(`Deleted: ${filename}`);
      else log.error(`Not found: ${filename}`);
    });

  skill.command("sync")
    .description("Sync skills to agent config directories (permanent)")
    .option("-a, --agent <agents>", "Comma-separated agents", "claude,claude-internal,codebuddy")
    .action(async (opts: { agent: string }) => {
      if (!(await api.health())) { log.error("Server not running."); process.exit(1); }
      const skills = await api.getSkills(getProjectId());
      const globalSkills = await api.getGlobalSkills();
      const all = [...globalSkills, ...skills];

      if (all.length === 0) {
        log.info("No skills to sync.");
        return;
      }

      const projectDir = process.cwd();
      const agents = opts.agent.split(",").map(a => a.trim());

      for (const agent of agents) {
        const result = syncSkillsToAgent(agent, projectDir, all);
        if (result) {
          log.success(`${chalk.cyan(agent)} → ${result.dir} (${result.count} added)`);
          if (result.skipped.length > 0) {
            log.dim(`  Skipped existing: ${result.skipped.join(", ")}`);
          }
        }
      }
    });
}

// ─── Sync logic ──────────────────────────────

interface SyncResult { dir: string; count: number; skipped: string[] }

function syncSkillsToAgent(
  agent: string,
  projectDir: string,
  skills: Array<{ filename: string; content: string }>,
): SyncResult | null {
  switch (agent) {
    case "claude":
    case "claude-internal": {
      const dir = path.join(projectDir, ".claude", "commands");
      fs.mkdirSync(dir, { recursive: true });
      let count = 0;
      const skipped: string[] = [];
      for (const s of skills) {
        const fp = path.join(dir, s.filename);
        if (fs.existsSync(fp)) {
          skipped.push(s.filename);
        } else {
          fs.writeFileSync(fp, s.content, "utf-8");
          count++;
        }
      }
      return { dir, count, skipped };
    }
    case "codebuddy": {
      const baseDir = path.join(projectDir, ".codebuddy", "skills");
      let count = 0;
      const skipped: string[] = [];
      for (const s of skills) {
        const name = s.filename.replace(/\.md$/, "");
        const skillDir = path.join(baseDir, name);
        const skillFile = path.join(skillDir, "SKILL.md");
        if (fs.existsSync(skillFile)) {
          skipped.push(name);
        } else {
          fs.mkdirSync(skillDir, { recursive: true });
          fs.writeFileSync(skillFile, s.content, "utf-8");
          count++;
        }
      }
      return { dir: baseDir, count, skipped };
    }
    default:
      return null;
  }
}

// ─── Inject/Restore for chat sessions ────────

interface SkillBackup {
  path: string;
  existed: boolean;
}

let skillBackups: SkillBackup[] = [];

export function injectSkills(
  agent: string,
  projectDir: string,
  skills: Array<{ filename: string; content: string }>,
): void {
  skillBackups = [];
  if (skills.length === 0) return;

  switch (agent) {
    case "claude":
    case "claude-internal": {
      const dir = path.join(projectDir, ".claude", "commands");
      const existed = fs.existsSync(dir);
      fs.mkdirSync(dir, { recursive: true });
      for (const s of skills) {
        const fp = path.join(dir, s.filename);
        skillBackups.push({ path: fp, existed: fs.existsSync(fp) });
        fs.writeFileSync(fp, s.content, "utf-8");
      }
      break;
    }
    case "codebuddy": {
      const baseDir = path.join(projectDir, ".codebuddy", "skills");
      for (const s of skills) {
        const name = s.filename.replace(/\.md$/, "");
        const skillDir = path.join(baseDir, name);
        skillBackups.push({ path: skillDir, existed: fs.existsSync(skillDir) });
        fs.mkdirSync(skillDir, { recursive: true });
        fs.writeFileSync(path.join(skillDir, "SKILL.md"), s.content, "utf-8");
      }
      break;
    }
  }
}

export function restoreSkills(): void {
  for (const entry of skillBackups) {
    if (!entry.existed && fs.existsSync(entry.path)) {
      // Remove file or directory we created
      const stat = fs.statSync(entry.path);
      if (stat.isDirectory()) {
        fs.rmSync(entry.path, { recursive: true, force: true });
      } else {
        fs.unlinkSync(entry.path);
      }
    }
  }
  skillBackups = [];
}
