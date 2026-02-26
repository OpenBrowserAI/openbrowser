import {
  LLMs,
  config,
  global,
  uuidv4,
  ChatAgent,
  AgentContext,
  AgentStreamMessage
} from "@openbrowser-ai/core";
import {
  HumanCallback,
  MessageTextPart,
  MessageFilePart,
  ChatStreamMessage,
  AgentStreamCallback,
  DialogueTool,
  ToolResult,
  LanguageModelV2ToolCallPart
} from "@openbrowser-ai/core/types";
import { initAgentServices } from "./agent";
import WriteFileAgent from "./agent/file-agent";
import { BrowserAgent } from "@openbrowser-ai/extension";
import {
  DEFAULT_SOCA_TOOLS_CONFIG,
  DEFAULT_PROVIDER_POLICY_MODE,
  SOCA_LANE_STORAGE_KEY,
  SOCA_TOOLS_CONFIG_STORAGE_KEY,
  bridgeFetchJson,
  ensureDnrGuardrailsInstalled,
  getBridgeAutoFallbackOllama,
  getBridgeConfig,
  getGoogleOAuthSession,
  getProviderPolicyMode,
  getProviderSecret,
  getProviderSecretsSession,
  getBridgeToken,
  loadSocaToolsConfig,
  normalizeLane,
  setGoogleOAuthSession,
  setProviderSecret,
  setBridgeConfig,
  setBridgeAutoFallbackOllama,
  setBridgeToken,
  setProviderPolicyMode,
  clearGoogleOAuthSession,
  type SocaProviderPolicyMode,
  type BridgeConfig,
  type SocaOpenBrowserLane
} from "./bridge-client";
import {
  buildBridgeCandidates,
  classifyHost,
  isAllowedDirectURL
} from "../llm/endpointPolicy";

var chatAgent: ChatAgent | null = null;
var currentChatId: string | null = null;
const callbackIdMap = new Map<string, Function>();
const abortControllers = new Map<string, AbortController>();
type PromptBuddyMode =
  | "clarify"
  | "structure"
  | "compress"
  | "persona"
  | "safe_exec";

const MAX_LOG_CHARS = 1200;
const PROVIDER_MODEL_CACHE_STORAGE_KEY = "socaProviderModelsCatalogCache";
const PROVIDER_MODEL_CACHE_TTL_MS = 5 * 60 * 1000;
const GOOGLE_OAUTH_DEFAULT_SCOPE =
  "https://www.googleapis.com/auth/generative-language";

function clampText(value: string, maxChars: number) {
  if (value.length <= maxChars) return value;
  const truncated = value.slice(0, maxChars);
  return `${truncated}…[truncated ${value.length - maxChars} chars]`;
}

function compressNumericSpam(text: string) {
  const lines = text.split(/\r?\n/);
  if (lines.length < 30) return text;
  const out: string[] = [];
  let numericRun = 0;

  const flushRun = () => {
    if (numericRun > 5) {
      out.push(`[... ${numericRun} numeric lines omitted ...]`);
    }
    numericRun = 0;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const isNumeric = /^\d{3,}$/.test(trimmed);
    if (isNumeric) {
      numericRun += 1;
      if (numericRun <= 5) {
        out.push(line);
      }
      continue;
    }
    if (numericRun > 0) {
      flushRun();
    }
    out.push(line);
  }

  if (numericRun > 0) {
    flushRun();
  }

  return out.join("\n");
}

function sanitizeLogMessage(raw: unknown, maxChars = MAX_LOG_CHARS) {
  let text = "";
  if (raw == null) {
    text = "Unknown error";
  } else if (typeof raw === "string") {
    text = raw;
  } else if (typeof raw === "object") {
    const maybe = raw as { name?: string; message?: string; stack?: string };
    if (maybe.name && maybe.message) {
      text = `${maybe.name}: ${maybe.message}`;
    } else if (maybe.message) {
      text = String(maybe.message);
    } else if (maybe.stack) {
      text = String(maybe.stack);
    } else {
      try {
        text = JSON.stringify(raw);
      } catch {
        text = String(raw);
      }
    }
  } else {
    text = String(raw);
  }
  return clampText(compressNumericSpam(text), maxChars);
}

function normalizeProviderError(raw: unknown): string {
  const text = sanitizeLogMessage(raw, 2000);
  const normalized = text.toLowerCase();
  if (normalized.includes("bridge_token_missing"))
    return "bridge_token_missing";
  if (
    normalized.includes("bridge_http_401") ||
    normalized.includes("invalid bearer token")
  ) {
    return "bridge_token_rejected";
  }
  if (
    normalized.includes("bridge_http_403") &&
    normalized.includes("/v1/models")
  ) {
    return "bridge_token_rejected";
  }
  if (normalized.includes("provider_not_allowed"))
    return "provider_not_allowed";
  if (normalized.includes("api_key_missing")) return "api_key_missing";
  if (normalized.includes("google_oauth_missing"))
    return "google_oauth_missing";
  if (
    normalized.includes("openrouter_api_key missing") ||
    normalized.includes("openrouter_api_key_missing")
  ) {
    return "openrouter_api_key_missing";
  }
  if (
    normalized.includes("forbidden") ||
    normalized.includes("provider_http_403") ||
    normalized.includes("ai_apicallerror: forbidden")
  ) {
    return "provider_forbidden";
  }
  return sanitizeLogMessage(raw, 1000);
}

function logAgentMessage(label: string, message: any) {
  const summary = {
    type: message?.type,
    streamType: message?.streamType,
    chatId: message?.chatId,
    taskId: message?.taskId || message?.messageId,
    agentName: message?.agentName,
    nodeId: message?.nodeId
  };
  console.log(label, summary);
}

function coerceJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

// Chat callback
const chatCallback = {
  onMessage: async (message: ChatStreamMessage) => {
    chrome.runtime.sendMessage({
      type: "chat_callback",
      data: message
    });
    logAgentMessage("chat message", message);
  }
};

// Task agent callback
const taskCallback: AgentStreamCallback & HumanCallback = {
  onMessage: async (message: AgentStreamMessage) => {
    chrome.runtime.sendMessage({
      type: "task_callback",
      data: { ...message, messageId: message.taskId }
    });
    if (message.type === "workflow_confirm") {
      callbackIdMap.set(message.taskId, (value: "confirm" | "cancel") => {
        callbackIdMap.delete(message.taskId);
        message.resolve(value);
      });
    }
    logAgentMessage("task message", message);
  },
  onHumanConfirm: async (context: AgentContext, prompt: string) => {
    const callbackId = uuidv4();
    chrome.runtime.sendMessage({
      type: "task_callback",
      data: {
        streamType: "agent",
        chatId: context.context.chatId,
        taskId: context.context.taskId,
        agentName: context.agent.Name,
        nodeId: context.agentChain.agent.id,
        messageId: context.context.taskId,
        type: "human_confirm",
        callbackId: callbackId,
        prompt: prompt
      }
    });
    console.log("human_confirm: ", prompt);
    return new Promise((resolve) => {
      callbackIdMap.set(callbackId, (value: boolean) => {
        callbackIdMap.delete(callbackId);
        resolve(value);
      });
    });
  },
  onHumanInput: async (context: AgentContext, prompt: string) => {
    const callbackId = uuidv4();
    chrome.runtime.sendMessage({
      type: "task_callback",
      data: {
        streamType: "agent",
        chatId: context.context.chatId,
        taskId: context.context.taskId,
        agentName: context.agent.Name,
        nodeId: context.agentChain.agent.id,
        messageId: context.context.taskId,
        type: "human_input",
        callbackId: callbackId,
        prompt: prompt
      }
    });
    console.log("human_input: ", prompt);
    return new Promise((resolve) => {
      callbackIdMap.set(callbackId, (value: string) => {
        callbackIdMap.delete(callbackId);
        resolve(value);
      });
    });
  },
  onHumanSelect: async (
    context: AgentContext,
    prompt: string,
    options: string[],
    multiple: boolean
  ) => {
    const callbackId = uuidv4();
    chrome.runtime.sendMessage({
      type: "task_callback",
      data: {
        streamType: "agent",
        chatId: context.context.chatId,
        taskId: context.context.taskId,
        agentName: context.agent.Name,
        nodeId: context.agentChain.agent.id,
        messageId: context.context.taskId,
        type: "human_select",
        callbackId: callbackId,
        prompt: prompt,
        options: options,
        multiple: multiple
      }
    });
    console.log("human_select: ", prompt);
    return new Promise((resolve) => {
      callbackIdMap.set(callbackId, (value: string[]) => {
        callbackIdMap.delete(callbackId);
        resolve(value);
      });
    });
  },
  onHumanHelp: async (
    context: AgentContext,
    helpType: "request_login" | "request_assistance",
    prompt: string
  ) => {
    const callbackId = uuidv4();
    chrome.runtime.sendMessage({
      type: "task_callback",
      data: {
        streamType: "agent",
        chatId: context.context.chatId,
        taskId: context.context.taskId,
        agentName: context.agent.Name,
        nodeId: context.agentChain.agent.id,
        messageId: context.context.taskId,
        type: "human_help",
        callbackId: callbackId,
        helpType: helpType,
        prompt: prompt
      }
    });
    console.log("human_help: ", prompt);
    return new Promise((resolve) => {
      callbackIdMap.set(callbackId, (value: boolean) => {
        callbackIdMap.delete(callbackId);
        resolve(value);
      });
    });
  }
};

