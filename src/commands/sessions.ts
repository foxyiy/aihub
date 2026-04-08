import type { Command } from "commander";
import chalk from "chalk";
import * as api from "../client/api.js";
import * as log from "../utils/logger.js";

export function registerSessionsCommand(program: Command): void {
  const sess = program.command("sessions").description("Manage sessions");

  sess.command("list")
    .option("-n, --limit <n>", "Limit", "20")
    .action(async (opts: { limit: string }) => {
      if (!(await api.health())) { log.error("Server not running."); process.exit(1); }
      const projectId = process.cwd().split("/").pop()!;
      const list = await api.listSessions(projectId, parseInt(opts.limit));
      if (list.length === 0) { log.info("No sessions yet."); return; }
      console.log(chalk.bold("\nSessions:\n"));
      for (const s of list) {
        const status = s.status === "completed" ? chalk.green("✅") : chalk.yellow("⏸");
        const segs = (s.segments as Array<Record<string, unknown>>);
        const agents = [...new Set(segs.map(seg => seg.agent))].join(" → ");
        console.log(`  ${status} ${chalk.dim(s.id as string)} ${(s.created as string).slice(0, 16)} ${chalk.cyan(agents)} ${s.task}`);
      }
      console.log();
    });

  sess.command("show <id>")
    .action(async (id: string) => {
      if (!(await api.health())) { log.error("Server not running."); process.exit(1); }
      const projectId = process.cwd().split("/").pop()!;
      const s = await api.getSession(projectId, id);
      if (s.error) { log.error(`Session not found: ${id}`); return; }
      console.log(chalk.bold(`\nSession ${s.id}`));
      console.log(`  Task: ${s.task}`);
      console.log(`  Status: ${s.status}`);
      console.log(`  Created: ${s.created}`);
      if (s.ended) console.log(`  Ended: ${s.ended}`);
      const segs = (s.segments as Array<Record<string, unknown>>) ?? [];
      for (const seg of segs) {
        console.log(`\n  ${chalk.cyan(`[${seg.agent}]`)} ${(seg.started as string).slice(11, 19)} - ${(seg.ended as string)?.slice(11, 19) ?? "..."}`);
        if (seg.git_changes) {
          const gc = typeof seg.git_changes === "string" ? JSON.parse(seg.git_changes) : seg.git_changes;
          if (gc.modified?.length) console.log(`    Modified: ${gc.modified.join(", ")}`);
          if (gc.created?.length) console.log(`    Created: ${gc.created.join(", ")}`);
        }
        if (seg.handoff) console.log(`    ${chalk.yellow("Handoff:")} ${(seg.handoff as string).slice(0, 100)}...`);
      }
      console.log();
    });
}
