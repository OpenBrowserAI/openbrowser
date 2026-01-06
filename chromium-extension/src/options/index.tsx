import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Form, Input, Button, message, Select, Checkbox, Spin } from "antd";
import { SaveOutlined, LoadingOutlined } from "@ant-design/icons";
import "../sidebar/index.css";
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
            message.success("Save Success!");
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
    message.success("Base URL reset to default");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Spin indicator={<LoadingOutlined style={{ fontSize: 48 }} spin />} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-3xl mx-auto px-6 py-6">
          <div className="flex items-center gap-4">
            <img
              src="/icon.png"
              alt="OpenBrowser Logo"
              className="w-12 h-12 rounded-lg"
            />
            <div>
              <h1 className="text-2xl font-semibold text-black">Settings</h1>
              <p className="text-sm text-gray-500 mt-1">
                Configure your AI model preferences (vision models only)
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <Form form={form} layout="vertical" initialValues={config}>
            <Form.Item
              name="llm"
              label={
                <span className="text-sm font-medium text-gray-900">
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
                className="w-full"
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
                <span className="text-sm font-medium text-gray-900">
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
                className="w-full"
                showSearch
                allowClear
                searchValue={modelSearchValue}
                onSearch={setModelSearchValue}
                onDropdownVisibleChange={(open) => {
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
                <span className="text-sm font-medium text-gray-900">
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
                className="w-full"
              />
            </Form.Item>

            <Form.Item
              name={["options", "baseURL"]}
              label={
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900">
                    Base URL <span className="text-gray-400">(Optional)</span>
                  </span>
                  <Button
                    type="link"
                    size="small"
                    onClick={handleResetBaseURL}
                    className="text-xs px-0"
                  >
                    Reset to default
                  </Button>
                </div>
              }
            >
              <Input
                placeholder="Enter custom base URL"
                size="large"
                className="w-full"
              />
            </Form.Item>

            <div className="border-t border-gray-200 pt-6 mt-6">
              <Form.Item
                name="webSearchEnabled"
                valuePropName="checked"
                className="mb-4"
              >
                <Checkbox>
                  <span className="text-sm font-medium text-gray-900">
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
                        <span className="text-sm font-medium text-gray-900">
                          Exa API Key{" "}
                          <span className="text-gray-400">(Optional)</span>
                        </span>
                      }
                      tooltip="Uses free tier if not provided"
                    >
                      <Input.Password
                        placeholder="sk-..."
                        size="large"
                        className="w-full"
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
                className="w-full bg-black hover:bg-gray-800 border-black text-white"
                block
                style={{
                  backgroundColor: "#000000",
                  borderColor: "#000000",
                  color: "#ffffff"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#1f2937";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#000000";
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
