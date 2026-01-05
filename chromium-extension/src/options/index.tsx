import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  Form,
  Input,
  Button,
  message,
  Select,
  AutoComplete,
  Checkbox
} from "antd";
import { SaveOutlined } from "@ant-design/icons";
import "../sidebar/index.css";

const { Option } = Select;

const OptionsPage = () => {
  const [form] = Form.useForm();

  const [config, setConfig] = useState({
    llm: "anthropic",
    apiKey: "",
    modelName: "claude-sonnet-4-5-20250929",
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

  useEffect(() => {
    chrome.storage.sync.get(
      ["llmConfig", "historyLLMConfig", "webSearchConfig"],
      (result) => {
        if (result.llmConfig) {
          if (result.llmConfig.llm === "") {
            result.llmConfig.llm = "anthropic";
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
  }, []);

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

  const modelLLMs = [
    { value: "anthropic", label: "Claude (default)" },
    { value: "openai", label: "OpenAI" },
    { value: "openrouter", label: "OpenRouter" },
    { value: "google", label: "Google Generative" },
    { value: "bedrock", label: "AWS Bedrock" },
    { value: "azure", label: "Microsoft Azure" },
    { value: "openai-compatible", label: "OpenAI Compatible" },
    { value: "modelscope", label: "ModelScope" }
  ];

  const modelOptions = {
    anthropic: [
      {
        value: "claude-sonnet-4-5-20250929",
        label: "Claude Sonnet 4.5 (default)"
      },
      { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
      { value: "claude-3-7-sonnet-20250219", label: "Claude 3.7 Sonnet" }
    ],
    openai: [
      { value: "gpt-5.2", label: "gpt-5.2 (default)" },
      { value: "gpt-5.1", label: "gpt-5.1" },
      { value: "gpt-5", label: "gpt-5" },
      { value: "gpt-5-mini", label: "gpt-5-mini" },
      { value: "gpt-4.1", label: "gpt-4.1" },
      { value: "gpt-4.1-mini", label: "gpt-4.1-mini" },
      { value: "o4-mini", label: "o4-mini" }
    ],
    openrouter: [
      {
        value: "anthropic/claude-sonnet-4.5",
        label: "claude-sonnet-4.5 (default)"
      },
      { value: "anthropic/claude-sonnet-4", label: "claude-sonnet-4" },
      { value: "anthropic/claude-3.7-sonnet", label: "claude-3.7-sonnet" },
      { value: "google/gemini-3-pro-preview", label: "gemini-3-pro-preview" },
      {
        value: "google/gemini-3-flash-preview",
        label: "gemini-3-flash-preview"
      },
      { value: "google/gemini-3-pro", label: "gemini-3-pro" },
      { value: "google/gemini-2.5-pro", label: "gemini-2.5-pro" },
      { value: "openai/gpt-5.2", label: "gpt-5.2" },
      { value: "openai/gpt-5.1", label: "gpt-5.1" },
      { value: "openai/gpt-5", label: "gpt-5" },
      { value: "openai/gpt-5-mini", label: "gpt-5-mini" },
      { value: "openai/gpt-4.1", label: "gpt-4.1" },
      { value: "openai/o4-mini", label: "o4-mini" },
      { value: "openai/gpt-4.1-mini", label: "gpt-4.1-mini" },
      { value: "x-ai/grok-4", label: "grok-4" },
      { value: "x-ai/grok-4-fast", label: "grok-4-fast" }
    ],
    google: [
      {
        value: "gemini-3-pro-preview",
        label: "gemini-3-pro-preview (default)"
      },
      { value: "gemini-3-flash-preview", label: "gemini-3-flash-preview" },
      { value: "gemini-3-pro", label: "gemini-3-pro" },
      { value: "gemini-2.5-pro", label: "gemini-2.5-pro" },
      { value: "gemini-2.5-flash", label: "gemini-2.5-flash" }
    ],
    bedrock: [
      {
        value: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
        label: "claude-sonnet-4-5 (default)"
      },
      {
        value: "us.anthropic.claude-opus-4-1-20250805-v1:0",
        label: "claude-opus-4-1"
      },
      {
        value: "us.anthropic.claude-sonnet-4-20250514-v1:0",
        label: "claude-sonnet-4"
      }
    ],
    azure: [
      { value: "gpt-5.2", label: "gpt-5.2 (default)" },
      { value: "gpt-5.1", label: "gpt-5.1" },
      { value: "gpt-5", label: "gpt-5" },
      { value: "gpt-4.1", label: "gpt-4.1" },
      { value: "gpt-4.1-mini", label: "gpt-4.1-mini" }
    ],
    "openai-compatible": [{ value: "", label: "Please enter the model" }],
    modelscope: [
      {
        value: "Qwen/Qwen3-VL-30B-A3B-Instruct",
        label: "Qwen3-VL-30B-A3B-Instruct (default)"
      },
      {
        value: "Qwen/Qwen3-VL-30B-A3B-Thinking",
        label: "Qwen3-VL-30B-A3B-Thinking"
      },
      {
        value: "Qwen/Qwen3-VL-235B-A22B-Instruct",
        label: "Qwen3-VL-235B-A22B-Instruct"
      },
      {
        value: "Qwen/Qwen3-VL-8B-Instruct",
        label: "Qwen3-VL-8B-Instruct"
      }
    ]
  };

  const handleLLMChange = (value: string) => {
    const baseURLMap = {
      openai: "https://api.openai.com/v1",
      anthropic: "https://api.anthropic.com/v1",
      openrouter: "https://openrouter.ai/api/v1",
      modelscope: "https://api-inference.modelscope.cn/v1",
      // https://{resourceName}.cognitiveservices.azure.com/openai
      azure: "https://{resourceName}.openai.azure.com/openai",
      "openai-compatible": "https://openrouter.ai/api/v1",
      google: "",
      bedrock: ""
    };
    const newConfig = historyLLMConfig[value] || {
      llm: value,
      apiKey: "",
      modelName: modelOptions[value][0].value,
      options: {
        baseURL: baseURLMap[value]
      }
    };
    setConfig(newConfig);
    form.setFieldsValue(newConfig);
  };

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
                Configure your AI model preferences
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
                {modelLLMs.map((llm) => (
                  <Option key={llm.value} value={llm.value}>
                    {llm.label}
                  </Option>
                ))}
              </Select>
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
              <AutoComplete
                placeholder="Select or enter model name"
                options={modelOptions[config.llm]}
                size="large"
                className="w-full"
                filterOption={(inputValue, option) =>
                  (option.value as string)
                    .toUpperCase()
                    .indexOf(inputValue.toUpperCase()) !== -1
                }
              />
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
                <span className="text-sm font-medium text-gray-900">
                  Base URL <span className="text-gray-400">(Optional)</span>
                </span>
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
