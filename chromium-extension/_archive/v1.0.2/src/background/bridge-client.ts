export type SocaOpenBrowserLane = "OB_OFFLINE" | "OB_ONLINE_PULSE";

export type SocaToolsConfig = {
  mcp?: {
    webfetch?: boolean;
    context7?: boolean;
    github?: boolean;
    nanobanapro?: boolean;
    nt2l?: boolean;
  };
  allowlistText?: string;
};

export type BridgeConfig = {
  bridgeBaseURL: string; // root, e.g. http://127.0.0.1:9834
  dnrGuardrailsEnabled: boolean;
};

export const SOCA_LANE_STORAGE_KEY = "socaOpenBrowserLane";
export const SOCA_TOOLS_CONFIG_STORAGE_KEY = "socaOpenBrowserToolsConfig";
export const SOCA_BRIDGE_CONFIG_STORAGE_KEY = "socaBridgeConfig";
export const SOCA_BRIDGE_TOKEN_SESSION_KEY = "socaBridgeToken";
export const SOCA_DIRECT_PROVIDER_GATE_KEY =
  "socaOpenBrowserAllowDirectProviders";

export const DEFAULT_SOCA_TOOLS_CONFIG: Required<SocaToolsConfig> = {
  mcp: {
    webfetch: false,
    context7: false,
    github: false,
    nanobanapro: false,
    nt2l: false
  },
  allowlistText: ""
};

export const DEFAULT_BRIDGE_CONFIG: BridgeConfig = {
  bridgeBaseURL: "http://127.0.0.1:9834",
  dnrGuardrailsEnabled: true
};

export const DEFAULT_ALLOWLIST_DOMAINS = [
  // NOTE: this affects what the bridge is allowed to fetch in OB_ONLINE_PULSE.
  // Keep conservative; user can extend via allowlistText.
  "api.github.com",
  "context7.com"
];

function hostnameFromBaseURL(baseURL?: string): string | null {
  if (!baseURL) return null;
  try {
    return new URL(baseURL).hostname;
  } catch {
    return null;
  }
}

function parseIPv4(hostname: string): [number, number, number, number] | null {
  const parts = hostname.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return nums as [number, number, number, number];
}

function isPrivateIPv4(hostname: string): boolean {
  const ip = parseIPv4(hostname);
  if (!ip) return false;
  const [a, b] = ip;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  // Tailscale CGNAT range (commonly used for tailnet IPv4 addresses)
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isLocalHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "::1") return true;
  return hostname === "127.0.0.1" || isPrivateIPv4(hostname);
}

function assertAllowedBridgeUrl(urlStr: string) {
  const u = new URL(urlStr);
  const host = u.hostname;
  const ok = isLocalHost(host) || host.endsWith(".ts.net");
  if (!ok) throw new Error(`bridgeBaseURL_not_allowed:${host}`);
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("bridgeBaseURL_bad_scheme");
  }
  if (u.username || u.password) {
    throw new Error("bridgeBaseURL_no_userinfo");
  }
}

export async function getBridgeConfig(): Promise<BridgeConfig> {
  const stored = (
    await chrome.storage.local.get([SOCA_BRIDGE_CONFIG_STORAGE_KEY])
  )[SOCA_BRIDGE_CONFIG_STORAGE_KEY] as BridgeConfig | undefined;
  const cfg =
    stored && typeof stored === "object" ? stored : DEFAULT_BRIDGE_CONFIG;
  assertAllowedBridgeUrl(cfg.bridgeBaseURL);
  return cfg;
}

export async function getAllowDirectProviders(): Promise<boolean> {
  const stored = (
    await chrome.storage.local.get([SOCA_DIRECT_PROVIDER_GATE_KEY])
  )[SOCA_DIRECT_PROVIDER_GATE_KEY];
  return Boolean(stored);
}

export async function setBridgeConfig(cfg: BridgeConfig): Promise<void> {
  assertAllowedBridgeUrl(cfg.bridgeBaseURL);
  await chrome.storage.local.set({ [SOCA_BRIDGE_CONFIG_STORAGE_KEY]: cfg });
}

export async function getBridgeToken(): Promise<string> {
  const v = await (chrome.storage as any).session.get([
    SOCA_BRIDGE_TOKEN_SESSION_KEY
  ]);
  const token = String(v[SOCA_BRIDGE_TOKEN_SESSION_KEY] || "").trim();
  if (!token) throw new Error("bridge_token_missing");
  return token;
}

export async function setBridgeToken(token: string): Promise<void> {
  const t = String(token || "").trim();
  await (chrome.storage as any).session.set({
    [SOCA_BRIDGE_TOKEN_SESSION_KEY]: t
  });
}

export function normalizeLane(value: unknown): SocaOpenBrowserLane {
  return value === "OB_ONLINE_PULSE" ? "OB_ONLINE_PULSE" : "OB_OFFLINE";
}

export async function loadSocaToolsConfig(): Promise<
  Required<SocaToolsConfig>
> {
  const stored = (
    await chrome.storage.local.get([SOCA_TOOLS_CONFIG_STORAGE_KEY])
  )[SOCA_TOOLS_CONFIG_STORAGE_KEY] as SocaToolsConfig | undefined;
  if (!stored || typeof stored !== "object") return DEFAULT_SOCA_TOOLS_CONFIG;
  return {
    ...DEFAULT_SOCA_TOOLS_CONFIG,
    ...stored,
    mcp: {
      ...DEFAULT_SOCA_TOOLS_CONFIG.mcp,
      ...(stored.mcp || {})
    }
  };
}

