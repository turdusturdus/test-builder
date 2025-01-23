import { defineConfig, devices } from '@playwright/test';
import config from './config.js';

export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.js',
  snapshotPathTemplate: '{testDir}/{arg}-{projectName}.png',

  reporter: 'html',
  use: {
    baseURL: config.basePageUrl,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],
});
