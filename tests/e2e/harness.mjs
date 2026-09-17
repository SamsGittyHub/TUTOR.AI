/**
 * A tiny end-to-end harness.
 *
 * No test framework, for the same reason there isn't one for the unit tests:
 * a runner that takes four seconds to start gets run. Each case is a function
 * handed a fresh signed-in page; the harness owns the browser, the account and
 * the reporting.
 *
 * These check things only a real browser can answer — that a page doesn't
 * scroll sideways on a phone, that a download actually arrives, that a button
 * a student needs is on screen. The pure logic is already covered by
 * `npm test`; duplicating it here would only make this slow enough to skip.
 */
import { chromium, devices } from "playwright";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";

let passed = 0;
let failed = 0;

export function expect(condition, message) {
  if (!condition) throw new Error(message);
}

/** Signs up a fresh account, so no case can depend on another's leftovers. */
async function signUp(page) {
  await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(`e2e${Date.now()}${Math.random().toString(36).slice(2, 7)}@example.com`);
  await page.getByLabel("Password").fill("a good long password");
  await page.getByRole("button", { name: /Create free account/i }).click();
  await page.waitForURL("**/app", { timeout: 30000 });
  await page.waitForTimeout(1200);
  // The tour opens itself on a first visit and would swallow every click.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
}

export async function run(cases) {
  const browser = await chromium.launch({
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  });

  for (const { name, device, fn } of cases) {
    const context = await browser.newContext({
      ...(device ? devices[device] : { viewport: { width: 1400, height: 900 } }),
      permissions: ["microphone"],
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    try {
      await signUp(page);
      await fn({ page, context, base: BASE });
      // A case that passes while the console is on fire hasn't passed.
      expect(errors.length === 0, `uncaught page errors: ${errors.slice(0, 2).join(" | ")}`);
      passed += 1;
      console.log(`  ok  ${name}`);
    } catch (error) {
      failed += 1;
      console.log(`FAIL  ${name}\n      ${error.message.split("\n")[0]}`);
    } finally {
      await context.close();
    }
  }

  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed) process.exitCode = 1;
}

/** True when the document is wider than the screen — the phone-layout smell. */
export async function scrollsSideways(page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
}
