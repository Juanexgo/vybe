import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  expect: {timeout: 15_000},
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  },
  reporter: [["list"], ["html", { open: "never" }]],
});
