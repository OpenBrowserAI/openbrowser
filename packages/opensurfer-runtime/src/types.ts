export type Effect = "read" | "write" | "destructive";
export type Policy = "auto" | "preview" | "block";

export interface CapabilityInput {
  param: string;
  as: string;
  evidence: "typed-by-user" | "varied-across-runs";
}

export interface CapabilityOutput {
  array?: boolean;
  of?: string;
  itemKey?: string;
  field?: string;
  sample?: unknown;
}

export interface CapabilityStrategy {
  type: "http";
  method: string;
  host: string;
  urlTemplate: string;
  paramLocation: "query" | "body" | "path";
}

export interface Capability {
  source: string;
  capability: string;
  entity: string;
  operation: string;
  effect: Effect;
  policy: Policy;
  inputs: Record<string, CapabilityInput>;
  output?: CapabilityOutput;
  strategy: CapabilityStrategy;
  evidence: number;
  confidence: number;
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
  trigger?: {
    system: string;
    capability: string;
    condition?: string;
  };
  steps: WorkflowStep[];
  _composedAt: string;
  error?: string;
}

export interface WorkflowStepResult {
  id: string;
  output?: unknown;
  skipped?: boolean;
  reason?: string;
  forEach?: boolean;
  count?: number;
  results?: unknown[];
}

export interface WorkflowResult {
  goal: string;
  steps: WorkflowStepResult[];
  context: Record<string, unknown>;
}

export interface ResolveResult {
  capability: string;
  source: string;
  score: number;
  entity: string;
  operation: string;
  effect: Effect;
}

export interface OpenSurferConfig {
  /** Base URL of the opensurfer control room. Defaults to http://localhost:4173 */
  serverUrl?: string;
}
