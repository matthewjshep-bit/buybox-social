import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { signedIn, toFirstHome, commentsOf, createShare, enterCode, heartOf, homeIn, openComments, pastNameStep, pick, settle, signInAgent, signUpBuyer, tapPhoto, passOn, keepLinksPrivate } from "./helpers";

// Under the photo, the way a post reads: how many liked the home, then the
// latest few comments, each a row that opens the comments on it. Nothing goes
// round on its own any more (the rotating line at the photo's foot is gone),
// so nothing here needs Pause or Play, and nothing is drawn on the photo from
// it. What's private on an agent's link still never reaches it. Timers run on
// the page's own clock where it matters, moved on by hand.

const WEXFORD = "3518 Wexford Ave N";
const FERNHOLLOW = "96 Fernhollow Ln";
const SALTMARSH = "719 Saltmarsh Ln";
const COTTAGE = "Blue cottage behind a white picket fence";
// What Al and Bo say about Wexford, and Cy about a spot in Fernhollow's third photo.
const AL_SAID = "Those sconces are a nice touch.";
const BO_SAID = "The front entry makes the whole street.";
const CY_SAID = "So bright in the afternoon.";
// A photo of someone, as small as one gets.
const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==";
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false };

// Waits until a home has snapped all the way into place.
const settled = async (home: Locator) => {
  await expect(home).toBeInViewport({ ratio: 0.9 });
  await expect.poll(async () => Math.abs((await home.boundingBox())?.y ?? 99)).toBeLessThan(1);
};

// The latest comments, under the photo (side by side: in the panel).
const latestOf = (home: Locator) => home.getByRole("group", { name: "Latest comments" });
// One comment's row in it, by its words.
const rowOf = (home: Locator, words: string) => latestOf(home).getByRole("listitem").filter({ hasText: words });
// The bold "N likes" line at its top, if anyone has liked the home.
const likesLineOf = (home: Locator) => latestOf(home).locator("p").filter({ hasText: /^\d+ likes?$|^Liked by / });
// The pin on a comment left on a spot, and the lock on one shared from a private chat.
const pinIn = (row: Locator) => row.locator('p > svg:has(circle[r="3"])');
const lockIn = (row: Locator) => row.locator("p > svg:has(rect)");
// What used to go round at the photo's foot, and what came with it: none of it, anywhere.
const nothingGoesRound = async (home: Locator) => {
  await expect(home.getByRole("group", { name: "Recent activity" })).toHaveCount(0);
  await expect(home.locator("[data-photo-caption]")).toHaveCount(0);
  await expect(home.getByRole("button", { name: /^(Pause|Play) activity$|^Show the next activity$/ })).toHaveCount(0);
  await expect(home.locator("[data-spot-highlight]")).toHaveCount(0);
  await expect(latestOf(home).locator("[aria-live]")).toHaveCount(0);
};
const box = async (part: Locator) => (await part.boundingBox())!;
// The photo's frame (the 4:3 box the photo fills, not the photo spilling past it).
const photoOf = (home: Locator) => home.locator("[data-photo-frame]").first();

// A page whose timers wait to be moved on.
async function stillPage(browser: Browser, options = {}) {
  const page = await (await browser.newContext(options)).newPage();
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  return page;
}

// The same, signed in first (a card on a spot is for someone who can like it:
// anyone else is asked to sign up before one opens).
async function signedInStillPage(browser: Browser, options = {}) {
  const page = await (await browser.newContext(options)).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(`still.${Date.now()}${Math.floor(Math.random() * 1e4)}@example.com`);
  await page.getByRole("button", { name: "Continue" }).click();
  await enterCode(page);
  await pastNameStep(page);
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  return page;
}

// Moves the page's clock on, then lets it draw what that did.
async function tick(page: Page, ms: number) {
  await page.clock.runFor(ms);
  await page.waitForTimeout(150);
}

