import { execSync, spawn } from "node:child_process";
import type { AgentDriver } from "./base.js";

export class AiderDriver implements AgentDriver {
  readonly name = "aider";
  readonly displayName = "Aider";

  async detect(): Promise<boolean> {
    try { execSync("which aider", { stdio: "ignore" }); return true; } catch { return false; }
  }

  async prepare(_context: string, _projectDir: string): Promise<void> {}

  async run(task: string, projectDir: string): Promise<{ exitCode: number }> {
    const args = task ? ["--message", task] : [];
    return new Promise(resolve => {
      const child = spawn("aider", args, { cwd: projectDir, stdio: "inherit" });
      child.on("close", code => resolve({ exitCode: code ?? 0 }));
      child.on("error", () => resolve({ exitCode: 1 }));
    });
  }

  async cleanup(_projectDir: string): Promise<void> {}
}
