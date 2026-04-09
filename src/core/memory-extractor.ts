import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as readline from "node:readline";

interface ExtractedMemory {
  content: string;
  type: string;
  tags: string[];
}

// ─── Path mapping ────────────────────────────

/** Claude: /Users/foxyi/aihub → -Users-foxyi-aihub */
function claudeProjectKey(projectDir: string): string {
  return "-" + projectDir.split("/").filter(Boolean).join("-");
}

/** CodeBuddy: /Users/foxyi/aihub → Users-foxyi-aihub */
function codebuddyProjectKey(projectDir: string): string {
  return projectDir.split("/").filter(Boolean).join("-");
}

function getLogDir(agent: string, projectDir: string): string | null {
  switch (agent) {
    case "claude":
    case "claude-internal": {
      const dir = path.join(os.homedir(), ".claude-internal", "projects", claudeProjectKey(projectDir));
      return fs.existsSync(dir) ? dir : null;
    }
    case "codebuddy": {
      const dir = path.join(os.homedir(), ".codebuddy", "projects", codebuddyProjectKey(projectDir));
      return fs.existsSync(dir) ? dir : null;
    }
    default:
      return null;
  }
}

// ─── Find latest session file ────────────────

function findLatestSessions(logDir: string, afterMs: number): string[] {
  return fs.readdirSync(logDir)
    .filter(f => f.endsWith(".jsonl"))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(logDir, f)).mtimeMs }))
    .filter(f => f.mtime >= afterMs)
    .sort((a, b) => b.mtime - a.mtime)
    .map(f => path.join(logDir, f.name));
}

// ─── Parse JSONL ─────────────────────────────

async function parseClaudeLog(filePath: string): Promise<string[]> {
  const texts: string[] = [];
  const stream = fs.createReadStream(filePath, { encoding: "utf-8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if (obj.type === "assistant") {
        const content = obj.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "text" && block.text) {
              texts.push(block.text);
            }
          }
        }
      }
    } catch { /* skip malformed lines */ }
  }
  return texts;
}

async function parseCodeBuddyLog(filePath: string): Promise<string[]> {
  const texts: string[] = [];
  const stream = fs.createReadStream(filePath, { encoding: "utf-8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if (obj.type === "message" && obj.role === "assistant") {
        const content = obj.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "output_text" && block.text) {
              texts.push(block.text);
            }
          }
        }
      }
    } catch { /* skip malformed lines */ }
  }
  return texts;
}

// ─── Filter & extract meaningful content ─────

function isUsefulMemory(text: string): boolean {
  const trimmed = text.trim();
  // Too short
  if (trimmed.length < 30) return false;
  // Pure questions
  if (trimmed.endsWith("?") && trimmed.split("\n").length <= 2) return false;
  // Pure acknowledgments
  const skipPatterns = [/^(ok|好的|好|done|完成|已|明白)/i];
  for (const p of skipPatterns) {
    if (p.test(trimmed)) return false;
  }
  return true;
}

function summarize(text: string, maxLen = 500): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen) + "...";
}

// ─── Main export ─────────────────────────────

export async function extractMemoriesFromLogs(
  agent: string,
  projectDir: string,
  startedAt: number,
): Promise<ExtractedMemory[]> {
  const logDir = getLogDir(agent, projectDir);
  if (!logDir) return [];

  const sessionFiles = findLatestSessions(logDir, startedAt);
  if (sessionFiles.length === 0) return [];

  // Try files newest-first, stop when we find content
  for (const sessionFile of sessionFiles) {
    let rawTexts: string[];
    switch (agent) {
      case "claude":
      case "claude-internal":
        rawTexts = await parseClaudeLog(sessionFile);
        break;
      case "codebuddy":
        rawTexts = await parseCodeBuddyLog(sessionFile);
        break;
      default:
        return [];
    }

    const memories: ExtractedMemory[] = [];
    for (const text of rawTexts) {
      if (!isUsefulMemory(text)) continue;
      memories.push({
        content: summarize(text),
        type: "learned",
        tags: ["auto", "agent-log"],
      });
    }

    if (memories.length > 0) return memories;
  }

  return [];
}
