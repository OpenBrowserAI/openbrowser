import React from "react";
import { Button, Dropdown } from "antd";
import { ThunderboltOutlined } from "@ant-design/icons";
import type { MenuProps } from "antd";

export type QuickAction = {
  id: string;
  label: string;
  prompt: string;
};

type QuickActionsMenuProps = {
  actions: QuickAction[];
  disabled?: boolean;
  onSelect: (prompt: string) => void;
};

export const QuickActionsMenu: React.FC<QuickActionsMenuProps> = ({
  actions,
  disabled,
  onSelect
}) => {
  const promptById = new Map(
    actions.map((action) => [action.id, action.prompt])
  );
  const items: MenuProps["items"] = actions.map((action) => ({
    key: action.id,
    label: action.label
  }));

  return (
    <Dropdown
      trigger={["click"]}
      menu={{
        items,
        onClick: ({ key }) => {
          const prompt = promptById.get(String(key));
          if (prompt) onSelect(prompt);
        }
      }}
      placement="topLeft"
    >
      <Button
        type="text"
        icon={<ThunderboltOutlined />}
        disabled={disabled}
        className="text-theme-icon"
      >
        Quick
      </Button>
    </Dropdown>
  );
};
