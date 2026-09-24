declare const openbrowser: any;
declare module "react-markdown";
declare module "remark-gfm";
declare module "remark-math";
declare module "rehype-katex";

// ── OpenSurfer capture (MAIN world) ──────────────────────────────────────────
// Runs in the page's own JS context so fetch/XHR interception actually works.
// Sends events via CustomEvent → isolated-world bridge → background → server.

(() => {
  if ((window as any).__opensurfer_ext) return;
  (window as any).__opensurfer_ext = true;

  const started = Date.now();
  const events: any[] = [];
  const clip = (s: any) =>
    typeof s === "string" && s.length > 4000 ? s.slice(0, 4000) + "…" : s;

  const flush = () => {
    if (events.length === 0) return;
    const snapshot = events.splice(0);
    window.dispatchEvent(
      new CustomEvent("__opensurfer_trace", {
        detail: {
          name: location.hostname.replace(/^www\./, ""),
          trace: {
            startedAt: new Date(started).toISOString(),
            url: location.href,
            events: snapshot
          }
        }
      })
    );
  };

  const push = (e: any) => {
    e.t = Date.now() - started;
    events.push(e);
    if (events.length >= 20) flush();
  };

  // Intercept fetch
  const _f = window.fetch;
  window.fetch = async function (input: any, init?: any) {
    const url = typeof input === "string" ? input : input?.url;
    const method = ((init?.method || input?.method) ?? "GET").toUpperCase();
    let rb = init?.body;
    try {
      rb = typeof rb === "string" ? rb : undefined;
    } catch {}
    const res = await _f.apply(this, arguments as any);
    let respBody: string | undefined;
    try {
      respBody = clip(await res.clone().text());
    } catch {}
    push({
      kind: "net",
      method,
      url,
      reqBody: clip(rb),
      status: res.status,
      respType: res.headers.get("content-type") ?? "",
      respBody
    });
    return res;
  };

  // Intercept XHR
  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m: string, u: string) {
    (this as any).__osc = { method: (m ?? "GET").toUpperCase(), url: u };
    return _open.apply(this, arguments as any);
  };
  XMLHttpRequest.prototype.send = function (b?: any) {
    const c = (this as any).__osc ?? {};
    this.addEventListener("load", () => {
      let r: string | undefined;
      try {
        r = clip(this.responseText);
      } catch {}
      push({
        kind: "net",
        method: c.method,
        url: c.url,
        reqBody: typeof b === "string" ? clip(b) : undefined,
        status: this.status,
        respType: this.getResponseHeader("content-type") ?? "",
        respBody: r
      });
    });
    return _send.apply(this, arguments as any);
  };

  // Navigation — flush on every nav
  const nav = (u: string) => {
    push({ kind: "nav", url: u });
    flush();
  };
  const _ps = history.pushState;
  history.pushState = function (...args: any[]) {
    nav(args[2]);
    return _ps.apply(this, args);
  };
  window.addEventListener("popstate", () => nav(location.href));
  nav(location.href);

  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
})();
