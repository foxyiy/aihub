import * as fs from "node:fs";
import * as path from "node:path";

export function acquireLock(projectDir: string): boolean {
  const lockFile = path.join(projectDir, ".aihub-chat.lock");
  if (fs.existsSync(lockFile)) {
    const data = JSON.parse(fs.readFileSync(lockFile, "utf-8"));
    // Check if PID is still alive
    try { process.kill(data.pid, 0); return false; } catch { /* dead process, clear lock */ }
  }
  fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, started: new Date().toISOString() }), "utf-8");
  return true;
}

export function releaseLock(projectDir: string): void {
  const lockFile = path.join(projectDir, ".aihub-chat.lock");
  if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
}
