import React, { useState, useEffect } from "react";
import { LoadingOutlined } from "@ant-design/icons";
import { MarkdownRenderer } from "../MarkdownRenderer";
import { Collapse, Typography, Spin } from "antd";

const { Text } = Typography;

interface ThinkingItemProps {
  streamId: string;
  text: string;
  streamDone: boolean;
}

export const ThinkingItem: React.FC<ThinkingItemProps> = ({
  text,
  streamDone,
}) => {
  const [activeKey, setActiveKey] = useState<string[]>(
    streamDone ? [] : ["thinking"]
  );

  useEffect(() => {
    if (streamDone) {
      setActiveKey([]);
    }
  }, [streamDone]);

  return (
    <Collapse
      size="small"
      className="thinking-collapse mb-2"
      activeKey={activeKey}
      onChange={(keys) => setActiveKey(keys as string[])}
      items={[
        {
          key: "thinking",
          label: (
            <div className="flex items-center gap-2">
              {!streamDone && <LoadingOutlined className="text-gray-400" spin />}
              <Text type="secondary" className="text-sm">
                💭 Thinking
              </Text>
            </div>
          ),
          children: (
            <div className="pl-1">
              <div className="text-sm text-gray-600">
                <MarkdownRenderer content={text} secondary />
              </div>
              {!streamDone && <Spin size="small" className="mt-2" />}
            </div>
          ),
        },
      ]}
    />
  );
};
