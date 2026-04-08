import type { Command } from "commander";
import chalk from "chalk";
import * as api from "../client/api.js";
import { buildContextString } from "../core/context-builder.js";
import { captureSnapshot, computeChanges } from "../core/git-changes.js";
import { acquireLock, releaseLock } from "../core/lockfile.js";
import { getDriver, detectAvailable } from "../drivers/registry.js";
import * as log from "../utils/logger.js";

export function registerChatCommand(program: Command): void {
  program
    .command("chat [task]")
    .description("Start a proxied chat session with an AI agent")
    .option("-a, --agent <name>", "Agent to use (claude, codebuddy, claude-internal, codex, aider)")
    .option("-s, --switch <name>", "Continue last session with a different agent")
    .action(async (task: string | undefined, opts: { agent?: string; switch?: string }) => {
      if (!(await api.health())) {
        log.error("Server not running. Start with: aihub server start");
        process.exit(1);
      }

      const projectPath = process.cwd();
      const projectId = projectPath.split("/").pop()!;

      // Ensure project registered
      await api.registerProject(projectPath);

      // Lock
      if (!acquireLock(projectPath)) {
        log.error("Another aihub chat is active in this directory.");
        process.exit(1);
      }

      const agentName = opts.switch ?? opts.agent ?? "claude";
      const sessionTask = task ?? "(interactive)";

      // If --switch, load handoff from last session
      let handoff: string | undefined;
      if (opts.switch) {
        const sessions = await api.listSessions(projectId, 1);
        if (sessions.length > 0) {
          const last = sessions[0] as Record<string, unknown>;
          const segs = (last.segments as Array<Record<string, unknown>>) ?? [];
          const lastSeg = segs[segs.length - 1];
          if (lastSeg?.git_changes) {
            const gc = typeof lastSeg.git_changes === "string" ? JSON.parse(lastSeg.git_changes as string) : lastSeg.git_changes;
            const parts: string[] = [];
            if (gc.modified?.length) parts.push(`Modified: ${gc.modified.join(", ")}`);
            if (gc.created?.length) parts.push(`Created: ${gc.created.join(", ")}`);
            handoff = `Previous session (${lastSeg.agent}):\n${parts.join("\n")}`;
          }
          log.info(`Continuing from last session with ${chalk.cyan(agentName)}`);
        }
      }

      try {
        const driver = getDriver(agentName);
        if (!driver) {
          log.error(`Unknown agent: ${agentName}`);
          const available = await detectAvailable();
          if (available.length > 0) log.info(`Available: ${available.map(a => a.name).join(", ")}`);
          return;
        }
        if (!(await driver.detect())) {
          log.error(`${driver.displayName} CLI not found.`);
          return;
        }

        // Create session on server
        const session = await api.createSession(projectId, sessionTask, agentName);

        // Build context from server + translate
        const ctx = await buildContextString(projectId, agentName, { task: sessionTask, handoff });
        log.info(`Context: ${ctx.stats.rules} rules, ${ctx.stats.context} context, ${ctx.stats.memories} memories`);

        // Inject
        await driver.prepare(ctx.content, projectPath);

        // Git snapshot before
        const gitBefore = captureSnapshot(projectPath);

        log.success(`Launching ${chalk.cyan(driver.displayName)}...`);
        console.log(chalk.dim("─".repeat(50)));

        // Hand over terminal — full interactive experience
        await driver.run(task ?? "", projectPath);

        console.log(chalk.dim("─".repeat(50)));

        // Cleanup
        await driver.cleanup(projectPath);

        // Compute git changes
        log.dim("Collecting changes...");
        const changes = computeChanges(gitBefore, projectPath);
        if (changes.modified.length > 0 || changes.created.length > 0) {
          log.info(`Changes: ${changes.modified.length} modified, ${changes.created.length} created`);
        }

        // Save to server
        await api.updateSession(projectId, session.id, { git_changes: changes });

        // Auto-add file changes as memory
        if (changes.modified.length > 0 || changes.created.length > 0) {
          const fileList = [...changes.modified, ...changes.created.map(f => `${f} (new)`)].join(", ");
          await api.addMemory(projectId, `Files changed by ${agentName}: ${fileList}`, {
            type: "learned", tags: ["files", "auto"], source_agent: agentName, source_session: session.id,
          });
        }

        // Complete session
        await api.updateSession(projectId, session.id, { status: "completed" });
        log.success(`Session ${chalk.bold(session.id)} archived.`);

        // Hint about switching
        log.dim(`To continue with another agent: aihub chat --switch claude-internal`);

      } finally {
        releaseLock(projectPath);
      }
    });
}