// Someone, by name, saying something about a home from its public page: in
// the comments, from the bar under the photo. On a spot in one of its photos
// (counted from 0), from that spot's card. Said once: a run that starts over
// after a failure finds it already there.
async function say(browser: Browser, key: string, address: string, name: string, words: string, spot?: { photo: number; thing: string }) {
  const page = await signedIn(browser, `${name.toLowerCase()}.${Date.now()}${Math.floor(Math.random() * 1e4)}@example.com`, name);
  await page.goto(`/homes/${key}`);
  const home = homeIn(page, address);
  await settled(home);
  const already = await openComments(page, home);
  const there = (await already.locator("[data-comment]").filter({ hasText: words }).count()) > 0;
  await page.keyboard.press("Escape");
  await expect(already).toBeHidden();
  if (there) {
    await page.context().close();
    return;
  }
  if (spot) {
    for (let at = 0; at < spot.photo; at++) {
      await home.getByRole("button", { name: "Next photo" }).click();
      await expect(home.getByText(new RegExp(`^Photo ${at + 2} of \\d+$`))).toBeAttached();
    }
    const card = await pick(home, spot.thing);
    await card.getByRole("button", { name: /^Comment on/ }).click();
  } else await home.getByRole("button", { name: "Add a comment…" }).click();
  const sheet = commentsOf(home);
  await sheet.getByRole("textbox").fill(words);
  await sheet.getByRole("button", { name: "Post", exact: true }).click();
  // (From a spot's card the thread folds away on Post; from the bar it stays
  // open. Either way the words are in the comments under the photo.)
  await expect(home.locator("[data-comment-list]")).toContainText(words);
  await page.context().close();
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  // Al first, then Bo, so Bo's is the newest.
  await say(browser, "SAMPLE-1007", WEXFORD, "Al", AL_SAID);
  await say(browser, "SAMPLE-1007", WEXFORD, "Bo", BO_SAID);
});

test("under the photo, the latest comments, the newest first, each a row that opens the comments on it; nothing goes round, and nothing is drawn on the photo", async ({
  browser,
}) => {
  const page = await stillPage(browser);
  await page.goto("/homes/SAMPLE-1007");
  const home = homeIn(page, WEXFORD);
  await settled(home);
  const latest = latestOf(home);
  await expect(latest).toBeVisible();
  // The newest first: Bo's, then Al's, each starting with who said it.
  const rows = latest.getByRole("listitem");
  await expect(rows.nth(0)).toContainText(`Bo ${BO_SAID}`);
  await expect(rows.nth(1)).toContainText(`Al ${AL_SAID}`);
  // Under the photo, not over it, and above the comment bar; and the home's
  // facts above the photo, where a post is headed.
  const [list, photo, bar, price] = [
    await box(latest),
    await box(photoOf(home)),
    await box(home.locator("[data-bar-row]")),
    await box(home.locator('[data-fact="Price"]')),
  ];
  expect(list.y).toBeGreaterThanOrEqual(photo.y + photo.height - 1);
  expect(list.y + list.height).toBeLessThanOrEqual(bar.y + 1);
  expect(price.y).toBeLessThan(photo.y);
  // Nothing goes round, and nothing is drawn on the photo: no hotspot, no pins.
  await nothingGoesRound(home);
  await expect(home.locator("[data-pin], [data-pins-toggle]")).toHaveCount(0);
  // Time passes; it reads the same (but for a minute ticking over in "· 10m"),
  // and nothing has moved.
  const ages = (text: string | null) => (text ?? "").replace(/· \d+m\b/g, "· Nm");
  const was = ages(await latest.textContent());
  for (let i = 0; i < 5; i++) await tick(page, 4000);
  expect(ages(await latest.textContent())).toBe(was);
  expect(await box(latest)).toEqual(list);
  expect((await box(home.locator('[data-fact="Price"]'))).y).toBe(price.y);
  // A row is a fingertip tall, and opens the comments on that comment.
  const row = rowOf(home, AL_SAID).getByRole("button");
  expect((await box(row)).height).toBeGreaterThanOrEqual(44);
  await row.click();
  const sheet = commentsOf(home);
  await expect(sheet).toBeVisible();
  await expect(sheet.locator("[data-comment][data-flash]")).toContainText(AL_SAID);
});

test("nothing moves on its own any more: no Pause, Play or next step, with or without reduced motion, and it reads the same on every home after a long while", async ({
  browser,
}) => {
  for (const options of [{}, { reducedMotion: "reduce" as const }]) {
    const page = await stillPage(browser, options);
    await page.goto("/homes/SAMPLE-1007");
    const home = homeIn(page, WEXFORD);
    await settled(home);
    const first = await latestOf(home).textContent();
    expect(first).toContain(BO_SAID);
    for (let i = 0; i < 5; i++) await tick(page, 2000);
    expect(await latestOf(home).textContent()).toBe(first);
    await nothingGoesRound(home);

    // The same on the next home, and after a reload.
    await page.goto("/homes/SAMPLE-1006");
    const other = homeIn(page, "2205 Brackenfield Ct NW");
    await settled(other);
    await expect(latestOf(other)).toBeVisible();
    const theirs = await latestOf(other).textContent();
    for (let i = 0; i < 5; i++) await tick(page, 2000);
    expect(await latestOf(other).textContent()).toBe(theirs);
    await nothingGoesRound(other);
    await page.reload();
    await settled(other);
    await expect(latestOf(other)).toHaveText(theirs!);
    await nothingGoesRound(other);
    await page.context().close();
  }
});

