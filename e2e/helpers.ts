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
  await enterCode(page);
  await page.waitForURL("**/dashboard/profile");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Company (optional)").fill("Harbor & Pine Realty");
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

// An agent's own details (name, company, how clients reach them, MLS ID,
// colour) are among their profile settings: Edit profile, "Your details".
export const detailsForm = (page: Page) => page.getByRole("form", { name: "Your details" });
export async function toDetails(page: Page) {
  await page.goto("/people/me/edit");
  await expect(detailsForm(page)).toBeVisible();
}
// Saved there: the page stays put and says so.
export async function saveDetails(page: Page) {
  await detailsForm(page).getByRole("button", { name: "Save details" }).click();
  await expect(detailsForm(page).getByRole("status")).toHaveText("Saved");
}

// Add a listing opens on "Find it" alone; entering one by hand is asked for
// under it. Asks (on the page already open), and gives back the form.
export async function enterListingYourself(page: Page) {
  const form = page.getByRole("form", { name: "Listing details" });
  await page.getByRole("button", { name: "Not there? Enter it yourself" }).click();
  await expect(form).toBeVisible();
  return form;
}

// Sending homes goes a step at a time: the homes, who it's for, then (on the
// link itself) what the agent thinks of them. From the homes (one picked), on
// to who it's for.
export async function toWho(page: Page) {
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Who's it for?" })).toBeVisible();
}

// Who it's for is said: Next makes the link and opens it for the agent's own
// thoughts (the last step), which Done skips; then the link, ready to copy.
export async function toLinkReady(page: Page) {
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.waitForURL(/\/s\/[\w-]+\?step=thoughts$/);
  // (Skip, with nothing said on it; Done, once there is.)
  await page.getByRole("banner").getByRole("link", { name: /^(Skip|Done)$/ }).click();
  await page.waitForURL(/\/dashboard\/shares\/[\w-]+\/sent$/);
}

// The same, and then Done again: on to the link's own page.
export async function linkMade(page: Page) {
  await toLinkReady(page);
  await page.getByRole("link", { name: "Done", exact: true }).click();
  await page.waitForURL(/\/dashboard\/shares\/[\w-]+\?tab=/);
}

// On Send homes: a home found by typing its address, and picked from what's
// offered under the box. (With nothing typed, only the agent's own listings
// and homes they've had to do with are listed.)
export async function pickHome(page: Page, address: string) {
  const search = page.getByRole("combobox", { name: "Address, MLS number, or a link to the home" });
  await search.fill(address);
  await page.getByRole("listbox", { name: "Homes that match" }).getByRole("option", { name: new RegExp(address) }).click();
  await expect(page.getByRole("list", { name: "Picked homes" })).toContainText(address);
}

// A package of homes for one or more people. Each person gets their own link.
// (With nobody, it's a link anyone can join: packageLink, in share-link.spec.ts.)
export async function createShare(page: Page, addresses: string[], people: string[] = ["Jamie"]) {
  await page.goto("/dashboard/new");
  for (const address of addresses) await pickHome(page, address);
  await toWho(page);
  // Who it's for: each first name typed, then Enter, as someone new.
  const who = page.getByRole("combobox", { name: "Who's it for?" });
  for (const name of people) {
    await who.fill(name);
    await who.press("Enter");
    await expect(page.getByRole("list", { name: "Who it's for" }).getByText(name, { exact: true })).toBeVisible();
  }
  // The link's made, the agent's own thoughts skipped, and it's ready: each person's, to copy.
  await toLinkReady(page);
  const urls: Record<string, string> = {};
  for (const name of people) urls[name] = await page.getByLabel(`${name}'s link`).inputValue();
  const dashboardUrl = page.url().replace(/\/sent$/, "");
  // On to the link's own page, where everything after carries on.
  await page.getByRole("link", { name: "Done", exact: true }).click();
  await page.waitForURL(/\/dashboard\/shares\/[\w-]+\?tab=/);
  return { url: urls[people[0]], urls, dashboardUrl };
}

