/**
 * Parses text to extract step-by-step format and other special content
 */

export interface ParsedStep {
  stepNumber: number;
  title: string;
  description?: string;
}

export interface ParsedText {
  introduction?: string; // Text before steps
  steps: ParsedStep[];
  conclusion?: string; // Text after steps
  rawText?: string; // Fallback if no steps found
}

/**
 * Parses text containing "Step 1:", "Step 2:" format into structured steps
 */
export const parseStepsFromText = (text: string): ParsedText => {
  if (!text) {
    return { steps: [], rawText: text };
  }

  // Regex to match step patterns:
  // - "Step 1: Title" or "Step 1 - Title" or "**Step 1**: Title"
  // - Case insensitive
  const stepRegex = /(?:^|\n)\s*(?:\*\*)?(?:step\s+(\d+))(?:\*\*)?[\s:.-]+(.+?)(?=(?:\n\s*(?:\*\*)?step\s+\d+|\n\n|$))/gis;

  // Use exec in a loop instead of matchAll for better compatibility
  const matches: RegExpExecArray[] = [];
  let match: RegExpExecArray | null;
  while ((match = stepRegex.exec(text)) !== null) {
    matches.push(match);
  }

  if (matches.length === 0) {
    // No steps found, return as raw text
    return { steps: [], rawText: text };
  }

  const steps: ParsedStep[] = [];
  let introduction = "";
  let conclusion = "";

  // Extract introduction (text before first step)
  const firstStepIndex = text.toLowerCase().indexOf("step 1");
  if (firstStepIndex > 0) {
    introduction = text.substring(0, firstStepIndex).trim();
  }

  // Extract steps
  matches.forEach((match) => {
    const stepNumber = parseInt(match[1], 10);
    const fullContent = match[2].trim();

    // Try to split title and description
    // Common patterns: "Title\nDescription" or "Title - Description"
    const lines = fullContent.split("\n").filter((l) => l.trim());
    const title = lines[0] || fullContent;
    const description = lines.slice(1).join("\n").trim() || undefined;

    steps.push({
      stepNumber,
      title,
      description,
    });
  });

  // Extract conclusion (text after last step)
  const lastMatch = matches[matches.length - 1];
  if (lastMatch && typeof lastMatch.index === 'number') {
    const lastStepEnd = lastMatch.index + lastMatch[0].length;
    const remainingText = text.substring(lastStepEnd).trim();

    // Only consider it conclusion if it's substantial (not just a single newline)
    if (remainingText && remainingText.length > 5) {
      conclusion = remainingText;
    }
  }

  return {
    introduction: introduction || undefined,
    steps,
    conclusion: conclusion || undefined,
  };
};

/**
 * Removes XML-like tags and code blocks from text for cleaner display
 */
export const cleanText = (text: string): string => {
  if (!text) return "";

  let cleaned = text;

  // Remove XML declarations
  cleaned = cleaned.replace(/<\?xml[^>]*\?>/gi, "");

  // Remove code block markers but keep content
  cleaned = cleaned.replace(/```[\w]*\n/g, "");
  cleaned = cleaned.replace(/```$/g, "");

  // Remove excessive newlines (more than 2)
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  return cleaned.trim();
};

/**
 * Extracts code blocks from text
 */
export const extractCodeBlocks = (text: string): { language: string; code: string }[] => {
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  const blocks: { language: string; code: string }[] = [];

  let match: RegExpExecArray | null;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    blocks.push({
      language: match[1] || "text",
      code: match[2].trim(),
    });
  }

  return blocks;
};

/**
 * Removes element index information like "[5]:", "[33]:<button>"
 */
export const removeElementIndexes = (text: string): string => {
  // Remove patterns like "[5]:", "[33]:<button>", "[]:"
  return text.replace(/\[[\d]*\]:(?:<[^>]+>)?/g, "").trim();
};
