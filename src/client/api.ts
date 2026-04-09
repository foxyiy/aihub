import { loadClientConfig } from "../utils/config.js";

function baseUrl(): string {
  return loadClientConfig().serverUrl;
}

async function request(path: string, opts?: RequestInit): Promise<unknown> {
  const url = `${baseUrl()}${path}`;
  const headers: Record<string, string> = { ...opts?.headers as Record<string, string> };
  if (opts?.body) headers["Content-Type"] = "application/json";
  const res = await fetch(url, { ...opts, headers });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── Health ───────────────────────
export async function health(): Promise<boolean> {
  try {
    await request("/health");
    return true;
  } catch { return false; }
}

// ─── Projects ─────────────────────
export async function listProjects(): Promise<unknown[]> {
  return request("/projects") as Promise<unknown[]>;
}

export async function registerProject(projectPath: string, description?: string): Promise<Record<string, unknown>> {
  return request("/projects", {
    method: "POST",
    body: JSON.stringify({ path: projectPath, description }),
  }) as Promise<Record<string, unknown>>;
}

export async function getProject(id: string): Promise<Record<string, unknown>> {
  return request(`/projects/${id}`) as Promise<Record<string, unknown>>;
}

// ─── Rules ────────────────────────
export async function getRules(projectId: string): Promise<Array<{ filename: string; content: string; metadata: Record<string, unknown> }>> {
  return request(`/projects/${projectId}/rules`) as Promise<Array<{ filename: string; content: string; metadata: Record<string, unknown> }>>;
}

export async function getGlobalRules(): Promise<Array<{ filename: string; content: string; metadata: Record<string, unknown> }>> {
  return request("/global/rules") as Promise<Array<{ filename: string; content: string; metadata: Record<string, unknown> }>>;
}

// ─── Context ──────────────────────
export async function getProjectContext(projectId: string): Promise<Array<{ filename: string; content: string; metadata: Record<string, unknown> }>> {
  return request(`/projects/${projectId}/context`) as Promise<Array<{ filename: string; content: string; metadata: Record<string, unknown> }>>;
}

export async function getGlobalContext(): Promise<Array<{ filename: string; content: string; metadata: Record<string, unknown> }>> {
  return request("/global/context") as Promise<Array<{ filename: string; content: string; metadata: Record<string, unknown> }>>;
}

// ─── Memory ───────────────────────
export async function listMemory(projectId: string, limit = 20): Promise<Array<Record<string, unknown>>> {
  return request(`/projects/${projectId}/memory?limit=${limit}`) as Promise<Array<Record<string, unknown>>>;
}

export async function searchMemory(projectId: string, query: string, limit = 10): Promise<Array<Record<string, unknown>>> {
  return request(`/projects/${projectId}/memory/search?q=${encodeURIComponent(query)}&limit=${limit}`) as Promise<Array<Record<string, unknown>>>;
}

export async function addMemory(projectId: string, content: string, opts?: { type?: string; tags?: string[]; source_agent?: string; source_session?: string }): Promise<Record<string, unknown>> {
  return request(`/projects/${projectId}/memory`, {
    method: "POST",
    body: JSON.stringify({ content, ...opts }),
  }) as Promise<Record<string, unknown>>;
}

export async function deleteMemory(projectId: string, memId: string): Promise<{ deleted: boolean }> {
  return request(`/projects/${projectId}/memory/${memId}`, { method: "DELETE" }) as Promise<{ deleted: boolean }>;
}

export async function memoryCount(projectId: string): Promise<number> {
  const res = await request(`/projects/${projectId}/memory/count`) as { count: number };
  return res.count;
}

// ─── Sessions ─────────────────────
export async function listSessions(projectId: string, limit = 20): Promise<Array<Record<string, unknown>>> {
  return request(`/projects/${projectId}/sessions?limit=${limit}`) as Promise<Array<Record<string, unknown>>>;
}

export async function createSession(projectId: string, task: string, agent: string): Promise<{ id: string; segmentId: string }> {
  return request(`/projects/${projectId}/sessions`, {
    method: "POST",
    body: JSON.stringify({ task, agent }),
  }) as Promise<{ id: string; segmentId: string }>;
}

export async function updateSession(projectId: string, sessionId: string, data: Record<string, unknown>): Promise<unknown> {
  return request(`/projects/${projectId}/sessions/${sessionId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function getSession(projectId: string, sessionId: string): Promise<Record<string, unknown>> {
  return request(`/projects/${projectId}/sessions/${sessionId}`) as Promise<Record<string, unknown>>;
}

// ─── Rules (write) ───────────────
export async function putRule(projectId: string, filename: string, content: string): Promise<{ ok: boolean }> {
  return request(`/projects/${projectId}/rules/${encodeURIComponent(filename)}`, {
    method: "PUT",
    body: JSON.stringify({ content }),
  }) as Promise<{ ok: boolean }>;
}

export async function deleteRule(projectId: string, filename: string): Promise<{ deleted: boolean }> {
  return request(`/projects/${projectId}/rules/${encodeURIComponent(filename)}`, { method: "DELETE" }) as Promise<{ deleted: boolean }>;
}

// ─── Context (write) ─────────────
export async function putContext(projectId: string, filename: string, content: string): Promise<{ ok: boolean }> {
  return request(`/projects/${projectId}/context/${encodeURIComponent(filename)}`, {
    method: "PUT",
    body: JSON.stringify({ content }),
  }) as Promise<{ ok: boolean }>;
}

export async function deleteContext(projectId: string, filename: string): Promise<{ deleted: boolean }> {
  return request(`/projects/${projectId}/context/${encodeURIComponent(filename)}`, { method: "DELETE" }) as Promise<{ deleted: boolean }>;
}

// ─── MCP ──────────────────────────
export async function getMcp(projectId: string): Promise<Record<string, unknown>> {
  return request(`/projects/${projectId}/mcp`) as Promise<Record<string, unknown>>;
}

export async function putMcp(projectId: string, data: Record<string, unknown>): Promise<{ ok: boolean }> {
  return request(`/projects/${projectId}/mcp`, {
    method: "PUT",
    body: JSON.stringify(data),
  }) as Promise<{ ok: boolean }>;
}

// ─── Skills ──────────────────────
export async function getSkills(projectId: string): Promise<Array<{ filename: string; content: string; metadata: Record<string, unknown> }>> {
  return request(`/projects/${projectId}/skills`) as Promise<Array<{ filename: string; content: string; metadata: Record<string, unknown> }>>;
}

export async function getGlobalSkills(): Promise<Array<{ filename: string; content: string; metadata: Record<string, unknown> }>> {
  return request("/global/skills") as Promise<Array<{ filename: string; content: string; metadata: Record<string, unknown> }>>;
}

export async function putSkill(projectId: string, filename: string, content: string): Promise<{ ok: boolean }> {
  return request(`/projects/${projectId}/skills/${encodeURIComponent(filename)}`, {
    method: "PUT",
    body: JSON.stringify({ content }),
  }) as Promise<{ ok: boolean }>;
}

export async function deleteSkill(projectId: string, filename: string): Promise<{ deleted: boolean }> {
  return request(`/projects/${projectId}/skills/${encodeURIComponent(filename)}`, { method: "DELETE" }) as Promise<{ deleted: boolean }>;
}
