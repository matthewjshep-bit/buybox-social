import { expect, type Browser, type Locator, type Page } from "@playwright/test";

const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==";

// Getting started (/welcome), a question a screen: what they are, then
// (for a pro) their whole name, company, MLS ID (an agent), photo and color;
// (someone shopping) their first name, unless they gave it signing up.
// Each answered from `answers`, or skipped where it may be.
export const WELCOME_CHOICE = {
  agent: "I'm an agent",
  investor: "I'm an investor",
  lender: "I'm a lender",
  buyer: "I'm shopping for a home",
} as const;
export async function throughWelcome(
  page: Page,
  kind: keyof typeof WELCOME_CHOICE,
  answers: { name?: string; place?: string; company?: string; mlsId?: string; photo?: boolean; color?: string } = {},
) {
  await page.waitForURL("**/welcome**");
  await page.getByRole("button", { name: new RegExp(`^${WELCOME_CHOICE[kind]}`) }).click();
  const step = (label: string) => page.getByRole("form", { name: label });
  const next = async (form: Locator, value: string | undefined, field?: string) => {
    if (value !== undefined && field) await form.getByLabel(field, { exact: true }).fill(value);
    await form.getByRole("button", { name: value !== undefined || !field ? /^(Continue|Finish)$/ : "Skip" }).click();
  };
  const place = step("Where are you located?");
  if (kind === "buyer") {
    const name = step("What's your first name?");
    // (Their name, asked only when they didn't give it signing up; then where they are.)
    await expect(name.or(place)).toBeVisible();
    if (await name.isVisible()) await next(name, answers.name, "First name");
    await next(place, answers.place, "City and state");
  } else {
    await next(step("What's your full name?"), answers.name ?? "Pat Pro", "Full name");
    await next(place, answers.place, "City and state");
    const company = page.getByRole("form", { name: /^What('s| brokerage| company)/ });
    await next(company, answers.company, "Company");
    if (kind === "agent") await next(step("What's your MLS ID?"), answers.mlsId, "MLS ID");
    const photo = step("Add a photo of you");
    if (answers.photo) {
      await photo.getByLabel("Your photo").setInputFiles({
        name: "me.png",
        mimeType: "image/png",
        buffer: Buffer.from(PNG_1PX, "base64"),
      });
      await expect(photo.getByRole("img", { name: "Your photo" })).toBeVisible();
      await photo.getByRole("button", { name: "Continue" }).click();
    } else await photo.getByRole("button", { name: "Skip" }).click();
    const color = step("Pick your color");
    if (answers.color) await color.getByRole("button", { name: answers.color }).click();
    await color.getByRole("button", { name: "Finish" }).click();
  }
  await page.waitForURL((url) => !url.pathname.startsWith("/welcome"));
}

// An agent signs up the way agents do: "Start free" on the For agents page,
// then, a step at a time, what they are, their name and brand (and where
// they are, when `place` is given). Then Home, like everyone (Clients is in the bar).
export async function signInAgent(browser: Browser, email: string, name: string, place?: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/for-agents");
  await page.getByRole("link", { name: "Start free" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Start free as an agent");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await enterCode(page);
  await throughWelcome(page, "agent", { name, place, company: "Harbor & Pine Realty", photo: true, color: "Merlot" });
  await page.waitForURL((url) => url.pathname === "/");
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
// On the box for sharing homes (/send): Private (under their name), and the
// To line for who.
export async function toWho(page: Page) {
  const chip = page.getByRole("button", { name: /^Who sees this/ });
  if ((await chip.textContent())?.includes("Private")) return;
  await chip.click();
  await page.getByRole("radio", { name: "Private" }).click();
  await expect(page.getByRole("combobox", { name: "Who's it for?" })).toBeVisible();
}

// Send: the homes go, and the conversation with them opens, each person's
// link ready to copy at its foot.
export async function toLinkReady(page: Page) {
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.waitForURL(/\/messages\/.+\?sent=/);
  await expect(page.getByRole("region", { name: "Links to send" })).toBeVisible();
}

// The same, and then on to the link's own page (Link details).
export async function linkMade(page: Page) {
  await toLinkReady(page);
  await page.getByRole("link", { name: "Link details" }).click();
  await page.waitForURL(/\/dashboard\/shares\/[\w-]+(\?tab=.*)?$/);
}

// On the box: a home found by typing its address (the search opens with
// "Add a home" when it isn't open yet), picked from the homes that match.
export async function pickHome(page: Page, address: string) {
  const search = page.getByRole("combobox", { name: "Address, MLS number, or a link to the home" });
  if (!(await search.isVisible())) await page.getByRole("button", { name: /^Add (a|another) home$/ }).click();
  await search.fill(address);
  await page.getByRole("listbox", { name: "Homes that match" }).getByRole("option", { name: new RegExp(address) }).click();
  await expect(page.getByRole("list", { name: "Picked homes" })).toContainText(address);
}

// A package of homes for one or more people. Each person gets their own link.
// (With nobody, it's a link anyone can join: namelessLink, below.)
export async function createShare(page: Page, addresses: string[], people: string[] = ["Jamie"]) {
  await page.goto("/send?aud=someone");
  for (const address of addresses) await pickHome(page, address);
  // Who it's for: each first name typed, then Enter, as someone new.
  const who = page.getByRole("combobox", { name: "Who's it for?" });
  for (const name of people) {
    await who.fill(name);
    await who.press("Enter");
    await expect(page.getByRole("list", { name: "Who it's for" }).getByText(name, { exact: true })).toBeVisible();
  }
  // Sent: the conversation opens, each person's link ready to copy.
  await toLinkReady(page);
  const urls: Record<string, string> = {};
  for (const name of people) urls[name] = await page.getByLabel(`${name}'s link`).inputValue();
  const details = (await page.getByRole("link", { name: "Link details" }).getAttribute("href"))!;
  const dashboardUrl = new URL(details, page.url()).toString();
  // On to the link's own page, where everything after carries on.
  await page.goto(dashboardUrl);
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
  // New here: what they are (shopping), and back to the page.
  await throughWelcome(page, "buyer");
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
  await expect(page.getByRole("form", { name: "Sign up" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Share homes/ })).toBeVisible();
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

// Just signed in on the sign-in page (the code, or the test password):
// someone new is asked what they are, then (shopping, with no first name
// yet) their first name, at /welcome, before going on. Here: shopping, and
// the name given (`name`), or skipped. Anyone who's been here before goes
// straight on, and there's nothing to do.
export async function pastNameStep(page: Page, name?: string) {
  await expect(async () => {
    const path = new URL(page.url()).pathname;
    expect(!path.startsWith("/login")).toBe(true);
  }).toPass({ timeout: 15_000 });
  if (!new URL(page.url()).pathname.startsWith("/welcome")) return;
  const kind = page.getByRole("group", { name: "What brings you to Porchcard?" });
  const step = page.getByRole("form", { name: "What's your first name?" });
  await expect(kind.or(step)).toBeVisible();
  if (await kind.isVisible()) {
    await throughWelcome(page, "buyer", { name });
    return;
  }
  // (Here before, with no name yet: only that's asked.)
  if (name) {
    await step.getByLabel("First name", { exact: true }).fill(name);
    await step.getByRole("button", { name: /^(Continue|Finish)$/ }).click();
  } else await step.getByRole("button", { name: "Skip" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/welcome"));
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
// (It leads the row under the photo.)
export const heartOf = (home: Locator) => home.getByRole("button", { name: /^Like (?!the )(?!.*\bcomment\b)/ });

// One comment in a thread: who wrote it, and what it says.
export function commentIn(thread: Locator, name: string, body: string) {
  return thread
    .getByRole("listitem")
    .filter({ hasText: body })
    .filter({ has: thread.page().getByText(name, { exact: true }) });
}

// A home's comments, unfurled where the latest of them are (under the photo
// on a phone, over it; in the panel beside it on a desktop): the block under
// the photo becomes the "Comments" region, thread and comment box both.
export const commentsOf = (home: Locator) => home.getByRole("region", { name: "Comments" });

// Waits until the comments, coming up as a sheet, have come to rest.
export const atRest = async (locator: Locator) => {
  await expect
    .poll(async () => {
      const was = (await locator.boundingBox())!.y;
      await locator.page().waitForTimeout(100);
      return Math.abs((await locator.boundingBox())!.y - was);
    })
    .toBeLessThan(0.5);
  await revealed(locator);
};
// (And its reveal has finished: until then, its top can't be tapped.)
const revealed = (locator: Locator) =>
  locator.evaluate((el) =>
    Promise.all((el.closest("[data-words]") ?? el).getAnimations().map((animation) => animation.finished)).then(() => undefined),
  );

export async function openComments(page: Page, home: Locator) {
  await home.getByRole("button", { name: /^Comments/ }).click();
  const thread = commentsOf(home);
  await expect(thread).toBeVisible();
  return thread;
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

// A home's Porchcard: what everyone thinks of it, from "Feedback" in its More
// menu (an agent's alone, in a link's homes or a client's: linkHomes).
export async function openScorecard(page: Page, home: Locator) {
  const more = await openMore(page, home);
  await more.getByRole("button", { name: "Feedback", exact: true }).click();
  await expect(more).toBeHidden();
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

// A home's "…" (at the end of its price and address, over the photo): its
// More menu, where "Not for me", Feedback (an agent's), Photo only and the
// map are.
export async function openMore(page: Page, home: Locator) {
  await home.getByRole("button", { name: "More options" }).click();
  const sheet = page.getByRole("dialog", { name: "More" });
  await expect(sheet).toBeVisible();
  return sheet;
}

// "Not for me", in a home's More menu: the way anyone passes on a home. The
// menu goes, and (passed on, not taken back) the feed goes on to the next home.
export const notForMe = (where: Page | Locator) => where.getByRole("button", { name: "Not for me", exact: true });
export async function pass(page: Page, home: Locator) {
  const more = await openMore(page, home);
  await notForMe(more).click();
  await expect(more).toBeHidden();
}

// Whether a home is passed on: "Not for me" pressed (or not) in its More menu,
// which is put away again after.
export async function expectPassed(page: Page, home: Locator, passed = true) {
  await home.scrollIntoViewIfNeeded();
  const more = await openMore(page, home);
  await expect(notForMe(more)).toHaveAttribute("aria-pressed", String(passed));
  await page.keyboard.press("Escape");
  await expect(more).toBeHidden();
}

// Whether a home offers its Porchcard ("Feedback", in its More menu: an
// agent's, in a link's homes or a client's), and More put away again after.
export async function expectFeedback(page: Page, home: Locator, shown = true) {
  const more = await openMore(page, home);
  await expect(more.getByRole("button", { name: "Feedback", exact: true })).toHaveCount(shown ? 1 : 0);
  await page.keyboard.press("Escape");
  await expect(more).toBeHidden();
}

// The "Share <address>" paper plane under a home (full screen, or a card in a
// feed): the Share sheet, with Send to someone, Post to your followers, Copy
// link and the rest.
export async function openShare(page: Page, home: Locator, address: string) {
  await home.getByRole("button", { name: `Share ${address}`, exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Share" });
  await expect(sheet).toBeVisible();
  return sheet;
}

// Someone who'd rather what they do on homes they're sent stayed off their
// profile: the one switch for it, in Edit profile, off. (It's on to start with.)
export async function keepLinksPrivate(page: Page) {
  await page.goto("/people/me/edit");
  const shown = page.getByRole("switch", { name: "Share my likes and comments on homes I'm sent" });
  await expect(shown).toHaveAttribute("aria-checked", "true");
  await shown.click();
  await expect(shown).toHaveAttribute("aria-checked", "false");
}

// Pass on a home, the way anyone does: "Not for me" in its More menu, which
// goes on to the next home. Then back on the one passed on, with More open
// again ("Not for me" pressed), where "What made you pass?" is for anyone
// who'd like to say.
export async function passOn(page: Page, home: Locator) {
  const was = (await home.boundingBox())?.y ?? 0;
  await pass(page, home);
  // (On to the next home, once the pass has held: then back.)
  await expect
    .poll(async () => Math.abs(((await home.boundingBox())?.y ?? 0) - was), { timeout: 5000 })
    .toBeGreaterThan(1)
    .catch(() => undefined);
  await home.scrollIntoViewIfNeeded();
  await expect.poll(async () => Math.abs((await home.boundingBox())?.y ?? 99)).toBeLessThan(1);
  const more = await openMore(page, home);
  await expect(notForMe(more)).toHaveAttribute("aria-pressed", "true");
  return more;
}

// Share, then "Send to someone": on to the box for sharing homes (/send), with
// this one picked, private. (Agents too: it's how a home is sent from itself.)
export async function sendToSomeone(page: Page, home: Locator, address: string) {
  const share = await openShare(page, home, address);
  await share.getByRole("button", { name: "Send to someone", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/send" && url.searchParams.has("home"));
}

// An agent's one-tap Send, the pill beside the map (/search) for the home
// showing in the pane: a link made there and then, and a sheet asking who
// it's for. (The pill shows once the page has a link waiting for it.)
export const sendPill = (page: Page) => page.getByRole("button", { name: /^Send this home/ }).filter({ visible: true });
// On to the map with a home showing, once the page has its link waiting for
// Send: the pill.
export async function toSendPill(page: Page, key: string) {
  const held = page.waitForResponse(
    async (res) =>
      res.request().method() === "POST" &&
      Boolean(res.request().headers()["next-action"]) &&
      /"token":"[\w-]{32}"/.test(await res.text().catch(() => "")),
  );
  await page.goto(`/search?home=${encodeURIComponent(key)}`);
  await held;
  return sendPill(page);
}

// A link with nobody named on it: the one anyone can join. The box for
// sending homes asks who it's for, so this is the one-tap Send beside the map
// (which makes the link first and asks who it's for after): skipped past,
// straight to the link's own page, where the link is read.
export async function namelessLink(agent: Page, key: string) {
  await (await toSendPill(agent, key)).click();
  const sheet = agent.getByRole("dialog", { name: /^(Sent\. )?Who's it for\?$|^Send this home$/ });
  await expect(sheet).toBeVisible({ timeout: 15_000 });
  // (The sheet's body loads a beat after it opens.) The slower way, when the
  // one tap couldn't copy the link: made here.
  const create = sheet.getByRole("button", { name: "Create link" });
  const details = sheet.getByRole("link", { name: "Link details", disabled: false });
  await expect(create.or(details)).toBeVisible();
  if (await create.isVisible()) await create.click();
  await details.click();
  await agent.waitForURL(/\/dashboard\/shares\/[\w-]+(\?tab=.*)?$/);
  const dashboardUrl = agent.url().split("?")[0];
  return { url: await agent.getByLabel("Your link is ready").inputValue(), dashboardUrl };
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

// A conversation on Messages (/messages): its row in the list, found by the
// name it's called (a first name; "Jo & Mike" for a link to two people; "Link
// for 96 Fernhollow Ln" for one nobody is on yet).
export const threadRow = (page: Page, name: string) =>
  page
    .getByRole("list", { name: "Conversations" })
    .getByRole("listitem")
    .filter({ has: page.getByText(name, { exact: true }) });

// A home's card in an open conversation (/messages/<key>), by its address:
// its photo, price and address, then one line of what's happened to it
// (opened, liked, passed, asked to see it) and Reply. Nothing said about it
// is in the card: each word is a message of its own (threadComment).
export const threadHome = (page: Page, address: string) =>
  page.getByRole("list", { name: "Messages" }).locator("li[id^='home-']").filter({ hasText: address });

// What was said about a home in an open conversation: a bubble of its own
// among the messages (not inside the home's card), the home it's about
// quoted above it as "About <street>" (a link to the home's card).
export const threadComment = (page: Page, street: string, words: string) =>
  page
    .getByRole("list", { name: "Messages" })
    .locator("li[id^='comment-']")
    .filter({ hasText: words })
    .filter({ hasText: `About ${street}` });

// From Messages to someone's conversation: their row, then the page named for them.
export async function openThread(page: Page, name: string) {
  await page.goto("/messages");
  await threadRow(page, name).getByRole("link").click();
  await page.waitForURL(/\/messages\/.+/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
}
