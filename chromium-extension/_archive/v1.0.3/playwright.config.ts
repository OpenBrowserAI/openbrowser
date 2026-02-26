import { defineConfig } from "playwright/test";

export default defineConfig({
  testDir: "e2e",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  // NOTE: extension tests create their own persistent Chromium context in `e2e/fixtures.ts`.
  reporter: "list"
});
