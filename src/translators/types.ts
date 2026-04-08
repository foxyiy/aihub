export interface RuleData {
  filename: string;
  content: string;
  metadata: Record<string, unknown>;
}

export interface ContextData {
  filename: string;
  content: string;
  metadata: Record<string, unknown>;
}

export interface MemoryData {
  id: string;
  content: string;
  type: string;
  tags: string;
  source_agent: string;
}

export interface ExportInput {
  rules: RuleData[];
  globalRules: RuleData[];
  context: ContextData[];
  globalContext: ContextData[];
  memories: MemoryData[];
  handoff?: string;
}

export interface ExportResult {
  files: Array<{ path: string; content: string }>;
}
