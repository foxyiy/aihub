import type { ChildProcess } from "node:child_process";

export interface AgentDriver {
  readonly name: string;
  readonly displayName: string;
  detect(): Promise<boolean>;
  prepare(context: string, projectDir: string): Promise<void>;
  run(task: string, projectDir: string): Promise<{ exitCode: number }>;
  cleanup(projectDir: string): Promise<void>;
}
