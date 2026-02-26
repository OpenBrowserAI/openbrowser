import React, { useState, useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { Form, Input, Button, message, Select, Spin, Switch, Alert } from "antd";
import { SaveOutlined, LoadingOutlined } from "@ant-design/icons";
import "../sidebar/index.css";
import { ThemeProvider } from "../sidebar/providers/ThemeProvider";
import {
  fetchModelsData,
  getProvidersWithImageSupport,
  providersToOptions,
  modelsToOptions,
  getDefaultBaseURL,
  type SocaOpenBrowserLane
} from "../llm/llm";
import type {
  Provider,
  ProviderOption,
  ModelOption
} from "../llm/llm.interface";

const { Option } = Select;
const SOCA_LANE_STORAGE_KEY = "socaOpenBrowserLane";
const DEFAULT_SOCA_LANE: SocaOpenBrowserLane = "OB_OFFLINE";
const SOCA_PROVIDER_SECRETS_SESSION_KEY = "socaProviderSecretsSession";
const SOCA_GOOGLE_OAUTH_SESSION_KEY = "socaGoogleOAuthSession";
const GOOGLE_OAUTH_DEFAULT_SCOPE =
  "https://www.googleapis.com/auth/generative-language";
type ProviderPolicyMode = "local_only" | "all_providers_bridge_governed";
const SOCA_PROVIDER_POLICY_MODE_KEY = "socaProviderPolicyMode";
const SOCA_DIRECT_PROVIDER_GATE_KEY = "socaOpenBrowserAllowDirectProviders";
const DEFAULT_PROVIDER_POLICY_MODE: ProviderPolicyMode =
  "all_providers_bridge_governed";
const SOCA_BRIDGE_AUTO_FALLBACK_OLLAMA_KEY = "socaBridgeAutoFallbackOllama";
const DIRECT_PROVIDER_HOST_PERMISSIONS = [
  "https://api.openai.com/*",
  "https://api.anthropic.com/*",
  "https://generativelanguage.googleapis.com/*",
  "https://oauth2.googleapis.com/*",
  "https://*.openai.azure.com/*",
  "https://bedrock-runtime.*.amazonaws.com/*"
];
const BRIDGE_ROUTED_PROVIDER_IDS = new Set(["soca-bridge", "openrouter"]);
const DIRECT_PROVIDER_IDS = new Set([
  "openai",
  "anthropic",
  "google",
  "opencode-zen",
  "azure",
  "bedrock"
]);

function normalizeProviderPolicyMode(value: unknown): ProviderPolicyMode {
  return value === "local_only"
    ? "local_only"
    : "all_providers_bridge_governed";
}

function runtimeSendMessage<TResp = any>(msg: any): Promise<TResp> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (resp) => {
      const err = chrome.runtime.lastError;
      if (err) return reject(new Error(String(err.message || err)));
      resolve(resp as TResp);
    });
  });
}

type ProviderAuthMode = "api_key" | "oauth";

type GoogleOAuthStatus = {
  connected: boolean;
  expiresAt: number;
  issuedAt: number;
  scope?: string;
  hasClientId?: boolean;
};

function normalizeAuthMode(value: unknown): ProviderAuthMode {
  return String(value || "").trim().toLowerCase() === "oauth"
    ? "oauth"
    : "api_key";
}

async function getProviderSessionSecret(providerId: string): Promise<string> {
  const key = String(providerId || "").trim().toLowerCase();
  if (!key) return "";
  const sess = await (chrome.storage as any).session.get([
    SOCA_PROVIDER_SECRETS_SESSION_KEY
  ]);
  const map = (sess?.[SOCA_PROVIDER_SECRETS_SESSION_KEY] || {}) as Record<
    string,
    string
  >;
  return String(map?.[key] || "").trim();
}

async function setProviderSessionSecret(
  providerId: string,
  secret: string
): Promise<void> {
  const key = String(providerId || "").trim().toLowerCase();
  if (!key) return;
  const sess = await (chrome.storage as any).session.get([
    SOCA_PROVIDER_SECRETS_SESSION_KEY
  ]);
  const map = {
    ...((sess?.[SOCA_PROVIDER_SECRETS_SESSION_KEY] || {}) as Record<
      string,
      string
    >)
  };
  const value = String(secret || "").trim();
  if (value) {
    map[key] = value;
  } else {
    delete map[key];
  }
  await (chrome.storage as any).session.set({
    [SOCA_PROVIDER_SECRETS_SESSION_KEY]: map
  });
}

function parseIPv4(hostname: string): [number, number, number, number] | null {
  const parts = hostname.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return nums as [number, number, number, number];
}

function isPrivateIPv4(hostname: string): boolean {
  const ip = parseIPv4(hostname);
  if (!ip) return false;
  const [a, b] = ip;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isLocalHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "::1") return true;
  return hostname === "127.0.0.1" || isPrivateIPv4(hostname);
}

function isLocalBaseURL(url: string): boolean {
  try {
    const u = new URL(url);
    return isLocalHost(u.hostname);
  } catch {
    return false;
  }
}

async function ensureOriginPermission(baseURL: string): Promise<boolean> {
  if (!chrome.permissions?.contains || !chrome.permissions?.request) return true;
  let originPattern = "";
  try {
    const url = new URL(baseURL);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    originPattern = `${url.origin}/*`;
  } catch {
    return false;
  }
  const hasPermission = await new Promise<boolean>((resolve) => {
    chrome.permissions?.contains({ origins: [originPattern] }, (result) =>
      resolve(Boolean(result))
    );
  });
  if (hasPermission) return true;
  const granted = await new Promise<boolean>((resolve) => {
    chrome.permissions?.request({ origins: [originPattern] }, (result) =>
      resolve(Boolean(result))
    );
  });
  return granted;
}

