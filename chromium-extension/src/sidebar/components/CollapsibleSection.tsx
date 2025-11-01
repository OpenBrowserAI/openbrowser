import React, { useState } from "react";

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultCollapsed?: boolean;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  children,
  defaultCollapsed = true,
}) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className="collapsible-section">
      <button
        className="collapsible-toggle"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="toggle-icon">{collapsed ? "▶" : "▼"}</span>
        <span className="toggle-title">{title}</span>
      </button>
      {!collapsed && <div className="collapsible-body">{children}</div>}
    </div>
  );
};
