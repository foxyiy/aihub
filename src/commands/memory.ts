import type { Command } from "commander";
import chalk from "chalk";
import * as api from "../client/api.js";
import * as log from "../utils/logger.js";

function getProjectId(): string {
  return process.cwd().split("/").pop()!;
}

export function registerMemoryCommand(program: Command): void {
  const mem = program.command("memory").description("Manage memories");

  mem.command("list")
    .option("-n, --limit <n>", "Limit", "20")
    .action(async (opts: { limit: string }) => {
      if (!(await api.health())) { log.error("Server not running."); process.exit(1); }
      const entries = await api.listMemory(getProjectId(), parseInt(opts.limit));
      if (entries.length === 0) { log.info("No memories yet."); return; }
      const count = await api.memoryCount(getProjectId());
      console.log(chalk.bold(`\nMemories (${count} total):\n`));
      for (const m of entries) {
        let tags: string[] = [];
        try { tags = JSON.parse(m.tags as string); } catch {}
        const tagStr = tags.length > 0 ? chalk.dim(` [${tags.join(", ")}]`) : "";
        console.log(`  ${chalk.dim(m.id as string)} ${(m.created as string).slice(0, 10)} ${m.content}${tagStr} ${chalk.dim(`(${m.source_agent})`)}`);
      }
      console.log();
    });

  mem.command("search <query>")
    .action(async (query: string) => {
      if (!(await api.health())) { log.error("Server not running."); process.exit(1); }
      const results = await api.searchMemory(getProjectId(), query);
      if (results.length === 0) { log.info(`No memories matching "${query}".`); return; }
      console.log(chalk.bold(`\nResults for "${query}":\n`));
      for (const m of results) {
        console.log(`  ${chalk.dim(m.id as string)} ${m.content} ${chalk.dim(`[${m.source_agent}]`)}`);
      }
      console.log();
    });

  mem.command("add <content>")
    .option("-t, --tags <tags>", "Comma-separated tags")
    .option("--type <type>", "Type: decision, learned, warning, context", "learned")
    .action(async (content: string, opts: { tags?: string; type?: string }) => {
      if (!(await api.health())) { log.error("Server not running."); process.exit(1); }
      const tags = opts.tags ? opts.tags.split(",").map(t => t.trim()) : [];
      const entry = await api.addMemory(getProjectId(), content, {
        type: opts.type, tags, source_agent: "manual",
      });
      log.success(`Memory added: ${chalk.dim(entry.id as string)}`);
    });

  mem.command("delete <id>")
    .action(async (id: string) => {
      if (!(await api.health())) { log.error("Server not running."); process.exit(1); }
      const res = await api.deleteMemory(getProjectId(), id);
      if (res.deleted) log.success(`Deleted ${id}`);
      else log.error(`Not found: ${id}`);
    });
}
