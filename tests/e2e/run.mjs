/**
 * Every end-to-end case. Run with `npm run e2e` against a running dev server.
 */
import { expect, run, scrollsSideways } from "./harness.mjs";

const PHONE = "iPhone 13";

await run([
  {
    name: "no page scrolls sideways on a phone",
    device: PHONE,
    async fn({ page, base }) {
      // The board was 558px of content in a 390px viewport: the header's
      // min-content width became the page's, and the board slid around under
      // a row of controls running off the right edge.
      for (const path of [
        "/app", "/materials", "/courses", "/calendar", "/quiz",
        "/practice-exam", "/exam-review", "/review", "/progress",
        "/sessions", "/voice", "/settings",
      ]) {
        await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
        await page.waitForTimeout(500);
        expect(!(await scrollsSideways(page)), `${path} scrolls sideways`);
      }
    },
  },
  {
    name: "the board's three panels are all reachable on a phone",
    device: PHONE,
    async fn({ page }) {
      for (const [tab, marker] of [
        ["Material", "Drop notes"],
        ["Ask", "Ask anything"],
        ["Board", "Whiteboard"],
      ]) {
        await page.getByRole("button", { name: tab, exact: true }).click();
        await page.waitForTimeout(400);
        expect(
          await page.getByText(marker, { exact: false }).first().isVisible(),
          `the ${tab} tab doesn't show ${marker}`,
        );
      }
    },
  },
  {
    name: "the tour opens on a first visit and stays shut after",
    async fn({ page, base }) {
      // signUp dismisses it, so this checks the remembering half.
      await page.goto(`${base}/app`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1200);
      expect(await page.getByRole("dialog").count() === 0, "the tour reopened");
      await page.getByRole("button", { name: "How this works" }).first().click();
      await page.waitForTimeout(400);
      expect(await page.getByRole("dialog").count() === 1, "the ? button didn't reopen it");
    },
  },
  {
    name: "every page in the nav actually loads",
    async fn({ page, base }) {
      for (const path of [
        "/materials", "/courses", "/calendar", "/quiz", "/practice-exam",
        "/exam-review", "/review", "/progress", "/sessions", "/voice", "/settings",
      ]) {
        const response = await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
        expect(response?.ok(), `${path} returned ${response?.status()}`);
        expect(await page.locator("h1, h2").count() > 0, `${path} rendered nothing`);
      }
    },
  },
  {
    name: "moving between pages never shows a loading skeleton twice",
    async fn({ page, base }) {
      // The library is fetched once and kept; a second visit that re-renders a
      // skeleton means the snapshot was lost.
      await page.goto(`${base}/materials`, { waitUntil: "networkidle" });
      await page.waitForTimeout(800);
      await page.goto(`${base}/progress`, { waitUntil: "networkidle" });
      await page.getByRole("link", { name: "Material", exact: true }).first().click();
      await page.waitForURL("**/materials");
      expect(
        await page.getByText(/^Loading/i).count() === 0,
        "a revisit still flashes a loading state",
      );
    },
  },
]);
