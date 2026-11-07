// Seed test for the Playwright planner and generator agents: they run it first, so the browser they explore in starts
// on the app, signed in (the setup project's saved session). Keep it minimal; it is not part of any ticket's run.
import { test } from "../fixtures/qa";

test("seed", { tag: "@seed" }, async ({ page }) => {
  await page.goto("/");
});
