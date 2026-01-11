import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Form, Input, Button, message, Select, Checkbox, Spin } from "antd";
import { SaveOutlined, LoadingOutlined } from "@ant-design/icons";
import "../sidebar/index.css";
import { useThemeColors } from "../sidebar/hooks/useThemeColors";
import {
  fetchModelsData,
  getProvidersWithImageSupport,
  providersToOptions,
  modelsToOptions,
  getDefaultBaseURL
} from "../llm/llm";
import type {
  Provider,
  ProviderOption,
  ModelOption
} from "../llm/llm.interface";

const { Option } = Select;

const OptionsPage = () => {
  // Use Chrome theme colors
  const { colors: themeColors } = useThemeColors();

  // Apply theme colors to CSS variables
  useEffect(() => {
    if (themeColors.kColorSysBase) {
      document.documentElement.style.setProperty('--chrome-bg-primary', themeColors.kColorSysBase);
    }
    if (themeColors.kColorSysOnSurface) {
      document.documentElement.style.setProperty('--chrome-text-primary', themeColors.kColorSysOnSurface);
      document.documentElement.style.setProperty('--chrome-icon-color', themeColors.kColorSysOnSurface);
    }
    if (themeColors.kColorSysBaseContainer) {
      document.documentElement.style.setProperty('--chrome-input-background', themeColors.kColorSysBaseContainer);
      document.documentElement.style.setProperty('--chrome-input-border', themeColors.kColorSysBaseContainer);
    }
  }, [themeColors]);

  const [form] = Form.useForm();

  const [config, setConfig] = useState({
    llm: "anthropic",
    apiKey: "",
    modelName: "claude-sonnet-4-5-20250929",
    npm: "@ai-sdk/anthropic",
    options: {
      baseURL: "https://api.anthropic.com/v1"
    }
  });

  const [webSearchConfig, setWebSearchConfig] = useState({
    enabled: false,
    apiKey: ""
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

  // Fetch models data on component mount
  useEffect(() => {
    const loadModels = async () => {
      try {
        setLoading(true);
        const data = await fetchModelsData();
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
  }, []);

  // Load saved config from storage
  useEffect(() => {
    if (Object.keys(providersData).length === 0) return; // Wait for providers to load

    chrome.storage.sync.get(
      ["llmConfig", "historyLLMConfig", "webSearchConfig"],
      (result) => {
        if (result.llmConfig) {
          if (result.llmConfig.llm === "") {
            result.llmConfig.llm = "anthropic";
          }

          if (!result.llmConfig.npm && providersData[result.llmConfig.llm]) {
            result.llmConfig.npm = providersData[result.llmConfig.llm].npm;
          }

          setConfig(result.llmConfig);
          form.setFieldsValue(result.llmConfig);
        }
        if (result.historyLLMConfig) {
          setHistoryLLMConfig(result.historyLLMConfig);
        }
        if (result.webSearchConfig) {
          setWebSearchConfig(result.webSearchConfig);
          form.setFieldsValue({
            webSearchEnabled: result.webSearchConfig.enabled,
            exaApiKey: result.webSearchConfig.apiKey
          });
        }
      }
    );
  }, [providersData]);

  const handleSave = () => {
    form
      .validateFields()
      .then((value) => {
        const { webSearchEnabled, exaApiKey, ...llmConfigValue } = value;

        setConfig(llmConfigValue);
        setHistoryLLMConfig({
          ...historyLLMConfig,
          [llmConfigValue.llm]: llmConfigValue
        });

        const newWebSearchConfig = {
          enabled: webSearchEnabled || false,
          apiKey: exaApiKey || ""
        };
        setWebSearchConfig(newWebSearchConfig);

        chrome.storage.sync.set(
          {
            llmConfig: llmConfigValue,
            historyLLMConfig: {
              ...historyLLMConfig,
              [llmConfigValue.llm]: llmConfigValue
            },
            webSearchConfig: newWebSearchConfig
          },
          () => {
            message.success({
              content: "Save Success!",
              className: "toast-text-black"
            });
          }
        );
      })
      .catch(() => {
        message.error("Please check the form field");
      });
  };

  const handleLLMChange = (value: string) => {
    const provider = providersData[value];
    const defaultBaseURL = getDefaultBaseURL(value, provider?.api);

    // Check if user has a saved config for this provider
    const savedConfig = historyLLMConfig[value];

    const newConfig = {
      llm: value,
      apiKey: savedConfig?.apiKey || "",
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

  if (loading) {
    return (
      <div className="min-h-screen bg-theme-primary flex items-center justify-center">
        <Spin indicator={<LoadingOutlined className="fill-theme-icon" style={{ fontSize: 48 }} spin />} />
      </div>
    );
  }

  
  return (
    <div className="min-h-screen bg-theme-primary">
      {/* Header */}
      <div className="border-b border-theme-input bg-theme-primary">
        <div className="max-w-3xl mx-auto px-6 py-6">
          <div className="flex items-center gap-4">
            <img
              src={isDarkMode ? "/icon_white.png" : "/icon.png"}
              alt="OpenBrowser Logo"
              className="w-12 h-12 radius-8px"
            />
            <div>
              <h1 className="text-2xl font-semibold text-theme-primary">Settings</h1>
              <p className="text-sm text-theme-primary mt-1" style={{opacity: 0.7}}>
                Configure your AI model preferences (vision models only)
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="bg-theme-primary border-theme-input rounded-xl p-6" style={{borderWidth: '1px', borderStyle: 'solid'}}>
          <Form form={form} layout="vertical" initialValues={config}>
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
                popupClassName="bg-theme-input border-theme-input dropdown-theme-items"
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
                popupClassName="bg-theme-input border-theme-input dropdown-theme-items"
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
                  API Key
                </span>
              }
              rules={[
                {
                  required: true,
                  message: "Please enter your API key"
                }
              ]}
            >
              <Input.Password
                placeholder="Enter your API key"
                size="large"
                className="w-full bg-theme-input border-theme-input text-theme-primary input-theme-focus radius-8px"
              />
            </Form.Item>

            <Form.Item
              name={["options", "baseURL"]}
              label={
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-theme-primary">
                    Base URL <span className="text-theme-primary" style={{opacity: 0.5}}>(Optional)</span>
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

            <div className="border-t border-theme-input pt-6 mt-6">
              <Form.Item
                name="webSearchEnabled"
                valuePropName="checked"
                className="mb-4"
              >
                <Checkbox className="checkbox-theme text-theme-primary">
                  <span className="text-sm font-medium text-theme-primary">
                    Enable web search (Exa AI)
                  </span>
                </Checkbox>
              </Form.Item>

              <Form.Item
                noStyle
                shouldUpdate={(prevValues, currentValues) =>
                  prevValues.webSearchEnabled !== currentValues.webSearchEnabled
                }
              >
                {({ getFieldValue }) =>
                  getFieldValue("webSearchEnabled") ? (
                    <Form.Item
                      name="exaApiKey"
                      label={
                        <span className="text-sm font-medium text-theme-primary">
                          Exa API Key{" "}
                          <span className="text-theme-primary" style={{opacity: 0.5}}>(Optional)</span>
                        </span>
                      }
                      tooltip="Uses free tier if not provided"
                    >
                      <Input.Password
                        placeholder="sk-..."
                        size="large"
                        className="w-full bg-theme-input border-theme-input text-theme-primary input-theme-focus radius-8px"
                        allowClear
                      />
                    </Form.Item>
                  ) : null
                }
              </Form.Item>
            </div>

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
    <OptionsPage />
  </React.StrictMode>
);
