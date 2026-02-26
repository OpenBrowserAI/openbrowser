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
const PROVIDER_MODELS_CACHE_STORAGE_KEY = "socaProviderModelsCatalogCache";
const BRIDGE_MODELS_MESSAGE_TYPE = "SOCA_BRIDGE_GET_MODELS";
const OPENROUTER_PROVIDER_ID = "openrouter";
const GENERIC_CUSTOM_MODEL: Model = {
  id: "custom",
  name: "SOCA Agent SDK (Custom)",
  modalities: { input: ["text", "image"], output: ["text"] }
};

type BridgeModelDescriptor = {
  id: string;
  name?: string;
  provider?: string;
  input_modalities?: unknown;
  output_modalities?: unknown;
};

type ProviderModelsCacheEntry = {
  providerId?: string;
  models?: BridgeModelDescriptor[];
  updatedAt?: number;
  expiresAt?: number;
};

type ProviderModelsCachePayload = Record<string, ProviderModelsCacheEntry>;

const LOCAL_OLLAMA_PROVIDER: ModelsData = {
  ollama: {
    id: "ollama",
    name: "Ollama (Local)",
    npm: "@ai-sdk/openai-compatible",
    api: "http://127.0.0.1:11434/v1",
    authModes: ["api_key"],
    modelSource: "static",
    requiresBaseURL: false,
    supportsLiveCatalog: true,
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
    authModes: ["api_key"],
    modelSource: "bridge",
    requiresBaseURL: false,
    supportsLiveCatalog: true,
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

const OPENAI_COMPAT_PROVIDER = (
  id: string,
  name: string,
  api: string,
  options?: {
    authModes?: ("api_key" | "oauth")[];
    modelSource?: "static" | "bridge" | "direct_api";
    requiresBaseURL?: boolean;
    supportsLiveCatalog?: boolean;
  }
): Provider => ({
  id,
  name,
  npm: "@ai-sdk/openai-compatible",
  api,
  authModes: options?.authModes || ["api_key"],
  modelSource: options?.modelSource || "static",
  requiresBaseURL: options?.requiresBaseURL ?? false,
  supportsLiveCatalog: options?.supportsLiveCatalog ?? false,
  models: {
    custom: GENERIC_CUSTOM_MODEL
  }
});

const LOCAL_OPENAI_COMPAT_PROVIDERS: ModelsData = {
  "openai-compatible": OPENAI_COMPAT_PROVIDER(
    "openai-compatible",
    "OpenAI-Compatible (Custom)",
    "http://127.0.0.1:1234/v1",
    { requiresBaseURL: true }
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
    authModes: ["api_key"],
    modelSource: "direct_api",
    requiresBaseURL: false,
    supportsLiveCatalog: true,
    models: {
      "gpt-4o": {
        id: "gpt-4o",
        name: "GPT-4o",
        modalities: { input: ["text", "image"], output: ["text"] }
      },
      "gpt-4o-mini": {
        id: "gpt-4o-mini",
        name: "GPT-4o Mini",
        modalities: { input: ["text", "image"], output: ["text"] }
      },
      "o1": {
        id: "o1",
        name: "o1",
        modalities: { input: ["text", "image"], output: ["text"] }
      },
      "o1-preview": {
        id: "o1-preview",
        name: "o1 Preview",
        modalities: { input: ["text"], output: ["text"] }
      },
      "o3-mini": {
        id: "o3-mini",
        name: "o3 Mini",
        modalities: { input: ["text"], output: ["text"] }
      },
      "gpt-4-turbo": {
        id: "gpt-4-turbo",
        name: "GPT-4 Turbo",
        modalities: { input: ["text", "image"], output: ["text"] }
      },
      custom: GENERIC_CUSTOM_MODEL
    }
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic (Direct)",
    npm: "@ai-sdk/anthropic",
    api: "https://api.anthropic.com/v1",
    authModes: ["api_key"],
    modelSource: "direct_api",
    requiresBaseURL: false,
    supportsLiveCatalog: true,
    models: {
      "claude-3-5-sonnet-latest": {
        id: "claude-3-5-sonnet-latest",
        name: "Claude 3.5 Sonnet",
        modalities: { input: ["text", "image"], output: ["text"] }
      },
      "claude-3-5-haiku-latest": {
        id: "claude-3-5-haiku-latest",
        name: "Claude 3.5 Haiku",
        modalities: { input: ["text", "image"], output: ["text"] }
      },
      "claude-3-opus-20240229": {
        id: "claude-3-opus-20240229",
        name: "Claude 3 Opus",
        modalities: { input: ["text", "image"], output: ["text"] }
      },
      custom: GENERIC_CUSTOM_MODEL
    }
  },
  google: {
    id: "google",
    name: "Google Gemini (Direct)",
    npm: "@ai-sdk/openai-compatible",
    api: "https://generativelanguage.googleapis.com/v1beta/openai",
    authModes: ["api_key", "oauth"],
    modelSource: "direct_api",
    requiresBaseURL: false,
    supportsLiveCatalog: true,
    models: {
      "gemini-2.5-pro": {
        id: "gemini-2.5-pro",
        name: "Gemini 2.5 Pro",
        modalities: { input: ["text", "image"], output: ["text"] }
      },
      "gemini-2.5-flash": {
        id: "gemini-2.5-flash",
        name: "Gemini 2.5 Flash",
        modalities: { input: ["text", "image"], output: ["text"] }
      },
      "gemini-1.5-pro": {
        id: "gemini-1.5-pro",
        name: "Gemini 1.5 Pro",
        modalities: { input: ["text", "image"], output: ["text"] }
      },
      "gemini-1.5-flash": {
        id: "gemini-1.5-flash",
        name: "Gemini 1.5 Flash",
        modalities: { input: ["text", "image"], output: ["text"] }
      },
      "gemini-2.0-flash-exp": {
        id: "gemini-2.0-flash-exp",
        name: "Gemini 2.0 Flash Exp",
        modalities: { input: ["text", "image"], output: ["text"] }
      },
      custom: GENERIC_CUSTOM_MODEL
    }
  },
  azure: {
    id: "azure",
    name: "Azure OpenAI (Direct)",
    npm: "@ai-sdk/azure",
    api: "https://YOUR_RESOURCE_NAME.openai.azure.com",
    authModes: ["api_key"],
    modelSource: "direct_api",
    requiresBaseURL: true,
    supportsLiveCatalog: false,
    models: {
      custom: GENERIC_CUSTOM_MODEL
    }
  },
  bedrock: {
    id: "bedrock",
    name: "AWS Bedrock (Direct)",
    npm: "@ai-sdk/amazon-bedrock",
    api: "https://bedrock-runtime.us-west-2.amazonaws.com",
    authModes: ["api_key"],
    modelSource: "direct_api",
    requiresBaseURL: false,
    supportsLiveCatalog: false,
    models: {
      custom: GENERIC_CUSTOM_MODEL
    }
  },
  "opencode-zen": OPENAI_COMPAT_PROVIDER(
    "opencode-zen",
    "Opencode Zen (Direct)",
    "",
    {
      authModes: ["api_key", "oauth"],
      modelSource: "direct_api",
      requiresBaseURL: true,
      supportsLiveCatalog: true
    }
  ),
  openrouter: {
    id: "openrouter",
    name: "OpenRouter (Direct)",
    npm: "@openrouter/ai-sdk-provider",
    api: "https://openrouter.ai/api/v1",
    authModes: ["api_key"],
    modelSource: "direct_api",
    requiresBaseURL: false,
    supportsLiveCatalog: true,
    models: {
      "openrouter/auto": {
        id: "openrouter/auto",
        name: "OpenRouter Auto",
        modalities: { input: ["text", "image"], output: ["text"] }
      },
      "anthropic/claude-3.5-sonnet": {
        id: "anthropic/claude-3.5-sonnet",
        name: "Claude 3.5 Sonnet (OpenRouter)",
        modalities: { input: ["text", "image"], output: ["text"] }
      },
      "google/gemini-2.5-pro": {
        id: "google/gemini-2.5-pro",
        name: "Gemini 2.5 Pro (OpenRouter)",
        modalities: { input: ["text", "image"], output: ["text"] }
      },
      "openai/gpt-4o": {
        id: "openai/gpt-4o",
        name: "GPT-4o (OpenRouter)",
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
    id.includes("gpt-image") ||
    id.includes("o1") ||
    id.includes("o3") ||
    id.includes("o4") ||
    id.includes("claude") ||
    id.includes("gemini") ||
    id.includes("gemma") ||
    id.includes("deepseek") ||
    id.includes("phi-4") ||
    id.includes("phi-5") ||
    id.includes("molmo") ||
    id.includes("qwq") ||
    id.includes("qwen2.5") ||
    id.includes("qwen3") ||
    id.includes("minicpm") ||
    id.includes("internvl") ||
    id.includes("cogvlm") ||
    id.includes("moondream") ||
    id.includes("bakllava") ||
    id.includes("llama-3") ||
    id.includes("mistral") ||
    id.includes("nous-hermes")
  );
}

function normalizeModalities(value: unknown): string[] {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized ? [normalized] : [];
  }
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const normalized = item.trim().toLowerCase();
    if (normalized && !out.includes(normalized)) {
      out.push(normalized);
    }
  }
  return out;
}

function modelFromBridgeDescriptor(desc: BridgeModelDescriptor): Model {
  const modelId = String(desc.id || "").trim();
  const name = String(desc.name || modelId || "").trim() || modelId;
  const input = normalizeModalities(desc.input_modalities);
  const output = normalizeModalities(desc.output_modalities);
  const fallbackHasVision = guessVisionSupport(modelId);
  const modalities =
    input.length || output.length
      ? {
          input: input.length ? input : fallbackHasVision ? ["text", "image"] : ["text"],
          output: output.length ? output : ["text"]
        }
      : fallbackHasVision
        ? { input: ["text", "image"], output: ["text"] }
        : { input: ["text"], output: ["text"] };
  return {
    id: modelId,
    name,
    modalities
  };
}

function cloneModelsData(data: ModelsData): ModelsData {
  const cloned: ModelsData = {};
  for (const [providerId, provider] of Object.entries(data)) {
    cloned[providerId] = {
      ...provider,
      models: {
        ...(provider.models || {})
      }
    };
  }
  return cloned;
}

async function fetchBridgeModels(timeoutMs: number): Promise<BridgeModelDescriptor[]> {
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
  return list
    .map((m: any) => ({
      id: String(m?.id || "").trim(),
      name: typeof m?.name === "string" ? m.name : undefined,
      provider: typeof m?.provider === "string" ? m.provider : undefined,
      input_modalities: m?.input_modalities,
      output_modalities: m?.output_modalities
    }))
    .filter((m: BridgeModelDescriptor) => Boolean(m.id));
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

async function readProviderCatalogCache(): Promise<ProviderModelsCachePayload | null> {
  try {
    if (typeof chrome === "undefined" || !chrome?.storage?.local) {
      return null;
    }
    const result = await chrome.storage.local.get([
      PROVIDER_MODELS_CACHE_STORAGE_KEY
    ]);
    const cached = result[
      PROVIDER_MODELS_CACHE_STORAGE_KEY
    ] as ProviderModelsCachePayload | undefined;
    if (!cached || typeof cached !== "object") {
      return null;
    }
    return cached;
  } catch (error) {
    console.warn("Failed to read provider catalog cache:", error);
    return null;
  }
}

async function mergeProviderCatalogCache(data: ModelsData): Promise<ModelsData> {
  const payload = await readProviderCatalogCache();
  if (!payload) return data;

  const merged = cloneModelsData(data);
  const now = Date.now();
  for (const entry of Object.values(payload)) {
    if (!entry || typeof entry !== "object") continue;
    const providerId = String(entry.providerId || "").trim();
    if (!providerId || !merged[providerId]) continue;
    const expiresAt = Number(entry.expiresAt || 0);
    if (expiresAt > 0 && expiresAt < now) continue;
    const cachedModels = Array.isArray(entry.models) ? entry.models : [];
    if (!cachedModels.length) continue;

    const nextModels = { ...merged[providerId].models };
    for (const descriptor of cachedModels) {
      const normalized = modelFromBridgeDescriptor(descriptor);
      if (!normalized.id) continue;
      nextModels[normalized.id] = normalized;
    }
    merged[providerId] = {
      ...merged[providerId],
      models: nextModels
    };
  }
  return merged;
}

export async function fetchModelsData(options?: {
  lane?: SocaOpenBrowserLane;
}): Promise<ModelsData> {
  const fallbackModels = await mergeProviderCatalogCache(
    cloneModelsData(DEFAULT_FALLBACK_MODELS)
  );
  if (options?.lane !== "OB_ONLINE_PULSE") {
    return fallbackModels;
  }
  try {
    const descriptors = await fetchBridgeModels(8000);
    if (!descriptors.length) {
      return fallbackModels;
    }

    const bridgeModels: Record<string, Model> = {};
    for (const descriptor of descriptors) {
      const model = modelFromBridgeDescriptor(descriptor);
      if (!model.id) continue;
      bridgeModels[model.id] = model;
    }

    const data: ModelsData = {
      ...fallbackModels,
      "soca-bridge": {
        ...fallbackModels["soca-bridge"],
        models: {
          ...(fallbackModels["soca-bridge"]?.models || {}),
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
      return mergeProviderCatalogCache(cloneModelsData(cached));
    }
    return fallbackModels;
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
      api: provider.api,
      authModes: provider.authModes,
      modelSource: provider.modelSource,
      requiresBaseURL: provider.requiresBaseURL,
      supportsLiveCatalog: provider.supportsLiveCatalog
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
  const options = Object.entries(models)
    .map(([id, model]) => ({
      value: id,
      label: model.name,
      provider: providerId
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  if (providerId !== OPENROUTER_PROVIDER_ID) {
    return options;
  }
  return options.sort((a, b) => {
    const aPinned = a.value === "openrouter/auto" ? 0 : 1;
    const bPinned = b.value === "openrouter/auto" ? 0 : 1;
    if (aPinned !== bPinned) return aPinned - bPinned;
    return a.label.localeCompare(b.label);
  });
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
    google: "https://generativelanguage.googleapis.com/v1beta/openai",
    azure: "https://YOUR_RESOURCE_NAME.openai.azure.com",
    "opencode-zen": ""
  };

  return defaults[providerId] || "";
}
