// Setup project: signs in once and saves the session to .auth/<env>.json for every test (see playwright.config.ts).
// Credentials come from the QA_USERNAME / QA_PASSWORD environment variables, else from .env (never claude.env): a
// test account on a non-production environment with synthetic data. Adjust the login fields in
// config/environments.yaml (labels, or selectors which take precedence), not here, when they differ.
import { test as setup, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { credential, qaTarget } from '../fixtures/env';

const target = qaTarget();

// exact: a substring match would also hit e.g. a "toggle password visibility" button next to the password field.
const field = (page: Page, selector: string | undefined, label: string) =>
  selector ? page.locator(selector) : page.getByLabel(label, { exact: true });

setup('authenticate', async ({ page }) => {
  fs.mkdirSync(path.dirname(target.storageState), { recursive: true });
  const login = target.login;

  if (login.mode === 'none') {
    await page.context().storageState({ path: target.storageState });
    return;
  }
  if (login.mode === 'manual') {
    if (!fs.existsSync(target.storageState))
      throw new Error(
        `No saved login for '${target.name}'. Capture one by hand: ` +
          `npx playwright codegen --save-storage=.auth/${target.name}.json ${target.baseURL}`,
      );
    return;
  }

  const username = credential('QA_USERNAME');
  const password = credential('QA_PASSWORD');
  if (!username || !password)
    throw new Error('Set QA_USERNAME and QA_PASSWORD in .env or as environment variables (test account, synthetic data only).');
  const passwordField = field(page, login.password_selector, login.password_label || 'Password');
  await page.goto(login.path || '/');
  await field(page, login.username_selector, login.username_label || 'Email').fill(username);
  await passwordField.fill(password);
  const submit = login.submit_selector
    ? page.locator(login.submit_selector)
    : page.getByRole('button', { name: login.submit_name || 'Sign in', exact: true });
  await submit.click();
  if (login.success_url) await page.waitForURL(login.success_url);
  else {
    // Weak check: a login that fails with an error message can still hide the form. Suggest a success_url.
    await expect(passwordField).toBeHidden();
    console.log(`[aisdlc-qa] signed in and landed on ${new URL(page.url()).pathname}; set login.success_url to ` +
      `"**${new URL(page.url()).pathname}" in config/environments.yaml so a failed login cannot pass.`);
  }
  await page.context().storageState({ path: target.storageState });
});