test("a comment left on a spot shows whichever photo is on screen, with a pin; it opens in the comments, where the spot can be shown", async ({
  browser,
  page,
}) => {
  await say(browser, "SAMPLE-1004", FERNHOLLOW, "Cy", CY_SAID, { photo: 2, thing: "the natural light" });
  await page.goto("/homes/SAMPLE-1004");
  const home = homeIn(page, FERNHOLLOW);
  await settled(home);
  await expect(home.getByText("Photo 1 of 3")).toBeAttached();
  // On the first photo already: the comments are the home's, not the photo's.
  // A pin says it's about a spot; which spot waits for the comments.
  const row = rowOf(home, CY_SAID);
  await expect(row).toContainText(`Cy ${CY_SAID}`);
  await expect(pinIn(row)).toHaveCount(1);
  await expect(row).not.toContainText(/natural light/i);
  await expect(home.locator("[data-spot-highlight]")).toHaveCount(0);
  const words = await latestOf(home).textContent();
  await home.getByRole("button", { name: "Next photo" }).click();
  await home.getByRole("button", { name: "Next photo" }).click();
  await expect(home.getByText("Photo 3 of 3")).toBeAttached();
  await expect(latestOf(home)).toHaveText(words!);
  await expect(home.locator("[data-spot-highlight]")).toHaveCount(0);
  // The row opens the comments on it, where its spot is named and can be shown.
  await row.getByRole("button").click();
  const sheet = commentsOf(home);
  await expect(sheet).toBeVisible();
  const said = sheet.locator("[data-comment]").filter({ hasText: CY_SAID });
  await expect(said).toBeVisible();
  await expect(said.getByRole("button", { name: /natural light\s*: show it$/i })).toBeVisible();
});

test("who liked the home: a bold line of how many, above the comments, that the photos turning doesn't change", async ({ browser }) => {
  const page = await signedIn(browser, `eve.${Date.now()}@example.com`, "Eve");
  await page.goto("/homes/SAMPLE-1007");
  const home = homeIn(page, WEXFORD);
  await settled(home);
  // (No line at all when nobody has: that reads as none.)
  const before = (await likesLineOf(home).count()) ? Number((await likesLineOf(home).textContent())!.match(/\d+/)![0]) : 0;
  await heartOf(home).click();
  await expect(heartOf(home)).toHaveAttribute("aria-pressed", "true");
  const line = likesLineOf(home);
  await expect(line).toHaveText(`${before + 1} ${before + 1 === 1 ? "like" : "likes"}`);
  expect(Number(await line.evaluate((el) => getComputedStyle(el).fontWeight))).toBeGreaterThanOrEqual(600);
  // Above the comments, never one of them.
  expect((await box(line)).y + (await box(line)).height).toBeLessThanOrEqual((await box(rowOf(home, BO_SAID))).y + 1);
  await expect(latestOf(home).getByRole("listitem").filter({ hasText: /^\d+ likes?$/ })).toHaveCount(0);
  // Never anyone's name in public, and not who: just how many.
  await expect(line).not.toContainText(/Liked by|Eve/);
  await home.getByRole("button", { name: "Next photo" }).click();
  await expect(home.getByText(/^Photo 2 of \d+$/)).toBeAttached();
  await expect(line).toHaveText(`${before + 1} ${before + 1 === 1 ? "like" : "likes"}`);
  await page.reload();
  await settled(home);
  await expect(likesLineOf(home)).toHaveText(`${before + 1} ${before + 1 === 1 ? "like" : "likes"}`);
  await page.context().close();
});

