export type HostClass =
  | "localhost"
  | "private"
  | "tailscale"
  | "public"
  | "invalid";

export type BridgeCandidateConfig = {
  savedBaseURL?: string;
  tailscaleHost?: string;
  fallbackBaseURL?: string;
};

const DEFAULT_BRIDGE_V1_BASE_URL = "http://127.0.0.1:9834/v1";

function hasExplicitScheme(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value);
}

function parseIPv4(hostname: string): [number, number, number, number] | null {
  const parts = hostname.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return nums as [number, number, number, number];
}

function parseURLLike(raw: string): URL | null {
  const input = String(raw || "").trim();
  if (!input) return null;
  const candidate = hasExplicitScheme(input) ? input : `http://${input}`;
  try {
    return new URL(candidate);
  } catch {
    return null;
  }
}

function toNormalizedURLString(url: URL): string {
  const pathname = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "");
  const search = url.search || "";
  const hash = url.hash || "";
  return `${url.protocol}//${url.host}${pathname}${search}${hash}`;
}

function toV1BaseURL(raw: string): string {
  const parsed = parseURLLike(raw);
  if (!parsed) return "";
  const pathname = parsed.pathname.replace(/\/+$/, "");
  const v1Path = pathname.endsWith("/v1") ? pathname : `${pathname}/v1`;
  return `${parsed.protocol}//${parsed.host}${v1Path || "/v1"}`;
}

export function normalizeBaseURL(raw: string): string {
  const parsed = parseURLLike(raw);
  if (!parsed) return String(raw || "").trim();
  return toNormalizedURLString(parsed);
}

export function classifyHost(host: string): HostClass {
  const hostname = String(host || "")
    .trim()
    .toLowerCase();
  if (!hostname) return "invalid";

  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  ) {
    return "localhost";
  }

  if (hostname.endsWith(".ts.net")) {
    return "tailscale";
  }

  const ipv4 = parseIPv4(hostname);
  if (!ipv4) {
    if (hostname.includes(" ")) return "invalid";
    return "public";
  }

  const [a, b] = ipv4;
  if (a === 127) return "localhost";
  if (a === 100 && b >= 64 && b <= 127) return "tailscale";
  if (a === 10) return "private";
  if (a === 172 && b >= 16 && b <= 31) return "private";
  if (a === 192 && b === 168) return "private";
  return "public";
}

export function isTrustedBridgeURL(url: string): boolean {
  const parsed = parseURLLike(url);
  if (!parsed) return false;
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  if (parsed.username || parsed.password) return false;
  const classification = classifyHost(parsed.hostname);
  return (
    classification === "localhost" ||
    classification === "private" ||
    classification === "tailscale"
  );
}

export function isAllowedDirectURL(url: string): boolean {
  const parsed = parseURLLike(url);
  if (!parsed) return false;
  if (parsed.protocol !== "https:") return false;
  if (parsed.username || parsed.password) return false;
  return classifyHost(parsed.hostname) === "public";
}

export function buildBridgeCandidates(config: BridgeCandidateConfig): string[] {
  const out: string[] = [];

  const push = (candidate: string) => {
    const normalized = toV1BaseURL(candidate);
    if (!normalized) return;
    const parsed = parseURLLike(normalized);
    if (!parsed) return;
    const hostType = classifyHost(parsed.hostname);
    if (!["localhost", "private", "tailscale"].includes(hostType)) return;
    if (!out.includes(normalized)) out.push(normalized);
  };

  push(String(config.savedBaseURL || "").trim());

  const tailscaleHost = String(config.tailscaleHost || "").trim();
  if (tailscaleHost) {
    const normalized = normalizeBaseURL(tailscaleHost);
    const parsed = parseURLLike(normalized);
    if (parsed && classifyHost(parsed.hostname) === "tailscale") {
      push(normalized);
    }
  }

  push(config.fallbackBaseURL || DEFAULT_BRIDGE_V1_BASE_URL);
  if (!out.length) {
    out.push(DEFAULT_BRIDGE_V1_BASE_URL);
  }
  return out;
}
