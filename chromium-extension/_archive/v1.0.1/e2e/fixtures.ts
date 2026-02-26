import {
  test as base,
  chromium,
  type BrowserContext,
  type Page,
  type Worker
} from "playwright/test";
import fs from "fs";
import os from "os";
import path from "path";

type Fixtures = {
  context: BrowserContext;
  background: Worker;
  extensionId: string;
  extPage: Page;
};

export const test = base.extend<Fixtures>({
  context: async ({}, use) => {
    const extPath = path.resolve(__dirname, "..", "dist");
    const manifestPath = path.join(extPath, "manifest.json");
    if (!fs.existsSync(manifestPath)) {
      throw new Error(
        `Extension dist missing. Build first: pnpm -C core/tools/openbrowser/chromium-extension build (missing ${manifestPath})`
      );
    }

    const userDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "soca-openbrowser-e2e-")
    );
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${extPath}`,
        `--load-extension=${extPath}`
      ]
    });

    try {
      await use(context);
    } finally {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  },

  background: async ({ context }, use) => {
    const isExtSW = (w: Worker) => w.url().startsWith("chrome-extension://");
    let bg = context.serviceWorkers().find(isExtSW);
    if (!bg) {
      bg = await context.waitForEvent("serviceworker", isExtSW);
    }
    await use(bg);
  },

  extensionId: async ({ background }, use) => {
    const url = background.url();
    const id = url.split("/")[2];
    await use(id);
  },

  extPage: async ({ context, extensionId }, use) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await page.waitForLoadState("domcontentloaded");
    await use(page);
    await page.close();
  }
});

export { expect } from "playwright/test";
