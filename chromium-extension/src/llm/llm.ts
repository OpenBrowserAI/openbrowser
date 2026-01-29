/**
 * LLM Model Fetching and Filtering Utilities
 */

import type {
  ModelsData,
  Provider,
  Model,
  ProviderOption,
  ModelOption
} from "./llm.interface";

const MODELS_API_URL = "https://models.dev/api.json";

/**
 * Fetch models data from models.dev API
 */
export async function fetchModelsData(): Promise<ModelsData> {
  try {
    const response = await fetch(MODELS_API_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching models:", error);
    throw error;
  }
}

/**
 * Check if a model supports image input (vision capabilities)
 */
export function supportsImageInput(model: Model): boolean {
  return (
    (model.modalities?.input?.includes("image") ||
      model.modalities?.input?.includes("video") ||
      false) &&
    model.status !== "deprecated" &&
    model.tool_call !== false
  );
}

/**
 * Filter models that support image input
 */
export function filterImageSupportedModels(
  provider: Provider
): Record<string, Model> {
  const filtered: Record<string, Model> = {};

  for (const [modelId, model] of Object.entries(provider.models)) {
    if (supportsImageInput(model)) {
      filtered[modelId] = model;
    }
  }

  return filtered;
}

/**
 * Get all providers with at least one image-supporting model
 */
export function getProvidersWithImageSupport(
  data: ModelsData
): Record<string, Provider> {
  const filtered: Record<string, Provider> = {};

  for (const [providerId, provider] of Object.entries(data)) {
    const imageSupportedModels = filterImageSupportedModels(provider);

    if (Object.keys(imageSupportedModels).length > 0) {
      filtered[providerId] = {
        ...provider,
        models: imageSupportedModels
      };
    }
  }

  return filtered;
}

/**
 * Convert providers to dropdown options
 */
export function providersToOptions(
  providers: Record<string, Provider>
): ProviderOption[] {
  return Object.entries(providers)
    .map(([id, provider]) => ({
      value: id,
      label: provider.name,
      api: provider.api
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Convert models to dropdown options
 */
export function modelsToOptions(
  models: Record<string, Model>,
  providerId: string
): ModelOption[] {
  return Object.entries(models)
    .map(([id, model]) => ({
      value: id,
      label: model.name,
      provider: providerId
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Get default base URL for a provider
 */
export function getDefaultBaseURL(providerId: string, api?: string): string {
  // Use API from models.dev data if available
  if (api) {
    return api;
  }

  // Fallback to known defaults
  const defaults: Record<string, string> = {
    anthropic: "https://api.anthropic.com/v1",
    openai: "https://api.openai.com/v1",
    openrouter: "https://openrouter.ai/api/v1",
    google: "https://generativelanguage.googleapis.com/v1beta",
    azure: "https://YOUR_RESOURCE_NAME.openai.azure.com"
  };

  return defaults[providerId] || "";
}
