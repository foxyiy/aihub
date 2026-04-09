import type { Command } from "commander";
import * as readline from "node:readline";
import chalk from "chalk";
import * as api from "../client/api.js";
import { buildContextString } from "../core/context-builder.js";
import { captureSnapshot, computeChanges } from "../core/git-changes.js";
import { extractMemoriesFromLogs } from "../core/memory-extractor.js";
import { acquireLock, releaseLock } from "../core/lockfile.js";
import { injectMcp, restoreMcp } from "../core/mcp-injector.js";
import type { McpServers } from "../core/mcp-injector.js";
import { injectSkills, restoreSkills } from "./skill.js";
import { autoImportMcp, autoImportSkills } from "../core/auto-import.js";
import { getDriver, detectAvailable } from "../drivers/registry.js";
import * as log from "../utils/logger.js";

// ─── Helper: build handoff from session ──────

function buildHandoff(session: Record<string, unknown>): string {
  const segs = (session.segments as Array<Record<string, unknown>>) ?? [];
  const parts: string[] = [`Task: ${session.task}`];
  for (const seg of segs) {
    const segParts: string[] = [`Agent: ${seg.agent}`];
    if (seg.git_changes) {
      const gc = typeof seg.git_changes === "string" ? JSON.parse(seg.git_changes as string) : seg.git_changes;
      if (gc.modified?.length) segParts.push(`Modified: ${gc.modified.join(", ")}`);
      if (gc.created?.length) segParts.push(`Created: ${gc.created.join(", ")}`);
    }
    parts.push(segParts.join(", "));
  }
  return `Continuing session:\n${parts.join("\n")}`;
}

// ─── Helper: interactive session picker ──────

async function pickSession(projectId: string): Promise<string | null> {
  const sessions = await api.listSessions(projectId, 10);
  if (sessions.length === 0) { log.info("No previous sessions."); return null; }

  console.log(chalk.bold("\nRecent sessions:\n"));
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    const segs = (s.segments as Array<Record<string, unknown>>) ?? [];
    const agents = [...new Set(segs.map(seg => seg.agent))].join(" → ");
    const time = (s.created as string).slice(0, 16);
    console.log(`  ${chalk.cyan(`[${i + 1}]`)} ${chalk.dim(s.id as string)} ${time} ${chalk.cyan(agents)} ${s.task}`);
  }
  console.log(`  ${chalk.dim("[0]")} New session`);
  console.log();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question("  Select (number): ", (answer) => {
      rl.close();
      const num = parseInt(answer.trim());
      if (num === 0 || isNaN(num)) { resolve(null); return; }
      if (num >= 1 && num <= sessions.length) {
        resolve(sessions[num - 1].id as string);
      } else {
        resolve(null);
      }
    });
  });
}

// ─── Main command ────────────────────────────