test("side by side, the comments are in the panel beside the photo, not over its foot; a row opens them docked there", async ({ browser }) => {
  const page = await signedInStillPage(browser, DESKTOP);
  await page.goto("/homes/SAMPLE-1007");
  const home = homeIn(page, WEXFORD);
  await settled(home);
  const latest = latestOf(home);
  await expect(latest).toContainText(`Bo ${BO_SAID}`);
  // In the panel, to the right of the photo, inside the words. Nothing over
  // the photo's foot but the X and the heart.
  const [list, photo, panel] = [await box(latest), await box(photoOf(home)), await box(home.locator("[data-words]"))];
  expect(list.x).toBeGreaterThanOrEqual(photo.x + photo.width);
  expect(list.x).toBeGreaterThanOrEqual(panel.x);
  expect(list.x + list.width).toBeLessThanOrEqual(panel.x + panel.width + 1);
  await nothingGoesRound(home);
  for (let i = 0; i < 3; i++) await tick(page, 8000);
  await expect(latest).toContainText(`Bo ${BO_SAID}`);
  await expect(latest).toContainText(`Al ${AL_SAID}`);
  // A card about a spot, opened on the photo, leaves the comments where they are.
  const card = await pick(home, "the front entry");
  await expect(latest).toBeVisible();
  await card.getByRole("button", { name: "Close" }).click();
  await expect(card).toBeHidden();
  // A row opens the comments, on that comment, beside the photo.
  await rowOf(home, BO_SAID).getByRole("button").click();
  const sheet = commentsOf(home);
  await expect(sheet).toBeVisible();
  await expect(sheet.locator("[data-comment][data-flash]")).toContainText(BO_SAID);
  expect((await box(sheet)).x).toBeGreaterThanOrEqual(photo.x + photo.width - 1);
});

test("opened from someone's profile, what they did is in Why it's here; under the photo, the home's own comments", async ({ browser }) => {
  // Bo's page, from Bo's name in the comments.
  const look = await (await browser.newContext()).newPage();
  await look.goto("/homes/SAMPLE-1007");
  const comments = await openComments(look, homeIn(look, WEXFORD));
  const profile = await comments.getByRole("link", { name: "Bo", exact: true }).first().getAttribute("href");
  expect(profile).toMatch(/^\/people\/[0-9a-f-]{36}$/);
  await look.context().close();
  const page = await stillPage(browser);
  await page.goto(profile!);
  // (A card opens their page's homes in the pop-out. By its top corner: the
  // photos in the middle swipe, and open it themselves.)
  await page.locator('a[href*="home=SAMPLE-1007"]').first().click({ position: { x: 20, y: 20 } });
  await page.waitForURL(/\/reel\?from=/);
  const home = homeIn(page.getByRole("dialog", { name: "Homes" }), WEXFORD);
  await expect(home).toBeVisible();
  // What Bo did, over the photo's top, as the reason it's here: Bo's, never Al's.
  const why = home.getByRole("region", { name: "Why it's here" });
  await expect(why).toContainText(/^Bo\b/);
  await expect(why).not.toContainText(/Al\b|A buyer/);
  // Under the photo, the home's comments as anywhere: Bo's and Al's, by name,
  // and nothing from anyone's private link.
  await expect(rowOf(home, BO_SAID)).toContainText(`Bo ${BO_SAID}`);
  await expect(rowOf(home, AL_SAID)).toContainText(`Al ${AL_SAID}`);
  await expect(latestOf(home)).not.toContainText(/A buyer|privately/);
  await nothingGoesRound(home);
  for (let i = 0; i < 4; i++) await tick(page, 5000);
  await expect(rowOf(home, BO_SAID)).toBeVisible();
});

test("beside the map: on a phone, the comments under the photo and Open full screen under them; on a wide screen the same, with Open full screen in the photo's corner", async ({
  browser,
}) => {
  // A phone: the home under the filters is just a look, with one way in.
  const phone = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage();
  await phone.clock.install();
  await phone.goto("/search?home=SAMPLE-1007");
  const small = homeIn(phone, WEXFORD);
  await expect(small).toBeVisible();
  await expect(latestOf(small)).toContainText(`Bo ${BO_SAID}`);
  await nothingGoesRound(small);
  const open = small.getByRole("button", { name: /^Open full screen/ });
  await expect(open).toBeVisible();
  const [list, photo, button] = [await box(latestOf(small)), await box(photoOf(small)), await box(open)];
  expect(list.y).toBeGreaterThanOrEqual(photo.y + photo.height - 1);
  expect(button.y).toBeGreaterThanOrEqual(list.y + list.height - 1);
  expect(button.height).toBeGreaterThanOrEqual(44);
  await phone.clock.runFor(20_000);
  await phone.waitForTimeout(300);
  await expect(latestOf(small)).toContainText(`Bo ${BO_SAID}`);
  await phone.context().close();

  // Wide: the pane is a phone's width, so the comments are under the photo
  // here too, between its foot and the bar; the X and the heart keep the
  // photo's bottom corners, and the pane's own Open full screen sits over
  // the photo's top corner, under the head.
  const page = await (await browser.newContext(DESKTOP)).newPage();
  await page.goto("/search?home=SAMPLE-1007");
  const home = homeIn(page, WEXFORD);
  await expect(home).toBeVisible();
  await expect(latestOf(home)).toContainText(`Bo ${BO_SAID}`);
  await nothingGoesRound(home);
  const [wideList, widePhoto, pass, heart, wideOpen] = [
    await box(latestOf(home)),
    await box(photoOf(home)),
    await box(home.getByRole("button", { name: "Pass on this home" })),
    await box(heartOf(home)),
    await box(page.getByRole("button", { name: "Open full screen" })),
  ];
  expect(wideList.y).toBeGreaterThanOrEqual(widePhoto.y + widePhoto.height - 1);
  expect(pass.y + pass.height).toBeLessThanOrEqual(widePhoto.y + widePhoto.height + 1);
  expect(heart.y + heart.height).toBeLessThanOrEqual(widePhoto.y + widePhoto.height + 1);
  expect(pass.x + pass.width).toBeLessThan(heart.x);
  expect(wideOpen.y).toBeGreaterThanOrEqual(widePhoto.y - 1);
  expect(wideOpen.y + wideOpen.height).toBeLessThan(widePhoto.y + widePhoto.height / 2);
  expect(wideOpen.height).toBeGreaterThanOrEqual(44);
  await page.context().close();
});