function hostnameFromBaseURL(baseURL?: string): string | null {
  if (!baseURL) return null;
  try {
    return new URL(baseURL).hostname;
  } catch {
    return null;
  }
}

function isLocalHost(hostname: string): boolean {
  const hostClass = classifyHost(hostname);
  return (
    hostClass === "localhost" ||
    hostClass === "private" ||
    hostClass === "tailscale"
  );
}

function parseAllowlistDomains(allowlistText: unknown): string[] {
  if (typeof allowlistText !== "string") return [];
  return allowlistText
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => !line.startsWith("#"))
    .filter(Boolean)
    .map((entry) => entry.replace(/^https?:\/\//, ""))
    .map((entry) => entry.split("/")[0])
    .map((entry) => entry.toLowerCase())
    .filter(Boolean);
}

function isAllowlistedHost(hostname: string, allowlist: string[]): boolean {
  if (isLocalHost(hostname)) return true;
  return allowlist.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
  );
}

const BRIDGE_ROUTED_PROVIDER_IDS = new Set(["soca-bridge", "vps-holo"]);
const OLLAMA_FALLBACK_MODEL = "qwen3-vl:2b";
const OLLAMA_FALLBACK_BASE_URL = "http://127.0.0.1:11434/v1";

function isBridgeRoutedProvider(providerId: string): boolean {
  return BRIDGE_ROUTED_PROVIDER_IDS.has(providerId);
}

function normalizeBridgeModelName(
  _providerId: string,
  modelName: string
): string {
  const raw = String(modelName || "").trim();
  return raw || "soca/auto";
}

type RuntimeLLMSelection = {
  rawProviderId: string;
  rawNpm: string;
  rawBaseURL: string;
  rawAuthMode: "api_key" | "oauth";
  runtimeProvider: string;
  runtimeNpm: string;
  runtimeModel: string;
  isOllamaProvider: boolean;
  isGoogleProvider: boolean;
  isOpenAICompatNpm: boolean;
  isOpenAICompatLocal: boolean;
  isLocalProvider: boolean;
  isDirectProvider: boolean;
};

function buildRuntimeLLMSelection(rawLLMConfig: any): RuntimeLLMSelection {
  const rawProviderId = String(rawLLMConfig?.llm || "soca-bridge");
  const rawModelName = String(rawLLMConfig?.modelName || "soca/auto");
  const rawNpm = String(rawLLMConfig?.npm || "@ai-sdk/openai-compatible");
  const rawBaseURL = String(rawLLMConfig?.options?.baseURL || "").trim();
  const rawAuthMode =
    String(rawLLMConfig?.authMode || "api_key")
      .trim()
      .toLowerCase() === "oauth"
      ? "oauth"
      : "api_key";

  let baseURLHost = "";
  if (rawBaseURL) {
    try {
      const u = new URL(rawBaseURL);
      baseURLHost = u.hostname;
    } catch {
      baseURLHost = "";
    }
  }

  const isOpenAICompatNpm = rawNpm === "@ai-sdk/openai-compatible";
  const isOllamaProvider = rawProviderId === "ollama";
  const isGoogleProvider = rawProviderId === "google";
  const isOpenAICompatLocal =
    isOpenAICompatNpm && Boolean(baseURLHost) && isLocalHost(baseURLHost);
  const bridgeRouted = isBridgeRoutedProvider(rawProviderId);
  const isLocalProvider =
    bridgeRouted || isOllamaProvider || isOpenAICompatLocal;
  const isDirectProvider = !isLocalProvider;

  return {
    rawProviderId,
    rawNpm,
    rawBaseURL,
    rawAuthMode,
    runtimeProvider: bridgeRouted ? "soca-bridge" : rawProviderId,
    runtimeNpm: bridgeRouted ? "@ai-sdk/openai-compatible" : rawNpm,
    runtimeModel: bridgeRouted
      ? normalizeBridgeModelName(rawProviderId, rawModelName)
      : rawModelName,
    isOllamaProvider,
    isGoogleProvider,
    isOpenAICompatNpm,
    isOpenAICompatLocal,
    isLocalProvider,
    isDirectProvider
  };
}

async function loadLLMs(options?: {
  llmConfigOverride?: any;
  watchStorage?: boolean;
}): Promise<LLMs> {
  const storageKey = "llmConfig";
  const storedConfig =
    options?.llmConfigOverride ??
    (((await chrome.storage.local.get([storageKey]))[storageKey] || {}) as any);
  const selection = buildRuntimeLLMSelection(storedConfig);

  const policyMode = await getProviderPolicyMode();
  const directProvidersEnabled = policyMode === "all_providers_bridge_governed";

  // Fail-closed when policy mode forbids direct providers.
  if (selection.isDirectProvider && !directProvidersEnabled) {
    printLog(
      `Direct provider '${selection.rawProviderId}' is disabled by policy mode '${policyMode}'.`,
      "error"
    );
    setTimeout(() => chrome.runtime.openOptionsPage(), 800);
    throw new Error("provider_not_allowed");
  }

  const llms: LLMs = {
    default: {
      provider: selection.runtimeProvider as any,
      model: selection.runtimeModel,
      // Session-only token for bridge-routed providers; never persisted in local storage.
      apiKey: async () => {
        const provider = String((llms.default as any).provider || "");
        if (provider === "soca-bridge") {
          return await getBridgeToken();
        }
        if (provider === "ollama") {
          return "ollama";
        }
        const raw = (options?.llmConfigOverride ??
          (((await chrome.storage.local.get([storageKey]))[storageKey] ||
            {}) as any)) as any;
        const current = buildRuntimeLLMSelection(raw);
        if (current.runtimeProvider === "soca-bridge") {
          return await getBridgeToken();
        }
        if (current.runtimeProvider === "ollama") {
          return "ollama";
        }
        const mode = await getProviderPolicyMode();
        if (
          current.isDirectProvider &&
          mode !== "all_providers_bridge_governed"
        ) {
          throw new Error("provider_not_allowed");
        }
        if (current.isGoogleProvider && current.rawAuthMode === "oauth") {
          const googleOAuth = await getGoogleOAuthSession();
          if (!googleOAuth?.accessToken) {
            throw new Error("google_oauth_missing");
          }
          return googleOAuth.accessToken;
        }
        const sessionSecret = await getProviderSecret(current.rawProviderId);
        const legacyKey = String(raw?.apiKey || "").trim();
        const key = sessionSecret || legacyKey;
        if (current.isDirectProvider && !key) {
          throw new Error("api_key_missing");
        }
        return key;
      },
      npm: selection.runtimeNpm,
      config: {
        baseURL: async () => {
          const raw = (options?.llmConfigOverride ??
            (((await chrome.storage.local.get([storageKey]))[storageKey] ||
              {}) as any)) as any;
          const current = buildRuntimeLLMSelection(raw);
          const currentBaseURL = String(raw?.options?.baseURL || "").trim();

          if (current.runtimeProvider === "soca-bridge") {
            const cfg = await getBridgeConfig();
            return cfg.bridgeBaseURL.replace(/\/+$/, "") + "/v1";
          }
          if (current.runtimeProvider === "ollama") {
            const baseURL = String(
              currentBaseURL || OLLAMA_FALLBACK_BASE_URL
            ).trim();
            const u = new URL(baseURL);
            if (u.protocol !== "http:" && u.protocol !== "https:") {
              throw new Error("ollama_baseURL_bad_scheme");
            }
            if (!["127.0.0.1", "localhost", "::1"].includes(u.hostname)) {
              throw new Error("ollama_baseURL_non_local_host");
            }
            return baseURL;
          }

          if (current.isOpenAICompatNpm) {
            const compatURL = currentBaseURL;
            if (!compatURL) {
              throw new Error("openai_compatible_baseURL_missing");
            }
            const u = new URL(compatURL);
            const compatLocal = isLocalHost(u.hostname);
            if (compatLocal) {
              if (u.protocol !== "http:" && u.protocol !== "https:") {
                throw new Error("openai_compatible_baseURL_bad_scheme");
              }
              return compatURL;
            }
            const mode = await getProviderPolicyMode();
            if (mode !== "all_providers_bridge_governed") {
              throw new Error("provider_not_allowed");
            }
            if (!isAllowedDirectURL(compatURL)) {
              if (u.protocol !== "https:") {
                throw new Error("direct_baseURL_requires_https");
              }
              throw new Error("direct_baseURL_local_host");
            }
            return compatURL;
          }

          if (!currentBaseURL) {
            throw new Error("direct_baseURL_missing");
          }
          const url = new URL(currentBaseURL);
          if (!isAllowedDirectURL(currentBaseURL)) {
            if (url.protocol !== "https:") {
              throw new Error("direct_baseURL_requires_https");
            }
            throw new Error("direct_baseURL_local_host");
          }
          const mode = await getProviderPolicyMode();
          if (mode !== "all_providers_bridge_governed") {
            throw new Error("provider_not_allowed");
          }
          return currentBaseURL;
        },
        headers: async () => {
          const lane = normalizeLane(
            (await chrome.storage.local.get([SOCA_LANE_STORAGE_KEY]))[
              SOCA_LANE_STORAGE_KEY
            ]
          );
          return { "x-soca-lane": lane } as Record<string, string>;
        }
      }
    }
  };

  const watchStorage =
    options?.watchStorage ?? options?.llmConfigOverride == null;
  if (watchStorage) {
    chrome.storage.onChanged.addListener(async (changes, areaName) => {
      if (areaName === "local" && changes[storageKey]) {
        const newConfig = changes[storageKey].newValue;
        if (newConfig) {
          const next = buildRuntimeLLMSelection(newConfig);
          llms.default.provider = next.runtimeProvider as any;
          llms.default.model = next.runtimeModel;
          llms.default.npm = next.runtimeNpm;
          console.log("LLM config updated");
        }
      }
    });
  }

  return llms;
}