export function registerChatCommand(program: Command): void {
  program
    .command("chat [task]")
    .description("Start a proxied chat session with an AI agent")
    .option("-a, --agent <name>", "Agent to use (claude, codebuddy, claude-internal, codex, aider)")
    .option("-s, --switch <name>", "Continue last session with a different agent")
    .option("-c, --continue <sessionId>", "Continue a specific historical session")
    .option("-l, --last", "Continue the most recent session")
    .option("-p, --pick", "Interactively pick a session to continue")
    .action(async (task: string | undefined, opts: {
      agent?: string; switch?: string; continue?: string; last?: boolean; pick?: boolean;
    }) => {
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

      // ─── Resolve which session to continue ───
      let handoff: string | undefined;
      let continueSessionId: string | undefined;

      if (opts.pick) {
        // Interactive picker
        const picked = await pickSession(projectId);
        if (picked) {
          const prev = await api.getSession(projectId, picked);
          if (!prev.error) {
            continueSessionId = picked;
            handoff = buildHandoff(prev);
            log.info(`Continuing session ${chalk.bold(picked)} with ${chalk.cyan(agentName)}`);
          }
        }
      } else if (opts.continue) {
        // Specific session ID
        const prev = await api.getSession(projectId, opts.continue);
        if (prev.error) {
          log.error(`Session not found: ${opts.continue}`);
          releaseLock(projectPath);
          return;
        }
        continueSessionId = opts.continue;
        handoff = buildHandoff(prev);
        log.info(`Continuing session ${chalk.bold(opts.continue)} with ${chalk.cyan(agentName)}`);

      } else if (opts.last || opts.switch) {
        // Last session
        const sessions = await api.listSessions(projectId, 1);
        if (sessions.length > 0) {
          const last = sessions[0] as Record<string, unknown>;
          continueSessionId = last.id as string;
          handoff = buildHandoff(last);
          log.info(`Continuing last session with ${chalk.cyan(agentName)}`);
        }
      } else if (!task) {
        // Smart detect: if last session ended < 5 min ago, ask to continue
        try {
          const sessions = await api.listSessions(projectId, 1);
          if (sessions.length > 0) {
            const last = sessions[0] as Record<string, unknown>;
            const ended = last.ended as string;
            if (ended) {
              const elapsed = Date.now() - new Date(ended).getTime();
              if (elapsed < 5 * 60 * 1000) {
                const segs = (last.segments as Array<Record<string, unknown>>) ?? [];
                const lastAgent = segs[segs.length - 1]?.agent ?? "unknown";
                console.log();
                console.log(chalk.yellow(`  Last session ended ${Math.round(elapsed / 1000)}s ago: "${last.task}" (${lastAgent})`));

                const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
                const answer = await new Promise<string>(resolve => {
                  rl.question(`  Continue it? ${chalk.dim("[Y/n]")} `, (a) => { rl.close(); resolve(a.trim()); });
                });

                if (answer === "" || answer.toLowerCase() === "y") {
                  continueSessionId = last.id as string;
                  handoff = buildHandoff(last);
                  log.info(`Continuing last session with ${chalk.cyan(agentName)}`);
                }
              }
            }
          }
        } catch { /* ignore */ }
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

        // Create or continue session
        let session: { id: string; segmentId: string };
        if (continueSessionId) {
          const seg = await api.updateSession(projectId, continueSessionId, {
            newAgent: agentName, handoff: handoff ?? "",
          }) as { segmentId: string };
          session = { id: continueSessionId, segmentId: seg.segmentId };
        } else {
          session = await api.createSession(projectId, sessionTask, agentName);
        }

        // Build context from server + translate
        const ctx = await buildContextString(projectId, agentName, { task: sessionTask, handoff });
        log.info(`Context: ${ctx.stats.rules} rules, ${ctx.stats.context} context, ${ctx.stats.memories} memories`);

        // Inject context via system prompt
        await driver.prepare(ctx.content, projectPath);

        // Inject MCP configs (global + project)
        const [mcpConfig, globalMcpConfig] = await Promise.all([
          api.getMcp(projectId),
          api.getGlobalMcp(),
        ]);
        const mcpServers = {
          ...((globalMcpConfig.servers ?? {}) as McpServers),
          ...((mcpConfig.servers ?? {}) as McpServers),
        };
        if (Object.keys(mcpServers).length > 0) {
          injectMcp(agentName, projectPath, mcpServers);
          log.info(`MCP: ${Object.keys(mcpServers).length} servers injected`);
        }

        // Inject skills
        const [skills, globalSkills] = await Promise.all([
          api.getSkills(projectId),
          api.getGlobalSkills(),
        ]);
        const allSkills = [...globalSkills, ...skills];
        if (allSkills.length > 0) {
          injectSkills(agentName, projectPath, allSkills);
          log.info(`Skills: ${allSkills.length} injected`);
        }

        // Git snapshot
        const gitBefore = captureSnapshot(projectPath);
        const startedAt = Date.now();

        log.success(`Launching ${chalk.cyan(driver.displayName)}...`);
        console.log(chalk.dim("─".repeat(50)));

        // Hand over terminal
        await driver.run(task ?? "", projectPath);

        console.log(chalk.dim("─".repeat(50)));

        // ── Post-agent collection (BEFORE restoring) ──

        log.dim("Scanning for new configs...");
        try {
          const mcp = await autoImportMcp(projectId);
          if (mcp.imported > 0) log.info(`New MCP servers detected: ${mcp.names.join(", ")}`);
          const sk = await autoImportSkills(projectId);
          if (sk.imported > 0) log.info(`New skills detected: ${sk.names.join(", ")}`);
        } catch { /* non-fatal */ }

        // Restore
        await driver.cleanup(projectPath);
        restoreMcp();
        restoreSkills();

        // Git changes
        log.dim("Collecting changes...");
        const changes = computeChanges(gitBefore, projectPath);
        if (changes.modified.length > 0 || changes.created.length > 0) {
          log.info(`Changes: ${changes.modified.length} modified, ${changes.created.length} created`);
        }
        await api.updateSession(projectId, session.id, { git_changes: changes });

        // Auto memories
        if (changes.modified.length > 0 || changes.created.length > 0) {
          const fileList = [...changes.modified, ...changes.created.map(f => `${f} (new)`)].join(", ");
          await api.addMemory(projectId, `Files changed by ${agentName}: ${fileList}`, {
            type: "learned", tags: ["files", "auto"], source_agent: agentName, source_session: session.id,
          });
        }

        // Extract from logs
        log.dim("Extracting memories from agent logs...");
        try {
          const extracted = await extractMemoriesFromLogs(agentName, projectPath, startedAt);
          for (const mem of extracted) {
            await api.addMemory(projectId, mem.content, {
              type: mem.type, tags: mem.tags, source_agent: agentName, source_session: session.id,
            });
          }
          if (extracted.length > 0) log.info(`Extracted ${extracted.length} memories from agent logs.`);
        } catch { /* non-fatal */ }

        // Complete
        await api.updateSession(projectId, session.id, { status: "completed" });
        log.success(`Session ${chalk.bold(session.id)} archived.`);

        // Hints
        log.dim(`Continue this session:  aihub chat --continue ${session.id}`);
        log.dim(`Continue last session:  aihub chat --last`);
        log.dim(`Pick from history:      aihub chat --pick`);

      } finally {
        restoreMcp();
        restoreSkills();
        releaseLock(projectPath);
      }
    });
}
