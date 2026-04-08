import { execSync } from "node:child_process";

export interface GitChanges {
  modified: string[];
  created: string[];
  deleted: string[];
  diffStat: string;
}

function gitExec(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { cwd, encoding: "utf-8", timeout: 5000 });
  } catch {
    return "";
  }
}

function isGitRepo(dir: string): boolean {
  return gitExec("git rev-parse --is-inside-work-tree", dir).trim() === "true";
}

export function captureSnapshot(projectDir: string): string {
  if (!isGitRepo(projectDir)) return "";
  return gitExec("git status --porcelain", projectDir);
}

export function computeChanges(beforeSnapshot: string, projectDir: string): GitChanges {
  const empty: GitChanges = { modified: [], created: [], deleted: [], diffStat: "" };
  if (!isGitRepo(projectDir)) return empty;

  const after = captureSnapshot(projectDir);
  const beforeFiles = parseStatus(beforeSnapshot);
  const afterFiles = parseStatus(after);

  const modified: string[] = [];
  const created: string[] = [];
  const deleted: string[] = [];

  for (const [file, status] of afterFiles) {
    if (!beforeFiles.has(file)) {
      if (status === "?" || status === "A") created.push(file);
      else modified.push(file);
    } else if (beforeFiles.get(file) !== status) {
      if (status === "D") deleted.push(file);
      else modified.push(file);
    }
  }

  const diffStat = gitExec("git diff --stat HEAD", projectDir).trim();

  return { modified, created, deleted, diffStat };
}

function parseStatus(output: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of output.split("\n")) {
    if (line.length < 4) continue;
    const status = line[1]?.trim() || line[0]?.trim() || "";
    const file = line.slice(3).trim();
    if (file) map.set(file, status);
  }
  return map;
}
