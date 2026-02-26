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

test("SW cannot fetch public internet (mechanical no-egress)", async ({
  extPage
}) => {
  const resp = await extSendMessage(extPage, {
    type: "SOCA_TEST_TRY_FETCH",
    url: "https://example.com"
  });
  expect(resp?.ok).toBe(true);
});

test("Bridge calls are token gated and work against localhost", async ({
  extPage
}) => {
  const server = http.createServer((req, res) => {
    try {
      if (req.url === "/v1/models") {
        const auth = String(req.headers["authorization"] || "");
        if (auth !== "Bearer test") {
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
                id: "mock-model",
                object: "model",
                created: 0,
                owned_by: "mock"
              }
            ]
          })
        );
        return;
      }
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not_found" }));
    } catch {
      res.writeHead(500);
      res.end();
    }
  });

  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve())
  );
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : null;
  if (!port) throw new Error("failed_to_bind_mock_bridge");
  const bridgeBaseURL = `http://127.0.0.1:${port}`;

  try {
    const setCfg = await extSendMessage(extPage, {
      type: "SOCA_SET_BRIDGE_CONFIG",
      config: { bridgeBaseURL, dnrGuardrailsEnabled: true }
    });
    expect(setCfg?.ok).toBe(true);

    const clearTok = await extSendMessage(extPage, {
      type: "SOCA_SET_BRIDGE_TOKEN",
      token: ""
    });
    expect(clearTok?.ok).toBe(true);

    const noTok = await extSendMessage(extPage, {
      type: "SOCA_BRIDGE_GET_MODELS"
    });
    expect(noTok?.ok).toBe(false);
    expect(String(noTok?.err || "")).toContain("bridge_token_missing");

    const setTok = await extSendMessage(extPage, {
      type: "SOCA_SET_BRIDGE_TOKEN",
      token: "test"
    });
    expect(setTok?.ok).toBe(true);

    const ok = await extSendMessage(extPage, {
      type: "SOCA_BRIDGE_GET_MODELS"
    });
    expect(ok?.ok).toBe(true);
    expect(Array.isArray(ok?.data?.data)).toBe(true);
  } finally {
    server.close();
  }
});

test("Write gate blocks on pageSigHash mismatch (deterministic fail-closed reason)", async ({
  extPage
}) => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>SOCA E2E Write Gate</title>
  </head>
  <body>
    <h1>Write Gate</h1>
    <button id="btn">Click me</button>
  </body>
</html>`);
  });

  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve())
  );
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : null;
  if (!port) throw new Error("failed_to_bind_local_test_page");
  const url = `http://127.0.0.1:${port}/`;

  try {
    const resp = await extSendMessage(extPage, {
      type: "SOCA_TEST_WRITE_GATE_BLOCK_REASON",
      url
    });
    expect(resp?.ok).toBe(true);
    expect(String(resp?.reason || "")).toContain(
      "fail_closed:pageSigHash_mismatch"
    );
  } finally {
    server.close();
  }
});