const OptionsPage = () => {
  const [form] = Form.useForm();

  const [laneLoaded, setLaneLoaded] = useState(false);
  const [socaOpenBrowserLane, setSocaOpenBrowserLane] =
    useState<SocaOpenBrowserLane>(DEFAULT_SOCA_LANE);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [providerPolicyMode, setProviderPolicyMode] =
    useState<ProviderPolicyMode>(DEFAULT_PROVIDER_POLICY_MODE);
  const [autoFallbackOllama, setAutoFallbackOllama] = useState(true);
  const [useCustomModelName, setUseCustomModelName] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<{
    state: "idle" | "checking" | "ok" | "warn" | "error";
    message: string;
  }>({ state: "idle", message: "" });

  const [config, setConfig] = useState({
    llm: "ollama",
    authMode: "api_key" as ProviderAuthMode,
    oauthClientId: "",
    oauthScopes: GOOGLE_OAUTH_DEFAULT_SCOPE,
    apiKey: "",
    modelName: "qwen3-vl:2b",
    npm: "@ai-sdk/openai-compatible",
    options: {
      baseURL: "http://127.0.0.1:11434/v1"
    }
  });

  const [historyLLMConfig, setHistoryLLMConfig] = useState<Record<string, any>>(
    {}
  );

  const [loading, setLoading] = useState(true);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [googleOAuthStatus, setGoogleOAuthStatus] = useState<GoogleOAuthStatus>(
    {
      connected: false,
      expiresAt: 0,
      issuedAt: 0,
      scope: GOOGLE_OAUTH_DEFAULT_SCOPE
    }
  );
  const [refreshingModels, setRefreshingModels] = useState(false);
  const [modelsCacheStatus, setModelsCacheStatus] = useState("");
  const [providersData, setProvidersData] = useState<Record<string, Provider>>(
    {}
  );
  const [providerOptions, setProviderOptions] = useState<ProviderOption[]>([]);
  const [modelOptions, setModelOptions] = useState<
    Record<string, ModelOption[]>
  >({});
  const [modelSearchValue, setModelSearchValue] = useState("");
  const [isDarkMode, setIsDarkMode] = useState(
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  const watchedProvider = Form.useWatch("llm", form);
  const watchedAuthMode = Form.useWatch("authMode", form);
  const watchedBaseURL = Form.useWatch(["options", "baseURL"], form);

  // Listen for theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => setIsDarkMode(e.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  // Update favicon based on theme
  useEffect(() => {
    const favicon = document.getElementById("favicon") as HTMLLinkElement;
    if (favicon) {
      favicon.href = isDarkMode ? "/icon_dark.png" : "/icon_light.png";
    }
  }, [isDarkMode]);

  // Load lane on mount
  useEffect(() => {
    const loadLane = async () => {
      try {
        const laneResult = await chrome.storage.local.get([
          SOCA_LANE_STORAGE_KEY
        ]);
        const lane =
          (laneResult[SOCA_LANE_STORAGE_KEY] as SocaOpenBrowserLane) ||
          DEFAULT_SOCA_LANE;
        setSocaOpenBrowserLane(lane);
        form.setFieldsValue({ [SOCA_LANE_STORAGE_KEY]: lane });
      } catch (error) {
        console.error("Failed to load lane:", error);
        message.error("Failed to load lane. Please refresh the page.");
      }
    };

    loadLane().finally(() => setLaneLoaded(true));
  }, []);

  useEffect(() => {
    const loadProviderPolicyState = async () => {
      try {
        const runtimeState = await runtimeSendMessage<any>({
          type: "SOCA_GET_PROVIDER_POLICY_STATE"
        });
        if (runtimeState?.ok) {
          setProviderPolicyMode(
            normalizeProviderPolicyMode(runtimeState.mode)
          );
          setAutoFallbackOllama(runtimeState.autoFallbackOllama !== false);
          return;
        }
      } catch (error) {
        console.warn("Failed to load provider policy state from runtime:", error);
      }

      // Fallback path when runtime bridge API is unavailable.
      try {
        const result = await chrome.storage.local.get([
          SOCA_PROVIDER_POLICY_MODE_KEY,
          SOCA_DIRECT_PROVIDER_GATE_KEY,
          SOCA_BRIDGE_AUTO_FALLBACK_OLLAMA_KEY
        ]);
        const storedMode = result[SOCA_PROVIDER_POLICY_MODE_KEY];
        let mode = normalizeProviderPolicyMode(storedMode);
        if (
          storedMode !== "local_only" &&
          storedMode !== "all_providers_bridge_governed"
        ) {
          const legacy = result[SOCA_DIRECT_PROVIDER_GATE_KEY];
          if (typeof legacy === "boolean") {
            mode = legacy
              ? "all_providers_bridge_governed"
              : "local_only";
          }
        }
        setProviderPolicyMode(mode);
        setAutoFallbackOllama(
          result[SOCA_BRIDGE_AUTO_FALLBACK_OLLAMA_KEY] !== false
        );
      } catch (error) {
        console.warn("Failed to load provider policy state:", error);
      }
    };
    loadProviderPolicyState();
  }, []);

  // Fetch models data whenever lane changes
  useEffect(() => {
    if (!laneLoaded) return;

    const loadModels = async () => {
      try {
        setLoading(true);

        const data = await fetchModelsData({ lane: socaOpenBrowserLane });
        const imageProviders = getProvidersWithImageSupport(data);

        setProvidersData(imageProviders);
        setProviderOptions(providersToOptions(imageProviders));

        // Convert all provider models to options
        const allModelOptions: Record<string, ModelOption[]> = {};
        Object.entries(imageProviders).forEach(([providerId, provider]) => {
          allModelOptions[providerId] = modelsToOptions(
            provider.models,
            providerId
          );
        });
        setModelOptions(allModelOptions);
      } catch (error) {
        console.error("Failed to load models:", error);
        message.error("Failed to load models. Please refresh the page.");
      } finally {
        setLoading(false);
      }
    };

    loadModels();
  }, [laneLoaded, socaOpenBrowserLane]);

  // Load saved config from storage
  useEffect(() => {
    if (!laneLoaded) return;
    if (Object.keys(providersData).length === 0) return; // Wait for providers to load

    const loadSavedConfig = async () => {
      form.setFieldsValue({ [SOCA_LANE_STORAGE_KEY]: socaOpenBrowserLane });

      const fallbackProviderId =
        Object.entries(providersData)
          .map(([id, provider]) => ({ id, name: provider.name }))
          .sort((a, b) => a.name.localeCompare(b.name))[0]?.id || "ollama";

      if (!configLoaded) {
        const result = await chrome.storage.local.get([
          "llmConfig",
          "historyLLMConfig",
          "socaBridgeConfig"
        ]);

        if (result.historyLLMConfig) {
          setHistoryLLMConfig(result.historyLLMConfig);
        }

        if (result.llmConfig) {
          const nextConfig = {
            ...result.llmConfig,
            authMode: normalizeAuthMode(result.llmConfig?.authMode),
            oauthClientId: String(result.llmConfig?.oauthClientId || "").trim(),
            oauthScopes: String(
              result.llmConfig?.oauthScopes || GOOGLE_OAUTH_DEFAULT_SCOPE
            )
              .trim()
              .replace(/\s+/g, " ")
          } as any;

          if (nextConfig.llm === "") {
            nextConfig.llm = fallbackProviderId;
          }

          if (!providersData[nextConfig.llm]) {
            nextConfig.llm = fallbackProviderId;
          }

          if (!nextConfig.npm && providersData[nextConfig.llm]) {
            nextConfig.npm = providersData[nextConfig.llm].npm;
          }

          if (
            !nextConfig.modelName ||
            !modelOptions[nextConfig.llm]?.some(
              (m) => m.value === nextConfig.modelName
            )
          ) {
            nextConfig.modelName = modelOptions[nextConfig.llm]?.[0]?.value || "";
          }

          if (!nextConfig.options?.baseURL) {
            nextConfig.options = {
              ...nextConfig.options,
              baseURL: getDefaultBaseURL(
                nextConfig.llm,
                providersData[nextConfig.llm]?.api
              )
            };
          }

          const isBridgeRoutedProvider = BRIDGE_ROUTED_PROVIDER_IDS.has(
            String(nextConfig.llm || "")
          );
          if (
            isBridgeRoutedProvider &&
            typeof result.socaBridgeConfig?.bridgeBaseURL === "string" &&
            result.socaBridgeConfig.bridgeBaseURL.trim()
          ) {
            nextConfig.options = {
              ...nextConfig.options,
              baseURL: `${result.socaBridgeConfig.bridgeBaseURL.replace(/\/+$/, "")}/v1`
            };
          } else if (
            isBridgeRoutedProvider &&
            !isLocalBaseURL(String(nextConfig.options?.baseURL || ""))
          ) {
            nextConfig.options = {
              ...nextConfig.options,
              baseURL: "http://127.0.0.1:9834/v1"
            };
          }

          // Never persist provider secrets in local state.
          nextConfig.apiKey = "";
          setConfig(nextConfig);
          form.setFieldsValue(nextConfig);

          const selectedProvider = String(nextConfig.llm || "");
          if (selectedProvider === "google") {
            try {
              const oauthStatus = await runtimeSendMessage<any>({
                type: "SOCA_OAUTH_GOOGLE_STATUS"
              });
              if (oauthStatus?.ok) {
                setGoogleOAuthStatus({
                  connected: Boolean(oauthStatus?.data?.connected),
                  expiresAt: Number(oauthStatus?.data?.expiresAt || 0),
                  issuedAt: Number(oauthStatus?.data?.issuedAt || 0),
                  scope:
                    String(oauthStatus?.data?.scope || "").trim() ||
                    GOOGLE_OAUTH_DEFAULT_SCOPE
                });
              }
            } catch {
              // ignore oauth status failures during bootstrap
            }
          }
        }

        // Session-only secret prefill (never persisted).
        try {
          const selectedProvider = String(result.llmConfig?.llm || "");
          if (BRIDGE_ROUTED_PROVIDER_IDS.has(selectedProvider)) {
            const sess = await (chrome.storage as any).session.get([
              "socaBridgeToken"
            ]);
            if (sess?.socaBridgeToken) {
              form.setFieldValue("apiKey", String(sess.socaBridgeToken));
            }
          } else if (selectedProvider) {
            const secret = await getProviderSessionSecret(selectedProvider);
            if (secret) {
              form.setFieldValue("apiKey", secret);
            }
          }
        } catch (e) {
          // ignore
        }

        setConfigLoaded(true);
        return;
      }

      // On lane/provider refresh: only adjust config if it's now invalid.
      if (!providersData[config.llm]) {
        handleLLMChange(fallbackProviderId);
        return;
      }
      if (
        config.modelName &&
        !modelOptions[config.llm]?.some((m) => m.value === config.modelName)
      ) {
        const nextModel = modelOptions[config.llm]?.[0]?.value || "";
        const nextConfig = { ...config, modelName: nextModel };
        setConfig(nextConfig);
        form.setFieldsValue(nextConfig);
      }
    };

    loadSavedConfig().catch((error) => {
      console.error("Failed to load saved config:", error);
    });
  }, [
    laneLoaded,
    providersData,
    configLoaded,
    socaOpenBrowserLane,
    config,
    modelOptions
  ]);

  useEffect(() => {
    if (!configLoaded) return;
    const options = modelOptions[config.llm] || [];
    const isCustom =
      Boolean(config.modelName) &&
      !options.some((m) => m.value === config.modelName);
    setUseCustomModelName(isCustom);
  }, [configLoaded, config.llm, config.modelName, modelOptions]);

  useEffect(() => {
    setBridgeStatus({ state: "idle", message: "" });
    setModelsCacheStatus("");
  }, [watchedProvider, config.llm]);

  useEffect(() => {
    const provider = String(watchedProvider || config.llm || "");
    const authMode = normalizeAuthMode(watchedAuthMode || config.authMode);
    if (provider !== "google" || authMode !== "oauth") return;
    runtimeSendMessage<any>({
      type: "SOCA_OAUTH_GOOGLE_STATUS"
    })
      .then((resp) => {
        if (!resp?.ok) return;
        setGoogleOAuthStatus({
          connected: Boolean(resp?.data?.connected),
          expiresAt: Number(resp?.data?.expiresAt || 0),
          issuedAt: Number(resp?.data?.issuedAt || 0),
          scope:
            String(resp?.data?.scope || "").trim() ||
            GOOGLE_OAUTH_DEFAULT_SCOPE
        });
      })
      .catch(() => {});
  }, [watchedProvider, watchedAuthMode, config.llm, config.authMode]);

  const handleSocaLaneChange = (lane: SocaOpenBrowserLane) => {
    setSocaOpenBrowserLane(lane);
  };

  const handleProviderPolicyToggle = async (next: boolean) => {
    try {
      const nextMode: ProviderPolicyMode = next
        ? "all_providers_bridge_governed"
        : "local_only";
      if (next) {
        const granted = await new Promise<boolean>((resolve) => {
          if (!chrome.permissions?.request) return resolve(true);
          chrome.permissions.request(
            { origins: DIRECT_PROVIDER_HOST_PERMISSIONS },
            (result) => resolve(Boolean(result))
          );
        });
        if (!granted) {
          message.error("Direct provider permissions were denied.");
          return;
        }
      }
      if (!next && chrome.permissions?.remove) {
        await new Promise<void>((resolve) => {
          chrome.permissions?.remove(
            { origins: DIRECT_PROVIDER_HOST_PERMISSIONS },
            () => resolve()
          );
        });
      }
      setProviderPolicyMode(nextMode);
      await chrome.storage.local.set({
        [SOCA_PROVIDER_POLICY_MODE_KEY]: nextMode,
        [SOCA_DIRECT_PROVIDER_GATE_KEY]:
          nextMode === "all_providers_bridge_governed"
      });
      await runtimeSendMessage({
        type: "SOCA_SET_PROVIDER_POLICY_MODE",
        mode: nextMode
      });
      await runtimeSendMessage({ type: "SOCA_REFRESH_DNR" });
    } catch (error) {
      console.error("Failed to update provider policy mode:", error);
      message.error("Failed to update provider policy mode.");
    }
  };

  const handleAutoFallbackToggle = async (next: boolean) => {
    try {
      setAutoFallbackOllama(next);
      await chrome.storage.local.set({
        [SOCA_BRIDGE_AUTO_FALLBACK_OLLAMA_KEY]: next
      });
      await runtimeSendMessage({
        type: "SOCA_SET_BRIDGE_AUTO_FALLBACK_OLLAMA",
        enabled: next
      });
    } catch (error) {
      console.error("Failed to update bridge fallback setting:", error);
      message.error("Failed to update bridge fallback setting.");
    }
  };

  const applyProviderModels = (
    providerId: string,
    models: Array<{
      id?: string;
      name?: string;
      input_modalities?: unknown;
      output_modalities?: unknown;
    }>
  ): ModelOption[] => {
    if (!providerId || !providersData[providerId]) return [];
    const provider = providersData[providerId];
    const nextProviderModels = {
      ...provider.models
    };
    for (const m of models || []) {
      const id = String(m?.id || "").trim();
      if (!id) continue;
      const name = String(m?.name || id).trim() || id;
      const input = Array.isArray(m?.input_modalities)
        ? (m.input_modalities as unknown[]).map((v) => String(v))
        : ["text", "image"];
      const output = Array.isArray(m?.output_modalities)
        ? (m.output_modalities as unknown[]).map((v) => String(v))
        : ["text"];
      nextProviderModels[id] = {
        id,
        name,
        modalities: {
          input,
          output
        }
      };
    }
    const nextProviders = {
      ...providersData,
      [providerId]: {
        ...provider,
        models: nextProviderModels
      }
    };
    const nextOptions = modelsToOptions(nextProviderModels, providerId);
    setProvidersData(nextProviders);
    setModelOptions({
      ...modelOptions,
      [providerId]: nextOptions
    });
    return nextOptions;
  };

  const handleRefreshModels = async (force = true) => {
    const providerId = String(
      form.getFieldValue("llm") || config.llm || ""
    ).trim();
    if (!providerId) return;
    try {
      setRefreshingModels(true);
      setModelsCacheStatus("");
      const authMode = normalizeAuthMode(
        form.getFieldValue("authMode") || config.authMode
      );
      const baseURL = String(
        form.getFieldValue(["options", "baseURL"]) ||
          config.options?.baseURL ||
          ""
      ).trim();
      const resp = await runtimeSendMessage<any>({
        type: "SOCA_PROVIDER_MODELS_REFRESH",
        providerId,
        authMode,
        baseURL,
        force
      });
      if (!resp?.ok) {
        throw new Error(String(resp?.err || "provider_models_refresh_failed"));
      }
      const data = resp?.data || {};
      const models = Array.isArray(data.models) ? data.models : [];
      const nextOptions = applyProviderModels(providerId, models);
      const updatedAt = Number(data.updatedAt || Date.now());
      const expiresAt = Number(data.expiresAt || updatedAt);
      const source = data.fromCache ? "cache" : "live";
      const ttlSec = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
      setModelsCacheStatus(
        `Models loaded from ${source}. ${models.length} entries. Cache TTL ~${ttlSec}s.`
      );
      if (providerId === String(form.getFieldValue("llm") || "")) {
        const currentModel = String(form.getFieldValue("modelName") || "");
        if (
          nextOptions.length &&
          !nextOptions.some((m) => m.value === currentModel)
        ) {
          form.setFieldValue("modelName", nextOptions[0].value);
        }
      }
    } catch (error: any) {
      setModelsCacheStatus("");
      message.error(String(error?.message || error || "Model refresh failed"));
    } finally {
      setRefreshingModels(false);
    }
  };

  const handleGoogleOAuthConnect = async () => {
    try {
      setOauthLoading(true);
      const clientId = String(form.getFieldValue("oauthClientId") || "").trim();
      const scopes = String(
        form.getFieldValue("oauthScopes") || GOOGLE_OAUTH_DEFAULT_SCOPE
      )
        .trim()
        .replace(/\s+/g, " ");
      if (!clientId) {
        throw new Error("Google OAuth Client ID is required.");
      }
      const resp = await runtimeSendMessage<any>({
        type: "SOCA_OAUTH_GOOGLE_START",
        clientId,
        scopes
      });
      if (!resp?.ok) {
        throw new Error(String(resp?.err || "google_oauth_start_failed"));
      }
      const statusResp = await runtimeSendMessage<any>({
        type: "SOCA_OAUTH_GOOGLE_STATUS"
      });
      if (statusResp?.ok) {
        setGoogleOAuthStatus({
          connected: Boolean(statusResp?.data?.connected),
          expiresAt: Number(statusResp?.data?.expiresAt || 0),
          issuedAt: Number(statusResp?.data?.issuedAt || 0),
          scope:
            String(statusResp?.data?.scope || "").trim() ||
            GOOGLE_OAUTH_DEFAULT_SCOPE
        });
      }
      message.success("Google OAuth connected for this browser session.");
    } catch (error: any) {
      message.error(String(error?.message || error || "Google OAuth failed."));
    } finally {
      setOauthLoading(false);
    }
  };

  const handleGoogleOAuthClear = async () => {
    try {
      setOauthLoading(true);
      const resp = await runtimeSendMessage<any>({
        type: "SOCA_OAUTH_GOOGLE_CLEAR"
      });
      if (!resp?.ok) {
        throw new Error(String(resp?.err || "google_oauth_clear_failed"));
      }
      await (chrome.storage as any).session.remove([SOCA_GOOGLE_OAUTH_SESSION_KEY]);
      setGoogleOAuthStatus({
        connected: false,
        expiresAt: 0,
        issuedAt: 0,
        scope: GOOGLE_OAUTH_DEFAULT_SCOPE
      });
      message.success("Google OAuth token cleared for this browser session.");
    } catch (error: any) {
      message.error(
        String(error?.message || error || "Failed to clear Google OAuth token.")
      );
    } finally {
      setOauthLoading(false);
    }
  };

  const handleSave = () => {
    (async () => {
      try {
        const value = await form.validateFields();
        const { socaOpenBrowserLane, ...llmConfigValue } = value as any;
        const lane =
          (socaOpenBrowserLane as SocaOpenBrowserLane) || DEFAULT_SOCA_LANE;
        const allProvidersEnabled =
          providerPolicyMode === "all_providers_bridge_governed";
        const providerId = String(llmConfigValue.llm || "").trim();
        const authMode = normalizeAuthMode(llmConfigValue.authMode);
        llmConfigValue.authMode = authMode;
        llmConfigValue.oauthClientId = String(
          llmConfigValue.oauthClientId || ""
        ).trim();
        llmConfigValue.oauthScopes = String(
          llmConfigValue.oauthScopes || GOOGLE_OAUTH_DEFAULT_SCOPE
        )
          .trim()
          .replace(/\s+/g, " ");

        const baseURL = String(llmConfigValue?.options?.baseURL || "").trim();
        if (baseURL) {
          const providerMeta = providersData[providerId];
          const providerNpm = String(
            providerMeta?.npm || llmConfigValue.npm || ""
          );
          const bridgeRouted = BRIDGE_ROUTED_PROVIDER_IDS.has(providerId);
          const isCompatProvider = providerNpm === "@ai-sdk/openai-compatible";
          const compatLocal = isCompatProvider && isLocalBaseURL(baseURL);
          const isDirectProvider =
            (!bridgeRouted &&
              DIRECT_PROVIDER_IDS.has(providerId)) ||
            (isCompatProvider && !compatLocal);

          if (isDirectProvider && !allProvidersEnabled) {
            throw new Error(
              "Cloud providers are disabled by policy mode. Enable 'All providers' to continue."
            );
          }

          const granted = await ensureOriginPermission(baseURL);
          if (!granted) {
            throw new Error(
              "Host permission required for this Base URL. Please allow the permission prompt."
            );
          }
        }

        // Session-only bridge token (never persisted to chrome.storage.local).
        if (BRIDGE_ROUTED_PROVIDER_IDS.has(providerId)) {
          const token = String(llmConfigValue.apiKey || "").trim();
          const r1 = await runtimeSendMessage<any>({
            type: "SOCA_SET_BRIDGE_TOKEN",
            token
          });
          if (!r1?.ok)
            throw new Error(String(r1?.err || "failed_to_set_bridge_token"));

          const currentBaseURL = String(
            llmConfigValue?.options?.baseURL || ""
          ).trim();
          const loadedBridgeCfg = await chrome.storage.local.get([
            "socaBridgeConfig"
          ]);
          const previousBridgeBaseURL = String(
            loadedBridgeCfg?.socaBridgeConfig?.bridgeBaseURL ||
              "http://127.0.0.1:9834"
          ).trim();

          const candidateBridgeBaseURL = currentBaseURL
            .replace(/\/+$/, "")
            .replace(/\/v1$/, "");
          const bridgeBaseURL =
            candidateBridgeBaseURL &&
            isLocalBaseURL(candidateBridgeBaseURL)
              ? candidateBridgeBaseURL
              : previousBridgeBaseURL;

          const r2 = await runtimeSendMessage<any>({
            type: "SOCA_SET_BRIDGE_CONFIG",
            config: { bridgeBaseURL, dnrGuardrailsEnabled: true }
          });
          if (!r2?.ok)
            throw new Error(String(r2?.err || "failed_to_set_bridge_config"));

          llmConfigValue.options = {
            ...llmConfigValue.options,
            baseURL: `${bridgeBaseURL.replace(/\/+$/, "")}/v1`
          };
          await setProviderSessionSecret(providerId, token);
          if (providerId === "openrouter") {
            await setProviderSessionSecret("soca-bridge", token);
          }
        } else {
          const token = String(llmConfigValue.apiKey || "").trim();
          const providerNpm = String(llmConfigValue.npm || "").trim();
          const isCompatProvider = providerNpm === "@ai-sdk/openai-compatible";
          const isCompatLocal = isCompatProvider && isLocalBaseURL(baseURL);
          const isDirectProvider =
            DIRECT_PROVIDER_IDS.has(providerId) ||
            (isCompatProvider && !isCompatLocal);

          if (isDirectProvider && authMode === "api_key" && !token) {
            throw new Error("API key required for this provider.");
          }
          if (providerId === "google" && authMode === "oauth") {
            if (!llmConfigValue.oauthClientId) {
              throw new Error("Google OAuth Client ID is required.");
            }
            const oauthStatus = await runtimeSendMessage<any>({
              type: "SOCA_OAUTH_GOOGLE_STATUS"
            });
            if (!oauthStatus?.ok || !oauthStatus?.data?.connected) {
              throw new Error(
                "Google OAuth token missing. Click Connect before saving."
              );
            }
          }
          if (providerId === "opencode-zen" && authMode === "oauth" && !token) {
            throw new Error(
              "OAuth bearer token required for Opencode Zen token mode."
            );
          }
          await setProviderSessionSecret(providerId, token);
        }

        // Persist non-secret config only.
        llmConfigValue.apiKey = "";
        setConfig(llmConfigValue);
        setHistoryLLMConfig({
          ...historyLLMConfig,
          [llmConfigValue.llm]: llmConfigValue
        });
        setSocaOpenBrowserLane(lane);

        await chrome.storage.local.set({
          llmConfig: llmConfigValue,
          historyLLMConfig: {
            ...historyLLMConfig,
            [llmConfigValue.llm]: llmConfigValue
          },
          [SOCA_LANE_STORAGE_KEY]: lane
        });
        await runtimeSendMessage({ type: "SOCA_REFRESH_DNR" });

        message.success({
          content: "Save Success!",
          className: "toast-text-black"
        });
      } catch (e: any) {
        message.error(String(e?.message || e || "Please check the form field"));
      }
    })();
  };

  const handleLLMChange = (value: string) => {
    const provider = providersData[value];
    const defaultBaseURL = getDefaultBaseURL(value, provider?.api);
    const providerAuthModes =
      provider?.authModes && provider.authModes.length
        ? provider.authModes
        : ["api_key"];

    // Check if user has a saved config for this provider
    const savedConfig = historyLLMConfig[value];
    const bridgeRouted = BRIDGE_ROUTED_PROVIDER_IDS.has(value);
    const savedAuthMode = normalizeAuthMode(savedConfig?.authMode);
    const authMode = providerAuthModes.includes(savedAuthMode)
      ? savedAuthMode
      : (providerAuthModes[0] as ProviderAuthMode);
    const savedBaseURL = String(savedConfig?.options?.baseURL || "").trim();
    const baseURLToUse =
      bridgeRouted && savedBaseURL && !isLocalBaseURL(savedBaseURL)
        ? defaultBaseURL
        : savedBaseURL || defaultBaseURL;

    const newConfig = {
      llm: value,
      authMode,
      oauthClientId: String(savedConfig?.oauthClientId || "").trim(),
      oauthScopes: String(
        savedConfig?.oauthScopes || GOOGLE_OAUTH_DEFAULT_SCOPE
      )
        .trim()
        .replace(/\s+/g, " "),
      apiKey: "",
      modelName:
        savedConfig?.modelName || modelOptions[value]?.[0]?.value || "",
      npm: provider?.npm,
      options: {
        // Use saved base URL if it exists and is different from default, otherwise use default
        baseURL: baseURLToUse
      }
    };

    setConfig(newConfig);
    form.setFieldsValue(newConfig);
    setUseCustomModelName(false);

    if (BRIDGE_ROUTED_PROVIDER_IDS.has(value)) {
      (chrome.storage as any).session
        .get(["socaBridgeToken"])
        .then((sess: any) => {
          if (sess?.socaBridgeToken) {
            form.setFieldValue("apiKey", String(sess.socaBridgeToken));
          }
        })
        .catch(() => {});
    } else {
      getProviderSessionSecret(value)
        .then((secret) => {
          if (secret) {
            form.setFieldValue("apiKey", secret);
          } else {
            form.setFieldValue("apiKey", "");
          }
        })
        .catch(() => {});
    }
    if (value === "google" && authMode === "oauth") {
      runtimeSendMessage<any>({ type: "SOCA_OAUTH_GOOGLE_STATUS" })
        .then((resp) => {
          if (!resp?.ok) return;
          setGoogleOAuthStatus({
            connected: Boolean(resp?.data?.connected),
            expiresAt: Number(resp?.data?.expiresAt || 0),
            issuedAt: Number(resp?.data?.issuedAt || 0),
            scope:
              String(resp?.data?.scope || "").trim() ||
              GOOGLE_OAUTH_DEFAULT_SCOPE
          });
        })
        .catch(() => {});
    }
  };

  const handleCustomModelToggle = (next: boolean) => {
    setUseCustomModelName(next);
    if (!next) {
      const provider = String(form.getFieldValue("llm") || config.llm || "");
      const options = modelOptions[provider] || [];
      const nextModel = options[0]?.value || "";
      form.setFieldValue("modelName", nextModel);
    }
  };

  const handleResetBaseURL = () => {
    const provider = providersData[config.llm];
    const defaultBaseURL = getDefaultBaseURL(config.llm, provider?.api);

    const newConfig = {
      ...config,
      options: {
        ...config.options,
        baseURL: defaultBaseURL
      }
    };

    setConfig(newConfig);
    form.setFieldValue(["options", "baseURL"], defaultBaseURL);
    message.success({
      content: "Base URL reset to default",
      className: "toast-text-black"
    });
  };

  const handleBridgeCheck = async () => {
    const baseURL = String(
      form.getFieldValue(["options", "baseURL"]) ||
        config.options?.baseURL ||
        ""
    ).trim();
    if (!baseURL) {
      setBridgeStatus({
        state: "error",
        message: "Bridge Base URL is missing."
      });
      return;
    }

    const fetchWithTimeout = async (
      url: string,
      init: RequestInit,
      timeoutMs: number
    ) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(url, { ...init, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    };

    const trimmed = baseURL.replace(/\/+$/, "");
    const root = trimmed.endsWith("/v1")
      ? trimmed.slice(0, -3).replace(/\/+$/, "")
      : trimmed;
    const healthUrl = `${root}/health`;
    const modelsUrl = trimmed.endsWith("/v1")
      ? `${trimmed}/models`
      : `${root}/v1/models`;
    const statusUrl = `${root}/soca/bridge/status`;

    setBridgeStatus({ state: "checking", message: "Checking bridge..." });

    const summarizeBridgeStatus = (payload: any) => {
      const openrouterKeyPresent = Boolean(payload?.openrouter_key_present);
      const openrouterCount = Number(payload?.openrouter_models_count || 0);
      const mergedCount = Number(payload?.merged_models_count || 0);
      if (!openrouterKeyPresent) {
        return {
          state: "warn" as const,
          message:
            "Bridge reachable, but OPENROUTER_API_KEY is missing on the bridge host."
        };
      }
      if (openrouterCount <= 0) {
        return {
          state: "warn" as const,
          message:
            "Bridge reachable, but OpenRouter model catalog is empty. Check bridge host network/key."
        };
      }
      return {
        state: "ok" as const,
        message: `Bridge reachable. ${mergedCount} models available (${openrouterCount} from OpenRouter).`
      };
    };

    try {
      const formToken = String(form.getFieldValue("apiKey") || "").trim();
      if (!formToken) {
        try {
          const runtimeStatus = await runtimeSendMessage<any>({
            type: "SOCA_BRIDGE_GET_STATUS"
          });
          if (runtimeStatus?.ok && runtimeStatus?.data) {
            setBridgeStatus(summarizeBridgeStatus(runtimeStatus.data));
            return;
          }
        } catch {
          // Fallback to direct HTTP checks below.
        }
      }

      const healthResp = await fetchWithTimeout(healthUrl, {}, 4000);
      if (!healthResp.ok) {
        throw new Error(`health_http_${healthResp.status}`);
      }

      const token = formToken;
      if (!token) {
        setBridgeStatus({
          state: "warn",
          message:
            "Bridge reachable. Bridge token missing in this form or session."
        });
        return;
      }

      const statusResp = await fetchWithTimeout(
        statusUrl,
        { headers: { Authorization: `Bearer ${token}` } },
        6000
      );
      if (statusResp.ok) {
        const payload = await statusResp.json();
        setBridgeStatus(summarizeBridgeStatus(payload));
        return;
      }
      if (statusResp.status === 404) {
        const modelsResp = await fetchWithTimeout(
          modelsUrl,
          { headers: { Authorization: `Bearer ${token}` } },
          6000
        );
        if (modelsResp.ok) {
          const payload = await modelsResp.json();
          const count = Array.isArray(payload?.data) ? payload.data.length : 0;
          setBridgeStatus({
            state: "ok",
            message: `Bridge reachable. Token accepted. ${count} models returned.`
          });
          return;
        }
        if (modelsResp.status === 401 || modelsResp.status === 403) {
          setBridgeStatus({
            state: "warn",
            message: "Bridge reachable but token rejected."
          });
          return;
        }
        setBridgeStatus({
          state: "warn",
          message: `Bridge reachable but models endpoint returned ${modelsResp.status}.`
        });
        return;
      }
      if (statusResp.status === 401 || statusResp.status === 403) {
        setBridgeStatus({
          state: "warn",
          message: "Bridge reachable but token rejected."
        });
        return;
      }
      setBridgeStatus({
        state: "warn",
        message: `Bridge reachable but status endpoint returned ${statusResp.status}.`
      });
    } catch (error) {
      setBridgeStatus({
        state: "error",
        message:
          "Bridge unreachable. Ensure SOCA Bridge is running and Base URL is correct."
      });
    }
  };

  const providerId = String(watchedProvider || config.llm || "");
  const baseURL = String(watchedBaseURL || config.options?.baseURL || "");
  const providerMeta = providersData[providerId];
  const providerAuthModes =
    providerMeta?.authModes && providerMeta.authModes.length
      ? providerMeta.authModes
      : ["api_key"];
  const selectedAuthModeRaw = normalizeAuthMode(
    watchedAuthMode || config.authMode
  );
  const selectedAuthMode = providerAuthModes.includes(selectedAuthModeRaw)
    ? selectedAuthModeRaw
    : (providerAuthModes[0] as ProviderAuthMode);
  const providerNpm = String(providerMeta?.npm || config.npm || "");
  const bridgeRoutedProvider = BRIDGE_ROUTED_PROVIDER_IDS.has(providerId);
  const allProvidersEnabled =
    providerPolicyMode === "all_providers_bridge_governed";
  const isCompatProvider = providerNpm === "@ai-sdk/openai-compatible";
  const openaiCompatLocal = isCompatProvider && isLocalBaseURL(baseURL);
  const isDirectProvider =
    (!bridgeRoutedProvider && DIRECT_PROVIDER_IDS.has(providerId)) ||
    (isCompatProvider && !openaiCompatLocal);
  const directProviderBlocked = isDirectProvider && !allProvidersEnabled;
  const googleOAuthMode = providerId === "google" && selectedAuthMode === "oauth";
  const zenTokenMode =
    providerId === "opencode-zen" && selectedAuthMode === "oauth";
  const requiresApiKey =
    bridgeRoutedProvider ||
    (isDirectProvider && !openaiCompatLocal && !googleOAuthMode);
  const apiKeyLabel =
    bridgeRoutedProvider
      ? "Bridge Token (session-only)"
      : zenTokenMode
        ? "OAuth Bearer Token (session-only)"
      : requiresApiKey
        ? "API Key"
        : "API Key (optional)";
  const apiKeyPlaceholder =
    bridgeRoutedProvider
      ? "Paste bridge token"
      : zenTokenMode
        ? "Paste OAuth bearer token"
        : "Paste API key";
  const oauthExpiresLabel = useMemo(() => {
    if (!googleOAuthStatus?.expiresAt) return "";
    try {
      return new Date(googleOAuthStatus.expiresAt).toLocaleString();
    } catch {
      return "";
    }
  }, [googleOAuthStatus]);

  return (
    <div className="min-h-screen bg-theme-primary relative">
      {loading && (
        <div className="absolute inset-0 bg-theme-primary flex items-center justify-center z-50">
          <Spin
            indicator={
              <LoadingOutlined
                className="fill-theme-icon"
                style={{ fontSize: 48 }}
                spin
              />
            }
          />
        </div>
      )}
      {/* Header */}
      <div className="border-b border-theme-input bg-theme-primary">
        <div className="max-w-3xl mx-auto px-6 py-6">
          <div className="flex items-center gap-4">
            <img
              src={isDarkMode ? "/icon_dark.png" : "/icon_light.png"}
              alt="OpenBrowser Logo"
              className="w-12 h-12 radius-8px"
            />
            <div>
              <h1 className="text-2xl font-semibold text-theme-primary">
                Settings
              </h1>
              <p
                className="text-sm text-theme-primary mt-1"
                style={{ opacity: 0.7 }}
              >
                Configure your AI model preferences (vision models only)
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div
          className="bg-theme-primary border-theme-input rounded-xl p-6"
          style={{ borderWidth: "1px", borderStyle: "solid" }}
        >
          <Form
            form={form}
            layout="vertical"
            initialValues={{
              ...config,
              [SOCA_LANE_STORAGE_KEY]: socaOpenBrowserLane
            }}
          >
            <Form.Item
              name={SOCA_LANE_STORAGE_KEY}
              label={
                <span className="text-sm font-medium text-theme-primary">
                  SOCA Lane
                </span>
              }
              rules={[
                {
                  required: true,
                  message: "Please select a SOCA lane"
                }
              ]}
            >
              <Select
                placeholder="Choose a SOCA lane"
                onChange={handleSocaLaneChange}
                size="large"
                className="w-full bg-theme-input border-theme-input text-theme-primary input-theme-focus radius-8px"
                classNames={{
                  popup: {
                    root: "bg-theme-input border-theme-input dropdown-theme-items"
                  }
                }}
              >
                <Option value="OB_OFFLINE">
                  OB_OFFLINE (no network egress)
                </Option>
                <Option value="OB_ONLINE_PULSE">
                  OB_ONLINE_PULSE (allowlisted domains only)
                </Option>
              </Select>
            </Form.Item>

            <div className="mb-4 rounded-lg border border-theme-input bg-theme-input p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-theme-primary">
                  Allow cloud providers
                </span>
                <Switch
                  checked={allProvidersEnabled}
                  onChange={handleProviderPolicyToggle}
                />
              </div>
              <div
                className="text-xs text-theme-primary mt-2"
                style={{ opacity: 0.7 }}
              >
                {allProvidersEnabled
                  ? "Cloud providers enabled (OpenAI, Anthropic, Gemini, etc). OpenRouter stays bridge-routed."
                  : "Local-only mode. Only Ollama, SOCA Bridge, and local providers are available. Switch on to use cloud APIs."}
              </div>
            </div>

            <div className="mb-4 rounded-lg border border-theme-input bg-theme-input p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-theme-primary">
                  Auto fallback to Ollama
                </span>
                <Switch
                  checked={autoFallbackOllama}
                  onChange={handleAutoFallbackToggle}
                />
              </div>
              <div
                className="text-xs text-theme-primary mt-2"
                style={{ opacity: 0.7 }}
              >
                When bridge-routed providers are unreachable, retry once on
                local Ollama (`http://127.0.0.1:11434/v1`).
              </div>
            </div>

            <Form.Item
              name="llm"
              label={
                <span className="text-sm font-medium text-theme-primary">
                  LLM Provider
                </span>
              }
              rules={[
                {
                  required: true,
                  message: "Please select a LLM provider"
                }
              ]}
            >
              <Select
                placeholder="Choose a LLM provider"
                onChange={handleLLMChange}
                size="large"
                className="w-full bg-theme-input border-theme-input text-theme-primary input-theme-focus radius-8px"
                classNames={{
                  popup: {
                    root: "bg-theme-input border-theme-input dropdown-theme-items"
                  }
                }}
              >
                {providerOptions.map((provider) => (
                  <Option key={provider.value} value={provider.value}>
                    {provider.label}
                  </Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item
              name="authMode"
              label={
                <span className="text-sm font-medium text-theme-primary">
                  Auth Mode
                </span>
              }
              rules={[
                {
                  required: true,
                  message: "Please select an auth mode"
                }
              ]}
            >
              <Select
                placeholder="Choose auth mode"
                size="large"
                disabled={providerAuthModes.length <= 1}
                className="w-full bg-theme-input border-theme-input text-theme-primary input-theme-focus radius-8px"
                classNames={{
                  popup: {
                    root: "bg-theme-input border-theme-input dropdown-theme-items"
                  }
                }}
                onChange={(mode: ProviderAuthMode) => {
                  const normalized = normalizeAuthMode(mode);
                  const nextConfig = { ...config, authMode: normalized };
                  setConfig(nextConfig);
                  form.setFieldValue("authMode", normalized);
                  const currentProvider = String(
                    form.getFieldValue("llm") || config.llm || ""
                  );
                  if (currentProvider === "google" && normalized === "oauth") {
                    form.setFieldValue("apiKey", "");
                  }
                }}
              >
                {providerAuthModes.map((mode) => (
                  <Option key={mode} value={mode}>
                    {mode === "oauth" ? "OAuth" : "API Key"}
                  </Option>
                ))}
              </Select>
            </Form.Item>
            {directProviderBlocked && (
              <Alert
                type="warning"
                showIcon
                className="mb-4"
                message="Cloud providers require provider policy mode"
                description={
                  <span>
                    This provider requires network access.{" "}
                    <Button
                      type="link"
                      size="small"
                      style={{ padding: 0 }}
                      onClick={() => handleProviderPolicyToggle(true)}
                    >
                      Enable cloud providers now
                    </Button>
                  </span>
                }
              />
            )}
            {bridgeRoutedProvider && (
              <div className="mb-4 rounded-lg border border-theme-input bg-theme-input p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-theme-primary">
                    Bridge Status
                  </span>
                  <Button
                    size="small"
                    onClick={handleBridgeCheck}
                    loading={bridgeStatus.state === "checking"}
                    className="text-theme-icon"
                  >
                    Check Bridge
                  </Button>
                </div>
                {bridgeStatus.message && (
                  <Alert
                    className="mt-2"
                    showIcon
                    type={
                      bridgeStatus.state === "ok"
                        ? "success"
                        : bridgeStatus.state === "warn"
                          ? "warning"
                          : bridgeStatus.state === "error"
                            ? "error"
                            : "info"
                    }
                    message={bridgeStatus.message}
                  />
                )}
                {!bridgeStatus.message && (
                  <div
                    className="text-xs text-theme-primary mt-2"
                    style={{ opacity: 0.7 }}
                  >
                    Click “Check Bridge” to verify the local SOCA Bridge
                    endpoint used by {providerId === "openrouter"
                      ? "OpenRouter routing"
                      : "this provider"}
                    .
                  </div>
                )}
              </div>
            )}
            {providerMeta?.supportsLiveCatalog && (
              <div className="mb-4 rounded-lg border border-theme-input bg-theme-input p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-theme-primary">
                    Model Catalog
                  </span>
                  <Button
                    size="small"
                    onClick={() => handleRefreshModels(true)}
                    loading={refreshingModels}
                    className="text-theme-icon"
                  >
                    Refresh Models
                  </Button>
                </div>
                <div
                  className="text-xs text-theme-primary mt-2"
                  style={{ opacity: 0.7 }}
                >
                  Fetches live models for this provider and updates the local cache.
                </div>
                {modelsCacheStatus && (
                  <Alert className="mt-2" type="info" showIcon message={modelsCacheStatus} />
                )}
              </div>
            )}
            {googleOAuthMode && (
              <div className="mb-4 rounded-lg border border-theme-input bg-theme-input p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-theme-primary">
                    Google OAuth
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="small"
                      onClick={handleGoogleOAuthConnect}
                      loading={oauthLoading}
                    >
                      Connect
                    </Button>
                    <Button
                      size="small"
                      danger
                      onClick={handleGoogleOAuthClear}
                      loading={oauthLoading}
                    >
                      Disconnect
                    </Button>
                  </div>
                </div>
                <Form.Item
                  className="mt-3 mb-3"
                  name="oauthClientId"
                  label={
                    <span className="text-sm font-medium text-theme-primary">
                      OAuth Client ID
                    </span>
                  }
                  rules={[
                    {
                      required: true,
                      message: "Google OAuth Client ID is required"
                    }
                  ]}
                >
                  <Input
                    placeholder="Paste Google OAuth Client ID"
                    size="large"
                    className="w-full bg-theme-input border-theme-input text-theme-primary input-theme-focus radius-8px"
                  />
                </Form.Item>
                <Form.Item
                  className="mb-0"
                  name="oauthScopes"
                  label={
                    <span className="text-sm font-medium text-theme-primary">
                      OAuth Scopes
                    </span>
                  }
                >
                  <Input
                    placeholder={GOOGLE_OAUTH_DEFAULT_SCOPE}
                    size="large"
                    className="w-full bg-theme-input border-theme-input text-theme-primary input-theme-focus radius-8px"
                  />
                </Form.Item>
                <Alert
                  className="mt-2"
                  type={googleOAuthStatus.connected ? "success" : "warning"}
                  showIcon
                  message={
                    googleOAuthStatus.connected
                      ? `Connected. Token expires at ${oauthExpiresLabel || "unknown"}.`
                      : "Not connected. Click Connect to start Google OAuth."
                  }
                />
              </div>
            )}

            {/* Hidden field for npm */}
            <Form.Item name="npm" hidden>
              <Input />
            </Form.Item>

            <Form.Item
              label={
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-sm font-medium text-theme-primary">
                    Model Name
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-theme-primary">
                      Custom
                    </span>
                    <Switch
                      checked={useCustomModelName}
                      onChange={handleCustomModelToggle}
                      size="small"
                    />
                  </div>
                </div>
              }
              required
            >
              {useCustomModelName ? (
                <Form.Item
                  name="modelName"
                  rules={[
                    {
                      required: true,
                      message: "Please enter a model name"
                    }
                  ]}
                  noStyle
                >
                  <Input
                    placeholder="Enter custom model name"
                    size="large"
                    className="w-full bg-theme-input border-theme-input text-theme-primary input-theme-focus radius-8px"
                  />
                </Form.Item>
              ) : (
                <Form.Item
                  name="modelName"
                  rules={[
                    {
                      required: true,
                      message: "Please select a model"
                    }
                  ]}
                  noStyle
                >
                  <Select
                    key={config.llm}
                    placeholder="Select model name"
                    size="large"
                    className="w-full bg-theme-input border-theme-input text-theme-primary input-theme-focus radius-8px"
                    classNames={{
                      popup: {
                        root: "bg-theme-input border-theme-input dropdown-theme-items"
                      }
                    }}
                    showSearch
                    allowClear
                    searchValue={modelSearchValue}
                    onSearch={setModelSearchValue}
                    onOpenChange={(open) => {
                      if (open) setModelSearchValue("");
                    }}
                    optionFilterProp="children"
                    filterOption={(input, option) => {
                      const label = option?.children?.toString() || "";
                      return label.toUpperCase().includes(input.toUpperCase());
                    }}
                  >
                    {(modelOptions[config.llm] || []).map((model) => (
                      <Option key={model.value} value={model.value}>
                        {model.label}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
              )}
            </Form.Item>

            <Form.Item
              name="apiKey"
              label={
                <span className="text-sm font-medium text-theme-primary">
                  {apiKeyLabel}
                </span>
              }
              rules={[
                ({ getFieldValue }) => ({
                  validator: async (_rule, value) => {
                    const provider = String(getFieldValue("llm") || "");
                    const authMode = normalizeAuthMode(
                      getFieldValue("authMode")
                    );
                    const currentBaseURL = String(
                      getFieldValue(["options", "baseURL"]) || ""
                    );
                    const token = String(value || "").trim();
                    const providerMeta = providersData[provider];
                    const providerNpm = String(
                      providerMeta?.npm || config.npm || ""
                    );
                    const bridgeRouted = BRIDGE_ROUTED_PROVIDER_IDS.has(
                      provider
                    );
                    const isCompatProvider =
                      providerNpm === "@ai-sdk/openai-compatible";
                    const isCompatLocal =
                      isCompatProvider && isLocalBaseURL(currentBaseURL);
                    const isDirect =
                      (!bridgeRouted &&
                        DIRECT_PROVIDER_IDS.has(provider)) ||
                      (isCompatProvider && !isCompatLocal);
                    const googleOAuth =
                      provider === "google" && authMode === "oauth";
                    const zenOAuth =
                      provider === "opencode-zen" && authMode === "oauth";
                    if (
                      isDirect &&
                      providerPolicyMode !== "all_providers_bridge_governed"
                    ) {
                      throw new Error(
                        "Cloud providers are disabled by policy mode."
                      );
                    }
                    if (bridgeRouted && !token) {
                      throw new Error(
                        "Bridge token required for this browser session"
                      );
                    }
                    if (zenOAuth && !token) {
                      throw new Error("OAuth bearer token required");
                    }
                    if (googleOAuth) {
                      return;
                    }
                    if (isDirect && !isCompatLocal && !token) {
                      throw new Error("API key required for this provider");
                    }
                  }
                })
              ]}
            >
              <Input.Password
                placeholder={apiKeyPlaceholder}
                disabled={googleOAuthMode}
                size="large"
                className="w-full bg-theme-input border-theme-input text-theme-primary input-theme-focus radius-8px"
              />
            </Form.Item>

            <Form.Item
              name={["options", "baseURL"]}
              label={
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-theme-primary">
                    Base URL{" "}
                    <span
                      className="text-theme-primary"
                      style={{ opacity: 0.5 }}
                    >
                      (Optional)
                    </span>
                  </span>
                  <Button
                    type="text"
                    size="small"
                    onClick={handleResetBaseURL}
                    className="text-xs px-0 text-theme-icon"
                  >
                    Reset to default
                  </Button>
                </div>
              }
              rules={[
                ({ getFieldValue }) => ({
                  validator: async (_rule, value) => {
                    const provider = String(getFieldValue("llm") || "");
                    const mustHaveBaseURL = Boolean(
                      providersData[provider]?.requiresBaseURL
                    );
                    const base = String(value || "").trim();
                    if (mustHaveBaseURL && !base) {
                      throw new Error("Base URL required for this provider");
                    }
                  }
                })
              ]}
            >
              <Input
                placeholder="Enter custom base URL"
                size="large"
                className="w-full bg-theme-input border-theme-input text-theme-primary input-theme-focus radius-8px"
              />
            </Form.Item>

            <Form.Item className="mb-0 mt-6">
              <Button
                onClick={handleSave}
                size="large"
                icon={<SaveOutlined />}
                className="w-full bg-inverted"
                block
                style={{
                  borderColor: "inherit"
                }}
              >
                Save Settings
              </Button>
            </Form.Item>
          </Form>
        </div>
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);

root.render(
  <React.StrictMode>
    <ThemeProvider>
      <OptionsPage />
    </ThemeProvider>
  </React.StrictMode>
);
