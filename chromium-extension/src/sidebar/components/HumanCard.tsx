import React, { useState } from "react";
import {
  Tag,
  Card,
  Space,
  Input,
  Radio,
  Button,
  Checkbox,
  Typography,
} from "antd";
import type { AgentContentItem } from "../types";
import { MarkdownRenderer } from "../MarkdownRenderer";
import { CheckOutlined, CloseOutlined } from "@ant-design/icons";

const { TextArea } = Input;
const { Text } = Typography;

// Human callback handler
const sendHumanCallback = (callbackId: string, value: any) => {
  chrome.runtime.sendMessage({
    type: "callback",
    data: { callbackId, value },
  });
};

// Human Confirm Card
const HumanConfirmCard: React.FC<{
  item: AgentContentItem & { type: "human_confirm" };
  onRespond: (value: any) => void;
}> = ({ item, onRespond }) => {
  const [value, setValue] = useState<string>("");

  const handleConfirm = () => {
    setValue("true");
    sendHumanCallback(item.callbackId, true);
    onRespond(true);
  };

  const handleCancel = () => {
    setValue("false");
    sendHumanCallback(item.callbackId, false);
    onRespond(false);
  };

  return (
    <Card
      size="small"
      className="mb-2 bg-orange-50 border border-orange-300"
    >
      <div className="mb-3">
        <MarkdownRenderer content={item.prompt} />
      </div>
      <Space>
        <Button
          type="primary"
          icon={<CheckOutlined />}
          onClick={handleConfirm}
          disabled={item.responded}
        >
          Confirm
        </Button>
        <Button
          icon={<CloseOutlined />}
          onClick={handleCancel}
          disabled={item.responded}
        >
          Cancel
        </Button>
        {item.responded && (
          <Text type="secondary" className="text-xs">
            Result: {value || item.value}
          </Text>
        )}
      </Space>
    </Card>
  );
};

// Human Input Card
const HumanInputCard: React.FC<{
  item: AgentContentItem & { type: "human_input" };
  onRespond: (value: any) => void;
}> = ({ item, onRespond }) => {
  const [inputValue, setInputValue] = useState("");

  const handleConfirm = () => {
    if (inputValue.trim()) {
      sendHumanCallback(item.callbackId, inputValue.trim());
      onRespond(inputValue.trim());
    }
  };

  return (
    <Card
      size="small"
      className="mb-2 bg-blue-50 border border-blue-300"
    >
      <div className="mb-3">
        <MarkdownRenderer content={item.prompt} />
      </div>
      <Space direction="vertical" className="w-full">
        <TextArea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Enter your input..."
          rows={3}
          disabled={item.responded}
          onPressEnter={(e) => {
            if (!e.shiftKey && inputValue.trim()) {
              e.preventDefault();
              handleConfirm();
            }
          }}
        />
        <Button
          type="primary"
          icon={<CheckOutlined />}
          onClick={handleConfirm}
          disabled={item.responded || !inputValue.trim()}
        >
          Confirm
        </Button>
        {item.responded && (
          <Text type="secondary" className="text-xs">
            Result: {inputValue.trim() || item.value}
          </Text>
        )}
      </Space>
    </Card>
  );
};

// Human Select Card
const HumanSelectCard: React.FC<{
  item: AgentContentItem & { type: "human_select" };
  onRespond: (value: any) => void;
}> = ({ item, onRespond }) => {
  const [selectedValues, setSelectedValues] = useState<string[]>([]);

  const handleConfirm = () => {
    if (selectedValues.length > 0) {
      sendHumanCallback(item.callbackId, selectedValues);
      onRespond(selectedValues);
    }
  };

  const handleChange = (value: string) => {
    if (item.multiple) {
      setSelectedValues((prev) =>
        prev.includes(value)
          ? prev.filter((v) => v !== value)
          : [...prev, value]
      );
    } else {
      setSelectedValues([value]);
    }
  };

  return (
    <Card
      size="small"
      className="mb-2 bg-green-50 border border-green-300"
    >
      <div className="mb-3">
        <MarkdownRenderer content={item.prompt} />
      </div>
      <Space direction="vertical" className="w-full">
        {item.multiple ? (
          <Checkbox.Group
            value={selectedValues}
            onChange={(values) => setSelectedValues(values as string[])}
            disabled={item.responded}
          >
            <Space direction="vertical">
              {item.options.map((option) => (
                <Checkbox key={option} value={option}>
                  {option}
                </Checkbox>
              ))}
            </Space>
          </Checkbox.Group>
        ) : (
          <Radio.Group
            value={selectedValues[0]}
            onChange={(e) => handleChange(e.target.value)}
            disabled={item.responded}
          >
            <Space direction="vertical">
              {item.options.map((option) => (
                <Radio key={option} value={option}>
                  {option}
                </Radio>
              ))}
            </Space>
          </Radio.Group>
        )}
        <Button
          type="primary"
          icon={<CheckOutlined />}
          onClick={handleConfirm}
          disabled={item.responded || selectedValues.length === 0}
        >
          Confirm
        </Button>
        {item.responded && (
          <Text type="secondary" className="text-xs">
            Result: {selectedValues.join(", ") || item.value}
          </Text>
        )}
      </Space>
    </Card>
  );
};

// Human Help Card
const HumanHelpCard: React.FC<{
  item: AgentContentItem & { type: "human_help" };
  onRespond: (value: any) => void;
}> = ({ item, onRespond }) => {
  const [value, setValue] = useState<string>("");
  const handleComplete = () => {
    setValue("true");
    sendHumanCallback(item.callbackId, true);
    onRespond(true);
  };

  const handleCancel = () => {
    setValue("false");
    sendHumanCallback(item.callbackId, false);
    onRespond(false);
  };

  const helpTypeText =
    item.helpType === "request_login"
      ? "Login Required"
      : "Assistance Required";

  return (
    <Card
      size="small"
      className="mb-2 bg-red-50 border border-red-200"
    >
      <Space direction="vertical" className="w-full">
        <Tag color="orange">{helpTypeText}</Tag>
        <div className="mb-3">
          <MarkdownRenderer content={item.prompt} />
        </div>
        <Space>
          <Button
            type="primary"
            icon={<CheckOutlined />}
            onClick={handleComplete}
            disabled={item.responded}
          >
            Complete
          </Button>
          <Button
            icon={<CloseOutlined />}
            onClick={handleCancel}
            disabled={item.responded}
          >
            Cancel
          </Button>
          {item.responded && (
            <Text type="secondary" className="text-xs">
              Result: {value || item.value}
            </Text>
          )}
        </Space>
      </Space>
    </Card>
  );
};

// Unified Human Card Component
interface HumanCardProps {
  item:
    | (AgentContentItem & { type: "human_confirm" })
    | (AgentContentItem & { type: "human_input" })
    | (AgentContentItem & { type: "human_select" })
    | (AgentContentItem & { type: "human_help" });
  onRespond: (value: any) => void;
}

export const HumanCard: React.FC<HumanCardProps> = ({ item, onRespond }) => {
  switch (item.type) {
    case "human_confirm":
      return <HumanConfirmCard item={item} onRespond={onRespond} />;
    case "human_input":
      return <HumanInputCard item={item} onRespond={onRespond} />;
    case "human_select":
      return <HumanSelectCard item={item} onRespond={onRespond} />;
    case "human_help":
      return <HumanHelpCard item={item} onRespond={onRespond} />;
    default:
      return <div>Unknown human card type: {(item as any).type}</div>;
  }
};
