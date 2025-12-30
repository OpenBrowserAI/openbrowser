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
      <MarkdownRenderer content={text} />
      {!streamDone && <Spin size="small" className="text-white" />}
    </div>
  );
};
