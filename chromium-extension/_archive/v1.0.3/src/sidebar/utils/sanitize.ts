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

  const normalized = text.toLowerCase();
  if (normalized.includes("bridge_token_missing")) {
    text =
      "Bridge token missing. Open Settings → Bridge Token, paste token, then Save Settings.";
  } else if (normalized.includes("failed to fetch")) {
    text =
      "Bridge unreachable. Ensure SOCA Bridge is running and Base URL is correct (default http://127.0.0.1:9834/v1). If enabled, auto fallback to Ollama will be attempted.";
  } else if (
    normalized.includes("openai_compatible_baseurl_missing") ||
    normalized.includes("direct_baseurl_missing")
  ) {
    text = "Base URL missing. Set a Base URL in Settings and Save.";
  } else if (normalized.includes("provider_not_allowed")) {
    text =
      "Provider blocked by policy mode. In Settings, switch Provider policy mode to 'All providers' or choose a local/bridge provider.";
  } else if (normalized.includes("api_key_missing")) {
    text = "API key missing. Paste your key in Settings and Save.";
  } else if (
    normalized.includes("openrouter_api_key missing") ||
    normalized.includes("openrouter_api_key_missing")
  ) {
    text =
      "OpenRouter key missing on bridge host. Set OPENROUTER_API_KEY (or SOCA_OPENBROWSER_BRIDGE_OPENROUTER_API_KEY) and restart SOCA Bridge.";
  } else if (normalized.includes("ollama_baseurl_non_local_host")) {
    text = "Ollama Base URL must be local (127.0.0.1/localhost).";
  } else if (normalized.includes("direct_baseurl_requires_https")) {
    text = "Direct provider base URL must use HTTPS.";
  }

  const compressed = compressNumericSpam(text);
  return clampText(compressed, maxChars);
};
