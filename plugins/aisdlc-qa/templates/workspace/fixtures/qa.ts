// QA test fixture: import { test, expect } from here instead of '@playwright/test'.
// qaStep(title, body) runs one scenario step as a Playwright step and then screenshots the page, passed or failed, so
// QA sees every step in the HTML report and the evidence folder keeps one picture per step:
//   $QA_EVIDENCE_DIR/screenshots/<TICKET>-S<n>/<nn>-<step>.png   (failing step: <nn>-<step>-FAILED.png)
// Tabs or popups opened or changed during the step (a PDF, a report) are screenshotted too: <nn>-<step>-tab<k>.png.
// The scenario folder comes from the test's @<TICKET>-S<n> tag; without one (ad-hoc checks), the test title's slug.
import { test as base, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

type QaFixtures = {
  qaStep: (title: string, body: () => Promise<void>) => Promise<void>;
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'step';

export const test = base.extend<QaFixtures>({
  qaStep: async ({ page }, use, testInfo) => {
    const scenarioTag = testInfo.tags.find((t) => /^@[A-Z][A-Z0-9]*-\d+-S\d+$/.test(t));
    const folder = scenarioTag ? scenarioTag.slice(1) : slug(testInfo.title);
    const evidence = process.env.QA_EVIDENCE_DIR;
    const dir = evidence ? path.join(evidence, 'screenshots', folder) : testInfo.outputPath('steps');
    const retry = testInfo.retry ? `retry${testInfo.retry}-` : '';
    const shoot = async (p: Page, name: string) => {
      const file = path.join(dir, `${name}.png`);
      const shot = await p.screenshot({ path: file, fullPage: true }).catch(() => undefined);
      if (shot) await testInfo.attach(name, { path: file, contentType: 'image/png' });
    };
    let n = 0;
    await use(async (title, body) => {
      n += 1;
      const label = `${retry}${String(n).padStart(2, '0')}-${slug(title)}`;
      const before = new Map(page.context().pages().map((p) => [p, p.url()]));
      let failed = false;
      try {
        await base.step(title, body);
      } catch (e) {
        failed = true;
        throw e;
      } finally {
        fs.mkdirSync(dir, { recursive: true });
        if (!page.isClosed()) await shoot(page, `${label}${failed ? '-FAILED' : ''}`);
        // The step's real result may be in another tab (a PDF, a popup): capture every tab that is new or moved.
        let k = 0;
        for (const p of page.context().pages()) {
          if (p === page || p.isClosed() || before.get(p) === p.url()) continue;
          await p.waitForLoadState('load', { timeout: 5_000 }).catch(() => {});
          await shoot(p, `${label}-tab${++k}`);
        }
      }
    });
  },
});

export { expect };
