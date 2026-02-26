/**
 * Maps internal tool names to user-friendly display names
 */
const TOOL_DISPLAY_NAMES: Record<string, string> = {
  deepAction: "Task Master",
  webpageQa: "Ask Page",
  webSearch: "Web Search",
  variableStorage: "Save Data",
  nt2lPlan: "NT2L Plan",
  nt2lValidatePlan: "NT2L Validate",
  nt2lExecuteDryRun: "NT2L Dry Run",
  nt2lApprovalPreview: "NT2L Approvals",
  nt2lScheduleDaily: "NT2L Schedule",
  nt2lCarnetHandoff: "NT2L Carnet Handoff"
};

/**
 * Get the display name for a tool
 * @param toolName - The internal tool name
 * @returns The user-friendly display name
 */
export function getToolDisplayName(toolName: string): string {
  return TOOL_DISPLAY_NAMES[toolName] || toolName;
}
