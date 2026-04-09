import * as fs from "node:fs";
import * as path from "node:path";
import type { Command } from "commander";
import chalk from "chalk";
import * as api from "../client/api.js";
import { buildExportInput } from "../core/context-builder.js";
import { exportForAgent } from "../translators/export/agents.js";
import * as log from "../utils/logger.js";

const AGENT_FILES: Record<string, string> = {
  claude: "CLAUDE.md",
  codex: "AGENTS.md",
  cursor: ".cursorrules",
  copilot: ".github/copilot-instructions.md",
  windsurf: ".windsurfrules",
};

const ALL_AGENTS = Object.keys(AGENT_FILES);

export function registerExportCommand(program: Command): void {
  program
    .command("export")
    .description("Export AIHub data as agent-native config files into project directory (for use without aihub)")
    .option("-a, --agent <agent>", "Agent format: claude, codex, cursor, copilot, windsurf (or 'all')")
    .option("--dry-run", "Preview without writing files")
    .action(async (opts: { agent?: string; dryRun?: boolean }) => {
      if (!(await api.health())) { log.error("Server not running."); process.exit(1); }

      const projectId = process.cwd().split("/").pop()!;
      await api.registerProject(process.cwd());

      const input = await buildExportInput(projectId);
      const agents = opts.agent && opts.agent !== "all" ? [opts.agent] : ALL_AGENTS;

      if (opts.dryRun) {
        console.log(chalk.bold("\nPreview (--dry-run):\n"));
      }

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

      if (!opts.dryRun) {
        console.log();
        log.info(`Exported to ${agents.length} agent format(s).`);
      }

      console.log(chalk.bold("\nWhat export does:"));
      console.log(chalk.dim("  Writes AIHub rules/context/memories into agent-native files."));
      console.log(chalk.dim("  This lets agents read the data even without 'aihub chat'."));
      console.log(chalk.dim("  Files: " + Object.entries(AGENT_FILES).map(([a, f]) => `${a}→${f}`).join(", ")));
      console.log();
    });
}
