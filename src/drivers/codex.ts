import { execSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { AgentDriver } from "./base.js";

const BACKUP_SUFFIX = ".aihub-backup";
const MARKER = "<!-- AIHUB-INJECTED -->";

export class CodexDriver implements AgentDriver {
  readonly name = "codex";
  readonly displayName = "OpenAI Codex";
  private hadOriginal = false;

  async detect(): Promise<boolean> {
    try { execSync("which codex", { stdio: "ignore" }); return true; } catch { return false; }
  }

  async prepare(context: string, projectDir: string): Promise<void> {
    const f = path.join(projectDir, "AGENTS.md");
    if (fs.existsSync(f)) {
      this.hadOriginal = true;
      fs.copyFileSync(f, f + BACKUP_SUFFIX);
      const orig = fs.readFileSync(f, "utf-8");
      fs.writeFileSync(f, MARKER + "\n\n" + context + "\n\n---\n\n" + orig, "utf-8");
    } else {
      this.hadOriginal = false;
      fs.writeFileSync(f, MARKER + "\n\n" + context, "utf-8");
    }
  }

  async run(task: string, projectDir: string): Promise<{ exitCode: number }> {
    const args = task ? [task] : [];
    return new Promise(resolve => {
      const child = spawn("codex", args, { cwd: projectDir, stdio: "inherit" });
      child.on("close", code => resolve({ exitCode: code ?? 0 }));
      child.on("error", () => resolve({ exitCode: 1 }));
    });
  }

  async cleanup(projectDir: string): Promise<void> {
    const f = path.join(projectDir, "AGENTS.md");
    const b = f + BACKUP_SUFFIX;
    if (fs.existsSync(b)) { fs.copyFileSync(b, f); fs.unlinkSync(b); }
    else if (!this.hadOriginal && fs.existsSync(f)) {
      const c = fs.readFileSync(f, "utf-8");
      if (c.startsWith(MARKER)) fs.unlinkSync(f);
    }
  }
}
