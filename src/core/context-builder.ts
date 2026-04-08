import * as api from "../client/api.js";
import { exportForAgent } from "../translators/export/agents.js";
import type { ExportInput, MemoryData } from "../translators/types.js";

export async function buildExportInput(projectId: string, opts?: { task?: string }): Promise<ExportInput> {
  const [rules, globalRules, context, globalContext, memories] = await Promise.all([
    api.getRules(projectId),
    api.getGlobalRules(),
    api.getProjectContext(projectId),
    api.getGlobalContext(),
    opts?.task
      ? api.searchMemory(projectId, opts.task, 10)
      : api.listMemory(projectId, 10),
  ]);

  return {
    rules,
    globalRules,
    context,
    globalContext,
    memories: memories as unknown as MemoryData[],
  };
}

export async function buildContextString(projectId: string, agent: string, opts?: { task?: string; handoff?: string }): Promise<{ content: string; stats: { rules: number; context: number; memories: number } }> {
  const input = await buildExportInput(projectId, opts);
  if (opts?.handoff) input.handoff = opts.handoff;

  const result = exportForAgent(agent, input);
  const content = result.files[0]?.content ?? "";

  return {
    content,
    stats: {
      rules: input.rules.length + input.globalRules.length,
      context: input.context.length + input.globalContext.length,
      memories: input.memories.length,
    },
  };
}
