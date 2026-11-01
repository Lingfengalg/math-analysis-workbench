import { defineConfig, devices } from '@playwright/test';

/**
 * 默认只跑 Chromium（保持现有验收基线不变）。
 * 设置 CROSS_BROWSER=1 时切换为 Firefox / WebKit 的跨浏览器基线，
 * 只运行 e2e/cross-browser.spec.ts，用于可选的兼容性 job。
 */
const crossBrowser = process.env.CROSS_BROWSER === '1';

export default defineConfig({
  testDir: './e2e',
  testMatch: crossBrowser ? /cross-browser\.spec\.ts/ : undefined,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ...(crossBrowser
      ? [
          { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
          { name: 'webkit', use: { ...devices['Desktop Safari'] } },
        ]
      : []),
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
});
