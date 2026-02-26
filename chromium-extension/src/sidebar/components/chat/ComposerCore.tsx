import React from "react";
import {
  SendOutlined,
  StopOutlined,
  PaperClipOutlined,
  PlusOutlined,
  HistoryOutlined,
  SettingOutlined,
  DownOutlined,
  UpOutlined
} from "@ant-design/icons";
import { Button, Space } from "antd";
import { WebpageMentionInput } from "../WebpageMentionInput";

type ComposerCoreProps = {
  inputValue: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onOpenFilePicker: () => void;
  onShowSessionHistory: () => void;
  onOpenSettings: () => void;
  onNewSession: () => void;
  onToggleAdvanced: () => void;
  advancedOpen: boolean;
  sending: boolean;
  currentMessageId: string | null;
  isEmpty: boolean;
  quickActionsNode?: React.ReactNode;
};

export const ComposerCore: React.FC<ComposerCoreProps> = ({
  inputValue,
  onInputChange,
  onSend,
  onStop,
  onOpenFilePicker,
  onShowSessionHistory,
  onOpenSettings,
  onNewSession,
  onToggleAdvanced,
  advancedOpen,
  sending,
  currentMessageId,
  isEmpty,
  quickActionsNode
}) => {
  return (
    <div
      className="bg-theme-input border-theme-input relative shadow-sm hover:shadow-md transition-shadow radius-8px"
      style={{ borderWidth: "1px", borderStyle: "solid", overflow: "hidden" }}
    >
      <div className="px-4 pt-3 pb-12">
        <WebpageMentionInput
          value={inputValue}
          onChange={onInputChange}
          disabled={sending || currentMessageId !== null}
          onSend={onSend}
        />
      </div>

      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 py-2">
        <Space size="small">
          <Button
            type="text"
            icon={<PaperClipOutlined />}
            onClick={onOpenFilePicker}
            disabled={sending || currentMessageId !== null}
            className="text-theme-icon"
          />
          <Button
            type="text"
            icon={<HistoryOutlined />}
            onClick={onShowSessionHistory}
            disabled={sending || currentMessageId !== null}
            className="text-theme-icon"
          />
          {quickActionsNode}
          <Button
            type="text"
            icon={<SettingOutlined />}
            onClick={onOpenSettings}
            disabled={sending || currentMessageId !== null}
            className="text-theme-icon"
          />
          <Button
            type="text"
            onClick={onToggleAdvanced}
            disabled={sending || currentMessageId !== null}
            className="text-theme-icon"
            icon={advancedOpen ? <UpOutlined /> : <DownOutlined />}
          >
            Advanced
          </Button>
        </Space>

        <Space size="small">
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={onNewSession}
            disabled={sending || currentMessageId !== null}
            className="soca-secondary-btn"
          >
            New (+)
          </Button>
          {currentMessageId ? (
            <Button
              size="small"
              danger
              icon={<StopOutlined />}
              onClick={onStop}
              className="soca-danger-btn"
            >
              Stop
            </Button>
          ) : (
            <Button
              size="small"
              icon={<SendOutlined />}
              onClick={onSend}
              loading={sending}
              disabled={sending || isEmpty}
              className="soca-primary-btn"
            >
              Send (Enter)
            </Button>
          )}
        </Space>
      </div>
    </div>
  );
};
