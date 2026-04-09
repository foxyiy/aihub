import type { Command } from "commander";
import chalk from "chalk";
import * as api from "../client/api.js";
import * as log from "../utils/logger.js";

function getProjectId(): string {
  return process.cwd().split("/").pop()!;
}

export function registerContextCommand(program: Command): void {
  const ctx = program.command("context").description("Manage project context documents");

  ctx.command("list")
    .option("-g, --global", "Show global context")
    .action(async (opts: { global?: boolean }) => {
      if (!(await api.health())) { log.error("Server not running."); process.exit(1); }
      const items = opts.global
        ? await api.getGlobalContext()
        : await api.getProjectContext(getProjectId());
      if (items.length === 0) {
        log.info(opts.global ? "No global context." : "No project context.");
        return;
      }
      console.log(chalk.bold(`\n${opts.global ? "Global" : "Project"} Context:\n`));
      for (const c of items) {
        console.log(`  ${chalk.cyan(c.filename)}  ${chalk.dim(c.content.slice(0, 60))}${c.content.length > 60 ? "..." : ""}`);
      }
      console.log();
    });

  ctx.command("show <filename>")
    .option("-g, --global", "Show global context")
    .action(async (filename: string, opts: { global?: boolean }) => {
      if (!(await api.health())) { log.error("Server not running."); process.exit(1); }
      const items = opts.global
        ? await api.getGlobalContext()
        : await api.getProjectContext(getProjectId());
      const doc = items.find(c => c.filename === filename);
      if (!doc) { log.error(`Context not found: ${filename}`); return; }
      console.log(`\n${chalk.bold(doc.filename)}\n`);
      console.log(doc.content);
      console.log();
    });

  ctx.command("add <filename> <content>")
    .description("Add or update a context document")
    .action(async (filename: string, content: string) => {
      if (!(await api.health())) { log.error("Server not running."); process.exit(1); }
      if (!filename.endsWith(".md")) filename += ".md";
      await api.putContext(getProjectId(), filename, content);
      log.success(`Context saved: ${chalk.cyan(filename)}`);
    });

  ctx.command("delete <filename>")
    .action(async (filename: string) => {
      if (!(await api.health())) { log.error("Server not running."); process.exit(1); }
      const res = await api.deleteContext(getProjectId(), filename);
      if (res.deleted) log.success(`Deleted: ${filename}`);
      else log.error(`Not found: ${filename}`);
    });
}
