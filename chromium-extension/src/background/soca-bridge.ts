export const DEFAULT_SOCA_BRIDGE_ROOT_URL = "http://127.0.0.1:9834";

/**
 * Extract the bridge root URL from an OpenAI-compatible base URL.
 *
 * Supports:
 *  - localhost: http://127.0.0.1:9834/v1  -> http://127.0.0.1:9834
 *  - Tailscale: http://vps-holo.tail12345.ts.net:9834/v1  -> http://vps-holo.tail12345.ts.net:9834
 *  - CGNAT:     http://100.100.1.2:9834/v1  -> http://100.100.1.2:9834
 */
export function socaBridgeRootURLFromBaseURL(baseURL: unknown): string {
  const raw = typeof baseURL === "string" ? baseURL.trim() : "";
  if (!raw) return DEFAULT_SOCA_BRIDGE_ROOT_URL;

  // `baseURL` in OpenAI-compatible clients is typically `${root}/v1`.
  // Bridge tool endpoints live at `${root}/soca/*`, so we strip the trailing `/v1`.
  const noTrailingSlash = raw.replace(/\/+$/, "");
  return noTrailingSlash.replace(/\/v1$/, "");
}
