export const clampText = (value: string, maxChars: number) => {
  if (value.length <= maxChars) return value;
  const truncated = value.slice(0, maxChars);
  return `${truncated}…[truncated ${value.length - maxChars} chars]`;
};

const compressNumericSpam = (text: string) => {
  const lines = text.split(/\r?\n/);
  if (lines.length < 30) return text;

  const out: string[] = [];
  let numericRun = 0;

  const flushRun = () => {
    if (numericRun > 5) {
      out.push(`[... ${numericRun} numeric lines omitted ...]`);
    }
    numericRun = 0;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const isNumeric = /^\d{3,}$/.test(trimmed);
    if (isNumeric) {
      numericRun += 1;
      if (numericRun <= 5) {
        out.push(line);
      }
      continue;
    }
    if (numericRun > 0) {
      flushRun();
    }
    out.push(line);
  }

  if (numericRun > 0) {
    flushRun();
  }

  return out.join("\n");
};

export const formatUiError = (err: unknown, maxChars = 1200) => {
  let text = "";
  if (!err) {
    text = "Unknown error";
  } else if (typeof err === "string") {
    text = err;
  } else if (typeof err === "object") {
    const maybe = err as { name?: string; message?: string; stack?: string };
    if (maybe.name && maybe.message) {
      text = `${maybe.name}: ${maybe.message}`;
    } else if (maybe.message) {
      text = String(maybe.message);
    } else if (maybe.stack) {
      text = String(maybe.stack);
    } else {
      try {
        text = JSON.stringify(err);
      } catch {
        text = String(err);
      }
    }
  } else {
    text = String(err);
  }

  const compressed = compressNumericSpam(text);
  return clampText(compressed, maxChars);
};
