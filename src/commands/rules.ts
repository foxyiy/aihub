import type { Command } from "commander";
import chalk from "chalk";
import * as api from "../client/api.js";
import * as log from "../utils/logger.js";

function getProjectId(): string {
  return process.cwd().split("/").pop()!;
}

export function registerRulesCommand(program: Command): void {
  const rules = program.command("rules").description("Manage project rules");

  rules.command("list")
    .option("-g, --global", "Show global rules")
    .action(async (opts: { global?: boolean }) => {
      if (!(await api.health())) { log.error("Server not running."); process.exit(1); }
      const items = opts.global
        ? await api.getGlobalRules()
        : await api.getRules(getProjectId());
      if (items.length === 0) {
        log.info(opts.global ? "No global rules." : "No project rules.");
        return;
      }
      console.log(chalk.bold(`\n${opts.global ? "Global" : "Project"} Rules:\n`));
      for (const r of items) {
        console.log(`  ${chalk.cyan(r.filename)}  ${chalk.dim(r.content.slice(0, 60))}${r.content.length > 60 ? "..." : ""}`);
      }
      console.log();
    });

  rules.command("show <filename>")
    .option("-g, --global", "Show global rule")
    .action(async (filename: string, opts: { global?: boolean }) => {
      if (!(await api.health())) { log.error("Server not running."); process.exit(1); }
      const items = opts.global
        ? await api.getGlobalRules()
        : await api.getRules(getProjectId());
      const rule = items.find(r => r.filename === filename);
      if (!rule) { log.error(`Rule not found: ${filename}`); return; }
      console.log(`\n${chalk.bold(rule.filename)}\n`);
      console.log(rule.content);
      console.log();
    });

  rules.command("add <filename> <content>")
    .description("Add or update a rule")
    .action(async (filename: string, content: string) => {
      if (!(await api.health())) { log.error("Server not running."); process.exit(1); }
      if (!filename.endsWith(".md")) filename += ".md";
      await api.putRule(getProjectId(), filename, content);
      log.success(`Rule saved: ${chalk.cyan(filename)}`);
    });

  rules.command("delete <filename>")
    .action(async (filename: string) => {
      if (!(await api.health())) { log.error("Server not running."); process.exit(1); }
      const res = await api.deleteRule(getProjectId(), filename);
      if (res.deleted) log.success(`Deleted: ${filename}`);
      else log.error(`Not found: ${filename}`);
    });
}
