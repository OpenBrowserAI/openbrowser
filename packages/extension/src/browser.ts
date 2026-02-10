import { AgentContext, BaseBrowserLabelsAgent } from "@openbrowser-ai/core";

type ObSnapshot = {
  tabId: number;
  frameId: number;
  documentId?: string | null;
  docInstanceId?: string | null;
  pageSigHash: string;
  pinHashByIndex: Record<string, string>;
  observedAt: number;
};

type DocState = {
  url: string;
  documentId?: string;
  updatedAt: number;
};

const docStateByTabFrame = new Map<string, DocState>();
const docKey = (tabId: number, frameId: number) => `${tabId}:${frameId}`;

let webNavListenersInstalled = false;
function ensureWebNavListeners() {
  if (webNavListenersInstalled) return;
  webNavListenersInstalled = true;

  chrome.webNavigation.onCommitted.addListener((d) => {
    docStateByTabFrame.set(docKey(d.tabId, d.frameId ?? 0), {
      url: d.url,
      documentId: (d as any).documentId,
      updatedAt: Date.now()
    });
  });

  chrome.webNavigation.onHistoryStateUpdated.addListener((d) => {
    docStateByTabFrame.set(docKey(d.tabId, d.frameId ?? 0), {
      url: d.url,
      documentId: (d as any).documentId,
      updatedAt: Date.now()
    });
  });
}

export default class BrowserAgent extends BaseBrowserLabelsAgent {
  constructor() {
    super();
    ensureWebNavListeners();
  }

