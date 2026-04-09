import type { Command } from "commander";
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

export function registerChatCommand(program: Command): void {
  program
    .command("chat [task]")
    .description("Start a proxied chat session with an AI agent")
    .option("-a, --agent <name>", "Agent to use (claude, codebuddy, claude-internal, codex, aider)")
    .option("-s, --switch <name>", "Continue last session with a different agent")
    .option("-c, --continue <sessionId>", "Continue a specific historical session")
    .action(async (task: string | undefined, opts: { agent?: string; switch?: string; continue?: string }) => {
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

      // Build handoff context from previous session
      let handoff: string | undefined;
      let continueSessionId: string | undefined;

      if (opts.continue) {
        // Continue a specific session by ID
        const prev = await api.getSession(projectId, opts.continue);
        if (prev.error) {
          log.error(`Session not found: ${opts.continue}`);
          return;
        }
        continueSessionId = opts.continue;
        const segs = (prev.segments as Array<Record<string, unknown>>) ?? [];
        const parts: string[] = [`Task: ${prev.task}`];
        for (const seg of segs) {
          const segParts: string[] = [`Agent: ${seg.agent}`];
          if (seg.git_changes) {
            const gc = typeof seg.git_changes === "string" ? JSON.parse(seg.git_changes as string) : seg.git_changes;
            if (gc.modified?.length) segParts.push(`Modified: ${gc.modified.join(", ")}`);
            if (gc.created?.length) segParts.push(`Created: ${gc.created.join(", ")}`);
          }
          parts.push(segParts.join(", "));
        }
        handoff = `Continuing session ${opts.continue}:\n${parts.join("\n")}`;
        log.info(`Continuing session ${chalk.bold(opts.continue)} with ${chalk.cyan(agentName)}`);

      } else if (opts.switch) {
        // Continue last session with different agent
        const sessions = await api.listSessions(projectId, 1);
        if (sessions.length > 0) {
          const last = sessions[0] as Record<string, unknown>;
          continueSessionId = last.id as string;
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

        // Create or continue session
        let session: { id: string; segmentId: string };
        if (continueSessionId) {
          // Append new segment to existing session
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

        // Inject MCP configs into agent config files (global + project)
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

        // Inject skills into agent directories
        const [skills, globalSkills] = await Promise.all([
          api.getSkills(projectId),
          api.getGlobalSkills(),
        ]);
        const allSkills = [...globalSkills, ...skills];
        if (allSkills.length > 0) {
          injectSkills(agentName, projectPath, allSkills);
          log.info(`Skills: ${allSkills.length} injected`);
        }

        // Git snapshot before
        const gitBefore = captureSnapshot(projectPath);
        const startedAt = Date.now();

        log.success(`Launching ${chalk.cyan(driver.displayName)}...`);
        console.log(chalk.dim("─".repeat(50)));

        // Hand over terminal — full interactive experience
        await driver.run(task ?? "", projectPath);

        console.log(chalk.dim("─".repeat(50)));

        // ── Post-agent data collection (BEFORE restoring configs) ──

        // 1. Collect new MCP/skills agent may have installed
        log.dim("Scanning for new configs...");
        try {
          const mcp = await autoImportMcp(projectId);
          if (mcp.imported > 0) log.info(`New MCP servers detected: ${mcp.names.join(", ")}`);
          const sk = await autoImportSkills(projectId);
          if (sk.imported > 0) log.info(`New skills detected: ${sk.names.join(", ")}`);
        } catch {
          // Non-fatal
        }

        // 2. Now restore injected configs
        await driver.cleanup(projectPath);
        restoreMcp();
        restoreSkills();

        // 3. Compute git changes
        log.dim("Collecting changes...");
        const changes = computeChanges(gitBefore, projectPath);
        if (changes.modified.length > 0 || changes.created.length > 0) {
          log.info(`Changes: ${changes.modified.length} modified, ${changes.created.length} created`);
        }

        // Save to server
        await api.updateSession(projectId, session.id, { git_changes: changes });

        // 4. Auto-add file changes as memory
        if (changes.modified.length > 0 || changes.created.length > 0) {
          const fileList = [...changes.modified, ...changes.created.map(f => `${f} (new)`)].join(", ");
          await api.addMemory(projectId, `Files changed by ${agentName}: ${fileList}`, {
            type: "learned", tags: ["files", "auto"], source_agent: agentName, source_session: session.id,
          });
        }

        // 5. Extract memories from agent logs
        log.dim("Extracting memories from agent logs...");
        try {
          const extracted = await extractMemoriesFromLogs(agentName, projectPath, startedAt);
          for (const mem of extracted) {
            await api.addMemory(projectId, mem.content, {
              type: mem.type, tags: mem.tags, source_agent: agentName, source_session: session.id,
            });
          }
          if (extracted.length > 0) {
            log.info(`Extracted ${extracted.length} memories from agent logs.`);
          }
        } catch {
          // Non-fatal
        }

        // Complete session
        await api.updateSession(projectId, session.id, { status: "completed" });
        log.success(`Session ${chalk.bold(session.id)} archived.`);

        // Hint
        log.dim(`Continue this session:  aihub chat --continue ${session.id} --agent <name>`);
        log.dim(`Switch agent (latest):  aihub chat --switch <agent>`);
        log.dim(`View history:           aihub sessions list`);

      } finally {
        restoreMcp();
        restoreSkills();
        releaseLock(projectPath);
      }
    });
}