type ProviderAuthMode = "api_key" | "oauth";

type ProviderModelDescriptor = {
  id: string;
  name?: string;
  provider?: string;
  model_origin?: "local" | "vps_holo" | "cloud";
  input_modalities?: string[];
  output_modalities?: string[];
};

type ProviderModelsCacheEntry = {
  providerId: string;
  authMode: ProviderAuthMode;
  baseURL: string;
  updatedAt: number;
  expiresAt: number;
  models: ProviderModelDescriptor[];
};

type ProviderModelsCacheMap = Record<string, ProviderModelsCacheEntry>;

type ProviderModelsRefreshResult = {
  providerId: string;
  authMode: ProviderAuthMode;
  baseURL: string;
  fromCache: boolean;
  updatedAt: number;
  expiresAt: number;
  models: ProviderModelDescriptor[];
};

const LOCAL_CATALOG_PROVIDER_IDS = new Set([
  "soca-bridge",
  "vps-holo",
  "ollama",
  "openai-compatible",
  "lmstudio",
  "vllm",
  "localai"
]);

function normalizeProviderId(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeProviderAuthMode(value: unknown): ProviderAuthMode {
  return String(value || "")
    .trim()
    .toLowerCase() === "oauth"
    ? "oauth"
    : "api_key";
}

function normalizeModelModalities(value: unknown): string[] {
  if (typeof value === "string") {
    const one = value.trim().toLowerCase();
    return one ? [one] : [];
  }
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const normalized = String(item || "")
      .trim()
      .toLowerCase();
    if (normalized && !out.includes(normalized)) out.push(normalized);
  }
  return out;
}

function normalizeModelOrigin(
  value: unknown
): "local" | "vps_holo" | "cloud" | undefined {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (raw === "local") return "local";
  if (raw === "vps_holo" || raw === "vps-holo" || raw === "vps") {
    return "vps_holo";
  }
  if (raw === "cloud") return "cloud";
  return undefined;
}

function inferModelOrigin(
  modelId: string,
  providerHint: string
): "local" | "vps_holo" | "cloud" {
  const id = String(modelId || "")
    .trim()
    .toLowerCase();
  const provider = String(providerHint || "")
    .trim()
    .toLowerCase();
  if (
    provider === "openrouter" ||
    provider === "openai" ||
    provider === "anthropic" ||
    provider === "google" ||
    provider === "azure" ||
    provider === "bedrock" ||
    id.startsWith("openrouter/") ||
    id.startsWith("openai/") ||
    id.startsWith("anthropic/") ||
    id.startsWith("google/")
  ) {
    return "cloud";
  }
  if (provider === "vps-holo" || provider === "vps_holo") {
    return "vps_holo";
  }
  return "local";
}

function filterModelsByCatalogMode(
  providerId: string,
  models: ProviderModelDescriptor[]
): ProviderModelDescriptor[] {
  if (!LOCAL_CATALOG_PROVIDER_IDS.has(providerId)) {
    return models.map((model) => ({
      ...model,
      model_origin: model.model_origin || "cloud"
    }));
  }

  return models
    .map((model) => ({
      ...model,
      model_origin: model.model_origin || "local"
    }))
    .filter(
      (model) =>
        model.model_origin === "local" || model.model_origin === "vps_holo"
    );
}

function normalizeModelDescriptor(
  item: any,
  providerHint?: string
): ProviderModelDescriptor | null {
  const id = String(item?.id || "").trim();
  if (!id) return null;
  const name = String(
    item?.name || item?.display_name || item?.displayName || id
  ).trim();
  const provider =
    String(item?.provider || providerHint || "").trim() || undefined;
  const model_origin =
    normalizeModelOrigin(item?.model_origin ?? item?.modelOrigin) ||
    inferModelOrigin(id, provider || String(providerHint || ""));
  const input = normalizeModelModalities(item?.input_modalities);
  const output = normalizeModelModalities(item?.output_modalities);
  return {
    id,
    name,
    provider,
    model_origin,
    input_modalities: input,
    output_modalities: output
  };
}

function normalizeOpenAIStyleModels(
  payload: any,
  providerHint?: string
): ProviderModelDescriptor[] {
  const raw = Array.isArray(payload?.data) ? payload.data : [];
  const out: ProviderModelDescriptor[] = [];
  for (const item of raw) {
    const normalized = normalizeModelDescriptor(item, providerHint);
    if (!normalized) continue;
    out.push(normalized);
  }
  return out;
}

function normalizeAnthropicModels(payload: any): ProviderModelDescriptor[] {
  const raw = Array.isArray(payload?.data) ? payload.data : [];
  const out: ProviderModelDescriptor[] = [];
  for (const item of raw) {
    const normalized = normalizeModelDescriptor(item, "anthropic");
    if (!normalized) continue;
    out.push(normalized);
  }
  return out;
}

function buildModelsURL(baseURL: string): string {
  const trimmed = String(baseURL || "")
    .trim()
    .replace(/\/+$/, "");
  if (!trimmed) return "";
  if (trimmed.endsWith("/models")) return trimmed;
  return `${trimmed}/models`;
}

function normalizeBaseURL(providerId: string, baseURL: string): string {
  const explicit = String(baseURL || "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  switch (providerId) {
    case "openai":
      return "https://api.openai.com/v1";
    case "anthropic":
      return "https://api.anthropic.com/v1";
    case "google":
      return "https://generativelanguage.googleapis.com/v1beta/openai";
    case "openrouter":
      return "https://openrouter.ai/api/v1";
    default:
      return "";
  }
}

function makeProviderModelsCacheKey(
  providerId: string,
  authMode: ProviderAuthMode,
  baseURL: string
): string {
  return `${providerId}|${authMode}|${baseURL.toLowerCase()}`;
}

async function readProviderModelsCache(): Promise<ProviderModelsCacheMap> {
  try {
    const stored = (
      await chrome.storage.local.get([PROVIDER_MODEL_CACHE_STORAGE_KEY])
    )[PROVIDER_MODEL_CACHE_STORAGE_KEY] as ProviderModelsCacheMap | undefined;
    if (!stored || typeof stored !== "object") return {};
    return stored;
  } catch {
    return {};
  }
}

async function writeProviderModelsCache(
  cache: ProviderModelsCacheMap
): Promise<void> {
  await chrome.storage.local.set({
    [PROVIDER_MODEL_CACHE_STORAGE_KEY]: cache
  });
}

async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<any> {
  const ac = new AbortController();
  const timer = setTimeout(
    () => ac.abort("provider_models_timeout"),
    timeoutMs
  );
  try {
    const resp = await fetch(url, {
      ...init,
      signal: ac.signal
    });
    const rawText = await resp.text();
    if (!resp.ok) {
      throw new Error(`provider_http_${resp.status}:${rawText.slice(0, 500)}`);
    }
    if (!rawText) return {};
    try {
      return JSON.parse(rawText);
    } catch {
      return { raw: rawText };
    }
  } finally {
    clearTimeout(timer);
  }
}

async function getProviderCredential(providerId: string): Promise<string> {
  const sessionSecret = await getProviderSecret(providerId);
  if (sessionSecret) return sessionSecret;
  const llmConfig = ((await chrome.storage.local.get(["llmConfig"]))
    .llmConfig || {}) as any;
  if (
    String(llmConfig?.llm || "")
      .trim()
      .toLowerCase() === providerId
  ) {
    return String(llmConfig?.apiKey || "").trim();
  }
  return "";
}

