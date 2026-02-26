import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Form, Input, Button, message, Select, Spin } from "antd";
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

function runtimeSendMessage<TResp = any>(msg: any): Promise<TResp> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (resp) => {
      const err = chrome.runtime.lastError;
      if (err) return reject(new Error(String(err.message || err)));
      resolve(resp as TResp);
    });
  });
}

const OptionsPage = () => {
  const [form] = Form.useForm();

  const [laneLoaded, setLaneLoaded] = useState(false);
  const [socaOpenBrowserLane, setSocaOpenBrowserLane] =
    useState<SocaOpenBrowserLane>(DEFAULT_SOCA_LANE);
  const [configLoaded, setConfigLoaded] = useState(false);

  const [config, setConfig] = useState({
    llm: "ollama",
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
          if (result.llmConfig.llm === "") {
            result.llmConfig.llm = fallbackProviderId;
          }

          if (!providersData[result.llmConfig.llm]) {
            result.llmConfig.llm = fallbackProviderId;
          }

          if (!result.llmConfig.npm && providersData[result.llmConfig.llm]) {
            result.llmConfig.npm = providersData[result.llmConfig.llm].npm;
          }

          if (
            !result.llmConfig.modelName ||
            !modelOptions[result.llmConfig.llm]?.some(
              (m) => m.value === result.llmConfig.modelName
            )
          ) {
            result.llmConfig.modelName =
              modelOptions[result.llmConfig.llm]?.[0]?.value || "";
          }

          if (!result.llmConfig.options?.baseURL) {
            result.llmConfig.options = {
              ...result.llmConfig.options,
              baseURL: getDefaultBaseURL(
                result.llmConfig.llm,
                providersData[result.llmConfig.llm]?.api
              )
            };
          }

          if (
            result.llmConfig.llm === "soca-bridge" &&
            typeof result.socaBridgeConfig?.bridgeBaseURL === "string" &&
            result.socaBridgeConfig.bridgeBaseURL.trim()
          ) {
            result.llmConfig.options = {
              ...result.llmConfig.options,
              baseURL: `${result.socaBridgeConfig.bridgeBaseURL.replace(/\/+$/, "")}/v1`
            };
          }

          setConfig(result.llmConfig);
          form.setFieldsValue(result.llmConfig);
        }

        // Session-only bridge token prefill (never persisted).
        try {
          const sess = await (chrome.storage as any).session.get([
            "socaBridgeToken"
          ]);
          if (sess?.socaBridgeToken) {
            form.setFieldValue("apiKey", String(sess.socaBridgeToken));
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

  const handleSocaLaneChange = (lane: SocaOpenBrowserLane) => {
    setSocaOpenBrowserLane(lane);
  };

  const handleSave = () => {
    (async () => {
      try {
        const value = await form.validateFields();
        const { socaOpenBrowserLane, ...llmConfigValue } = value as any;
        const lane =
          (socaOpenBrowserLane as SocaOpenBrowserLane) || DEFAULT_SOCA_LANE;

        // Session-only bridge token (never persisted to chrome.storage.local).
        if (llmConfigValue.llm === "soca-bridge") {
          const token = String(llmConfigValue.apiKey || "").trim();
          const r1 = await runtimeSendMessage<any>({
            type: "SOCA_SET_BRIDGE_TOKEN",
            token
          });
          if (!r1?.ok)
            throw new Error(String(r1?.err || "failed_to_set_bridge_token"));

          const baseURL = String(llmConfigValue?.options?.baseURL || "").trim();
          const bridgeBaseURL = baseURL
            .replace(/\/+$/, "")
            .replace(/\/v1$/, "");
          const r2 = await runtimeSendMessage<any>({
            type: "SOCA_SET_BRIDGE_CONFIG",
            config: { bridgeBaseURL, dnrGuardrailsEnabled: true }
          });
          if (!r2?.ok)
            throw new Error(String(r2?.err || "failed_to_set_bridge_config"));

          // Persist a non-secret placeholder only.
          llmConfigValue.apiKey = "";
        }

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

    // Check if user has a saved config for this provider
    const savedConfig = historyLLMConfig[value];
    const defaultApiKey =
      savedConfig?.apiKey ||
      (value === "ollama" ? "ollama" : value === "soca-bridge" ? "" : "");

    const newConfig = {
      llm: value,
      apiKey: defaultApiKey,
      modelName:
        savedConfig?.modelName || modelOptions[value]?.[0]?.value || "",
      npm: provider?.npm,
      options: {
        // Use saved base URL if it exists and is different from default, otherwise use default
        baseURL: savedConfig?.options?.baseURL || defaultBaseURL
      }
    };

    setConfig(newConfig);
    form.setFieldsValue(newConfig);

    if (value === "soca-bridge") {
      (chrome.storage as any).session
        .get(["socaBridgeToken"])
        .then((sess: any) => {
          if (sess?.socaBridgeToken) {
            form.setFieldValue("apiKey", String(sess.socaBridgeToken));
          }
        })
        .catch(() => {});
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

            {/* Hidden field for npm */}
            <Form.Item name="npm" hidden>
              <Input />
            </Form.Item>

            <Form.Item
              name="modelName"
              label={
                <span className="text-sm font-medium text-theme-primary">
                  Model Name
                </span>
              }
              rules={[
                {
                  required: true,
                  message: "Please select a model"
                }
              ]}
            >
              <Select
                key={config.llm}
                placeholder="Select or enter model name"
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

            <Form.Item
              name="apiKey"
              label={
                <span className="text-sm font-medium text-theme-primary">
                  Bridge Token (session-only)
                </span>
              }
              rules={[
                ({ getFieldValue }) => ({
                  validator: async (_rule, value) => {
                    const provider = String(getFieldValue("llm") || "");
                    const token = String(value || "").trim();
                    if (provider === "soca-bridge" && !token) {
                      throw new Error(
                        "Bridge token required for this browser session"
                      );
                    }
                  }
                })
              ]}
            >
              <Input.Password
                placeholder="Paste bridge token"
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
