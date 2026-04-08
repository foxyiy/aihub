import { execSync, spawn } from "node:child_process";
import type { AgentDriver } from "./base.js";

export class ClaudeInternalDriver implements AgentDriver {
  readonly name = "claude-internal";
  readonly displayName = "Claude Code Internal";
  private context = "";

  async detect(): Promise<boolean> {
    try { execSync("which claude-internal", { stdio: "ignore" }); return true; } catch { return false; }
  }

  async prepare(context: string, _projectDir: string): Promise<void> {
    this.context = context;
  }

  async run(task: string, projectDir: string): Promise<{ exitCode: number }> {
    const args: string[] = [];

    if (this.context) {
      args.push("--append-system-prompt", this.context);
    }

    if (task) {
      args.push(task);
    }

    return new Promise(resolve => {
      const child = spawn("claude-internal", args, { cwd: projectDir, stdio: "inherit" });
      child.on("close", code => resolve({ exitCode: code ?? 0 }));
      child.on("error", () => resolve({ exitCode: 1 }));
    });
  }

  async cleanup(_projectDir: string): Promise<void> {}
}
