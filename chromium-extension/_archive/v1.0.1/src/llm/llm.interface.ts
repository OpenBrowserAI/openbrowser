/**
 * LLM Model and Provider Type Definitions
 */

export interface ModelModalities {
  input: string[];
  output: string[];
}

export interface ModelCost {
  input?: number;
  output?: number;
  request?: number;
}

export interface ModelLimit {
  context?: number;
  output?: number;
}

export interface Model {
  id: string;
  name: string;
  family?: string;
  attachment?: boolean;
  reasoning?: boolean;
  tool_call?: boolean;
  temperature?: boolean;
  knowledge?: string;
  release_date?: string;
  last_updated?: string;
  modalities?: ModelModalities;
  open_weights?: boolean;
  cost?: ModelCost;
  limit?: ModelLimit;
}

export interface Provider {
  id: string;
  env?: string[];
  npm?: string;
  api?: string;
  name: string;
  doc?: string;
  models: Record<string, Model>;
}

export interface ModelsData {
  [providerId: string]: Provider;
}

export interface ModelOption {
  value: string;
  label: string;
  provider: string;
}

export interface ProviderOption {
  value: string;
  label: string;
  api?: string;
}
