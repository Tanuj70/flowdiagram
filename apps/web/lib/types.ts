export type Role = "admin" | "executor" | "viewer";
export interface User { id: string; email: string; role: Role }
export type GuardMode = "off" | "log" | "warn" | "block";
export interface Agent {
  id: string; name: string; description: string; prompt: string; icon: string; skills: string[];
  framework: string; pattern: string; model: string; max_tokens: number; temperature: number; top_p: number; top_k: number;
  guardrails: Record<string, GuardMode>; approvals: string[]; roles: { who: string; role: string }[];
  memory: { short: boolean; long: boolean; backend: string; retention: number; max: number };
  version: number; status: "draft" | "published";
}
export interface Tool { name: string; mode: "read" | "write"; description: string; input_schema?: Record<string, unknown> | null }
export interface Mcp { id: string; name: string; url: string; icon: string; description: string; tags: string[]; tools: Tool[] }
export interface Endpoint { id: string; name: string; method: string; url: string; auth: string; mode: "read" | "write"; collection: string }
export interface Overview { tools: string[]; endpoints: string[]; agents: string[] }
export interface Usage { id: string; name: string; refs: string[] }
export type Socket = "agents" | "tools" | "endpoints";
export interface ApiNode { id: string; type: "agent" | "tool" | "endpoint"; ref: string; x: number; y: number }
export interface ApiEdge { id: string; source: string; target: string; socket: Socket }
export interface Step {
  kind: "agent" | "tool" | "endpoint"; ref: string; label: string; depth: number; status: string;
  ms?: number; tokens?: number; findings?: { rule: string; mode: string; detail: string }[];
}
export interface Run { id: string; agent_id: string; status: string; input: string; output: string; steps: Step[]; tokens: number; latency_ms: number; created_at?: string; user_email?: string }
export interface RunItem { id: string; agent_id: string; agent_name: string; status: string; input: string; steps_total: number; steps_done: number; tokens: number; latency_ms: number; created_at?: string; user_email: string }
export interface Stats {
  sessions: number; completed: number; blocked: number; tokens: number; avg_latency_ms: number; est_cost_usd: number;
  tools: { name: string; calls: number; ok: number }[]; tokens_by_day: { day: string; tokens: number }[];
}
export interface ExportFile { path: string; content: string; size: number }
export interface ExportResult {
  files: ExportFile[];
  warnings: { level: "warn" | "info"; area: string; text: string }[];
  mapping: { area: string; status: "exact" | "approximate" | "not exported"; note: string }[];
  summary: { agent: string; agents: number; mcp_servers: number; tools: number; endpoints: number; image: string; adk_version: string };
  commands: string[];
}
export interface ExportOptions { project: string; location: string; repository: string; model: string; min_instances: number; max_instances: number; cpu: string; memory: string }
