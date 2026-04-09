import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as api from "../client/api.js";

/**
 * Scan local agent MCP configs and upload to server.
 * Global agent configs → Server global MCP
 * Project agent configs → Server project MCP
 */
export async function autoImportMcp(projectId: string): Promise<{ imported: number; names: string[] }> {
  const globalCollected: Record<string, unknown> = {};
  const projectCollected: Record<string, unknown> = {};

  // Claude global → Server global
  const claudeGlobal = path.join(os.homedir(), ".claude", "settings.local.json");
  collectMcpFromJson(claudeGlobal, globalCollected);

  // CodeBuddy plugins → Server global
  const pluginsDir = path.join(os.homedir(), ".codebuddy", "plugins", "marketplaces");
  if (fs.existsSync(pluginsDir)) {
    for (const f of findFiles(pluginsDir, ".mcp.json")) {
      try {
        const data = JSON.parse(fs.readFileSync(f, "utf-8"));
        const servers = data.mcpServers ?? data;
        Object.assign(globalCollected, servers);
      } catch { /* skip */ }
    }
  }

  // Claude project-level → Server project
  const claudeProject = path.join(process.cwd(), ".claude", "settings.local.json");
  collectMcpFromJson(claudeProject, projectCollected);

  // CodeBuddy project-level → Server project
  const cbProject = path.join(process.cwd(), ".codebuddy", "settings.local.json");
  collectMcpFromJson(cbProject, projectCollected);

  const allNames: string[] = [];

  // Upload global
  if (Object.keys(globalCollected).length > 0) {
    const current = await api.getGlobalMcp();
    const existing = (current.servers ?? {}) as Record<string, unknown>;
    for (const key of Object.keys(globalCollected)) {
      if (!(key in existing)) {
        existing[key] = globalCollected[key];
        allNames.push(key);
      }
    }
    if (allNames.length > 0) {
      await api.putGlobalMcp({ servers: existing });
    }
  }

  // Upload project
  if (Object.keys(projectCollected).length > 0) {
    const current = await api.getMcp(projectId);
    const existing = (current.servers ?? {}) as Record<string, unknown>;
    const projNames: string[] = [];
    for (const key of Object.keys(projectCollected)) {
      if (!(key in existing)) {
        existing[key] = projectCollected[key];
        projNames.push(key);
      }
    }
    if (projNames.length > 0) {
      await api.putMcp(projectId, { servers: existing });
      allNames.push(...projNames);
    }
  }

  return { imported: allNames.length, names: allNames };
}

/**
 * Scan local agent skill files and upload new ones to server.
 */
export async function autoImportSkills(projectId: string): Promise<{ imported: number; names: string[] }> {
  const projectDir = process.cwd();
  const names: string[] = [];

  // Get existing skills on server
  const serverSkills = await api.getSkills(projectId);
  const existingNames = new Set(serverSkills.map(s => s.filename));

  // Claude commands
  for (const dir of [
    path.join(projectDir, ".claude", "commands"),
    path.join(os.homedir(), ".claude", "commands"),
  ]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".md"))) {
      if (existingNames.has(f)) continue;
      const content = fs.readFileSync(path.join(dir, f), "utf-8");
      await api.putSkill(projectId, f, content);
      existingNames.add(f);
      names.push(f);
    }
  }

  // CodeBuddy project skills
  const cbSkillsDir = path.join(projectDir, ".codebuddy", "skills");
  if (fs.existsSync(cbSkillsDir)) {
    for (const d of fs.readdirSync(cbSkillsDir, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const filename = `${d.name}.md`;
      if (existingNames.has(filename)) continue;
      const skillFile = path.join(cbSkillsDir, d.name, "SKILL.md");
      if (!fs.existsSync(skillFile)) continue;
      const content = fs.readFileSync(skillFile, "utf-8");
      await api.putSkill(projectId, filename, content);
      existingNames.add(filename);
      names.push(d.name);
    }
  }

  return { imported: names.length, names };
}

// ─── Helpers ──────────────────────────────────

function collectMcpFromJson(filePath: string, target: Record<string, unknown>): void {
  if (!fs.existsSync(filePath)) return;
  try {
    const config = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (config.mcpServers && typeof config.mcpServers === "object") {
      Object.assign(target, config.mcpServers);
    }
  } catch { /* skip */ }
}

function findFiles(dir: string, name: string): string[] {
  const results: string[] = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) results.push(...findFiles(fullPath, name));
      else if (entry.name === name) results.push(fullPath);
    }
  } catch { /* skip */ }
  return results;
}
