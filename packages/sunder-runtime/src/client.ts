import type {
  Capability,
  WorkflowPlan,
  WorkflowResult,
  ResolveResult,
  SunderConfig,
} from "./types.js";

export class SunderClient {
  private base: string;

  constructor(config: SunderConfig = {}) {
    this.base = (config.serverUrl ?? "http://localhost:4173").replace(/\/$/, "");
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.base}${path}`);
    if (!res.ok) throw new Error(`sunder ${path}: ${res.status}`);
    return res.json() as Promise<T>;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`sunder ${path}: ${res.status}`);
    return res.json() as Promise<T>;
  }

  /** All discovered capabilities, optionally filtered by system */
  async capabilities(system?: string): Promise<Capability[]> {
    const url = system
      ? `/api/capabilities?system=${encodeURIComponent(system)}`
      : "/api/capabilities";
    return this.get<Capability[]>(url);
  }

  /** All connected systems and their capability counts */
  async systems(): Promise<Record<string, number>> {
    return this.get<Record<string, number>>("/api/systems");
  }

  /** Route a natural-language intent to the best matching capabilities */
  async resolve(intent: string): Promise<ResolveResult[]> {
    return this.post<ResolveResult[]>("/api/resolve", { intent });
  }

  /** Execute a discovered capability */
  async run(
    system: string,
    capability: string,
    params: Record<string, unknown> = {},
    confirm = false
  ): Promise<unknown> {
    return this.post("/api/run", { system, capability, params, confirm });
  }

  /** Compose a natural-language goal into a multi-step workflow plan */
  async compose(goal: string): Promise<WorkflowPlan> {
    return this.post<WorkflowPlan>("/api/compose", { goal });
  }

  /** Run a workflow plan */
  async runWorkflow(plan: WorkflowPlan, confirm = false): Promise<WorkflowResult> {
    return this.post<WorkflowResult>("/api/workflow/run", { plan, confirm });
  }

  /** Compose and immediately execute a workflow */
  async composeAndRun(goal: string, confirm = false): Promise<{ plan: WorkflowPlan; result: WorkflowResult }> {
    const plan = await this.compose(goal);
    if (plan.error) throw new Error(`compose failed: ${plan.error}`);
    const result = await this.runWorkflow(plan, confirm);
    return { plan, result };
  }

  /** Check if the opensurfer server is reachable */
  async ping(): Promise<boolean> {
    try {
      await this.get("/api/capabilities");
      return true;
    } catch {
      return false;
    }
  }
}
