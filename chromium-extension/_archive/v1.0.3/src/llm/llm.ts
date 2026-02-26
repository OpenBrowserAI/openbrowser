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

export type SocaOpenBrowserLane = "OB_OFFLINE" | "OB_ONLINE_PULSE";

const MODELS_CACHE_STORAGE_KEY = "socaBridgeModelsCache";
const BRIDGE_MODELS_MESSAGE_TYPE = "SOCA_BRIDGE_GET_MODELS";
const GENERIC_CUSTOM_MODEL: Model = {
  id: "custom",
  name: "Custom (enter model name)",
  modalities: { input: ["text", "image"], output: ["text"] }
};

const LOCAL_OLLAMA_PROVIDER: ModelsData = {
  ollama: {
    id: "ollama",
    name: "Ollama (Local)",
    npm: "@ai-sdk/openai-compatible",
    api: "http://127.0.0.1:11434/v1",
    models: {
      "qwen3-vl:2b": {
        id: "qwen3-vl:2b",
        name: "Qwen3-VL 2B",
        modalities: { input: ["text", "image"], output: ["text"] }
      },
      "qwen3-vl:4b": {
        id: "qwen3-vl:4b",
        name: "Qwen3-VL 4B",
        modalities: { input: ["text", "image"], output: ["text"] }
      },
      "qwen3-vl:8b": {
        id: "qwen3-vl:8b",
        name: "Qwen3-VL 8B",
        modalities: { input: ["text", "image"], output: ["text"] }
      }
    }
  }
};
const LOCAL_SOCA_BRIDGE_PROVIDER: ModelsData = {
  "soca-bridge": {
    id: "soca-bridge",
    name: "SOCA Bridge (Local)",
    npm: "@ai-sdk/openai-compatible",
    api: "http://127.0.0.1:9834/v1",
    models: {
      "soca/auto": {
        id: "soca/auto",
        name: "SOCA Auto (via Bridge)",
        modalities: { input: ["text", "image"], output: ["text"] }
      },
      "soca/fast": {
        id: "soca/fast",
        name: "SOCA Fast (via Bridge)",
        modalities: { input: ["text", "image"], output: ["text"] }
      },
      "soca/best": {
        id: "soca/best",
        name: "SOCA Best (via Bridge)",
        modalities: { input: ["text", "image"], output: ["text"] }
      },
      "qwen3-vl:2b": {
        id: "qwen3-vl:2b",
        name: "Qwen3-VL 2B (via Bridge)",
        modalities: { input: ["text", "image"], output: ["text"] }
      },
      "qwen3-vl:4b": {
        id: "qwen3-vl:4b",
        name: "Qwen3-VL 4B (via Bridge)",
        modalities: { input: ["text", "image"], output: ["text"] }
      },
      "qwen3-vl:8b": {
        id: "qwen3-vl:8b",
        name: "Qwen3-VL 8B (via Bridge)",
        modalities: { input: ["text", "image"], output: ["text"] }
      }
    }
  }
};

const OPENAI_COMPAT_PROVIDER = (id: string, name: string, api: string) => ({
  id,
  name,
  npm: "@ai-sdk/openai-compatible",
  api,
  models: {
    custom: GENERIC_CUSTOM_MODEL
  }
});

const LOCAL_OPENAI_COMPAT_PROVIDERS: ModelsData = {
  "openai-compatible": OPENAI_COMPAT_PROVIDER(
    "openai-compatible",
    "OpenAI-Compatible (Custom)",
    "http://127.0.0.1:1234/v1"
  ),
  lmstudio: OPENAI_COMPAT_PROVIDER(
    "lmstudio",
    "LM Studio (Local)",
    "http://127.0.0.1:1234/v1"
  ),
  vllm: OPENAI_COMPAT_PROVIDER(
    "vllm",
    "vLLM (Local)",
    "http://127.0.0.1:8000/v1"
  ),
  localai: OPENAI_COMPAT_PROVIDER(
    "localai",
    "LocalAI (Local)",
    "http://127.0.0.1:8080/v1"
  )
};