export function parseAllowlistDomains(allowlistText: unknown): string[] {
  if (typeof allowlistText !== "string") return [];
  return allowlistText
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => !line.startsWith("#"))
    .filter(Boolean)
    .map((entry) => entry.replace(/^https?:\/\//, ""))
    .map((entry) => entry.split("/")[0])
    .map((entry) => entry.toLowerCase())
    .filter(Boolean);
}

export async function getEffectiveAllowlistDomains(): Promise<string[]> {
  const toolsConfig = await loadSocaToolsConfig();
  return [
    ...DEFAULT_ALLOWLIST_DOMAINS,
    ...parseAllowlistDomains(toolsConfig.allowlistText)
  ];
}

export async function resolveSocaBridgeConnection(): Promise<{
  lane: SocaOpenBrowserLane;
  token: string;
  bridgeBaseURL: string;
  allowlistDomains: string[];
}> {
  const lane =
    normalizeLane(
      (await chrome.storage.local.get([SOCA_LANE_STORAGE_KEY]))[
        SOCA_LANE_STORAGE_KEY
      ]
    ) || "OB_OFFLINE";
  const cfg = await getBridgeConfig();
  const token = await getBridgeToken();
  const allowlistDomains = await getEffectiveAllowlistDomains();
  return { lane, token, bridgeBaseURL: cfg.bridgeBaseURL, allowlistDomains };
}

export async function bridgeFetchJson<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number; withLane?: boolean } = {}
): Promise<T> {
  const { lane, token, bridgeBaseURL, allowlistDomains } =
    await resolveSocaBridgeConnection();

  const base = new URL(bridgeBaseURL.replace(/\/+$/, "") + "/");
  const url = new URL(path.replace(/^\//, ""), base);
  assertAllowedBridgeUrl(base.toString());

  const timeoutMs = init.timeoutMs ?? 12_000;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort("bridge_timeout"), timeoutMs);
  try {
    const headers: Record<string, string> = {
      ...(init.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${token}`,
      "x-soca-client": "openbrowser-extension"
    };

    // For endpoints that do URL-gating on the bridge.
    if (allowlistDomains.length) {
      headers["x-soca-allowlist"] = allowlistDomains.join(",");
    }
    if (!headers["content-type"] && init.body != null) {
      headers["content-type"] = "application/json";
    }

    const body =
      init.withLane && init.body && typeof init.body === "string"
        ? JSON.stringify({ lane, ...JSON.parse(init.body) })
        : init.withLane && init.body && typeof init.body === "object"
          ? JSON.stringify({ lane, ...(init.body as any) })
          : init.body;

    const resp = await fetch(url.toString(), {
      ...init,
      body,
      headers,
      signal: ac.signal
    });
    const text = await resp.text();
    if (!resp.ok) {
      throw new Error(`bridge_http_${resp.status}:${text.slice(0, 500)}`);
    }
    return text ? (JSON.parse(text) as T) : (undefined as T);
  } finally {
    clearTimeout(t);
  }
}

export async function ensureDnrGuardrailsInstalled(): Promise<void> {
  const cfg = await getBridgeConfig();
  if (!cfg.dnrGuardrailsEnabled) return;

  // Best-effort. If scoping to extension initiator proves unreliable in a given
  // Chromium build, host_permissions remain the primary hard guarantee.
  const initiator = chrome.runtime.id;
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const toRemove = existing
    .map((r) => r.id)
    .filter((id) => id >= 9000 && id < 9100);

  const bridgeHost = hostnameFromBaseURL(cfg.bridgeBaseURL) || "";
  const allowedRequestDomains = new Set(
    ["127.0.0.1", "localhost", bridgeHost].filter(Boolean)
  );

  try {
    const allowDirect = await getAllowDirectProviders();
    if (allowDirect) {
      const llmConfig = (await chrome.storage.local.get(["llmConfig"]))
        .llmConfig as any;
      const providerId = String(llmConfig?.llm || "").trim();
      const baseURL = String(llmConfig?.options?.baseURL || "").trim();
      if (providerId && baseURL) {
        const host = hostnameFromBaseURL(baseURL);
        if (host && !isLocalHost(host)) {
          allowedRequestDomains.add(host);
        }
      }
    }
  } catch (e) {
    console.warn("SOCA DNR guardrails allowlist update failed:", e);
  }

  const rules: chrome.declarativeNetRequest.Rule[] = [
    {
      id: 9000,
      priority: 1,
      action: { type: chrome.declarativeNetRequest.RuleActionType.BLOCK },
      // DNR types lag behind Chrome in some @types/chrome versions.
      // Keep runtime field names (initiatorDomains/excludedRequestDomains) and cast.
      condition: {
        regexFilter: "^https?://",
        resourceTypes: [
          chrome.declarativeNetRequest.ResourceType.XML_HTTP_REQUEST,
          chrome.declarativeNetRequest.ResourceType.WEB_SOCKET
        ],
        initiatorDomains: [initiator],
        excludedRequestDomains: Array.from(allowedRequestDomains)
      } as any
    } as any
  ];

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: toRemove,
      addRules: rules
    });
  } catch (e) {
    // Guardrails are best-effort. host_permissions are the hard guarantee.
    console.warn("SOCA DNR guardrails install failed:", e);
  }
}
