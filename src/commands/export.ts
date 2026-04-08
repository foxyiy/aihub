import * as fs from "node:fs";
import * as path from "node:path";
import type { Command } from "commander";
import chalk from "chalk";
import * as api from "../client/api.js";
import { buildExportInput } from "../core/context-builder.js";
import { exportForAgent } from "../translators/export/agents.js";
import * as log from "../utils/logger.js";

const ALL_AGENTS = ["claude", "codex", "cursor", "copilot", "windsurf"];

export function registerExportCommand(program: Command): void {
  program
    .command("export")
    .description("Export AIHub data to agent-native config files")
    .option("-a, --agent <agent>", "Specific agent (or 'all')")
    .option("--dry-run", "Preview without writing")
    .action(async (opts: { agent?: string; dryRun?: boolean }) => {
      if (!(await api.health())) { log.error("Server not running."); process.exit(1); }

      const projectId = process.cwd().split("/").pop()!;
      await api.registerProject(process.cwd());

      const input = await buildExportInput(projectId);
      const agents = opts.agent && opts.agent !== "all" ? [opts.agent] : ALL_AGENTS;

      for (const agent of agents) {
        try {
          const result = exportForAgent(agent, input);
          for (const file of result.files) {
            const fullPath = path.join(process.cwd(), file.path);
            if (opts.dryRun) {
              console.log(`  ${chalk.cyan(agent)} → ${file.path} (${file.content.length} chars)`);
            } else {
              fs.mkdirSync(path.dirname(fullPath), { recursive: true });
              fs.writeFileSync(fullPath, file.content, "utf-8");
              log.success(`${chalk.cyan(agent)} → ${file.path}`);
            }
          }
        } catch (e) {
          log.warn(`Skipping ${agent}: ${(e as Error).message}`);
        }
      }

      if (!opts.dryRun) log.info(`Exported to ${agents.length} agents.`);
    });
}
