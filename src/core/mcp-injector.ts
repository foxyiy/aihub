import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export interface McpServers {
  [name: string]: {
    command: string;
    args?: string[];
    env?: Record<string, string>;
  };
}

interface BackupEntry {
  path: string;
  existed: boolean;
  content: string | null;
}

let backups: BackupEntry[] = [];

// ─── Inject MCP configs into agent config files ──────

export function injectMcp(agent: string, projectDir: string, servers: McpServers): void {
  backups = [];
  if (Object.keys(servers).length === 0) return;

  switch (agent) {
    case "claude":
    case "claude-internal":
      injectClaude(projectDir, servers);
      break;
    case "codebuddy":
      injectCodeBuddy(projectDir, servers);
      break;
    // codex/aider: no MCP support
  }
}

export function restoreMcp(): void {
  for (const entry of backups) {
    if (entry.existed && entry.content !== null) {
      fs.writeFileSync(entry.path, entry.content, "utf-8");
    } else if (!entry.existed && fs.existsSync(entry.path)) {
      fs.unlinkSync(entry.path);
    }
  }
  backups = [];
}

// ─── One-time sync (aihub mcp sync) ─────────────────

export function syncMcpToAgent(agent: string, projectDir: string, servers: McpServers): { path: string; action: string } | null {
  if (Object.keys(servers).length === 0) return null;

  switch (agent) {
    case "claude":
    case "claude-internal":
      return syncClaude(projectDir, servers);
    case "codebuddy":
      return syncCodeBuddy(projectDir, servers);
    default:
      return null;
  }
}

// ─── Claude ──────────────────────────────────────────

function claudeConfigPath(projectDir: string): string {
  return path.join(projectDir, ".claude", "settings.local.json");
}

function readJsonSafe(filePath: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return {};
  }
}

function injectClaude(projectDir: string, servers: McpServers): void {
  const configPath = claudeConfigPath(projectDir);
  const existed = fs.existsSync(configPath);
  const content = existed ? fs.readFileSync(configPath, "utf-8") : null;
  backups.push({ path: configPath, existed, content });

  const config = existed ? readJsonSafe(configPath) : {};
  const existing = (config.mcpServers ?? {}) as Record<string, unknown>;
  config.mcpServers = { ...existing, ...servers };

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}

function syncClaude(projectDir: string, servers: McpServers): { path: string; action: string } {
  const configPath = claudeConfigPath(projectDir);
  const config = readJsonSafe(configPath);
  const existing = (config.mcpServers ?? {}) as Record<string, unknown>;

  // Only add new keys, don't overwrite existing (local-first)
  const { merged, skipped } = mergeNoOverwrite(existing, servers);
  config.mcpServers = merged;

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
  const action = skipped.length > 0
    ? `merged (skipped existing: ${skipped.join(", ")})`
    : "merged";
  return { path: configPath, action };
}

// ─── CodeBuddy ───────────────────────────────────────

function codebuddyConfigPath(projectDir: string): string {
  return path.join(projectDir, ".codebuddy", "settings.local.json");
}

function injectCodeBuddy(projectDir: string, servers: McpServers): void {
  const configPath = codebuddyConfigPath(projectDir);
  const existed = fs.existsSync(configPath);
  const content = existed ? fs.readFileSync(configPath, "utf-8") : null;
  backups.push({ path: configPath, existed, content });

  const config = existed ? readJsonSafe(configPath) : {};
  const existing = (config.mcpServers ?? {}) as Record<string, unknown>;
  config.mcpServers = { ...existing, ...servers };

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}

function syncCodeBuddy(projectDir: string, servers: McpServers): { path: string; action: string } {
  const configPath = codebuddyConfigPath(projectDir);
  const config = readJsonSafe(configPath);
  const existing = (config.mcpServers ?? {}) as Record<string, unknown>;

  const { merged, skipped } = mergeNoOverwrite(existing, servers);
  config.mcpServers = merged;

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
  const action = skipped.length > 0
    ? `merged (skipped existing: ${skipped.join(", ")})`
    : "merged";
  return { path: configPath, action };
}

// ─── Helpers ─────────────────────────────────────────

function mergeNoOverwrite(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): { merged: Record<string, unknown>; skipped: string[] } {
  const merged = { ...existing };
  const skipped: string[] = [];
  for (const [key, value] of Object.entries(incoming)) {
    if (key in existing) {
      skipped.push(key);
    } else {
      merged[key] = value;
    }
  }
  return { merged, skipped };
}
