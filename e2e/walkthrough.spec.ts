import { expect, test, type Page } from "@playwright/test";
import { createShare, homeIn, signInAgent } from "./helpers";

// The phone settings carry over to new contexts, touch included; a desktop has none.
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false };

// A real touch swipe, sideways across the screen at height `y`.
async function swipeLeft(page: Page, y: number) {
  const { width } = page.viewportSize()!;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", x?: number) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: x === undefined ? [] : [{ x, y }] });
  await touch("touchStart", width * 0.8);
  for (let i = 1; i <= 10; i++) await touch("touchMove", width * 0.8 - i * width * 0.06);
  await touch("touchEnd");
}

const nudge = (page: Page) => page.locator("[data-nudge]");

test("an agent's link nudges a first-timer: swipe for photos, then on to the next home, once", async ({ browser }) => {
  test.setTimeout(60_000);
  const agent = await signInAgent(browser, "nell@example.com", "Nell Agent");
  const { url } = await createShare(agent, ["10421 Halvard", "4127 Larkmoor"], ["Wren"]);

  const page = await (await browser.newContext()).newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(url);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Wren, I picked these 2 homes for you");
  // Nothing on the welcome screen but its own "swipe up".
  await expect(nudge(page)).toHaveCount(0);

  await page.keyboard.press("ArrowDown");
  const first = homeIn(page, "10421 Halvard Way NE");
  await expect(first).toBeInViewport({ ratio: 0.9 });
  // First: there are more photos, this way. (On a phone, a swipe is the way.)
  await expect(first.getByText("Swipe for more photos")).toBeVisible();
  await expect(first.getByText(", or use the arrows")).toBeHidden();

  // A thumb swipe low on the screen, over the caption's words, turns the photo.
  const caption = await first.getByText(/^Listed by/).boundingBox();
  await swipeLeft(page, caption!.y + caption!.height / 2);
  await expect(first.getByText("Photo 2 of 4")).toBeAttached();
  await expect(first.getByText("Swipe for more photos")).toBeHidden();

  // Then: the next home is a swipe up away.
  await expect(first.getByText("Swipe up for the next home")).toBeVisible({ timeout: 5000 });
  await expect(first.getByText("Scroll for the next home")).toBeHidden();
  await page.keyboard.press("ArrowDown");
  const second = homeIn(page, "4127 Larkmoor Ave NE");
  await expect(second).toBeInViewport({ ratio: 0.9 });
  await page.waitForTimeout(2500);
  await expect(nudge(page)).toHaveCount(0);

  // Learned once, on this device: no nudges next time.
  await page.reload();
  await page.keyboard.press("ArrowDown");
  await expect(homeIn(page, "10421 Halvard Way NE")).toBeInViewport({ ratio: 0.9 });
  await page.waitForTimeout(2500);
  await expect(nudge(page)).toHaveCount(0);

  // On a desktop screen it says scroll, not swipe up, and points to the arrows.
  const desk = await (await browser.newContext(DESKTOP)).newPage();
  await desk.goto(url);
  await desk.keyboard.press("ArrowDown");
  const deskHome = homeIn(desk, "10421 Halvard Way NE");
  await expect(deskHome.getByText("Swipe for more photos, or use the arrows")).toBeVisible();
  await deskHome.getByRole("button", { name: "Next photo" }).click();
  await expect(deskHome.getByText("Scroll for the next home")).toBeVisible({ timeout: 5000 });
  await expect(deskHome.getByText("Swipe up for the next home")).toBeHidden();

  // The public feed has no walkthrough.
  await page.goto("/");
  await expect(page.getByRole("article").first()).toBeVisible();
  await page.waitForTimeout(2000);
  await expect(nudge(page)).toHaveCount(0);

  expect(pageErrors).toEqual([]);
});

test("a link with one home opens on it, and the photo nudge shows there", async ({ browser }) => {
  const agent = await signInAgent(browser, "nell-one@example.com", "Nell Agent");
  const { url } = await createShare(agent, ["96 Fernhollow"], ["Ivy"]);

  const page = await (await browser.newContext()).newPage();
  await page.goto(url);
  // No welcome screen to get past.
  await expect(page.getByRole("region", { name: "Welcome" })).toHaveCount(0);
  const home = homeIn(page, "96 Fernhollow Ln");
  await expect(home).toBeInViewport({ ratio: 0.9 });
  await expect(home.getByText("Swipe for more photos")).toBeVisible();
  // There's no next home to point to.
  await home.getByRole("button", { name: "Next photo" }).click();
  await expect(home.getByText("Swipe for more photos")).toBeHidden();
  await page.waitForTimeout(2500);
  await expect(nudge(page)).toHaveCount(0);
});

test("on a desktop, a sideways trackpad swipe turns the photos and an up-and-down one moves between homes", async ({
  browser,
}) => {
  const page = await (await browser.newContext(DESKTOP)).newPage();
  await page.goto("/homes/SAMPLE-1005");
  const home = homeIn(page, "10421 Halvard Way NE");
  await expect(home).toBeInViewport({ ratio: 0.9 });
  await expect(home.getByText("Photo 1 of 4")).toBeAttached();

  // A real trackpad ends in a flick; without one, it has to go past halfway.
  // (Tried again until the page's scripts have loaded and are listening.)
  await expect(async () => {
    await page.mouse.move(720, 350);
    for (let i = 0; i < 20; i++) {
      await page.mouse.wheel(50, 0);
      await page.waitForTimeout(16);
    }
    await expect(home.getByText("Photo 2 of 4")).toBeAttached({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });

  // A drag works too (once the trackpad gesture has wound down).
  await page.waitForTimeout(800);
  await page.mouse.move(900, 350);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(900 - i * 80, 350);
  await page.mouse.up();
  await expect(home.getByText("Photo 3 of 4")).toBeAttached();

  const top = () => page.evaluate(() => document.querySelector<HTMLElement>("[data-reel]")!.scrollTop);
  const before = await top();
  await page.waitForTimeout(600);
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(30);
  }
  await expect.poll(top).toBeGreaterThan(before);
});
