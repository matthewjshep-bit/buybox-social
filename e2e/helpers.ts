import { expect, type Browser, type Locator, type Page } from "@playwright/test";

const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==";

// An agent signs up the way agents do: "Start free" on the For agents page,
// then their name and brand.
export async function signInAgent(browser: Browser, email: string, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/for-agents");
  await page.getByRole("link", { name: "Start free" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Start free as an agent");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/dashboard/profile");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Company (brokerage)").fill("Harbor & Pine Realty");
  await page.getByRole("button", { name: "Merlot" }).click();
  await page.getByLabel("Your photo").setInputFiles({
    name: "me.png",
    mimeType: "image/png",
    buffer: Buffer.from(PNG_1PX, "base64"),
  });
  await expect(page.getByRole("img", { name })).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForURL("**/dashboard");
  return page;
}

// A package of homes for one or more people. Each person gets their own link.
export async function createShare(page: Page, addresses: string[], people: string[] = ["Jamie"]) {
  await page.goto("/dashboard/new");
  for (const address of addresses) {
    await page.getByRole("button", { name: new RegExp(address) }).click();
  }
  for (const [i, name] of people.entries()) {
    if (i > 0) await page.getByRole("button", { name: "Add another person" }).click();
    await page.getByLabel(`Person ${i + 1}'s first name`).fill(name);
  }
  await page.getByLabel(/Personal note/).fill("This one has the yard you mentioned.");
  await page.getByRole("button", { name: /Create link/ }).click();
  await page.waitForURL("**/dashboard/shares/*");
  const urls: Record<string, string> = {};
  for (const name of people) urls[name] = await page.getByLabel(`${name}'s link`).inputValue();
  return { url: urls[people[0]], urls, dashboardUrl: page.url() };
}

// A buyer signs up the way buyers do: the form on the home page. Locally
// there's no email to open, so they're signed straight in, to the feed.
export async function signUpBuyer(browser: Browser, email: string, name: string, phone = "206-555-0100") {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/");
  const form = page.getByRole("form", { name: "Sign up" }).first();
  await form.getByLabel("Name").fill(name);
  await form.getByLabel("Phone").fill(phone);
  await form.getByLabel("Email").fill(email);
  await form.getByRole("button", { name: "Sign up free" }).click();
  await expect(page.getByRole("link", { name: "Your profile" })).toBeVisible();
  await expect(page.getByRole("form", { name: "Sign up" })).toHaveCount(0);
  return page;
}

// The feed: one home per screen.
export const homeIn = (page: Page, address: string) => page.getByRole("article", { name: address });

// The heart on a home's rail (photo hearts are named "Like the kitchen").
export const heartOf = (home: Locator) => home.getByRole("button", { name: /^Like (?!the )/ });

// One comment in a thread: who wrote it, and what it says.
export function commentIn(thread: Locator, name: string, body: string) {
  return thread
    .getByRole("listitem")
    .filter({ hasText: body })
    .filter({ has: thread.page().getByText(name, { exact: true }) });
}

export async function openComments(page: Page, home: Locator) {
  await home.getByRole("button", { name: /^Comments/ }).click();
  const sheet = page.getByRole("dialog", { name: "Comments" });
  await expect(sheet).toBeVisible();
  return sheet;
}

export async function openMore(page: Page, home: Locator) {
  await home.getByRole("button", { name: "More options" }).click();
  const sheet = page.getByRole("dialog", { name: "More" });
  await expect(sheet).toBeVisible();
  return sheet;
}

// Scrolls the feed to the very end, loading every home on the way.
export async function scrollToEnd(page: Page) {
  await expect(async () => {
    await page.evaluate(() => {
      const reel = document.querySelector<HTMLElement>("[data-reel]")!;
      reel.scrollTo({ top: reel.scrollHeight });
    });
    await expect(page.getByRole("heading", { name: "You've seen every home for now" })).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 20_000 });
}

// Answers the first-name prompt and waits for it to close.
export async function joinAs(page: Page, firstName: string) {
  const field = page.getByRole("textbox", { name: "First name" });
  await field.fill(firstName);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(field).toBeHidden();
}

// Waits for a card that just popped in to come to rest. Clicking one of its
// buttons mid-animation can make Playwright scroll it into place, and in a
// feed that snaps from home to home, that lands on the next home.
export const settle = (card: Locator) =>
  card.evaluate((el) =>
    Promise.race([
      Promise.all(el.getAnimations().map((animation) => animation.finished)),
      new Promise((done) => setTimeout(done, 1000)),
    ]),
  );

// Picks something in the photo on screen ("the floating staircase") the way a
// keyboard does, which opens the same card a tap on it opens. Returns the card.
export async function pick(home: Locator, thing: string) {
  // What's on a photo shows once its home is on screen.
  await home.scrollIntoViewIfNeeded();
  await expect(home).toBeInViewport({ ratio: 0.9 });
  await home.getByRole("button", { name: `Select ${thing}` }).press("Enter");
  const card = home.getByRole("group", { name: new RegExp(`^${thing.replace(/^the /, "")}$`, "i") });
  await expect(card).toBeVisible();
  await settle(card);
  return card;
}

// Likes something in the photo on screen, from its card.
export async function likeInPhoto(home: Locator, thing: string) {
  const card = await pick(home, thing);
  const like = card.getByRole("button", { name: new RegExp(`^Like ${thing}(,|$)`) });
  await like.click();
  await expect(like).toHaveAttribute("aria-pressed", "true");
  return card;
}

// Taps a spot on the photo on screen, at fractions of its width and height.
export async function tapPhoto(home: Locator, photoName: string, x: number, y: number) {
  const box = (await home.getByRole("img", { name: photoName }).boundingBox())!;
  await home.page().mouse.click(box.x + box.width * x, box.y + box.height * y);
}

// The list that slides out of a home's heart: everything in the photo on
// screen. Opened the phone way, by pressing and holding the heart.
export async function photoList(home: Locator) {
  const heart = heartOf(home);
  await heart.scrollIntoViewIfNeeded();
  await heart.dispatchEvent("pointerdown", { pointerType: "touch", isPrimary: true });
  await home.page().waitForTimeout(600);
  await heart.dispatchEvent("pointerup", { pointerType: "touch", isPrimary: true });
  const list = home.getByRole("group", { name: "Like what's in this photo" });
  await expect(list).toBeVisible();
  return list;
}