const DIRECT_PROVIDER_CATALOG: ModelsData = {
  openai: {
    id: "openai",
    name: "OpenAI (Direct)",
    npm: "@ai-sdk/openai",
    api: "https://api.openai.com/v1",
    models: {
      custom: GENERIC_CUSTOM_MODEL
    }
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic (Direct)",
    npm: "@ai-sdk/anthropic",
    api: "https://api.anthropic.com/v1",
    models: {
      custom: GENERIC_CUSTOM_MODEL
    }
  },
  google: {
    id: "google",
    name: "Google Gemini (Direct)",
    npm: "@ai-sdk/google",
    api: "https://generativelanguage.googleapis.com/v1beta",
    models: {
      custom: GENERIC_CUSTOM_MODEL
    }
  },
  azure: {
    id: "azure",
    name: "Azure OpenAI (Direct)",
    npm: "@ai-sdk/azure",
    api: "https://YOUR_RESOURCE_NAME.openai.azure.com",
    models: {
      custom: GENERIC_CUSTOM_MODEL
    }
  },
  bedrock: {
    id: "bedrock",
    name: "AWS Bedrock (Direct)",
    npm: "@ai-sdk/amazon-bedrock",
    api: "https://bedrock-runtime.us-west-2.amazonaws.com",
    models: {
      custom: GENERIC_CUSTOM_MODEL
    }
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter (via SOCA Bridge)",
    npm: "@openrouter/ai-sdk-provider",
    api: "http://127.0.0.1:9834/v1",
    models: {
      "openrouter/auto": {
        id: "openrouter/auto",
        name: "OpenRouter Auto (via Bridge)",
        modalities: { input: ["text", "image"], output: ["text"] }
      },
      custom: GENERIC_CUSTOM_MODEL
    }
  }
};
const DEFAULT_FALLBACK_MODELS: ModelsData = {
  ...LOCAL_OLLAMA_PROVIDER,
  ...LOCAL_SOCA_BRIDGE_PROVIDER,
  ...LOCAL_OPENAI_COMPAT_PROVIDERS,
  ...DIRECT_PROVIDER_CATALOG
};

function guessVisionSupport(modelId: string): boolean {
  const id = (modelId || "").toLowerCase();
  // Heuristic: prefer false-positives (more models shown) over missing likely vision models.
  return (
    id.startsWith("soca/") ||
    id.includes("vl") ||
    id.includes("vision") ||
    id.includes("llava") ||
    id.includes("pixtral") ||
    id.includes("gpt-4o") ||
    id.includes("gpt-4.1") ||
    id.includes("claude") ||
    id.includes("gemini")
  );
}

async function fetchBridgeModelIds(timeoutMs: number): Promise<string[]> {
  if (typeof chrome === "undefined" || !chrome?.runtime?.sendMessage) return [];
  const resp = (await Promise.race([
    chrome.runtime.sendMessage({ type: BRIDGE_MODELS_MESSAGE_TYPE }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("bridge_models_timeout")), timeoutMs)
    )
  ])) as any;

  if (!resp?.ok) {
    throw new Error(String(resp?.err || "bridge_models_failed"));
  }
  const list = resp?.data?.data;
  if (!Array.isArray(list)) return [];
  return list.map((m: any) => String(m?.id || "").trim()).filter(Boolean);
}

async function readModelsCache(): Promise<ModelsData | null> {
  try {
    if (typeof chrome === "undefined" || !chrome?.storage?.local) {
      return null;
    }
    const result = await chrome.storage.local.get([MODELS_CACHE_STORAGE_KEY]);
    const cached = result[MODELS_CACHE_STORAGE_KEY] as ModelsData | undefined;
    if (!cached || typeof cached !== "object") {
      return null;
    }
    return cached;
  } catch (error) {
    console.warn("Failed to read models cache:", error);
    return null;
  }
}

async function writeModelsCache(data: ModelsData): Promise<void> {
  try {
    if (typeof chrome === "undefined" || !chrome?.storage?.local) {
      return;
    }
    await chrome.storage.local.set({ [MODELS_CACHE_STORAGE_KEY]: data });
  } catch (error) {
    console.warn("Failed to write models cache:", error);
  }
}

export async function fetchModelsData(options?: {
  lane?: SocaOpenBrowserLane;
}): Promise<ModelsData> {
  const fallbackModels = DEFAULT_FALLBACK_MODELS;
  if (options?.lane !== "OB_ONLINE_PULSE") {
    return fallbackModels;
  }
  try {
    const ids = await fetchBridgeModelIds(8000);
    if (!ids.length) {
      return fallbackModels;
    }

    const bridgeModels: Record<string, Model> = {};
    for (const id of ids) {
      bridgeModels[id] = {
        id,
        name: id,
        modalities: guessVisionSupport(id)
          ? { input: ["text", "image"], output: ["text"] }
          : { input: ["text"], output: ["text"] }
      };
    }

    const data: ModelsData = {
      ...fallbackModels,
      "soca-bridge": {
        ...LOCAL_SOCA_BRIDGE_PROVIDER["soca-bridge"],
        models: {
          ...LOCAL_SOCA_BRIDGE_PROVIDER["soca-bridge"].models,
          ...bridgeModels
        }
      }
    };
    await writeModelsCache(data);
    return data;
  } catch (error) {
    console.error("Error fetching models:", error);
    const cached = await readModelsCache();
    if (cached) {
      return cached;
    }
    return DEFAULT_FALLBACK_MODELS;
  }
}

/**
 * Check if a model supports image input (vision capabilities)
 */
export function supportsImageInput(model: Model): boolean {
  return (
    model.modalities?.input?.includes("image") ||
    model.modalities?.input?.includes("video") ||
    false
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
  // Use provider-advertised API base URL if available.
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
