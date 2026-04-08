import { execSync, spawn } from "node:child_process";
import type { AgentDriver } from "./base.js";

export class ClaudeDriver implements AgentDriver {
  readonly name = "claude";
  readonly displayName = "Claude Code";
  private context = "";

  async detect(): Promise<boolean> {
    try { execSync("which claude", { stdio: "ignore" }); return true; } catch { return false; }
  }

  async prepare(context: string, _projectDir: string): Promise<void> {
    this.context = context;
  }

  async run(task: string, projectDir: string): Promise<{ exitCode: number }> {
    const args: string[] = [];

    // Inject context via --append-system-prompt (no file modification needed)
    if (this.context) {
      args.push("--append-system-prompt", this.context);
    }

    // Initial task as prompt argument
    if (task) {
      args.push(task);
    }

    return new Promise(resolve => {
      const child = spawn("claude", args, { cwd: projectDir, stdio: "inherit" });
      child.on("close", code => resolve({ exitCode: code ?? 0 }));
      child.on("error", () => resolve({ exitCode: 1 }));
    });
  }

  async cleanup(_projectDir: string): Promise<void> {
    // No files to clean up — context was injected via CLI args
  }
}
