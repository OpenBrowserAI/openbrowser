import React from "react";
import { ApiOutlined, BookOutlined } from "@ant-design/icons";
import { Badge, Button, Popover, Select, Space, Tooltip } from "antd";

export type PromptBuddyMode =
  | "clarify"
  | "structure"
  | "compress"
  | "persona"
  | "safe_exec";

export type PromptBuddyProfile = { id: string; name: string };

type ComposerAdvancedProps = {
  pbMode: PromptBuddyMode;
  pbProfileId?: string;
  pbProfiles: PromptBuddyProfile[];
  pbBusy: boolean;
  sending: boolean;
  currentMessageId: string | null;
  inputValue: string;
  toolsPopoverOpen: boolean;
  toolsPopoverContent: React.ReactNode;
  enabledToolsCount: number;
  onSetPbMode: (value: PromptBuddyMode) => void;
  onSetPbProfileId: (value?: string) => void;
  onSetToolsPopoverOpen: (value: boolean) => void;
  onOpenPromptLibrary: () => void;
  onEnhance: () => void;
};

const PROMPTBUDDY_MODES: PromptBuddyMode[] = [
  "clarify",
  "structure",
  "compress",
  "persona",
  "safe_exec"
];

export const ComposerAdvanced: React.FC<ComposerAdvancedProps> = ({
  pbMode,
  pbProfileId,
  pbProfiles,
  pbBusy,
  sending,
  currentMessageId,
  inputValue,
  toolsPopoverOpen,
  toolsPopoverContent,
  enabledToolsCount,
  onSetPbMode,
  onSetPbProfileId,
  onSetToolsPopoverOpen,
  onOpenPromptLibrary,
  onEnhance
}) => {
  return (
    <div className="soca-composer-advanced mb-2">
      <Space size="small" wrap>
        <Popover
          content={toolsPopoverContent}
          trigger="click"
          open={toolsPopoverOpen}
          onOpenChange={onSetToolsPopoverOpen}
          placement="topLeft"
          overlayClassName="soca-tools-popover"
        >
          <Badge dot={enabledToolsCount > 0} offset={[-2, 2]}>
            <Button
              type="text"
              icon={<ApiOutlined />}
              disabled={sending || currentMessageId !== null}
              className="text-theme-icon"
            >
              Tools
            </Button>
          </Badge>
        </Popover>

        <Select
          size="small"
          value={pbMode}
          onChange={(value) => onSetPbMode(value as PromptBuddyMode)}
          disabled={sending || currentMessageId !== null || pbBusy}
          style={{ width: 122 }}
          className="bg-theme-input border-theme-input text-theme-primary input-theme-focus radius-8px"
          classNames={{
            popup: {
              root: "bg-theme-input border-theme-input dropdown-theme-items"
            }
          }}
          options={PROMPTBUDDY_MODES.map((mode) => ({
            value: mode,
            label: mode
          }))}
        />

        <Select
          size="small"
          allowClear
          placeholder="profile"
          value={pbProfileId}
          onChange={(value) => onSetPbProfileId(value)}
          disabled={sending || currentMessageId !== null || pbBusy}
          style={{ width: 130 }}
          className="bg-theme-input border-theme-input text-theme-primary input-theme-focus radius-8px"
          classNames={{
            popup: {
              root: "bg-theme-input border-theme-input dropdown-theme-items"
            }
          }}
          options={pbProfiles.map((profile) => ({
            value: profile.id,
            label: profile.name
          }))}
        />

        <Tooltip title="Prompt Library (local)">
          <Button
            type="text"
            icon={<BookOutlined />}
            onClick={onOpenPromptLibrary}
            disabled={sending || currentMessageId !== null || pbBusy}
            className="text-theme-icon"
            aria-label="Open Prompt Library"
          >
            Library
          </Button>
        </Tooltip>

        <Button
          type="text"
          onClick={onEnhance}
          disabled={
            sending || currentMessageId !== null || pbBusy || !inputValue.trim()
          }
          className="text-theme-icon"
        >
          {pbBusy ? "Enhancing..." : "Enhance"}
        </Button>
      </Space>
    </div>
  );
};
