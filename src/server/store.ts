import * as fs from "node:fs";
import * as path from "node:path";
import matter from "gray-matter";
import { getProjectsDir, getDataDir } from "./db.js";

export interface MarkdownFile {
  filename: string;
  content: string;
  metadata: Record<string, unknown>;
}

function projectDir(projectId: string): string {
  return path.join(getProjectsDir(), projectId);
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

// ─── Rules ────────────────────────────────────────────

export function getRules(projectId: string): MarkdownFile[] {
  return readMarkdownDir(path.join(projectDir(projectId), "rules"));
}

export function getGlobalRules(): MarkdownFile[] {
  return readMarkdownDir(path.join(getDataDir(), "global", "rules"));
}

export function putRule(projectId: string, filename: string, content: string): void {
  const dir = path.join(projectDir(projectId), "rules");
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, filename), content, "utf-8");
}

export function putGlobalRule(filename: string, content: string): void {
  const dir = path.join(getDataDir(), "global", "rules");
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, filename), content, "utf-8");
}

export function deleteRule(projectId: string, filename: string): boolean {
  const fp = path.join(projectDir(projectId), "rules", filename);
  if (fs.existsSync(fp)) { fs.unlinkSync(fp); return true; }
  return false;
}

// ─── Context ──────────────────────────────────────────

export function getContext(projectId: string): MarkdownFile[] {
  return readMarkdownDir(path.join(projectDir(projectId), "context"));
}

export function getGlobalContext(): MarkdownFile[] {
  return readMarkdownDir(path.join(getDataDir(), "global", "context"));
}

export function putContext(projectId: string, filename: string, content: string): void {
  const dir = path.join(projectDir(projectId), "context");
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, filename), content, "utf-8");
}

export function putGlobalContext(filename: string, content: string): void {
  const dir = path.join(getDataDir(), "global", "context");
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, filename), content, "utf-8");
}

export function deleteContext(projectId: string, filename: string): boolean {
  const fp = path.join(projectDir(projectId), "context", filename);
  if (fs.existsSync(fp)) { fs.unlinkSync(fp); return true; }
  return false;
}

// ─── MCP ──────────────────────────────────────────────

export function getMcp(projectId: string): Record<string, unknown> {
  const fp = path.join(projectDir(projectId), "mcp", "servers.json");
  if (!fs.existsSync(fp)) return { servers: {} };
  return JSON.parse(fs.readFileSync(fp, "utf-8"));
}

export function getGlobalMcp(): Record<string, unknown> {
  const fp = path.join(getDataDir(), "global", "mcp", "servers.json");
  if (!fs.existsSync(fp)) return { servers: {} };
  return JSON.parse(fs.readFileSync(fp, "utf-8"));
}

export function putMcp(projectId: string, data: Record<string, unknown>): void {
  const dir = path.join(projectDir(projectId), "mcp");
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, "servers.json"), JSON.stringify(data, null, 2), "utf-8");
}

export function putGlobalMcp(data: Record<string, unknown>): void {
  const dir = path.join(getDataDir(), "global", "mcp");
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, "servers.json"), JSON.stringify(data, null, 2), "utf-8");
}

// ─── Skills ──────────────────────────────────────────

export function getSkills(projectId: string): MarkdownFile[] {
  return readMarkdownDir(path.join(projectDir(projectId), "skills"));
}

export function getGlobalSkills(): MarkdownFile[] {
  return readMarkdownDir(path.join(getDataDir(), "global", "skills"));
}

export function putSkill(projectId: string, filename: string, content: string): void {
  const dir = path.join(projectDir(projectId), "skills");
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, filename), content, "utf-8");
}

export function deleteSkill(projectId: string, filename: string): boolean {
  const fp = path.join(projectDir(projectId), "skills", filename);
  if (fs.existsSync(fp)) { fs.unlinkSync(fp); return true; }
  return false;
}

// ─── Init project dirs ───────────────────────────────

export function initProjectDirs(projectId: string): void {
  const base = projectDir(projectId);
  ensureDir(path.join(base, "rules"));
  ensureDir(path.join(base, "context"));
  ensureDir(path.join(base, "mcp"));
  ensureDir(path.join(base, "skills"));
}

// ─── Helpers ──────────────────────────────────────────

function readMarkdownDir(dir: string): MarkdownFile[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith(".md"))
    .sort()
    .map(filename => {
      const raw = fs.readFileSync(path.join(dir, filename), "utf-8");
      const { data, content } = matter(raw);
      return { filename, content: content.trim(), metadata: data };
    });
}
