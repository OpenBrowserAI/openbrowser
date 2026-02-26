import http from "http";
import { test, expect } from "./fixtures";

async function extSendMessage(extPage: any, msg: any): Promise<any> {
  const out = await extPage.evaluate(
    (m: any) =>
      new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage(m, (resp) => {
            const err = chrome.runtime.lastError?.message || null;
            resolve({ resp, err });
          });
        } catch (e: any) {
          resolve({ resp: null, err: String(e?.message || e) });
        }
      }),
    msg
  );
  if (out?.err) return { ok: false, err: out.err };
  return out?.resp;
}

test("Provider model refresh matrix covers bridge/api-key/oauth modes", async ({
  extPage
}) => {
  const bridgeServer = http.createServer((req, res) => {
    if (req.url === "/v1/models") {
      const auth = String(req.headers["authorization"] || "");
      if (auth !== "Bearer bridge-good-token") {
        res.writeHead(403, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_token" }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          object: "list",
          data: [
            {
              id: "openrouter/auto",
              name: "OpenRouter Auto",
              provider: "openrouter"
            },
            {
              id: "openrouter/anthropic/claude-3.5-sonnet",
              name: "Claude 3.5 Sonnet",
              provider: "openrouter"
            }
          ]
        })
      );
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
  });

  const directServer = http.createServer((req, res) => {
    const auth = String(req.headers["authorization"] || "");
    const xApiKey = String(req.headers["x-api-key"] || "");
    const anthropicVersion = String(req.headers["anthropic-version"] || "");

    if (req.url === "/v1/models" && auth === "Bearer openai-key") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          object: "list",
          data: [{ id: "gpt-4o-mini", name: "GPT-4o mini", provider: "openai" }]
        })
      );
      return;
    }

    if (
      req.url === "/v1/models" &&
      xApiKey === "anthropic-key" &&
      anthropicVersion === "2023-06-01"
    ) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          data: [
            {
              id: "claude-3-7-sonnet-latest",
              display_name: "Claude 3.7 Sonnet"
            }
          ]
        })
      );
      return;
    }

    if (
      req.url === "/google/v1beta/openai/models" &&
      auth === "Bearer gemini-key"
    ) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          object: "list",
          data: [{ id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" }]
        })
      );
      return;
    }

    if (
      req.url === "/google/v1beta/openai/models" &&
      auth === "Bearer gemini-oauth-token"
    ) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          object: "list",
          data: [{ id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" }]
        })
      );
      return;
    }

    if (req.url === "/zen/v1/models" && auth === "Bearer zen-api-key") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          object: "list",
          data: [{ id: "zen-alpha", name: "Zen Alpha" }]
        })
      );
      return;
    }

    if (req.url === "/zen/v1/models" && auth === "Bearer zen-oauth-token") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          object: "list",
          data: [{ id: "zen-oauth", name: "Zen OAuth" }]
        })
      );
      return;
    }

    res.writeHead(403, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "forbidden" }));
  });

  await Promise.all([
    new Promise<void>((resolve) => bridgeServer.listen(0, "127.0.0.1", resolve)),
    new Promise<void>((resolve) => directServer.listen(0, "127.0.0.1", resolve))
  ]);

  const bridgeAddress = bridgeServer.address();
  const directAddress = directServer.address();
  const bridgePort =
    typeof bridgeAddress === "object" && bridgeAddress
      ? bridgeAddress.port
      : null;
  const directPort =
    typeof directAddress === "object" && directAddress
      ? directAddress.port
      : null;
  if (!bridgePort || !directPort) {
    throw new Error("failed_to_bind_mock_servers");
  }
  const bridgeBaseURL = `http://127.0.0.1:${bridgePort}`;
  const directBaseURL = `http://127.0.0.1:${directPort}`;

  try {
    const setBridgeConfig = await extSendMessage(extPage, {
      type: "SOCA_SET_BRIDGE_CONFIG",
      config: { bridgeBaseURL, dnrGuardrailsEnabled: true }
    });
    expect(setBridgeConfig?.ok).toBe(true);

    await extSendMessage(extPage, {
      type: "SOCA_SET_BRIDGE_TOKEN",
      token: ""
    });

    const missingBridgeToken = await extSendMessage(extPage, {
      type: "SOCA_PROVIDER_MODELS_REFRESH",
      providerId: "openrouter",
      authMode: "api_key",
      force: true
    });
    expect(missingBridgeToken?.ok).toBe(false);
    expect(String(missingBridgeToken?.err || "")).toContain(
      "bridge_token_missing"
    );

    const setBridgeToken = await extSendMessage(extPage, {
      type: "SOCA_SET_BRIDGE_TOKEN",
      token: "bridge-good-token"
    });
    expect(setBridgeToken?.ok).toBe(true);

    const bridgeModels = await extSendMessage(extPage, {
      type: "SOCA_PROVIDER_MODELS_REFRESH",
      providerId: "openrouter",
      authMode: "api_key",
      force: true
    });
    expect(bridgeModels?.ok).toBe(true);
    expect(Array.isArray(bridgeModels?.data?.models)).toBe(true);
    expect(
      bridgeModels?.data?.models?.some(
        (m: any) => String(m?.id || "") === "openrouter/auto"
      )
    ).toBe(true);

    const setOpenAISecret = await extSendMessage(extPage, {
      type: "SOCA_PROVIDER_SECRET_SET",
      providerId: "openai",
      secret: "openai-key"
    });
    expect(setOpenAISecret?.ok).toBe(true);

    const openaiModels = await extSendMessage(extPage, {
      type: "SOCA_PROVIDER_MODELS_REFRESH",
      providerId: "openai",
      authMode: "api_key",
      baseURL: `${directBaseURL}/v1`,
      force: true
    });
    expect(openaiModels?.ok).toBe(true);
    expect(
      openaiModels?.data?.models?.some(
        (m: any) => String(m?.id || "") === "gpt-4o-mini"
      )
    ).toBe(true);

    const setAnthropicSecret = await extSendMessage(extPage, {
      type: "SOCA_PROVIDER_SECRET_SET",
      providerId: "anthropic",
      secret: "anthropic-key"
    });
    expect(setAnthropicSecret?.ok).toBe(true);

    const anthropicModels = await extSendMessage(extPage, {
      type: "SOCA_PROVIDER_MODELS_REFRESH",
      providerId: "anthropic",
      authMode: "api_key",
      baseURL: `${directBaseURL}/v1`,
      force: true
    });
    expect(anthropicModels?.ok).toBe(true);
    expect(
      anthropicModels?.data?.models?.some((m: any) =>
        String(m?.id || "").includes("claude")
      )
    ).toBe(true);

    const setGeminiApiSecret = await extSendMessage(extPage, {
      type: "SOCA_PROVIDER_SECRET_SET",
      providerId: "google",
      secret: "gemini-key"
    });
    expect(setGeminiApiSecret?.ok).toBe(true);

    const geminiApiModels = await extSendMessage(extPage, {
      type: "SOCA_PROVIDER_MODELS_REFRESH",
      providerId: "google",
      authMode: "api_key",
      baseURL: `${directBaseURL}/google/v1beta/openai`,
      force: true
    });
    expect(geminiApiModels?.ok).toBe(true);
    expect(
      geminiApiModels?.data?.models?.some(
        (m: any) => String(m?.id || "") === "gemini-2.5-pro"
      )
    ).toBe(true);

    await extPage.evaluate(() => {
      return (chrome.storage as any).session.set({
        socaGoogleOAuthSession: {
          accessToken: "gemini-oauth-token",
          expiresAt: Date.now() + 60 * 60 * 1000,
          issuedAt: Date.now(),
          scope: "https://www.googleapis.com/auth/generative-language",
          tokenType: "Bearer",
          clientId: "test-client-id.apps.googleusercontent.com"
        }
      });
    });

    const geminiOauthModels = await extSendMessage(extPage, {
      type: "SOCA_PROVIDER_MODELS_REFRESH",
      providerId: "google",
      authMode: "oauth",
      baseURL: `${directBaseURL}/google/v1beta/openai`,
      force: true
    });
    expect(geminiOauthModels?.ok).toBe(true);
    expect(
      geminiOauthModels?.data?.models?.some(
        (m: any) => String(m?.id || "") === "gemini-2.5-flash"
      )
    ).toBe(true);

    const setZenApiSecret = await extSendMessage(extPage, {
      type: "SOCA_PROVIDER_SECRET_SET",
      providerId: "opencode-zen",
      secret: "zen-api-key"
    });
    expect(setZenApiSecret?.ok).toBe(true);

    const zenApiModels = await extSendMessage(extPage, {
      type: "SOCA_PROVIDER_MODELS_REFRESH",
      providerId: "opencode-zen",
      authMode: "api_key",
      baseURL: `${directBaseURL}/zen/v1`,
      force: true
    });
    expect(zenApiModels?.ok).toBe(true);
    expect(
      zenApiModels?.data?.models?.some(
        (m: any) => String(m?.id || "") === "zen-alpha"
      )
    ).toBe(true);

    const setZenOAuthSecret = await extSendMessage(extPage, {
      type: "SOCA_PROVIDER_SECRET_SET",
      providerId: "opencode-zen",
      secret: "zen-oauth-token"
    });
    expect(setZenOAuthSecret?.ok).toBe(true);

    const zenOauthModels = await extSendMessage(extPage, {
      type: "SOCA_PROVIDER_MODELS_REFRESH",
      providerId: "opencode-zen",
      authMode: "oauth",
      baseURL: `${directBaseURL}/zen/v1`,
      force: true
    });
    expect(zenOauthModels?.ok).toBe(true);
    expect(
      zenOauthModels?.data?.models?.some(
        (m: any) => String(m?.id || "") === "zen-oauth"
      )
    ).toBe(true);
  } finally {
    bridgeServer.close();
    directServer.close();
  }
});
