import React from "react";
import { ToolItem } from "../types/messages";
import { CollapsibleSection } from "../../workflow/components/CollapsibleSection";

interface ToolDisplayProps {
  tool: ToolItem;
}

export const ToolDisplay: React.FC<ToolDisplayProps> = ({ tool }) => {
  return (
    <CollapsibleSection title={tool.toolName} defaultCollapsed={true}>
      <div className="tool-details">
        {tool.params && (
          <pre className="tool-code">
            {JSON.stringify(tool.params, null, 2)}
          </pre>
        )}
      </div>
    </CollapsibleSection>
  );
};
