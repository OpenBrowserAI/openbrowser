import React, { useRef } from "react";
import {
  SendOutlined,
  StopOutlined,
  FileOutlined,
  DeleteOutlined,
  PaperClipOutlined,
} from "@ant-design/icons";
import type { UploadedFile } from "../types";
import { Button, Space, Image, Typography } from "antd";
import { WebpageMentionInput } from "./WebpageMentionInput";

const { Text } = Typography;

interface ChatInputProps {
  inputValue: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (fileId: string) => void;
  uploadedFiles: UploadedFile[];
  sending: boolean;
  currentMessageId: string | null;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  inputValue,
  onInputChange,
  onSend,
  onStop,
  onFileSelect,
  onRemoveFile,
  uploadedFiles,
  sending,
  currentMessageId,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="p-4 bg-white border-t border-gray-200">
      {uploadedFiles.length > 0 && (
        <div className="mb-2">
          <Space wrap>
            {uploadedFiles.map((file) => {
              const isImage = file.mimeType.startsWith("image/");
              return (
                <div
                  key={file.id}
                  className="inline-flex items-center px-2 py-1 bg-gray-100 rounded border border-gray-300"
                >
                  {isImage ? (
                    <Image
                      src={
                        file.url
                          ? file.url
                          : `data:${file.mimeType};base64,${file.base64Data}`
                      }
                      alt={file.filename}
                      className="w-10 h-10 object-cover rounded mr-2"
                      preview={false}
                    />
                  ) : (
                    <FileOutlined className="mr-2 text-base" />
                  )}
                  <Text className="text-xs mr-2 max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap">
                    {file.filename}
                  </Text>
                  <Button
                    type="text"
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={() => onRemoveFile(file.id)}
                    className="p-0 w-5 h-5"
                  />
                </div>
              );
            })}
          </Space>
        </div>
      )}

      <Space.Compact className="w-full items-center">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.docx,.xlsx,.txt,.md,.json"
          onChange={onFileSelect}
          className="hidden"
        />
        <Button
          icon={<PaperClipOutlined />}
          onClick={() => fileInputRef.current?.click()}
          disabled={sending || currentMessageId !== null}
        />

        <WebpageMentionInput
          value={inputValue}
          onChange={onInputChange}
          disabled={sending || currentMessageId !== null}
          onSend={onSend}
        />

        {currentMessageId ? (
          <Button danger icon={<StopOutlined />} onClick={onStop}>
            Stop
          </Button>
        ) : (
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={onSend}
            loading={sending}
            disabled={
              (!inputValue.trim() && uploadedFiles.length === 0) || sending
            }
            className="px-2.5"
          >
            Send
          </Button>
        )}
      </Space.Compact>
    </div>
  );
};