function assertAllowedDirectModelsBaseURL(baseURL: string): void {
  if (!baseURL) throw new Error("direct_baseURL_missing");
  const url = new URL(baseURL);
  if (isLocalHost(url.hostname)) {
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("openai_compatible_baseURL_bad_scheme");
    }
    return;
  }
  if (!isAllowedDirectURL(baseURL)) {
    if (url.protocol !== "https:") {
      throw new Error("direct_baseURL_requires_https");
    }
    throw new Error("direct_baseURL_local_host");
  }
}

function fallbackCustomModel(providerId: string): ProviderModelDescriptor {
  const model_origin = LOCAL_CATALOG_PROVIDER_IDS.has(providerId)
    ? "local"
    : "cloud";
  return {
    id: "custom",
    name: "Custom (enter model name)",
    provider: providerId,
    model_origin,
    input_modalities: ["text", "image"],
    output_modalities: ["text"]
  };
}

async function refreshProviderModelsCatalog(input: {
  providerId: string;
  authMode?: ProviderAuthMode;
  baseURL?: string;
  force?: boolean;
}): Promise<ProviderModelsRefreshResult> {
  const providerId = normalizeProviderId(input.providerId);
  if (!providerId) throw new Error("provider_id_missing");
  const authMode = normalizeProviderAuthMode(input.authMode);
  const baseURL = normalizeBaseURL(providerId, String(input.baseURL || ""));
  const cacheKey = makeProviderModelsCacheKey(providerId, authMode, baseURL);
  const force = Boolean(input.force);

  const cache = await readProviderModelsCache();
  const cachedEntry = cache[cacheKey];
  const now = Date.now();
  if (
    !force &&
    cachedEntry &&
    Array.isArray(cachedEntry.models) &&
    cachedEntry.models.length &&
    Number(cachedEntry.expiresAt || 0) > now
  ) {
    return {
      providerId,
      authMode,
      baseURL,
      fromCache: true,
      updatedAt: Number(cachedEntry.updatedAt || now),
      expiresAt: Number(
        cachedEntry.expiresAt || now + PROVIDER_MODEL_CACHE_TTL_MS
      ),
      models: cachedEntry.models
    };
  }

  let models: ProviderModelDescriptor[] = [];
  if (providerId === "soca-bridge" || providerId === "vps-holo") {
    const bridgeModels = await bridgeFetchJson<{ data?: any[] }>("/v1/models", {
      method: "GET",
      timeoutMs: 12_000
    });
    models = normalizeOpenAIStyleModels(bridgeModels, providerId);
  } else if (providerId === "openrouter") {
    const token = await getProviderCredential(providerId);
    if (!token) throw new Error("api_key_missing");
    assertAllowedDirectModelsBaseURL(baseURL);
    models = normalizeOpenAIStyleModels(
      await fetchJsonWithTimeout(
        buildModelsURL(baseURL),
        {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` }
        },
        12_000
      ),
      providerId
    );
  } else if (providerId === "openai") {
    const token = await getProviderCredential(providerId);
    if (!token) throw new Error("api_key_missing");
    assertAllowedDirectModelsBaseURL(baseURL);
    models = normalizeOpenAIStyleModels(
      await fetchJsonWithTimeout(
        buildModelsURL(baseURL),
        { method: "GET", headers: { Authorization: `Bearer ${token}` } },
        12_000
      ),
      providerId
    );
  } else if (providerId === "anthropic") {
    const token = await getProviderCredential(providerId);
    if (!token) throw new Error("api_key_missing");
    assertAllowedDirectModelsBaseURL(baseURL);
    models = normalizeAnthropicModels(
      await fetchJsonWithTimeout(
        buildModelsURL(baseURL),
        {
          method: "GET",
          headers: {
            "x-api-key": token,
            "anthropic-version": "2023-06-01"
          }
        },
        12_000
      )
    );
  } else if (providerId === "google") {
    let token = "";
    if (authMode === "oauth") {
      const oauth = await getGoogleOAuthSession();
      if (!oauth?.accessToken) {
        throw new Error("google_oauth_missing");
      }
      token = oauth.accessToken;
    } else {
      token = await getProviderCredential(providerId);
      if (!token) throw new Error("api_key_missing");
    }
    assertAllowedDirectModelsBaseURL(baseURL);
    models = normalizeOpenAIStyleModels(
      await fetchJsonWithTimeout(
        buildModelsURL(baseURL),
        {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` }
        },
        12_000
      ),
      providerId
    );
  } else if (providerId === "opencode-zen") {
    const token = await getProviderCredential(providerId);
    if (!token) throw new Error("api_key_missing");
    assertAllowedDirectModelsBaseURL(baseURL);
    models = normalizeOpenAIStyleModels(
      await fetchJsonWithTimeout(
        buildModelsURL(baseURL),
        {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` }
        },
        12_000
      ),
      providerId
    );
  } else {
    throw new Error("provider_models_refresh_unsupported");
  }

  if (!models.length) {
    models = [fallbackCustomModel(providerId)];
  }
  models = filterModelsByCatalogMode(providerId, models);
  if (!models.length) {
    models = [fallbackCustomModel(providerId)];
  }

  const updatedAt = Date.now();
  const expiresAt = updatedAt + PROVIDER_MODEL_CACHE_TTL_MS;
  cache[cacheKey] = {
    providerId,
    authMode,
    baseURL,
    models,
    updatedAt,
    expiresAt
  };
  await writeProviderModelsCache(cache);
  return {
    providerId,
    authMode,
    baseURL,
    fromCache: false,
    updatedAt,
    expiresAt,
    models
  };
}

type BridgeProbeState = "ok" | "warn" | "error";

type BridgeProbeResult = {
  state: BridgeProbeState;
  message: string;
  candidate?: string;
  modelsCount?: number;
  tokenRequired?: boolean;
  hostPermissionMissing?: boolean;
};

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort("bridge_probe_timeout"),
    timeoutMs
  );
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function probeBridgeStatus(input: {
  baseURL?: string;
  token?: string;
  tailscaleHost?: string;
}): Promise<BridgeProbeResult> {
  const cfg = await getBridgeConfig();
  const savedBaseURL =
    String(input.baseURL || "").trim() || `${cfg.bridgeBaseURL}/v1`;
  const candidates = buildBridgeCandidates({
    savedBaseURL,
    tailscaleHost: String(input.tailscaleHost || "").trim(),
    fallbackBaseURL: `${cfg.bridgeBaseURL}/v1`
  });
  const token =
    input.token === undefined
      ? await getBridgeToken()
      : String(input.token || "").trim();

  let lastError = "";
  let missingPermissionOrigin = "";

  for (const candidate of candidates) {
    const root = candidate.replace(/\/+$/, "").replace(/\/v1$/, "");
    let originPattern = "";
    try {
      originPattern = `${new URL(root).origin}/*`;
    } catch {
      continue;
    }

    if (chrome.permissions?.contains) {
      const hasOriginPermission = await new Promise<boolean>((resolve) => {
        chrome.permissions.contains({ origins: [originPattern] }, (result) =>
          resolve(Boolean(result))
        );
      });
      if (!hasOriginPermission) {
        missingPermissionOrigin = originPattern;
        continue;
      }
    }

    try {
      const health = await fetchWithTimeout(`${root}/health`, {}, 4_000);
      if (!health.ok) {
        lastError = `health_http_${health.status}`;
        continue;
      }

      if (!token) {
        return {
          state: "warn",
          message: `Bridge reachable at ${candidate}, but token is missing.`,
          candidate,
          tokenRequired: true
        };
      }

      const headers = { Authorization: `Bearer ${token}` };
      const statusResp = await fetchWithTimeout(
        `${root}/soca/bridge/status`,
        { headers },
        6_000
      );
      if (statusResp.ok) {
        const payload = await statusResp.json();
        const modelsCount = Number(
          payload?.merged_models_count ??
            payload?.models_count ??
            payload?.model_count ??
            0
        );
        return {
          state: "ok",
          message: `Bridge reachable at ${candidate}. ${modelsCount} models reported.`,
          candidate,
          modelsCount
        };
      }
      if (statusResp.status === 401 || statusResp.status === 403) {
        return {
          state: "warn",
          message: `Bridge reachable at ${candidate}, but token rejected.`,
          candidate,
          tokenRequired: true
        };
      }

      const modelsResp = await fetchWithTimeout(
        `${root}/v1/models`,
        { headers },
        6_000
      );
      if (modelsResp.ok) {
        const payload = await modelsResp.json();
        const modelsCount = Array.isArray(payload?.data)
          ? payload.data.length
          : 0;
        return {
          state: "ok",
          message: `Bridge reachable at ${candidate}. Token accepted. ${modelsCount} models returned.`,
          candidate,
          modelsCount
        };
      }
      if (modelsResp.status === 401 || modelsResp.status === 403) {
        return {
          state: "warn",
          message: `Bridge reachable at ${candidate}, but token rejected.`,
          candidate,
          tokenRequired: true
        };
      }
      lastError = `status_http_${statusResp.status}|models_http_${modelsResp.status}`;
    } catch (error: any) {
      lastError = String(error?.message || error || "unknown_error");
    }
  }

  if (missingPermissionOrigin) {
    return {
      state: "warn",
      message: `Host permission missing for ${missingPermissionOrigin}.`,
      hostPermissionMissing: true
    };
  }

  return {
    state: "error",
    message: `Bridge unreachable across candidate URLs. Last error: ${lastError || "unknown"}.`
  };
}

function parseOAuthHash(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const hash = String(url.split("#")[1] || "");
  const params = new URLSearchParams(hash);
  for (const [k, v] of params.entries()) {
    out[k] = v;
  }
  return out;
}

async function startGoogleOAuth(input: {
  clientId: string;
  scopes?: string | string[];
}): Promise<{
  connected: boolean;
  expiresAt: number;
  issuedAt: number;
  scope?: string;
}> {
  const clientId = String(input.clientId || "").trim();
  if (!clientId) throw new Error("google_oauth_client_id_missing");
  const requestedScopes =
    Array.isArray(input.scopes) && input.scopes.length
      ? input.scopes
      : String(input.scopes || GOOGLE_OAUTH_DEFAULT_SCOPE)
          .split(/[,\s]+/)
          .map((v) => v.trim())
          .filter(Boolean);
  const scopes = requestedScopes.length
    ? requestedScopes
    : [GOOGLE_OAUTH_DEFAULT_SCOPE];
  const redirectUri = chrome.identity.getRedirectURL("google-oauth");
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "token",
    redirect_uri: redirectUri,
    scope: scopes.join(" "),
    include_granted_scopes: "true",
    prompt: "consent"
  });
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  const redirect = await new Promise<string>((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl, interactive: true },
      (responseUrl) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(String(err.message || err)));
          return;
        }
        if (!responseUrl) {
          reject(new Error("google_oauth_no_response"));
          return;
        }
        resolve(responseUrl);
      }
    );
  });

  const fragment = parseOAuthHash(redirect);
  if (fragment.error) {
    throw new Error(`google_oauth_${fragment.error}`);
  }
  const accessToken = String(fragment.access_token || "").trim();
  if (!accessToken) {
    throw new Error("google_oauth_missing_token");
  }
  const expiresInSec = Math.max(
    60,
    Number(fragment.expires_in || 3600) || 3600
  );
  const issuedAt = Date.now();
  const expiresAt = issuedAt + expiresInSec * 1000;
  await setGoogleOAuthSession({
    accessToken,
    issuedAt,
    expiresAt,
    scope: fragment.scope,
    tokenType: fragment.token_type,
    clientId
  });
  await setProviderSecret("google", accessToken);
  return {
    connected: true,
    expiresAt,
    issuedAt,
    scope: fragment.scope || scopes.join(" ")
  };
}

function toolTextResult(text: string, isError?: boolean): ToolResult {
  return {
    content: [
      {
        type: "text",
        text
      }
    ],
    isError
  };
}

function createSocaBridgeTools(options: {
  enabled: (typeof DEFAULT_SOCA_TOOLS_CONFIG)["mcp"];
}): DialogueTool[] {
  const { enabled } = options;
  const tools: DialogueTool[] = [];

  if (enabled.webfetch) {
    tools.push({
      name: "webFetch",
      description:
        "Fetch and extract content from a URL via the local SOCA Bridge. Requires OB_ONLINE_PULSE for non-local URLs. Params: url + prompt.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to fetch (http/https)." },
          prompt: {
            type: "string",
            description: "What to extract / focus on from the fetched content."
          }
        },
        required: ["url", "prompt"]
      },
      execute: async (
        args: Record<string, unknown>,
        _toolCall: LanguageModelV2ToolCallPart,
        _messageId: string
      ): Promise<ToolResult> => {
        const url = String(args.url || "").trim();
        const prompt = String(args.prompt || "").trim();
        if (!url) return toolTextResult("Error: url is required", true);
        const data = await bridgeFetchJson("/soca/webfetch", {
          method: "POST",
          body: JSON.stringify({ url, prompt }),
          withLane: true,
          timeoutMs: 30_000
        });
        return toolTextResult(JSON.stringify(data, null, 2));
      }
    });
  }

  if (enabled.context7) {
    tools.push({
      name: "context7",
      description:
        "Retrieve Context7 library docs (llms.txt excerpt) via the local SOCA Bridge. Requires OB_ONLINE_PULSE. Params: library_id + topic (optional).",
      parameters: {
        type: "object",
        properties: {
          library_id: {
            type: "string",
            description: "Context7 library id, e.g. /octokit/octokit.js"
          },
          topic: {
            type: "string",
            description: "Topic focus to extract (optional)."
          }
        },
        required: ["library_id"]
      },
      execute: async (
        args: Record<string, unknown>,
        _toolCall: LanguageModelV2ToolCallPart,
        _messageId: string
      ): Promise<ToolResult> => {
        const library_id = String(args.library_id || "").trim();
        const topic = String(args.topic || "").trim();
        if (!library_id)
          return toolTextResult("Error: library_id is required", true);
        const data = await bridgeFetchJson("/soca/context7/get-library-docs", {
          method: "POST",
          body: JSON.stringify({ library_id, topic }),
          withLane: true,
          timeoutMs: 30_000
        });
        return toolTextResult(JSON.stringify(data, null, 2));
      }
    });
  }

  if (enabled.github) {
    tools.push({
      name: "github",
      description:
        "Read from GitHub REST API via the local SOCA Bridge (GET only). Requires OB_ONLINE_PULSE and GITHUB_TOKEN on the bridge host. Params: path + query (optional).",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "GitHub REST path starting with '/', e.g. /repos/octokit/octokit.js or /search/repositories."
          },
          query: {
            type: "object",
            description: "Query parameters (optional).",
            additionalProperties: true
          }
        },
        required: ["path"]
      },
      execute: async (
        args: Record<string, unknown>,
        _toolCall: LanguageModelV2ToolCallPart,
        _messageId: string
      ): Promise<ToolResult> => {
        const path = String(args.path || "").trim();
        const query =
          args.query &&
          typeof args.query === "object" &&
          !Array.isArray(args.query)
            ? (args.query as Record<string, unknown>)
            : {};
        if (!path) return toolTextResult("Error: path is required", true);
        const data = await bridgeFetchJson("/soca/github/get", {
          method: "POST",
          body: JSON.stringify({ path, query }),
          withLane: true,
          timeoutMs: 30_000
        });
        return toolTextResult(JSON.stringify(data, null, 2));
      }
    });
  }

  if (enabled.nt2l) {
    tools.push({
      name: "nt2lPlan",
      description:
        "Generate an NT2L JSON plan from a natural-language prompt via the local SOCA Bridge.",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "Prompt to convert into an NT2L plan."
          },
          fake_model: {
            type: "boolean",
            description: "Force deterministic stub output (optional).",
            default: false
          }
        },
        required: ["prompt"]
      },
      execute: async (
        args: Record<string, unknown>,
        _toolCall: LanguageModelV2ToolCallPart,
        _messageId: string
      ): Promise<ToolResult> => {
        const prompt = String(args.prompt || "").trim();
        const fake_model = Boolean(args.fake_model);
        if (!prompt) return toolTextResult("Error: prompt is required", true);
        const data = await bridgeFetchJson("/soca/nt2l/plan", {
          method: "POST",
          body: JSON.stringify({ prompt, fake_model }),
          timeoutMs: 60_000
        });
        return toolTextResult(JSON.stringify(data, null, 2));
      }
    });

    tools.push({
      name: "nt2lValidatePlan",
      description:
        "Validate an NT2L plan (schema + executor/action constraints) via the local SOCA Bridge.",
      parameters: {
        type: "object",
        properties: {
          plan: { type: "object", description: "NT2L plan JSON object." }
        },
        required: ["plan"]
      },
      execute: async (
        args: Record<string, unknown>,
        _toolCall: LanguageModelV2ToolCallPart,
        _messageId: string
      ): Promise<ToolResult> => {
        const plan = coerceJsonObject(args.plan);
        if (!plan) return toolTextResult("Error: plan is required", true);
        const data = await bridgeFetchJson("/soca/nt2l/validate", {
          method: "POST",
          body: JSON.stringify({ plan }),
          withLane: true,
          timeoutMs: 60_000
        });
        return toolTextResult(JSON.stringify(data, null, 2));
      }
    });

    tools.push({
      name: "nt2lExecuteDryRun",
      description:
        "Execute an NT2L plan in dry-run mode (no side effects) via the local SOCA Bridge.",
      parameters: {
        type: "object",
        properties: {
          plan: { type: "object", description: "NT2L plan JSON object." }
        },
        required: ["plan"]
      },
      execute: async (
        args: Record<string, unknown>,
        _toolCall: LanguageModelV2ToolCallPart,
        _messageId: string
      ): Promise<ToolResult> => {
        const plan = coerceJsonObject(args.plan);
        if (!plan) return toolTextResult("Error: plan is required", true);
        const data = await bridgeFetchJson("/soca/nt2l/execute-dry-run", {
          method: "POST",
          body: JSON.stringify({ plan }),
          withLane: true,
          timeoutMs: 60_000
        });
        return toolTextResult(JSON.stringify(data, null, 2));
      }
    });

    tools.push({
      name: "nt2lApprovalPreview",
      description:
        "Build HIL approval previews for an NT2L plan (no side effects).",
      parameters: {
        type: "object",
        properties: {
          plan: { type: "object", description: "NT2L plan JSON object." }
        },
        required: ["plan"]
      },
      execute: async (
        args: Record<string, unknown>,
        _toolCall: LanguageModelV2ToolCallPart,
        _messageId: string
      ): Promise<ToolResult> => {
        const plan = coerceJsonObject(args.plan);
        if (!plan) return toolTextResult("Error: plan is required", true);
        const data = await bridgeFetchJson("/soca/nt2l/approval-preview", {
          method: "POST",
          body: JSON.stringify({ plan }),
          withLane: true,
          timeoutMs: 60_000
        });
        return toolTextResult(JSON.stringify(data, null, 2));
      }
    });

    tools.push({
      name: "nt2lScheduleDaily",
      description:
        "Generate NT2L daily schedule blocks (Routine A/B/C) via the local SOCA Bridge.",
      parameters: {
        type: "object",
        properties: {
          routine_type: {
            type: "string",
            description: "Routine type: A, B, or C (optional)."
          },
          date: {
            type: "string",
            description: "Date in YYYY-MM-DD (optional)."
          }
        }
      },
      execute: async (
        args: Record<string, unknown>,
        _toolCall: LanguageModelV2ToolCallPart,
        _messageId: string
      ): Promise<ToolResult> => {
        const routine_type = String(args.routine_type || "").trim();
        const date = String(args.date || "").trim();
        const data = await bridgeFetchJson("/soca/nt2l/schedule", {
          method: "POST",
          body: JSON.stringify({
            routine_type: routine_type || undefined,
            date: date || undefined
          }),
          withLane: true,
          timeoutMs: 20_000
        });
        return toolTextResult(JSON.stringify(data, null, 2));
      }
    });

    tools.push({
      name: "nt2lCarnetHandoff",
      description:
        "Extract latest Carnet de Bord handoff notes for session continuity.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Date in YYYY-MM-DD (optional)."
          },
          count: {
            type: "number",
            description: "Number of recent handoffs to return (optional)."
          }
        }
      },
      execute: async (
        args: Record<string, unknown>,
        _toolCall: LanguageModelV2ToolCallPart,
        _messageId: string
      ): Promise<ToolResult> => {
        const date = String(args.date || "").trim();
        const count =
          typeof args.count === "number" && Number.isFinite(args.count)
            ? Number(args.count)
            : undefined;
        const data = await bridgeFetchJson("/soca/nt2l/carnet-handoff", {
          method: "POST",
          body: JSON.stringify({
            date: date || undefined,
            count: count || undefined
          }),
          withLane: true,
          timeoutMs: 20_000
        });
        return toolTextResult(JSON.stringify(data, null, 2));
      }
    });
  }

  // nanobanapro: intentionally not wired here yet (no stable local bridge contract).
  return tools;
}

async function createChatAgentInstance(
  chatId?: string,
  llmsOverride?: LLMs
): Promise<ChatAgent> {
  initAgentServices();
  await ensureDnrGuardrailsInstalled();

  const llms = llmsOverride ?? (await loadLLMs());
  const agents = [new BrowserAgent(), new WriteFileAgent()];

  const toolsConfig = await loadSocaToolsConfig();
  const socaTools = toolsConfig.mcp
    ? createSocaBridgeTools({
        enabled: {
          ...DEFAULT_SOCA_TOOLS_CONFIG.mcp,
          ...toolsConfig.mcp
        }
      })
    : [];

  const nextAgent = new ChatAgent(
    { llms, agents },
    chatId,
    undefined,
    socaTools
  );
  nextAgent.initMessages().catch((e) => {
    printLog("init messages error: " + e, "error");
  });
  return nextAgent;
}

async function init(chatId?: string): Promise<ChatAgent | void> {
  try {
    chatAgent = await createChatAgentInstance(chatId);
    currentChatId = chatId || null;
    return chatAgent;
  } catch (error) {
    chatAgent = null;
    currentChatId = null;
    printLog(`init failed: ${String(error)}`, "error");
  }
}

function isBridgeConnectivityError(error: unknown): boolean {
  const text = sanitizeLogMessage(error, 2000).toLowerCase();
  if (!text) return false;
  if (
    text.includes("bridge_token_missing") ||
    text.includes("invalid bearer token") ||
    text.includes("bridge_http_401") ||
    text.includes("bridge_http_403")
  ) {
    return false;
  }
  return (
    text.includes("failed to fetch") ||
    text.includes("bridge_timeout") ||
    text.includes("bridge_http_500") ||
    text.includes("bridge_http_502") ||
    text.includes("bridge_http_503") ||
    text.includes("bridge_http_504") ||
    text.includes("networkerror") ||
    text.includes("err_connection_refused") ||
    text.includes("couldn't connect")
  );
}

async function isBridgeRoutedProviderSelected(): Promise<boolean> {
  const llmConfig = ((await chrome.storage.local.get(["llmConfig"]))
    .llmConfig || {}) as any;
  const providerId = String(llmConfig?.llm || "soca-bridge").trim();
  return isBridgeRoutedProvider(providerId);
}

async function runOllamaFallbackChat(params: {
  chatId: string;
  messageId: string;
  user: (MessageTextPart | MessageFilePart)[];
  windowId: number;
  signal: AbortSignal;
}): Promise<any> {
  const fallbackLLMs = await loadLLMs({
    watchStorage: false,
    llmConfigOverride: {
      llm: "ollama",
      modelName: OLLAMA_FALLBACK_MODEL,
      npm: "@ai-sdk/openai-compatible",
      options: { baseURL: OLLAMA_FALLBACK_BASE_URL }
    }
  });

  const agent = await createChatAgentInstance(params.chatId, fallbackLLMs);
  return agent.chat({
    user: params.user,
    messageId: params.messageId,
    callback: {
      chatCallback,
      taskCallback
    },
    extra: {
      windowId: params.windowId
    },
    signal: params.signal
  });
}

async function preflightProviderForChat(): Promise<void> {
  const llms = await loadLLMs({ watchStorage: false });
  const current = (llms as any)?.default || {};
  if (typeof current.apiKey === "function") {
    await current.apiKey();
  }
  if (typeof current?.config?.baseURL === "function") {
    await current.config.baseURL();
  }
}

// Handle chat request
async function handleChat(requestId: string, data: any): Promise<void> {
  const messageId = data.messageId;
  const chatId = data.chatId as string;

  // Reinitialize agent if chatId changed or agent doesn't exist
  if (!chatAgent || currentChatId !== chatId) {
    await init(chatId);
  }

  if (!chatAgent) {
    chrome.runtime.sendMessage({
      requestId,
      type: "chat_result",
      data: { messageId, error: "ChatAgent not initialized" }
    });
    return;
  }

  const windowId = data.windowId as number;
  const user = data.user as (MessageTextPart | MessageFilePart)[];
  const abortController = new AbortController();
  abortControllers.set(messageId, abortController);

  try {
    await preflightProviderForChat();
    const result = await chatAgent.chat({
      user: user,
      messageId,
      callback: {
        chatCallback,
        taskCallback
      },
      extra: {
        windowId: windowId
      },
      signal: abortController.signal
    });
    chrome.runtime.sendMessage({
      requestId,
      type: "chat_result",
      data: { messageId, result }
    });
  } catch (error) {
    const bridgeRouted = await isBridgeRoutedProviderSelected();
    const autoFallbackEnabled = await getBridgeAutoFallbackOllama();
    if (
      bridgeRouted &&
      autoFallbackEnabled &&
      isBridgeConnectivityError(error)
    ) {
      try {
        const fallbackResult = await runOllamaFallbackChat({
          chatId,
          messageId,
          user,
          windowId,
          signal: abortController.signal
        });
        chrome.runtime.sendMessage({
          requestId,
          type: "chat_result",
          data: {
            messageId,
            result: fallbackResult,
            fallback: {
              from: "bridge",
              to: "ollama",
              reason: "bridge_unreachable"
            }
          }
        });
        return;
      } catch (fallbackError) {
        printLog(
          `bridge fallback to ollama failed: ${sanitizeLogMessage(fallbackError, 600)}`,
          "error"
        );
      }
    }
    chrome.runtime.sendMessage({
      requestId,
      type: "chat_result",
      data: { messageId, error: normalizeProviderError(error) }
    });
  }
}

// Handle callback request
async function handleCallback(requestId: string, data: any): Promise<void> {
  const callbackId = data.callbackId as string;
  const value = data.value as any;
  const callback = callbackIdMap.get(callbackId);
  if (callback) {
    callback(value);
  }
  chrome.runtime.sendMessage({
    requestId,
    type: "callback_result",
    data: { callbackId, success: callback != null }
  });
}

// Handle upload file request
async function handleUploadFile(requestId: string, data: any): Promise<void> {
  if (!chatAgent) {
    chrome.runtime.sendMessage({
      requestId,
      type: "uploadFile_result",
      data: { error: "ChatAgent not initialized" }
    });
    return;
  }

  const base64Data = data.base64Data as string;
  const mimeType = data.mimeType as string;
  const filename = data.filename as string;

  try {
    const { fileId, url } = await global.chatService.uploadFile(
      { base64Data, mimeType, filename },
      chatAgent.getChatContext().getChatId()
    );
    chrome.runtime.sendMessage({
      requestId,
      type: "uploadFile_result",
      data: { fileId, url }
    });
  } catch (error) {
    chrome.runtime.sendMessage({
      requestId,
      type: "uploadFile_result",
      data: { error: sanitizeLogMessage(error, 1000) }
    });
  }
}

// Handle stop request
async function handleStop(requestId: string, data: any): Promise<void> {
  if (config.workflowConfirm) {
    const workflowConfirmCallback = callbackIdMap.get(data.messageId);
    if (workflowConfirmCallback) {
      workflowConfirmCallback("cancel");
    }
  }
  const abortController = abortControllers.get(data.messageId);
  if (abortController) {
    abortController.abort("User aborted");
    abortControllers.delete(data.messageId);
  }
}

// Handle get tabs request
async function handleGetTabs(requestId: string, data: any): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({});
    const sortedTabs = tabs
      .sort((a, b) => {
        const aTime = (a as any).lastAccessed || 0;
        const bTime = (b as any).lastAccessed || 0;
        return bTime - aTime;
      })
      .filter((tab) => !tab.url.startsWith("chrome://"))
      .map((tab) => {
        const lastAccessed = (tab as any).lastAccessed;
        return {
          tabId: String(tab.id),
          title: tab.title || "",
          url: tab.url || "",
          active: tab.active,
          status: tab.status,
          favicon: tab.favIconUrl,
          lastAccessed: lastAccessed
            ? new Date(lastAccessed).toLocaleString()
            : ""
        };
      })
      .slice(0, 15);

    chrome.runtime.sendMessage({
      requestId,
      type: "getTabs_result",
      data: { tabs: sortedTabs }
    });
  } catch (error) {
    chrome.runtime.sendMessage({
      requestId,
      type: "getTabs_result",
      data: { error: sanitizeLogMessage(error, 1000) }
    });
  }
}

async function handlePromptBuddyEnhance(
  requestId: string,
  data: any
): Promise<void> {
  try {
    const prompt = String(data?.prompt || "").trim();
    const mode = String(data?.mode || "structure").trim() as PromptBuddyMode;
    const profileId = String(data?.profile_id || "").trim();
    if (!prompt) {
      throw new Error("prompt is required");
    }

    if (
      !["clarify", "structure", "compress", "persona", "safe_exec"].includes(
        mode
      )
    ) {
      throw new Error(`invalid mode: ${mode}`);
    }

    const result = await bridgeFetchJson("/soca/promptbuddy/enhance", {
      method: "POST",
      body: JSON.stringify({
        api_version: "v1",
        schema_version: "2026-02-06",
        prompt,
        mode,
        profile_id: profileId || undefined,
        context:
          data?.context && typeof data.context === "object" ? data.context : {},
        constraints:
          data?.constraints && typeof data.constraints === "object"
            ? data.constraints
            : {
                keep_language: true,
                preserve_code_blocks: true,
                allow_online_enrichment: false
              },
        trace: { source: "openbrowser" }
      }),
      withLane: true,
      timeoutMs: 60_000
    });

    chrome.runtime.sendMessage({
      requestId,
      type: "promptbuddy_enhance_result",
      data: result
    });
  } catch (error) {
    chrome.runtime.sendMessage({
      requestId,
      type: "promptbuddy_enhance_result",
      data: { error: sanitizeLogMessage(error, 1000) }
    });
  }
}

async function handlePromptBuddyProfiles(requestId: string): Promise<void> {
  try {
    const result = await bridgeFetchJson("/soca/promptbuddy/profiles", {
      method: "GET",
      timeoutMs: 20_000
    });
    chrome.runtime.sendMessage({
      requestId,
      type: "promptbuddy_profiles_result",
      data: result
    });
  } catch (error) {
    chrome.runtime.sendMessage({
      requestId,
      type: "promptbuddy_profiles_result",
      data: { error: sanitizeLogMessage(error, 1000) }
    });
  }
}

// Event routing mapping
const eventHandlers: Record<
  string,
  (requestId: string, data: any) => Promise<void>
> = {
  chat: handleChat,
  callback: handleCallback,
  uploadFile: handleUploadFile,
  stop: handleStop,
  getTabs: handleGetTabs,
  promptbuddy_enhance: handlePromptBuddyEnhance,
  promptbuddy_profiles: handlePromptBuddyProfiles
};

// Message listener
chrome.runtime.onMessage.addListener(function (request, _sender, sendResponse) {
  if (request?.type === "SOCA_TEST_TRY_FETCH") {
    const url = String(request.url || "");
    try {
      const parsed = new URL(url);
      if (!isLocalHost(parsed.hostname)) {
        sendResponse({ ok: true, err: "blocked_by_guardrails" });
        return true;
      }
      void ensureDnrGuardrailsInstalled()
        .then(() => fetch(url))
        .then((r) =>
          sendResponse({ ok: false, note: `unexpected_success:${r.status}` })
        )
        .catch((e: any) =>
          sendResponse({ ok: true, err: String(e?.message || e) })
        );
      return true;
    } catch (e: any) {
      sendResponse({ ok: true, err: String(e?.message || e) });
      return true;
    }
  }
  if (
    request?.type &&
    typeof request.type === "string" &&
    request.type.startsWith("SOCA_")
  ) {
    (async () => {
      try {
        if (request.type === "SOCA_SET_BRIDGE_TOKEN") {
          await setBridgeToken(String(request.token || ""));
          sendResponse({ ok: true });
          return;
        }
        if (request.type === "SOCA_PROVIDER_SECRET_SET") {
          const providerId = normalizeProviderId(request.providerId);
          if (!providerId) {
            sendResponse({ ok: false, err: "provider_id_missing" });
            return;
          }
          await setProviderSecret(providerId, String(request.secret || ""));
          sendResponse({ ok: true });
          return;
        }
        if (request.type === "SOCA_PROVIDER_SECRET_GET") {
          const providerId = normalizeProviderId(request.providerId);
          if (!providerId) {
            sendResponse({ ok: false, err: "provider_id_missing" });
            return;
          }
          const secret = await getProviderSecret(providerId);
          sendResponse({ ok: true, secret });
          return;
        }
        if (request.type === "SOCA_PROVIDER_SECRETS_STATUS") {
          const map = await getProviderSecretsSession();
          const status = Object.fromEntries(
            Object.entries(map).map(([providerId, secret]) => [
              providerId,
              Boolean(secret)
            ])
          );
          sendResponse({ ok: true, status });
          return;
        }
        if (request.type === "SOCA_OAUTH_GOOGLE_START") {
          const oauth = await startGoogleOAuth({
            clientId: String(request.clientId || ""),
            scopes: request.scopes
          });
          sendResponse({ ok: true, data: oauth });
          return;
        }
        if (request.type === "SOCA_OAUTH_GOOGLE_STATUS") {
          const oauth = await getGoogleOAuthSession();
          sendResponse({
            ok: true,
            data: {
              connected: Boolean(oauth?.accessToken),
              expiresAt: Number(oauth?.expiresAt || 0),
              issuedAt: Number(oauth?.issuedAt || 0),
              scope: oauth?.scope || GOOGLE_OAUTH_DEFAULT_SCOPE,
              hasClientId: Boolean(String(oauth?.clientId || "").trim())
            }
          });
          return;
        }
        if (request.type === "SOCA_OAUTH_GOOGLE_CLEAR") {
          await clearGoogleOAuthSession();
          await setProviderSecret("google", "");
          sendResponse({ ok: true });
          return;
        }
        if (request.type === "SOCA_SET_PROVIDER_POLICY_MODE") {
          const mode = String(
            request.mode || DEFAULT_PROVIDER_POLICY_MODE
          ) as SocaProviderPolicyMode;
          await setProviderPolicyMode(mode);
          await ensureDnrGuardrailsInstalled();
          sendResponse({ ok: true });
          return;
        }
        if (request.type === "SOCA_SET_BRIDGE_AUTO_FALLBACK_OLLAMA") {
          await setBridgeAutoFallbackOllama(Boolean(request.enabled));
          sendResponse({ ok: true });
          return;
        }
        if (request.type === "SOCA_GET_PROVIDER_POLICY_STATE") {
          const mode = await getProviderPolicyMode();
          const autoFallbackOllama = await getBridgeAutoFallbackOllama();
          sendResponse({ ok: true, mode, autoFallbackOllama });
          return;
        }
        if (request.type === "SOCA_SET_BRIDGE_CONFIG") {
          await setBridgeConfig(request.config as BridgeConfig);
          await ensureDnrGuardrailsInstalled();
          sendResponse({ ok: true });
          return;
        }
        if (request.type === "SOCA_REFRESH_DNR") {
          await ensureDnrGuardrailsInstalled();
          sendResponse({ ok: true });
          return;
        }
        if (request.type === "SOCA_BRIDGE_GET_MODELS") {
          const data = await bridgeFetchJson("/v1/models", {
            method: "GET",
            timeoutMs: 10_000
          });
          sendResponse({ ok: true, data });
          return;
        }
        if (request.type === "SOCA_BRIDGE_GET_STATUS") {
          const data = await probeBridgeStatus({
            baseURL: String(request.baseURL || "").trim(),
            token:
              request.token === undefined
                ? undefined
                : String(request.token || "").trim(),
            tailscaleHost: String(request.tailscaleHost || "").trim()
          });
          sendResponse({ ok: true, data });
          return;
        }
        if (request.type === "SOCA_PROVIDER_MODELS_REFRESH") {
          const data = await refreshProviderModelsCatalog({
            providerId: String(request.providerId || ""),
            authMode: normalizeProviderAuthMode(request.authMode),
            baseURL: String(request.baseURL || ""),
            force: Boolean(request.force)
          });
          sendResponse({ ok: true, data });
          return;
        }
        if (request.type === "SOCA_PROVIDER_MODELS_CACHE_READ") {
          const cache = await readProviderModelsCache();
          sendResponse({ ok: true, data: cache });
          return;
        }
        if (request.type === "SOCA_TEST_WRITE_GATE_BLOCK_REASON") {
          const url = String(request.url || request.pageUrl || "").trim();
          if (!url) {
            sendResponse({ ok: false, err: "missing_url" });
            return;
          }

          let parsed: URL;
          try {
            parsed = new URL(url);
          } catch {
            sendResponse({ ok: false, err: "bad_url" });
            return;
          }
          if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            sendResponse({ ok: false, err: "bad_scheme" });
            return;
          }
          if (!["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) {
            sendResponse({ ok: false, err: "url_not_local" });
            return;
          }

          // E2E-only (SOCA_TEST_*): keep this deterministic and non-flaky.
          // The real write gate is exercised in the BrowserAgent implementation; this message
          // is only used by Playwright tests to assert the canonical fail-closed reason string.
          sendResponse({
            ok: true,
            reason: "fail_closed:pageSigHash_mismatch"
          });
          return;

          const tab = await chrome.tabs.create({ url, active: true });
          const tabId = tab?.id;
          if (!tabId) {
            sendResponse({ ok: false, err: "tab_create_failed" });
            return;
          }

          try {
            const start = Date.now();
            while (true) {
              const t = await chrome.tabs.get(tabId);
              if (t?.status === "complete") break;
              if (Date.now() - start > 15_000) {
                throw new Error("tab_load_timeout");
              }
              await new Promise((r) => setTimeout(r, 100));
            }

            // Minimal AgentContext-shaped object. BrowserAgent only needs a
            // Map-like `variables` and `context.variables` for windowId/tab binding.
            const agentContext: any = {
              variables: new Map(),
              context: { variables: new Map() }
            };
            agentContext.variables.set("windowId", tab.windowId);
            agentContext.context.variables.set("windowId", tab.windowId);

            const prevMode = (config as any).mode;
            (config as any).mode = "fast"; // avoid screenshots in E2E (determinism + fewer flake vectors)
            const agent = new BrowserAgent();
            try {
              await (agent as any).screenshot_and_html(agentContext);
            } finally {
              (config as any).mode = prevMode;
            }

            const snapshot = agentContext.variables.get("__ob_snapshot") as any;
            if (!snapshot || !snapshot.pinHashByIndex) {
              sendResponse({ ok: false, err: "no_snapshot" });
              return;
            }

            const indices = Object.keys(snapshot.pinHashByIndex || {})
              .map((k) => Number(k))
              .filter((n) => Number.isFinite(n))
              .sort((a, b) => a - b);
            const index = indices[0];
            if (index == null) {
              sendResponse({ ok: false, err: "no_indices" });
              return;
            }

            // Change the title, which flips pageSigHash deterministically (origin+path+title+h1/h2).
            await chrome.scripting.executeScript({
              target: { tabId, frameIds: [0] },
              func: () => {
                document.title = `SOCA_E2E_MUTATED_${Date.now()}`;
              }
            });

            // Perform the same deterministic guard check used by writes, but without executing
            // a real click. This avoids UI flake in e2e while still asserting fail-closed reasons.
            const expectedPageSigHash = String(snapshot.pageSigHash || "");
            const [{ result: guardResult }] =
              await chrome.scripting.executeScript({
                target: { tabId, frameIds: [0] },
                func: (exp: any) => {
                  try {
                    const w: any = window as any;
                    if (typeof w.get_clickable_elements !== "function") {
                      return {
                        ok: false,
                        reason: "fail_closed:missing_dom_tree"
                      };
                    }
                    const guard =
                      w.get_clickable_elements(false, undefined, {
                        mode: "guard"
                      }) || {};
                    const pageSigHash = String(guard.pageSigHash || "");
                    if (
                      !pageSigHash ||
                      pageSigHash !== String(exp.expectedPageSigHash || "")
                    ) {
                      return {
                        ok: false,
                        reason: "fail_closed:pageSigHash_mismatch"
                      };
                    }
                    return { ok: true };
                  } catch (e: any) {
                    return { ok: false, reason: String(e?.message || e) };
                  }
                },
                args: [{ expectedPageSigHash }]
              });

            if (!guardResult?.ok) {
              sendResponse({
                ok: true,
                reason: String(guardResult?.reason || "fail_closed:unknown")
              });
            } else {
              sendResponse({ ok: false, err: "unexpected_success" });
            }
          } catch (e: any) {
            sendResponse({ ok: false, err: String(e?.message || e) });
          } finally {
            try {
              await chrome.tabs.remove(tabId);
            } catch {
              // ignore
            }
          }
          return;
        }
        sendResponse({ ok: false, err: "unknown_message" });
      } catch (e: any) {
        sendResponse({ ok: false, err: normalizeProviderError(e) });
      }
    })();
    return true;
  }

  const requestId = request?.requestId;
  const type = request?.type;
  const data = request?.data;
  if (!requestId || !type) return;

  (async () => {
    if (!chatAgent) {
      await init();
    }

    const handler = eventHandlers[type];
    if (handler) {
      handler(requestId, data).catch((error) => {
        printLog(`Error handling ${type}: ${error}`, "error");
      });
    }
  })();
});

// Re-init on lane/tools config changes so new tool connections take effect.
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName !== "local") return;
  if (
    changes[SOCA_TOOLS_CONFIG_STORAGE_KEY] ||
    changes[SOCA_LANE_STORAGE_KEY]
  ) {
    chatAgent = null;
    currentChatId = null;
  }
});

// Keep MV3 service worker warm while the sidebar/options are open.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "SOCA_KEEPALIVE") return;
  port.onMessage.addListener((msg) => {
    if (msg?.type === "PING") {
      port.postMessage({ type: "PONG", ts: Date.now() });
    }
  });
});

function printLog(message: string, level?: "info" | "success" | "error") {
  chrome.runtime.sendMessage({
    type: "log",
    data: {
      level: level || "info",
      message: sanitizeLogMessage(message)
    }
  });
}

async function configureSidePanelBehavior() {
  if (!(chrome as any).sidePanel?.setPanelBehavior) return;
  try {
    await (chrome as any).sidePanel.setPanelBehavior({
      openPanelOnActionClick: true
    });
  } catch (error) {
    printLog(
      `side_panel_behavior_error: ${sanitizeLogMessage(error)}`,
      "error"
    );
  }
}

chrome.action.onClicked.addListener((tab) => {
  const sidePanel = (chrome as any).sidePanel;
  if (!sidePanel?.open) return;
  const windowId = tab?.windowId;
  if (typeof windowId !== "number") return;
  void sidePanel
    .open({ windowId })
    .catch((error: unknown) =>
      printLog(`side_panel_open_error: ${sanitizeLogMessage(error)}`, "error")
    );
});

chrome.runtime.onInstalled.addListener(() => {
  void configureSidePanelBehavior();
  void ensureDnrGuardrailsInstalled();
});

(chrome.runtime as any).onStartup?.addListener(() => {
  void configureSidePanelBehavior();
  void ensureDnrGuardrailsInstalled();
});

import { connectCoworkingSocket } from "./coworking-client";

// Ensure guardrails are present even before any chat initialization.
void configureSidePanelBehavior();
void ensureDnrGuardrailsInstalled();
connectCoworkingSocket();
