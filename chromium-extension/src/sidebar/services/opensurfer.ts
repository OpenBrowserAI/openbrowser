const BASE = "http://localhost:4173";

export interface Capability {
  source: string;
  capability: string;
  entity: string;
  operation: string;
  effect: "read" | "write" | "destructive";
  policy: "auto" | "preview" | "block";
  inputs: Record<string, { param: string; as: string; evidence: string }>;
  output?: { array?: boolean; of?: string; field?: string; sample?: unknown };
  confidence: number;
  evidence: number;
}

export interface WorkflowStep {
  id: string;
  system: string;
  capability: string;
  inputs: Record<string, string>;
  forEach?: string;
  condition?: string;
  description?: string;
}

export interface WorkflowPlan {
  goal: string;
  trigger?: { system: string; capability: string; condition?: string };
  steps: WorkflowStep[];
  _composedAt: string;
  error?: string;
  missing?: string;
}

export interface WorkflowStepResult {
  id: string;
  output?: unknown;
  skipped?: boolean;
  reason?: string;
  forEach?: boolean;
  count?: number;
}

export interface WorkflowResult {
  goal: string;
  steps: WorkflowStepResult[];
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function ping(): Promise<boolean> {
  try { await get("/api/capabilities"); return true; } catch { return false; }
}

export async function getSystems(): Promise<Record<string, number>> {
  const caps = await get<Capability[]>("/api/capabilities");
  const counts: Record<string, number> = {};
  for (const c of caps) counts[c.source] = (counts[c.source] ?? 0) + 1;
  return counts;
}

export async function getCapabilities(system?: string): Promise<Capability[]> {
  const url = system ? `/api/capabilities?system=${encodeURIComponent(system)}` : "/api/capabilities";
  return get<Capability[]>(url);
}

export async function compose(goal: string): Promise<WorkflowPlan> {
  return post<WorkflowPlan>("/api/compose", { goal });
}

export async function runWorkflow(plan: WorkflowPlan, confirm = false): Promise<WorkflowResult> {
  return post<WorkflowResult>("/api/workflow/run", { plan, confirm });
}
