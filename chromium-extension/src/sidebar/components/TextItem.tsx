import React from "react";
import { Spin } from "antd";
import { MarkdownRenderer } from "../MarkdownRenderer";

interface TextItemProps {
  streamId: string;
  text: string;
  streamDone: boolean;
}

export const TextItem: React.FC<TextItemProps> = ({ text, streamDone }) => {
  return (
    <div className="mb-2">
      <div className="text-gray-900 leading-relaxed text-sm">
        <MarkdownRenderer content={text} />
      </div>
      {!streamDone && <Spin size="small" className="mt-1" />}
    </div>
  );
};