test("on a link, what you said is under your name, and the agent's words under theirs with their badge; no way to a profile from here", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const agent = await signInAgent(browser, "vera@example.com", "Vera Agent");
  const { url, dashboardUrl } = await createShare(agent, ["719 Saltmarsh"], ["Kit"]);
  const kit = await signedIn(browser, undefined, "Kit");
  // (She knows her way round a link: no first-timer nudge over the photo.)
  await kit.addInitScript(() => localStorage.setItem("buybox:nudges", JSON.stringify({ photos: true, next: true })));
  await kit.goto(url);
  await toFirstHome(kit);
  const home = homeIn(kit, SALTMARSH);
  await settled(home);
  const chat = await openComments(kit, home);
  await chat.getByLabel("Add a comment").fill("Is the roof new?");
  await chat.getByRole("button", { name: "Post", exact: true }).click();
  await expect(chat.getByText("Is the roof new?")).toBeVisible();
  await kit.keyboard.press("Escape");
  // Hers, under her name, as the link knows her. On a link, nobody's name is
  // a way to a profile, hers included.
  await expect(rowOf(home, "Is the roof new?")).toContainText("Kit Is the roof new?");
  await expect(rowOf(home, "Is the roof new?")).not.toContainText("Agent");
  await expect(latestOf(home).getByRole("link")).toHaveCount(0);
  await nothingGoesRound(home);

  // The agent answers from their dashboard. On their own link it's under
  // their name, with their badge, and first: the agent's words lead.
  await agent.goto(dashboardUrl);
  const panel = agent.getByRole("region", { name: SALTMARSH });
  await panel.getByLabel("Reply to your client").fill("New in 2021.");
  await panel.getByRole("button", { name: "Reply" }).click();
  await expect(panel.getByText("New in 2021.")).toBeVisible();
  await agent.goto(url);
  const own = homeIn(agent, SALTMARSH);
  await own.scrollIntoViewIfNeeded();
  await settled(own);
  // (The row's text starts with the initial on their face: "V", then the name.)
  await expect(rowOf(own, "New in 2021.")).toContainText(/Vera Agent\s*Agent\s*New in 2021\./);
  await expect(latestOf(own).getByRole("listitem").first()).toContainText("New in 2021.");
  await expect(latestOf(own).getByRole("link")).toHaveCount(0);

  // To Kit, the same words are her agent's, badged the same, and still first.
  await kit.reload();
  await toFirstHome(kit);
  await settled(home);
  await expect(rowOf(home, "New in 2021.")).toContainText(/Vera Agent\s*Agent\s*New in 2021\./);
  await expect(latestOf(home).getByRole("listitem").first()).toContainText("New in 2021.");
  await expect(latestOf(home).getByRole("listitem").nth(1)).toContainText("Kit Is the roof new?");
  await expect(latestOf(home).getByRole("link")).toHaveCount(0);
});

