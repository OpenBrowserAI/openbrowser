/**
 * Maps internal tool names to user-friendly display names
 */
const TOOL_DISPLAY_NAMES: Record<string, string> = {
  deepAction: "Task Master",
  webpageQa: "Ask Page",
  webSearch: "Web Search",
  variableStorage: "Save Data"
};

/**
 * Get the display name for a tool
 * @param toolName - The internal tool name
 * @returns The user-friendly display name
 */
export function getToolDisplayName(toolName: string): string {
  return TOOL_DISPLAY_NAMES[toolName] || toolName;
}
