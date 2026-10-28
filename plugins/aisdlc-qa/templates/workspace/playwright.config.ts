// Playwright configuration for the QA workspace (managed by the aisdlc-qa plugin).
// - Target: config/environments.yaml, chosen by QA_ENV; production is refused (fixtures/env.ts).
// - Tests: tests/ (ticket tests, the regression suite) and checks/ (ad-hoc checks without a ticket).
// - Visible by default so QA can watch; headless when CI or QA_HEADLESS=1. QA_SLOWMO slows each action (ms).
// - QA_EVIDENCE_DIR (set by the plugin's run-tests.js / run-check.js) turns on full evidence in that folder: a trace and
//   a screenshot for every test, an HTML report and a JSON report. Per-step screenshots (fixtures/qa.ts) are the proof;
//   video only when asked for (QA_VIDEO=1).
// - Playwright empties its outputDir at the start of every run, so it gets its own subfolder: the rest of test-results/
//   (local proof of earlier checks) survives.
// - The "setup" project signs in once and saves the session to .auth/<env>.json; it records no trace, video or
//   screenshot so credentials never end up in evidence.
import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { qaTarget, setting } from './fixtures/env';

const target = qaTarget();
const evidence = process.env.QA_EVIDENCE_DIR ? path.resolve(process.env.QA_EVIDENCE_DIR) : undefined;
const headless = !!process.env.CI || process.env.QA_HEADLESS === '1';
const slowMo = Number(setting('QA_SLOWMO') || 0);

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: headless ? undefined : 1,
  outputDir: evidence ? path.join(evidence, 'artifacts') : path.join('test-results', '.playwright'),
  reporter: evidence
    ? [
        ['list'],
        ['html', { outputFolder: path.join(evidence, 'report'), open: 'never' }],
        ['json', { outputFile: path.join(evidence, 'results.json') }],
      ]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: target.baseURL,
    headless,
    launchOptions: { slowMo },
    testIdAttribute: target.testIdAttribute,
    trace: evidence ? 'on' : process.env.CI ? 'on-first-retry' : 'retain-on-failure',
    // Screenshots per step are the proof; video only when asked for (QA_VIDEO=1, run-tests.js --video).
    video: process.env.QA_VIDEO === '1' ? 'on' : 'off',
    screenshot: evidence ? 'on' : 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /tests[\\/]auth\.setup\.ts$/, use: { trace: 'off', video: 'off', screenshot: 'off' } },
    {
      name: 'chromium',
      testMatch: /(^|[\\/])(tests|checks)[\\/].*\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], storageState: target.storageState },
      dependencies: ['setup'],
    },
  ],
});