test("each comment starts with the face of whoever said it; from here there's no way to their profile, but in the comments their name is one", async ({
  browser,
}) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/homes/SAMPLE-1007");
  const home = homeIn(page, WEXFORD);
  await settled(home);
  const row = rowOf(home, BO_SAID);
  // Like a profile picture: Bo's initial, just before the words.
  const face = row.locator("button > span[aria-hidden]").first();
  await expect(face).toHaveText("B");
  const [faceBox, words] = [await box(face), await box(row.locator("button > p"))];
  expect(faceBox.x + faceBox.width).toBeLessThanOrEqual(words.x);
  expect(faceBox.width).toBeGreaterThanOrEqual(24);
  // Nothing to tap but the row itself, which opens the comments; there, Bo's
  // name is the way to Bo's page.
  await expect(latestOf(home).getByRole("link")).toHaveCount(0);
  await row.getByRole("button").click();
  const sheet = commentsOf(home);
  await expect(sheet).toBeVisible();
  // (Once it has finished sliding up: a tap mid-slide lands on the sheet itself.)
  await settle(sheet);
  await sheet.locator("[data-comment]").filter({ hasText: BO_SAID }).getByRole("link", { name: "Bo", exact: true }).click();
  await page.waitForURL(/\/people\/[0-9a-f-]{36}$/);
  await expect(page.locator("h1").first()).toContainText("Bo");
});

test("isolation: what's private on an agent's link never reaches the public page, by words, name, pass or spot", async ({ browser }) => {
  test.setTimeout(120_000);
  const SECRET = "Offer 30k under, they sound desperate.";
  const SPOT_SECRET = "That corner needs a total redo.";
  const agent = await signInAgent(browser, "tilly@example.com", "Tilly Agent");
  const { url } = await createShare(agent, ["719 Saltmarsh"], ["Yara"]);
  const yara = await signedIn(browser);
  await yara.goto(url);
  const yaraHome = homeIn(yara, SALTMARSH);
  await yaraHome.scrollIntoViewIfNeeded();
  await settled(yaraHome);

  // A dislike on a spot, a comment on a spot, a comment, and a pass: all private.
  const chimney = await pick(yaraHome, "the chimney");
  await chimney.getByRole("button", { name: /^Dislike the chimney/ }).click();
  await expect(chimney.getByRole("button", { name: /^Dislike the chimney/ })).toHaveAttribute("aria-pressed", "true");
  await chimney.getByRole("button", { name: "Close" }).click();
  // (Right on a spot nobody else has used; on a touchscreen, said in the sheet below.)
  const SPOT = { x: 0.8, y: 0.45 };
  await tapPhoto(yaraHome, COTTAGE, SPOT.x, SPOT.y);
  const card = yaraHome.locator("[data-spot-card]");
  await expect(card).toBeVisible();
  await settle(card);
  await card.getByRole("button", { name: /^Comment on/ }).click();
  const about = commentsOf(yaraHome);
  await expect(about.getByRole("heading", { name: "On a spot in photo 1" })).toBeVisible();
  await about.getByRole("textbox").fill(SPOT_SECRET);
  await about.getByRole("button", { name: "Post", exact: true }).click();
  await expect(about).toBeHidden();
  // Where it was left, exactly ("@80,45"), as the link has it: on her card
  // in the link's comments.
  const chat = await openComments(yara, yaraHome);
  const spot = chat.getByRole("listitem").filter({ hasText: SPOT_SECRET }).locator('[data-spot-tag^="@"]');
  await expect(spot).toHaveCount(1);
  const spotTag = (await spot.getAttribute("data-spot-tag"))!;
  await chat.getByLabel("Add a comment").fill(SECRET);
  await chat.getByRole("button", { name: "Post", exact: true }).click();
  await expect(chat.getByText(SECRET)).toBeVisible();
  await yara.keyboard.press("Escape");
  const more = await passOn(yara, yaraHome);
  await more.getByRole("group", { name: "What made you pass?" }).getByRole("button", { name: "Price" }).click();
  await expect(
    more.getByRole("group", { name: "What made you pass?" }).getByRole("button", { name: "Price" }),
  ).toHaveAttribute("aria-pressed", "true");

  // The public page: none of it, under the photo or anywhere on the home,
  // now or after a while. Nothing of hers was shared, so not even "A buyer".
  const page = await stillPage(browser);
  await page.goto("/homes/SAMPLE-1008");
  const home = homeIn(page, SALTMARSH);
  await settled(home);
  await expect(latestOf(home)).toBeVisible();
  const photo = await box(home.getByRole("img", { name: COTTAGE }));
  const spotAt = { x: photo.x + photo.width * SPOT.x, y: photo.y + photo.height * SPOT.y };
  for (let i = 0; i < 3; i++) {
    const text = (await home.textContent())!;
    for (const never of ["didn't like", "passed", "privately", SECRET, SPOT_SECRET, "Yara"]) expect(text).not.toContain(never);
    // Nor a word of it in the comments under the photo: no row of hers at
    // all. (Other tests' words may be there, even one another buyer chose
    // to share; nothing of Yara's, and nothing on a spot.)
    const rows = latestOf(home).getByRole("listitem");
    await expect(rows.filter({ hasText: new RegExp(`Yara|${SECRET}|${SPOT_SECRET}`) })).toHaveCount(0);
    await expect(latestOf(home)).not.toContainText(/, on /);
    // Nor its spot, drawn or named: nothing on the photo where she left it.
    await expect(home.locator(`[data-spot-tag="${spotTag}"]`)).toHaveCount(0);
    for (const drawn of await home.locator("[data-spot-highlight], [data-pin]").all()) {
      const at = await box(drawn);
      expect(Math.hypot(at.x + at.width / 2 - spotAt.x, at.y + at.height / 2 - spotAt.y)).toBeGreaterThan(10);
    }
    await tick(page, 8000);
  }
  for (const path of ["/", "/homes/SAMPLE-1008"]) {
    const html = await (await page.request.get(path)).text();
    for (const never of [SECRET, SPOT_SECRET, "Yara", spotTag]) expect(html).not.toContain(never);
  }
});

