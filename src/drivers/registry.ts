import type { AgentDriver } from "./base.js";
import { ClaudeDriver } from "./claude.js";
import { ClaudeInternalDriver } from "./claude-internal.js";
import { CodeBuddyDriver } from "./codebuddy.js";
import { CodexDriver } from "./codex.js";
import { AiderDriver } from "./aider.js";

const ALL: AgentDriver[] = [
  new ClaudeDriver(),
  new ClaudeInternalDriver(),
  new CodeBuddyDriver(),
  new CodexDriver(),
  new AiderDriver(),
];

export function getDriver(name: string): AgentDriver | undefined {
  return ALL.find(d => d.name === name);
}

export function getAllDrivers(): AgentDriver[] { return ALL; }

export async function detectAvailable(): Promise<AgentDriver[]> {
  const results = await Promise.all(ALL.map(async d => ({ d, ok: await d.detect() })));
  return results.filter(r => r.ok).map(r => r.d);
}