  protected async screenshot(
    agentContext: AgentContext
  ): Promise<{ imageBase64: string; imageType: "image/jpeg" | "image/png" }> {
    let windowId = await this.getWindowId(agentContext);
    let dataUrl;
    try {
      dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
        format: "jpeg",
        quality: 60
      });
    } catch (e) {
      await this.sleep(1000);
      dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
        format: "jpeg",
        quality: 60
      });
    }
    let data = dataUrl.substring(dataUrl.indexOf("base64,") + 7);
    return {
      imageBase64: data,
      imageType: "image/jpeg"
    };
  }

  protected async navigate_to(
    agentContext: AgentContext,
    url: string
  ): Promise<{
    url: string;
    title?: string;
    tabId?: number;
  }> {
    let windowId = await this.getWindowId(agentContext);
    let tab = await chrome.tabs.create({
      url: url,
      windowId: windowId
    });
    tab = await this.waitForTabComplete(tab.id);
    await this.sleep(200);
    agentContext.variables.set("windowId", tab.windowId);
    let navigateTabIds = agentContext.variables.get("navigateTabIds") || [];
    navigateTabIds.push(tab.id);
    agentContext.variables.set("navigateTabIds", navigateTabIds);
    return {
      url: url,
      title: tab.title,
      tabId: tab.id
    };
  }

  protected async get_all_tabs(
    agentContext: AgentContext
  ): Promise<Array<{ tabId: number; url: string; title: string }>> {
    let windowId = await this.getWindowId(agentContext);
    let tabs = await chrome.tabs.query({
      windowId: windowId
    });
    let result: Array<{ tabId: number; url: string; title: string }> = [];
    for (let i = 0; i < tabs.length; i++) {
      let tab = tabs[i];
      result.push({
        tabId: tab.id,
        url: tab.url,
        title: tab.title
      });
    }
    return result;
  }

  protected async switch_tab(
    agentContext: AgentContext,
    tabId: number
  ): Promise<{ tabId: number; url: string; title: string }> {
    let tab = await chrome.tabs.update(tabId, { active: true });
    if (!tab) {
      throw new Error("tabId does not exist: " + tabId);
    }
    agentContext.variables.set("windowId", tab.windowId);
    return {
      tabId: tab.id,
      url: tab.url,
      title: tab.title
    };
  }

  protected async go_back(agentContext: AgentContext): Promise<any> {
    try {
      let canGoBack = await this.execute_script(agentContext, () => {
        return (window as any).navigation.canGoBack;
      }, []);
      if (canGoBack + "" == "true") {
        await this.execute_script(agentContext, () => {
          (window as any).navigation.back();
        }, []);
        await this.sleep(100);
        return;
      }
      let history_length = await this.execute_script(agentContext, () => {
        return (window as any).history.length;
      }, []);
      if (history_length > 1) {
        await this.execute_script(agentContext, () => {
          (window as any).history.back();
        }, []);
      } else {
        let navigateTabIds = agentContext.variables.get("navigateTabIds");
        if (navigateTabIds && navigateTabIds.length > 0) {
          return await this.switch_tab(
            agentContext,
            navigateTabIds[navigateTabIds.length - 1]
          );
        }
      }
      await this.sleep(100);
    } catch (e) {
      console.error("BrowserAgent, go_back, error: ", e);
    }
  }

  protected async execute_script(
    agentContext: AgentContext,
    func: (...args: any[]) => void,
    args: any[]
  ): Promise<any> {
    ensureWebNavListeners();
    const tabId = await this.getTabId(agentContext);
    const frameId = 0;

    // Bind execution to the current tab/frame/document for later write gating.
    agentContext.variables.set("__ob_tabId", tabId);
    agentContext.variables.set("__ob_frameId", frameId);
    const doc = docStateByTabFrame.get(docKey(tabId as number, frameId));
    agentContext.variables.set("__ob_documentId", doc?.documentId || null);
    let frameResults = await chrome.scripting.executeScript({
      target: { tabId: tabId as number, frameIds: [frameId] },
      func: func,
      args: args
    });
    return frameResults[0].result;
  }

  private readSnapshot(agentContext: AgentContext): ObSnapshot {
    const snapshot = agentContext.variables.get("__ob_snapshot") as
      | ObSnapshot
      | undefined;
    if (!snapshot) {
      throw new Error("fail_closed:no_snapshot");
    }
    return snapshot;
  }

  private async currentDocState(
    tabId: number,
    frameId: number
  ): Promise<DocState | null> {
    ensureWebNavListeners();
    return docStateByTabFrame.get(docKey(tabId, frameId)) || null;
  }

  private expectedPin(snapshot: ObSnapshot, index: number): string {
    return (
      snapshot.pinHashByIndex[String(index)] ||
      snapshot.pinHashByIndex[index as any] ||
      ""
    );
  }

  private async runWriteWithGate<T>(
    agentContext: AgentContext,
    index: number,
    op: (opts: {
      expectedPageSigHash: string;
      expectedDocInstanceId: string;
      expectedPinHash: string;
    }) => Promise<T>
  ): Promise<T> {
    const snapshot = this.readSnapshot(agentContext);
    const tabId = (await this.getTabId(agentContext)) as number;
    const frameId = snapshot.frameId ?? 0;

    if (snapshot.tabId !== tabId) {
      throw new Error("fail_closed:tab_mismatch");
    }
    if (frameId !== 0) {
      throw new Error("fail_closed:frame_mismatch");
    }

    const doc = await this.currentDocState(tabId, frameId);
    if (
      snapshot.documentId &&
      doc?.documentId &&
      snapshot.documentId !== doc.documentId
    ) {
      throw new Error("fail_closed:documentId_mismatch");
    }

    const expectedPinHash = this.expectedPin(snapshot, index);
    if (!expectedPinHash) {
      throw new Error("fail_closed:no_expected_pin");
    }

    return await op({
      expectedPageSigHash: snapshot.pageSigHash,
      expectedDocInstanceId: String(snapshot.docInstanceId || ""),
      expectedPinHash
    });
  }

  protected override async click_element(
    agentContext: AgentContext,
    index: number,
    num_clicks: number,
    button: "left" | "right" | "middle"
  ): Promise<any> {
    return await this.runWriteWithGate(
      agentContext,
      index,
      async (expected) => {
        const tabId = (await this.getTabId(agentContext)) as number;
        const [{ result }] = await chrome.scripting.executeScript({
          target: { tabId, frameIds: [0] },
          func: (idx: number, numClicks: number, btn: string, exp: any) => {
            try {
              const w: any = window as any;
              if (typeof w.get_clickable_elements !== "function") {
                return { ok: false, reason: "fail_closed:missing_dom_tree" };
              }
              const guard =
                w.get_clickable_elements(false, undefined, { mode: "guard" }) ||
                {};
              const pageSigHash = String(guard.pageSigHash || "");
              const docInstanceId = String(guard.docInstanceId || "");
              const pinHash = String((guard.pinHashByIndex || {})[idx] || "");

              if (!pageSigHash || pageSigHash !== exp.expectedPageSigHash) {
                return {
                  ok: false,
                  reason: "fail_closed:pageSigHash_mismatch"
                };
              }
              if (
                exp.expectedDocInstanceId &&
                docInstanceId !== exp.expectedDocInstanceId
              ) {
                return {
                  ok: false,
                  reason: "fail_closed:docInstanceId_mismatch"
                };
              }
              if (!pinHash || pinHash !== exp.expectedPinHash) {
                return { ok: false, reason: "fail_closed:pinHash_mismatch" };
              }

              const element = w.get_highlight_element?.(idx);
              if (!element) return { ok: false, reason: "element_not_found" };

              const buttonCode = btn === "right" ? 2 : btn === "middle" ? 1 : 0;
              const eventTypes =
                btn === "right"
                  ? ["mousedown", "mouseup", "contextmenu"]
                  : ["mousedown", "mouseup", "click"];

              for (let n = 0; n < numClicks; n++) {
                for (const eventType of eventTypes) {
                  const event = new MouseEvent(eventType, {
                    view: window,
                    bubbles: true,
                    cancelable: true,
                    button: buttonCode as any
                  });
                  if (eventType === "click" && element.click) {
                    element.click();
                  } else {
                    element.dispatchEvent(event);
                  }
                  element.focus?.();
                }
              }
              return { ok: true };
            } catch (e: any) {
              return { ok: false, reason: String(e?.message || e) };
            }
          },
          args: [index, num_clicks, button, expected]
        });

        if (!result?.ok) {
          throw new Error(String(result?.reason || "click_failed"));
        }
        return result;
      }
    );
  }

  protected override async input_text(
    agentContext: AgentContext,
    index: number,
    text: string,
    enter: boolean
  ): Promise<any> {
    return await this.runWriteWithGate(
      agentContext,
      index,
      async (expected) => {
        const tabId = (await this.getTabId(agentContext)) as number;
        const [{ result }] = await chrome.scripting.executeScript({
          target: { tabId, frameIds: [0] },
          func: (idx: number, t: string, doEnter: boolean, exp: any) => {
            try {
              const w: any = window as any;
              if (typeof w.get_clickable_elements !== "function") {
                return { ok: false, reason: "fail_closed:missing_dom_tree" };
              }
              const guard =
                w.get_clickable_elements(false, undefined, { mode: "guard" }) ||
                {};
              const pageSigHash = String(guard.pageSigHash || "");
              const docInstanceId = String(guard.docInstanceId || "");
              const pinHash = String((guard.pinHashByIndex || {})[idx] || "");

              if (!pageSigHash || pageSigHash !== exp.expectedPageSigHash) {
                return {
                  ok: false,
                  reason: "fail_closed:pageSigHash_mismatch"
                };
              }
              if (
                exp.expectedDocInstanceId &&
                docInstanceId !== exp.expectedDocInstanceId
              ) {
                return {
                  ok: false,
                  reason: "fail_closed:docInstanceId_mismatch"
                };
              }
              if (!pinHash || pinHash !== exp.expectedPinHash) {
                return { ok: false, reason: "fail_closed:pinHash_mismatch" };
              }

              const element = w.get_highlight_element?.(idx);
              if (!element) return { ok: false, reason: "element_not_found" };

              let input: any;
              if (element.tagName === "IFRAME") {
                const iframeDoc =
                  element.contentDocument || element.contentWindow?.document;
                input =
                  iframeDoc?.querySelector("textarea") ||
                  iframeDoc?.querySelector('*[contenteditable="true"]') ||
                  iframeDoc?.querySelector("input");
              } else if (
                element.tagName === "INPUT" ||
                element.tagName === "TEXTAREA" ||
                element.childElementCount === 0
              ) {
                input = element;
              } else {
                input =
                  element.querySelector("input") ||
                  element.querySelector("textarea");
                if (!input) {
                  input =
                    element.querySelector('*[contenteditable="true"]') ||
                    element;
                  if (input.tagName === "DIV") {
                    input =
                      input.querySelector("span") ||
                      input.querySelector("div") ||
                      input;
                  }
                }
              }
              input?.focus?.();

              if (!t && doEnter) {
                ["keydown", "keypress", "keyup"].forEach((eventType) => {
                  const ev = new KeyboardEvent(eventType, {
                    key: "Enter",
                    code: "Enter",
                    keyCode: 13,
                    bubbles: true,
                    cancelable: true
                  } as any);
                  input.dispatchEvent(ev);
                });
                return { ok: true };
              }

              if (input?.value === undefined) {
                input.textContent = t;
              } else {
                input.value = t;
                if (input.__proto__) {
                  const valueSetter = Object.getOwnPropertyDescriptor(
                    input.__proto__ as any,
                    "value"
                  )?.set;
                  valueSetter && valueSetter.call(input, t);
                }
              }
              input.dispatchEvent(new Event("input", { bubbles: true }));

              if (doEnter) {
                ["keydown", "keypress", "keyup"].forEach((eventType) => {
                  const ev = new KeyboardEvent(eventType, {
                    key: "Enter",
                    code: "Enter",
                    keyCode: 13,
                    bubbles: true,
                    cancelable: true
                  } as any);
                  input.dispatchEvent(ev);
                });
              }

              return { ok: true };
            } catch (e: any) {
              return { ok: false, reason: String(e?.message || e) };
            }
          },
          args: [index, text, enter, expected]
        });

        if (!result?.ok) {
          throw new Error(String(result?.reason || "input_failed"));
        }
        return result;
      }
    );
  }

  protected override async select_option(
    agentContext: AgentContext,
    index: number,
    option: string
  ): Promise<any> {
    return await this.runWriteWithGate(
      agentContext,
      index,
      async (expected) => {
        const tabId = (await this.getTabId(agentContext)) as number;
        const [{ result }] = await chrome.scripting.executeScript({
          target: { tabId, frameIds: [0] },
          func: (idx: number, opt: string, exp: any) => {
            try {
              const w: any = window as any;
              if (typeof w.get_clickable_elements !== "function") {
                return { ok: false, reason: "fail_closed:missing_dom_tree" };
              }
              const guard =
                w.get_clickable_elements(false, undefined, { mode: "guard" }) ||
                {};
              const pageSigHash = String(guard.pageSigHash || "");
              const docInstanceId = String(guard.docInstanceId || "");
              const pinHash = String((guard.pinHashByIndex || {})[idx] || "");

              if (!pageSigHash || pageSigHash !== exp.expectedPageSigHash) {
                return {
                  ok: false,
                  reason: "fail_closed:pageSigHash_mismatch"
                };
              }
              if (
                exp.expectedDocInstanceId &&
                docInstanceId !== exp.expectedDocInstanceId
              ) {
                return {
                  ok: false,
                  reason: "fail_closed:docInstanceId_mismatch"
                };
              }
              if (!pinHash || pinHash !== exp.expectedPinHash) {
                return { ok: false, reason: "fail_closed:pinHash_mismatch" };
              }

              const el = w.get_highlight_element?.(idx);
              if (!el || el.tagName?.toUpperCase() !== "SELECT") {
                return { ok: false, reason: "not_select_element" };
              }
              const text = String(opt || "").trim();
              let found = Array.from((el as any).options || []).find(
                (o: any) => String(o.text || "").trim() === text
              ) as any;
              if (!found) {
                found = Array.from((el as any).options || []).find(
                  (o: any) => String(o.value || "").trim() === text
                ) as any;
              }
              if (!found) {
                return {
                  ok: false,
                  reason: "select_option_not_found",
                  availableOptions: Array.from((el as any).options || []).map(
                    (o: any) => String(o.text || "").trim()
                  )
                };
              }
              (el as any).value = found.value;
              el.dispatchEvent(new Event("change"));
              return {
                ok: true,
                selectedValue: found.value,
                selectedText: String(found.text || "").trim()
              };
            } catch (e: any) {
              return { ok: false, reason: String(e?.message || e) };
            }
          },
          args: [index, option, expected]
        });

        if (!result?.ok) {
          throw new Error(String(result?.reason || "select_failed"));
        }
        return result;
      }
    );
  }

  private async getTabId(agentContext: AgentContext): Promise<number | null> {
    let windowId = await this.getWindowId(agentContext);
    let tabs = (await chrome.tabs.query({
      windowId,
      active: true,
      windowType: "normal"
    })) as any[];
    if (tabs.length == 0) {
      tabs = (await chrome.tabs.query({
        windowId,
        windowType: "normal"
      })) as any[];
    }
    return tabs[tabs.length - 1].id as number;
  }

  private async getWindowId(
    agentContext: AgentContext
  ): Promise<number | null> {
    let windowId = agentContext.variables.get("windowId") as number;
    if (windowId) {
      return windowId;
    }
    windowId = agentContext.context.variables.get("windowId") as number;
    if (windowId) {
      return windowId;
    }
    let window = await chrome.windows.getLastFocused({
      windowTypes: ["normal"]
    });
    if (!window) {
      window = await chrome.windows.getCurrent({
        windowTypes: ["normal"]
      });
    }
    if (window) {
      return window.id;
    }
    let tabs = (await chrome.tabs.query({
      windowType: "normal",
      currentWindow: true
    })) as any[];
    if (tabs.length == 0) {
      tabs = (await chrome.tabs.query({
        windowType: "normal",
        lastFocusedWindow: true
      })) as any[];
    }
    return tabs[tabs.length - 1].windowId as number;
  }

  private async waitForTabComplete(
    tabId: number,
    timeout: number = 8000
  ): Promise<chrome.tabs.Tab> {
    return new Promise(async (resolve, reject) => {
      const time = setTimeout(async () => {
        chrome.tabs.onUpdated.removeListener(listener);
        let tab = await chrome.tabs.get(tabId);
        if (tab.status === "complete") {
          resolve(tab);
        } else {
          resolve(tab);
        }
      }, timeout);
      const listener = async (updatedTabId: any, changeInfo: any, tab: any) => {
        if (updatedTabId == tabId && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          clearTimeout(time);
          resolve(tab);
        }
      };
      let tab = await chrome.tabs.get(tabId);
      if (tab.status === "complete") {
        resolve(tab);
        clearTimeout(time);
        return;
      }
      chrome.tabs.onUpdated.addListener(listener);
    });
  }

  private sleep(time: number): Promise<void> {
    return new Promise((resolve) => setTimeout(() => resolve(), time));
  }
}

export { BrowserAgent };