test("isolation: a comment on a spot shared from a link shows its words in public, as a buyer's, never where it was left", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const WORDS = "Love how the light falls on this side.";
  const agent = await signInAgent(browser, "tess@example.com", "Tess Agent");
  const { url } = await createShare(agent, ["719 Saltmarsh"], ["Zoe"]);
  const zoe = await signedIn(browser);
  await zoe.goto(url);
  const zoeHome = homeIn(zoe, SALTMARSH);
  await zoeHome.scrollIntoViewIfNeeded();
  await settled(zoeHome);
  // Sharing is offered once you like the home.
  await heartOf(zoeHome).click();
  await expect(heartOf(zoeHome)).toHaveAttribute("aria-pressed", "true");
  const SPOT = { x: 0.8, y: 0.45 };
  await tapPhoto(zoeHome, COTTAGE, SPOT.x, SPOT.y);
  const card = zoeHome.locator("[data-spot-card]");
  await expect(card).toBeVisible();
  await settle(card);
  await card.getByRole("button", { name: /^Comment on/ }).click();
  const about = commentsOf(zoeHome);
  await expect(about.getByRole("heading", { name: "On a spot in photo 1" })).toBeVisible();
  await about.getByLabel(/share publicly/).check();
  await about.getByRole("textbox").fill(WORDS);
  await about.getByRole("button", { name: "Post", exact: true }).click();
  await expect(about).toBeHidden();
  const zoeChat = await openComments(zoe, zoeHome);
  const spot = zoeChat.getByRole("listitem").filter({ hasText: WORDS }).locator('[data-spot-tag^="@"]');
  await expect(spot).toHaveCount(1);
  const spotTag = (await spot.getAttribute("data-spot-tag"))!;
  await zoe.keyboard.press("Escape");

  // In public: what she said, under the photo, by "A buyer" with a lock, on
  // no spot at all: no pin on the row, no spot in the comments.
  const page = await (await browser.newContext()).newPage();
  await page.goto("/homes/SAMPLE-1008");
  const home = homeIn(page, SALTMARSH);
  await settled(home);
  const row = rowOf(home, WORDS);
  await expect(row).toContainText(`A buyer ${WORDS}`);
  await expect(row).not.toContainText("Zoe");
  await expect(lockIn(row)).toHaveCount(1);
  await expect(pinIn(row)).toHaveCount(0);
  await expect(home.locator(`[data-spot-tag="${spotTag}"]`)).toHaveCount(0);
  await expect(home.locator("[data-spot-highlight]")).toHaveCount(0);
  await row.getByRole("button").click();
  const sheet = commentsOf(home);
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText(WORDS)).toBeVisible();
  await expect(sheet.getByRole("button", { name: /: show it$/ })).toHaveCount(0);
  await expect(sheet.getByRole("listitem").filter({ hasText: WORDS }).locator("[data-spot-tag]")).toHaveCount(0);
  const html = await (await page.request.get("/homes/SAMPLE-1008")).text();
  expect(html).toContain(WORDS);
  expect(html).not.toContain(spotTag);
  expect(html).not.toContain("Zoe");
});

