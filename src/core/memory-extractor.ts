import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as readline from "node:readline";
import { execSync } from "node:child_process";

interface ExtractedMemory {
  content: string;
  type: string;
  tags: string[];
}

// ─── Path mapping ────────────────────────────

function claudeProjectKey(projectDir: string): string {
  return "-" + projectDir.split("/").filter(Boolean).join("-");
}

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

// ─── Agent CLI name mapping ──────────────────

function getAgentCli(agent: string): string {
  switch (agent) {
    case "claude": return "claude";
    case "claude-internal": return "claude-internal";
    case "codebuddy": return "codebuddy";
    case "codex": return "codex";
    case "aider": return "aider";
    default: return agent;
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
    } catch { /* skip */ }
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
    } catch { /* skip */ }
  }
  return texts;
}

// ─── LLM summarization via agent -p ──────────

const SUMMARY_PROMPT = `你是一个会话摘要提取器。从以下 AI agent 的对话内容中，提取有价值的信息。

输出格式（每条一行，用 | 分隔类型和内容）：
decision|选择了 React 19 而不是 Vue，因为团队更熟悉
warning|sql.js 在 Linux 上不需要编译，但 better-sqlite3 需要 C++ 编译器
learned|项目使用 Client-Server 架构，CLI 是无状态客户端

规则：
- 只提取有价值的：架构决策、技术选择、踩坑经验、重要发现
- 忽略：闲聊、确认、提问、代码细节
- 每条不超过 100 字
- 最多 10 条
- 如果没有有价值的内容，输出空

对话内容：
`;

function summarizeWithAgent(agent: string, rawTexts: string[]): ExtractedMemory[] {
  const cli = getAgentCli(agent);

  // Combine texts, truncate to avoid token limits
  const combined = rawTexts
    .filter(t => t.trim().length > 30)
    .map(t => t.trim().slice(0, 500))
    .join("\n---\n")
    .slice(0, 8000);

  if (combined.length < 50) return [];

  try {
    const result = execSync(
      `${cli} -p "${SUMMARY_PROMPT}${combined.replace(/"/g, '\\"')}"`,
      { encoding: "utf-8", timeout: 30000, stdio: ["pipe", "pipe", "pipe"] },
    ).trim();

    return parseSummaryOutput(result);
  } catch {
    // Agent -p not available or failed, fall back to simple extraction
    return [];
  }
}

function parseSummaryOutput(output: string): ExtractedMemory[] {
  const memories: ExtractedMemory[] = [];
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("-")) continue;

    const pipeIdx = trimmed.indexOf("|");
    if (pipeIdx > 0 && pipeIdx < 15) {
      const type = trimmed.slice(0, pipeIdx).trim();
      const content = trimmed.slice(pipeIdx + 1).trim();
      if (content.length > 10 && ["decision", "warning", "learned"].includes(type)) {
        memories.push({ content, type, tags: ["auto", "summary"] });
      }
    }
  }
  return memories;
}

// ─── Fallback: simple keyword extraction ─────

function simpleFallback(rawTexts: string[]): ExtractedMemory[] {
  const memories: ExtractedMemory[] = [];
  for (const text of rawTexts) {
    const trimmed = text.trim();
    if (trimmed.length < 50) continue;
    if (trimmed.endsWith("?") && trimmed.split("\n").length <= 2) continue;
    if (/^(ok|好的|好|done|完成|已|明白|没问题|你好|hello|我来|让我|let me)/i.test(trimmed)) continue;

    memories.push({
      content: trimmed.slice(0, 500) + (trimmed.length > 500 ? "..." : ""),
      type: "learned",
      tags: ["auto", "agent-log"],
    });
  }
  return memories;
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

    if (rawTexts.length === 0) continue;

    // Try LLM summary first, fall back to simple extraction
    const memories = summarizeWithAgent(agent, rawTexts);
    if (memories.length > 0) return memories;

    // Fallback
    const fallback = simpleFallback(rawTexts);
    if (fallback.length > 0) return fallback;
  }

  return [];
}
