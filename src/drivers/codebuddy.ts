import { execSync, spawn } from "node:child_process";
import type { AgentDriver } from "./base.js";

export class CodeBuddyDriver implements AgentDriver {
  readonly name = "codebuddy";
  readonly displayName = "CodeBuddy";
  private context = "";

  async detect(): Promise<boolean> {
    try { execSync("which codebuddy", { stdio: "ignore" }); return true; } catch { return false; }
  }

  async prepare(context: string, _projectDir: string): Promise<void> {
    this.context = context;
  }

  async run(task: string, projectDir: string): Promise<{ exitCode: number }> {
    const args: string[] = [];

    // Inject context via --append-system-prompt
    if (this.context) {
      args.push("--append-system-prompt", this.context);
    }

    // Initial task as prompt argument
    if (task) {
      args.push(task);
    }

    return new Promise(resolve => {
      const child = spawn("codebuddy", args, { cwd: projectDir, stdio: "inherit" });
      child.on("close", code => resolve({ exitCode: code ?? 0 }));
      child.on("error", () => resolve({ exitCode: 1 }));
    });
  }

  async cleanup(_projectDir: string): Promise<void> {
    // No files to clean up
  }
}