test("isolation: kept private, what you said on an agent's link stays off your own page, for you and for everyone; your public like counts there", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const SECRET = "Too close to the road for the two of us.";
  const agent = await signInAgent(browser, "tara.own@example.com", "Tara Agent");
  const { url } = await createShare(agent, ["719 Saltmarsh"], ["Wren"]);
  const wren = await signUpBuyer(browser, "wren.own@example.com", "Wren Own");
  // (She'd rather what she does on homes she's sent stayed off her profile.)
  await keepLinksPrivate(wren);
  await wren.goto(url);
  const linkHome = homeIn(wren, SALTMARSH);
  await linkHome.scrollIntoViewIfNeeded();
  await settled(linkHome);
  // A comment on her agent's link: private.
  const chat = await openComments(wren, linkHome);
  await chat.getByLabel("Add a comment").fill(SECRET);
  await chat.getByRole("button", { name: "Post", exact: true }).click();
  await expect(chat.getByText(SECRET)).toBeVisible();
  await wren.keyboard.press("Escape");
  // And a like of the same home in public, so it's on her page.
  await wren.goto("/homes/SAMPLE-1008");
  const liked = heartOf(homeIn(wren, SALTMARSH));
  await liked.click();
  await expect(liked).toHaveAttribute("aria-pressed", "true");
  await wren.goto("/people/me");
  await wren.waitForURL(/\/people\/[0-9a-f-]{36}$/);
  const wrenId = new URL(wren.url()).pathname.split("/").pop();
  const address = `/reel?from=${wrenId}&home=SAMPLE-1008`;
  // She has a photo of herself.
  await wren.goto("/people/me/edit");
  await wren.getByLabel("Add a photo").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: Buffer.from(PNG_1PX, "base64") });
  await expect(wren.getByLabel("Change photo")).toBeAttached();

  // The home as her page shows it, to whoever's looking: what's under the
  // photo and what the home says, now and after a while.
  const look = async (page: Page) => {
    const home = homeIn(page, SALTMARSH);
    await settled(home);
    await expect(latestOf(home)).toBeVisible();
    const said: string[] = [];
    for (let i = 0; i < 3; i++) {
      said.push((await latestOf(home).textContent()) ?? "", (await home.textContent()) ?? "");
      await tick(page, 8000);
    }
    return { home, said };
  };

  // To her, on her own page: her like counted, with her face on why it's
  // here (her photo, as her page shows it); never her words from the link,
  // not even nameless. (What another buyer chose to share shows here as it
  // does anywhere, as "A buyer": that's the home's thread, not hers.)
  const own = await wren.context().newPage();
  await own.clock.install();
  await own.clock.pauseAt(new Date(Date.now() + 1000));
  await own.goto(address);
  const hers = await look(own);
  await expect(likesLineOf(hers.home)).toHaveText(/^\d+ likes?$/);
  await expect(hers.home.getByRole("region", { name: "Why it's here" })).toContainText("You liked this");
  await expect(hers.home.getByRole("region", { name: "Why it's here" }).locator("img")).toHaveAttribute(
    "src",
    new RegExp(`^/people/${wrenId}/photo`),
  );
  for (const text of hers.said) expect(text).not.toMatch(/Too close|privately|others liked/);
  await own.close();

  // Anyone else on her page: her public like, under her name, and nothing she said.
  const visitor = await stillPage(browser);
  await visitor.goto(address);
  const theirs = await look(visitor);
  await expect(theirs.home.getByRole("region", { name: "Why it's here" })).toContainText("Wren liked this");
  await expect(likesLineOf(theirs.home)).toHaveText(/^\d+ likes?$/);
  for (const text of theirs.said) expect(text).not.toMatch(/Too close|privately|others liked/);
  expect(await (await visitor.request.get(address)).text()).not.toContain(SECRET);

  // Her agent, there: the same. What she said on the link stays on the link.
  expect(await (await agent.request.get(address)).text()).not.toContain(SECRET);
  const agents = await agent.context().newPage();
  await agents.clock.install();
  await agents.clock.pauseAt(new Date(Date.now() + 1000));
  await agents.goto(address);
  for (const text of (await look(agents)).said) expect(text).not.toMatch(/Too close/);
  await agents.close();

  // Her like, taken back, so no later spec counts it.
  await wren.goto("/homes/SAMPLE-1008");
  const heart = heartOf(homeIn(wren, SALTMARSH));
  await expect(heart).toHaveAttribute("aria-pressed", "true");
  await heart.click();
  await expect(heart).toHaveAttribute("aria-pressed", "false");
});
