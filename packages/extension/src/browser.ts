import { AgentContext, BaseBrowserLabelsAgent } from "@openbrowser-ai/core";

export default class BrowserAgent extends BaseBrowserLabelsAgent {
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
      let canGoBack = await this.execute_script(
        agentContext,
        () => {
          return (window as any).navigation.canGoBack;
        },
        []
      );
      if (canGoBack + "" == "true") {
        await this.execute_script(
          agentContext,
          () => {
            (window as any).navigation.back();
          },
          []
        );
        await this.sleep(100);
        return;
      }
      let history_length = await this.execute_script(
        agentContext,
        () => {
          return (window as any).history.length;
        },
        []
      );
      if (history_length > 1) {
        await this.execute_script(
          agentContext,
          () => {
            (window as any).history.back();
          },
          []
        );
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

  protected async click_element(
    agentContext: AgentContext,
    index: number,
    num_clicks: number,
    button: "left" | "right" | "middle"
  ): Promise<any> {
    const clickPoint = await this.execute_script(
      agentContext,
      get_click_point,
      [{ index }]
    );
    const tabId = await this.getTabId(agentContext);
    let cdpResult: any = null;

    if (
      tabId != null &&
      clickPoint?.ok &&
      typeof clickPoint.x === "number" &&
      typeof clickPoint.y === "number" &&
      chrome?.debugger
    ) {
      cdpResult = await this.dispatchDebuggerClick(
        tabId,
        clickPoint.x,
        clickPoint.y,
        button,
        num_clicks
      );
      if (cdpResult?.success) {
        return {
          method: "cdp",
          clickPoint,
          cdp: cdpResult
        };
      }
    }

    const domResult = await super.click_element(
      agentContext,
      index,
      num_clicks,
      button
    );
    return {
      method: "dom",
      clickPoint,
      cdp: cdpResult,
      dom: domResult
    };
  }

  protected async execute_script(
    agentContext: AgentContext,
    func: (...args: any[]) => void,
    args: any[]
  ): Promise<any> {
    let tabId = await this.getTabId(agentContext);
    let frameResults = await chrome.scripting.executeScript({
      target: { tabId: tabId as number },
      func: func,
      args: args
    });
    return frameResults[0].result;
  }

  private async dispatchDebuggerClick(
    tabId: number,
    x: number,
    y: number,
    button: "left" | "middle" | "right",
    num_clicks: number
  ): Promise<{ success: boolean; error?: string }> {
    if (num_clicks <= 0) {
      return { success: false, error: "num_clicks must be > 0" };
    }

    const debuggee = { tabId };
    try {
      await chrome.debugger.attach(debuggee, "1.3");
    } catch (error) {
      return { success: false, error: String(error) };
    }

    const cdpButton =
      button === "right" ? "right" : button === "middle" ? "middle" : "left";
    const buttonsMask =
      cdpButton === "left" ? 1 : cdpButton === "right" ? 2 : 4;

    try {
      await chrome.debugger.sendCommand(debuggee, "Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x,
        y,
        button: cdpButton,
        buttons: buttonsMask
      });

      for (let i = 0; i < num_clicks; i++) {
        const clickCount = i + 1;
        await chrome.debugger.sendCommand(
          debuggee,
          "Input.dispatchMouseEvent",
          {
            type: "mousePressed",
            x,
            y,
            button: cdpButton,
            buttons: buttonsMask,
            clickCount
          }
        );
        await chrome.debugger.sendCommand(
          debuggee,
          "Input.dispatchMouseEvent",
          {
            type: "mouseReleased",
            x,
            y,
            button: cdpButton,
            buttons: buttonsMask,
            clickCount
          }
        );

        if (i < num_clicks - 1) {
          await this.sleep(10);
        }
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    } finally {
      try {
        await chrome.debugger.detach(debuggee);
      } catch (e) {}
    }
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
    if (tabs.length == 0) {
      return null;
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
        clearTimeout(time);
        resolve(tab);
        return;
      }
      chrome.tabs.onUpdated.addListener(listener);
    });
  }

  private sleep(time: number): Promise<void> {
    return new Promise((resolve) => setTimeout(() => resolve(), time));
  }
}

function get_click_point(params: { index: number }) {
  const index = params.index;
  const result: any = {
    ok: false,
    index,
    reason: "",
    x: 0,
    y: 0,
    tag: "",
    topTag: "",
    inIframe: false
  };
  const element = (window as any).get_highlight_element(index);
  if (!element) {
    result.reason = "element_not_found";
    return result;
  }
  try {
    element.scrollIntoView({ block: "center", inline: "center" });
  } catch (e) {}

  const rect = element.getBoundingClientRect();
  if (!rect || rect.width === 0 || rect.height === 0) {
    result.reason = "zero_rect";
    return result;
  }

  const viewportWidth =
    window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight =
    window.innerHeight || document.documentElement.clientHeight || 0;
  if (
    rect.bottom < 0 ||
    rect.top > viewportHeight ||
    rect.right < 0 ||
    rect.left > viewportWidth
  ) {
    result.reason = "offscreen";
    return result;
  }

  let x = rect.left + rect.width / 2;
  let y = rect.top + rect.height / 2;
  let win = element.ownerDocument ? element.ownerDocument.defaultView : null;
  let depth = 0;
  while (win && win !== win.parent && depth < 10) {
    depth++;
    const frameElement = win.frameElement as any;
    if (!frameElement) {
      break;
    }
    const frameRect = frameElement.getBoundingClientRect();
    x += frameRect.left;
    y += frameRect.top;
    try {
      const frameStyle = (
        frameElement.ownerDocument?.defaultView || window
      ).getComputedStyle(frameElement);
      x += parseFloat(frameStyle.borderLeftWidth) || 0;
      y += parseFloat(frameStyle.borderTopWidth) || 0;
      x += parseFloat(frameStyle.paddingLeft) || 0;
      y += parseFloat(frameStyle.paddingTop) || 0;
    } catch (e) {}
    win = win.parent;
  }
  result.inIframe = depth > 0;

  x = Math.min(Math.max(x, 0), Math.max(viewportWidth - 1, 0));
  y = Math.min(Math.max(y, 0), Math.max(viewportHeight - 1, 0));

  let topEl: Element | null = null;
  try {
    topEl = document.elementFromPoint(x, y);
  } catch (e) {}

  result.ok = true;
  result.x = Math.round(x);
  result.y = Math.round(y);
  result.tag = element.tagName || "";
  result.topTag = topEl ? (topEl as any).tagName || "" : "";
  result.rect = {
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  };
  return result;
}

export { BrowserAgent };