// A buyer signs up the way buyers do: the form at the foot of the home page,
// a first name and an email, then the code (locally, always DEV_CODE, shown on the page).
// They're signed in right there: the home page is their feed now. Then on to
// every home full screen (Browse, at /browse), where most tests carry on. The phone
// is optional.
export async function signUpBuyer(browser: Browser, email: string, name: string, phone?: string) {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/");
  const form = page.getByRole("form", { name: "Sign up" }).first();
  await form.getByLabel("First name").fill(name);
  if (phone) await form.getByLabel(/^Phone/).fill(phone);
  await form.getByLabel("Email").fill(email);
  await form.getByRole("button", { name: "Sign up free" }).click();
  await enterCode(page.getByRole("form", { name: "Sign up" }).first());
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
  await expect(page.getByRole("form", { name: "Sign up" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Send homes to someone" })).toBeVisible();
  await page.goto("/browse");
  await expect(page.getByRole("article").first()).toBeVisible();
  return page;
}

// Someone already signed in (just an email, no name yet), in a browser of
// their own: the way a client comes back to a link after signing up. On their
// own link, a tap does what it does at once; on a package's link they're asked
// only their first name (joinAs). The sign-in page asks a new buyer's first
// name before going on: skipped here, so they stay nameless, unless `name`
// is given.
export async function signedIn(
  browser: Browser,
  email = `client.${Date.now()}${Math.floor(Math.random() * 1e4)}@example.com`,
  name?: string,
) {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await enterCode(page);
  await pastNameStep(page, name);
  await page.waitForURL((url) => url.pathname === "/");
  return page;
}

// Just signed in on the sign-in page (the code, or the test password): a
// buyer with no first name yet is asked it there, the one thing on the page,
// before going on. Given here (`name`), or skipped. Anyone with a name, and
// any agent, goes straight on, and there's nothing to do.
export async function pastNameStep(page: Page, name?: string) {
  const step = page.getByRole("form", { name: "Your name" });
  await expect(async () => {
    expect(!new URL(page.url()).pathname.startsWith("/login") || (await step.isVisible())).toBe(true);
  }).toPass({ timeout: 15_000 });
  if (!(await step.isVisible())) return;
  if (name) {
    await step.getByLabel("First name").fill(name);
    await step.getByRole("button", { name: "Continue" }).click();
  } else {
    await step.getByRole("link", { name: "Skip" }).click();
  }
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

// The code from the email, typed where it was asked for: locally there's no
// email, and it's always this.
export const DEV_CODE = "123456";
export async function enterCode(where: Page | Locator) {
  await where.getByLabel("Code", { exact: true }).fill(DEV_CODE);
  await where.getByRole("button", { name: "Continue" }).click();
}

// The feed: one home per screen.
// A person on the agent's Clients page (/dashboard), in whichever group
// they're in: their row, found by the heading that's their name.
export const clientRow = (page: Page, name: string) =>
  page
    .getByRole("main")
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });

export const homeIn = (page: Page | Locator, address: string) => page.getByRole("article", { name: address });

// An agent's link opens on its welcome screen, a word from the agent: on to
// the first home the way its button goes.
export async function toFirstHome(page: Page) {
  await page.getByRole("button", { name: /^See the (home|\d+ homes)$/ }).click();
  const first = page.getByRole("article").first();
  await expect(first).toBeInViewport({ ratio: 0.9 });
  // Come to rest: a tap while it's still sliding into place can miss.
  await expect.poll(async () => Math.abs((await first.boundingBox())?.y ?? 99)).toBeLessThan(1);
}

// The heart on a home's rail (photo hearts are named "Like the kitchen").
// The home's own heart on the rail (not a heart on a comment, in the feed beside the photo).
// (It's in the photo's bottom right corner, opposite the X that passes.)
export const heartOf = (home: Locator) => home.getByRole("button", { name: /^Like (?!the )(?!.*\bcomment\b)/ });

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

// An agent going through a link's homes, full screen, on one of them (as from
// the home's address on the link's page of the dashboard): the one place a
// home has its Porchcard. Everyone else has Save there.
export async function linkHomes(agent: Page, dashboardUrl: string, listingKey: string, address: string) {
  await agent.goto(`/reel?from=share:${dashboardUrl.split("/").pop()}&home=${listingKey}`);
  const home = homeIn(agent, address);
  await expect(home).toBeInViewport({ ratio: 0.9 });
  return home;
}

// A home's Porchcard: what everyone thinks of it, from the button on its rail
// (an agent's alone, in a link's homes or a client's: linkHomes).
export async function openScorecard(page: Page, home: Locator) {
  await home.getByRole("button", { name: "Feedback", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Feedback" });
  await expect(sheet).toBeVisible();
  return sheet;
}

// The Porchcard on the agent's own page for a link (the dashboard): what
// each person on the link thinks of a home, by name.
export async function linkPorchcard(agent: Page, dashboardUrl: string, address: string) {
  await agent.goto(dashboardUrl);
  await agent.getByRole("region", { name: address }).getByRole("button", { name: `Feedback on ${address}` }).click();
  const card = agent.getByRole("dialog", { name: "Feedback" });
  await expect(card).toBeVisible();
  return card;
}

export async function openMore(page: Page, home: Locator) {
  await home.getByRole("button", { name: "More options" }).click();
  const sheet = page.getByRole("dialog", { name: "More" });
  await expect(sheet).toBeVisible();
  return sheet;
}

// Someone who'd rather what they do on homes they're sent stayed off their
// profile: the one switch for it, in Edit profile, off. (It's on to start with.)
export async function keepLinksPrivate(page: Page) {
  await page.goto("/people/me/edit");
  const shown = page.getByRole("switch", { name: "Show what I do on homes I'm sent" });
  await expect(shown).toHaveAttribute("aria-checked", "true");
  await shown.click();
  await expect(shown).toHaveAttribute("aria-checked", "false");
}

// Pass on a home, the way anyone does: the X in its photo's corner, which
// goes on to the next home. Then back on the one passed on, with More open,
// where "What made you pass?" is for anyone who'd like to say.
export async function passOn(page: Page, home: Locator) {
  const x = home.getByRole("button", { name: "Pass on this home" });
  await x.click();
  await expect(x).toHaveAttribute("aria-pressed", "true");
  await home.scrollIntoViewIfNeeded();
  await expect.poll(async () => Math.abs((await home.boundingBox())?.y ?? 99)).toBeLessThan(1);
  return openMore(page, home);
}

// Scrolls the feed to the very end, loading every home on the way.
export async function scrollToEnd(page: Page) {
  await expect(async () => {
    await page.evaluate(() => {
      const reel = document.querySelector<HTMLElement>("[data-reel]")!;
      reel.scrollTo({ top: reel.scrollHeight });
    });
    await expect(page.getByRole("heading", { name: "That's all for now" })).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 20_000 });
}

// Signs up (or in) where it's asked, the first time someone likes or says
// something: a first name and an email, then the code. Or, already signed in
// with no name yet, just the name. Waits for it to close. Each person a new
// email unless one is given (the same person, on another device).
export async function joinAs(
  page: Page,
  firstName: string,
  email = `${firstName.toLowerCase().replace(/[^a-z]/g, "") || "someone"}.${Date.now()}${Math.floor(Math.random() * 1e4)}@example.com`,
) {
  const join = page.getByRole("dialog", { name: "Sign up to like and comment" });
  const nameOnly = page.getByRole("dialog", { name: "What's your first name?" });
  await expect(join.or(nameOnly)).toBeVisible();
  if (await nameOnly.isVisible()) {
    const field = nameOnly.getByRole("textbox", { name: "First name" });
    await field.fill(firstName);
    await nameOnly.getByRole("button", { name: "Continue" }).click();
    await expect(nameOnly).toBeHidden();
    return;
  }
  await join.getByLabel("First name").fill(firstName);
  await join.getByLabel("Email").fill(email);
  await join.getByRole("button", { name: "Continue" }).click();
  await enterCode(join);
  await expect(join).toBeHidden();
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

// Where taps miss across a fingertip (a 44px circle) centred on a control:
// each point that lands on something else, as "dx,dy". It counts a touch area
// grown around a small control (hit-44) only where a tap really reaches it, so
// one clipped by a line clamp, or covered by something else, shows up here.
// (A circle, not a square: a round pill's own corners aren't part of it.)
export const missedTaps = (control: Locator) =>
  control.evaluate((el) => {
    el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
    const box = el.getBoundingClientRect();
    const [x, y] = [box.left + box.width / 2, box.top + box.height / 2];
    const points = [[0, 0], [-20, 0], [20, 0], [0, -20], [0, 20], [-14, -14], [14, -14], [-14, 14], [14, 14]];
    return points.flatMap(([dx, dy]) => {
      const hit = document.elementFromPoint(x + dx, y + dy);
      return hit && el.contains(hit) ? [] : [`${dx},${dy}`];
    });
  });

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
