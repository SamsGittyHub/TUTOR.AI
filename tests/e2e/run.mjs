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
  {
    name: "feedback can be sent from inside the app",
    async fn({ page }) {
      await page.getByRole("button", { name: "Send feedback" }).first().click();
      await page.waitForTimeout(300);
      await page.getByPlaceholder(/The board went blank/i).fill(
        "e2e: the diagram labels overlapped on the redox lesson",
      );
      await page.getByRole("button", { name: "Send this feedback" }).click();
      await page.waitForTimeout(1200);
      expect(
        await page.getByText(/genuinely helps/i).count() === 1,
        "no confirmation after sending",
      );
    },
  },
  {
    name: "a spoken lesson reopens as a spoken lesson",
    async fn({ page, base }) {
      // Saved straight through the API: driving a real realtime session from a
      // test would be testing OpenAI, not this.
      const id = `s_${crypto.randomUUID()}`;
      await page.evaluate(
        ([id, base]) =>
          fetch(`${base}/api/lessons`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              session: {
                id,
                title: "e2e spoken lesson",
                createdAt: Date.now(),
                updatedAt: Date.now(),
                materialIds: [],
                providerId: "openai",
                model: "gpt-realtime-2.1-mini",
                mode: "voice",
                actions: [
                  { type: "write_text", id: "t1", text: "Ohm's law", style: "title", color: "ink" },
                ],
                transcript: [],
                usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, turns: 1 },
                boardTheme: "paper",
              },
            }),
          }).then((r) => r.json()),
        [id, base],
      );

      await page.goto(`${base}/sessions`, { waitUntil: "networkidle" });
      await page.waitForTimeout(800);
      const link = page.getByRole("link", { name: "e2e spoken lesson" });
      expect(await link.count() === 1, "the spoken lesson isn't listed");
      expect(
        (await link.getAttribute("href"))?.startsWith("/voice?session="),
        "a spoken lesson links to the typed board",
      );

      await link.click();
      await page.waitForURL("**/voice**", { timeout: 15000 });
      await page.waitForTimeout(1500);
      expect(
        await page.getByText("Ohm's law").first().isVisible(),
        "the board didn't come back with the lesson",
      );
    },
  },
  {
    name: "search finds a word from inside an uploaded file",
    async fn({ page, base }) {
      await page.locator("input[type=file]").setInputFiles({
        name: "Chem notes.txt",
        mimeType: "text/plain",
        buffer: Buffer.from(
          "Before the titration begins, rinse the burette with the acid. " +
          "The end point is where the indicator changes colour permanently.\n".repeat(3),
        ),
      });
      await page.waitForTimeout(6000);

      await page.goto(`${base}/search`, { waitUntil: "networkidle" });
      await page.getByLabel("Search your material and lessons").fill("burette");
      await page.waitForTimeout(1500);
      expect(
        await page.getByText(/Chem notes\.txt/).count() > 0,
        "the file it matched isn't named",
      );
      expect(await page.locator("mark").count() > 0, "the matched word isn't marked");
    },
  },
  {
    name: "a shared lesson opens for someone with no account",
    async fn({ page, context, base }) {
      const id = `s_${crypto.randomUUID()}`;
      await page.evaluate(
        ([id, base]) =>
          fetch(`${base}/api/lessons`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              session: {
                id, title: "e2e shared lesson",
                createdAt: Date.now(), updatedAt: Date.now(),
                materialIds: [], providerId: "openai", model: "m", mode: "typed",
                actions: [{ type: "write_text", id: "t1", text: "Shared board card", style: "title", color: "ink" }],
                transcript: [], usage: {}, boardTheme: "paper",
              },
            }),
          }).then((r) => r.json()),
        [id, base],
      );

      await page.goto(`${base}/sessions`, { waitUntil: "networkidle" });
      await page.waitForTimeout(800);
      const row = page.locator("li").filter({ hasText: "e2e shared lesson" });
      await row.getByRole("button", { name: "Share" }).click();
      await page.waitForTimeout(1200);
      expect(await row.getByText(/Link copied|Copy link/).count() === 1, "no link came back");

      // A brand-new context: no cookies, no account, like a classmate.
      const link = await page.evaluate(() => {
        const el = document.querySelector('[title^="http"]');
        return el?.getAttribute("title") ?? "";
      });
      expect(link.includes("/s/"), `unexpected share link: ${link}`);

      const stranger = await context.browser().newContext();
      const strangerPage = await stranger.newPage();
      await strangerPage.goto(link, { waitUntil: "networkidle" });
      expect(
        await strangerPage.getByText("Shared board card").count() > 0,
        "a signed-out visitor can't see the shared board",
      );
      expect(
        !strangerPage.url().includes("/login"),
        "the share link bounced to the login page",
      );
      await stranger.close();
    },
  },
  {
    name: "the material panel hides and comes back, and the chat docks onto the board",
    async fn({ page }) {
      // Both panels' states persist, so a regression here silently follows a
      // student around rather than resetting on reload.
      await page.getByRole("button", { name: /Hide the material panel/i }).click();
      await page.waitForTimeout(500);
      expect(
        !(await page.getByText("Drop notes, slides").isVisible().catch(() => false)),
        "the material panel didn't hide",
      );

      await page.getByRole("button", { name: /Dock the chat onto the board/i }).click();
      await page.waitForTimeout(600);
      expect(await page.getByText("Docked").isVisible(), "the chat didn't dock");
      expect(
        (await page.locator("textarea:visible").count()) === 1,
        "docking should leave exactly one usable chat input",
      );

      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(1800);
      expect(
        await page.getByText("Docked").isVisible().catch(() => false),
        "the docked chat didn't survive a reload",
      );

      await page.getByRole("button", { name: /Put the chat back/i }).click();
      await page.getByRole("button", { name: /Show the material panel/i }).click();
      await page.waitForTimeout(600);
      expect(
        await page.getByText("Drop notes, slides").isVisible(),
        "the material panel didn't come back",
      );
    },
  },
]);
