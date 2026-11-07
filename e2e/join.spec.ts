import { expect, test, type Page } from "@playwright/test";
import { scrollToEnd } from "./helpers";

const SMALL = { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const ON_ITS_SIDE = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

// A real touch swipe up, near the left edge, most of the way up the screen.
async function swipeUp(page: Page) {
  const { width, height } = page.viewportSize()!;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", y?: number) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: y === undefined ? [] : [{ x: width * 0.08, y }] });
  await touch("touchStart", height * 0.9);
  for (let i = 1; i <= 8; i++) {
    await touch("touchMove", height * (0.9 - i * 0.1));
    await page.waitForTimeout(12);
  }
  await touch("touchEnd");
}

test("signed out, the home page says what this is, shows three homes, then asks you to sign up", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");

  // First: what this is, and a short form.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Every home for sale, one swipe at a time.");
  const intro = page.getByRole("form", { name: "Sign up" }).first();
  await expect(intro).toBeInViewport();
  await expect(intro.getByLabel("Name")).toBeVisible();
  await expect(intro.getByLabel("Phone")).toBeVisible();
  await expect(intro.getByLabel("Email")).toBeVisible();

  // Then homes: three of them, a tap away.
  await page.getByRole("button", { name: "See homes" }).click();
  await expect(page.getByRole("article").first()).toBeInViewport({ ratio: 0.9 });
  await expect(page.getByRole("article")).toHaveCount(3);

  // After the third, sign up to see more. No more homes load.
  await page.evaluate(() => {
    const reel = document.querySelector<HTMLElement>("[data-reel]")!;
    reel.scrollTo({ top: reel.scrollHeight });
  });
  await expect(page.getByRole("heading", { name: "There's plenty more to see" })).toBeInViewport();
  await page.waitForTimeout(1000);
  await expect(page.getByRole("article")).toHaveCount(3);

  // A mistake says which field, and keeps what was typed.
  const gate = page.getByRole("form", { name: "Sign up" }).last();
  await gate.getByLabel("Name").fill("Robin Buyer");
  await gate.getByLabel("Phone").fill("555-0100");
  await gate.getByLabel("Email").fill("robin@example.com");
  await gate.getByRole("button", { name: "Sign up free" }).click();
  await expect(gate.getByRole("alert")).toHaveText("Please add your phone number, with the area code.");
  await expect(gate.getByLabel("Phone")).toHaveAttribute("aria-invalid", "true");
  await expect(gate.getByLabel("Name")).toHaveValue("Robin Buyer");
  await expect(gate.getByLabel("Email")).toHaveValue("robin@example.com");

  // Locally no email goes out, so they're signed straight in: no more
  // questions, they're a buyer, by the name they gave.
  await gate.getByLabel("Phone").fill("(206) 555-0100");
  await gate.getByRole("button", { name: "Sign up free" }).click();
  await expect(page.getByRole("button", { name: "Your profile" })).toHaveText("R");
  await expect(page).toHaveURL(/localhost:\d+\/$/);

  // Signed in, it's the feed, for as long as you scroll.
  await expect(page.getByRole("form", { name: "Sign up" })).toHaveCount(0);
  await scrollToEnd(page);
  await expect(page.getByRole("article")).toHaveCount(13);

  expect(pageErrors).toEqual([]);
});

test("on a phone, the welcome fits under the header, and a swipe on it goes on to the homes", async ({ browser }) => {
  for (const options of [SMALL, ON_ITS_SIDE]) {
    const page = await (await browser.newContext(options)).newPage();
    await page.goto("/");
    const name = `${options.viewport.width}x${options.viewport.height}`;
    // All of it on screen, from the headline to the way to the homes, and
    // nothing of it under the header's buttons.
    const signIn = (await page.getByRole("banner").getByRole("link", { name: "Sign in", exact: true }).boundingBox())!;
    const welcome = page.getByRole("region", { name: "Welcome" });
    const headline = welcome.getByRole("heading", { level: 1 });
    const form = welcome.getByRole("form", { name: "Sign up" });
    for (const part of [headline, form.getByRole("button", { name: "Sign up free" }), welcome.getByRole("button", { name: "See homes" })]) {
      await expect(part, name).toBeInViewport({ ratio: 1 });
    }
    for (const part of [headline, form]) {
      expect((await part.boundingBox())!.y, name).toBeGreaterThanOrEqual(signIn.y + signIn.height);
    }
    // A swipe anywhere on it moves on, as it does on a home: nothing on it holds the swipe back.
    await swipeUp(page);
    await expect(page.getByRole("article").first(), name).toBeInViewport({ ratio: 0.9 });
    await page.context().close();
  }
});
