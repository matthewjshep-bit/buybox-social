// The homes in the pop-out are what's on the page they came from: someone's
// highlights, under the page's filter and in its order, on a stage that takes
// the window, each home saying whose take it is and opening on their photo.
// Nothing private comes along: not hidden passes, not what they didn't like
// (but to them), not the comments they liked, not an agent's client to
// anyone but that agent. Everything here is taken back at the end, so no
// later spec counts it.
import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  createShare,
  heartOf,
  homeIn,
  likeInPhoto,
  openComments,
  openMore,
  pick,
  signedIn,
  signInAgent,
  signUpBuyer,
} from "./helpers";
import { takeBackAll } from "./own-page";

test.describe.configure({ mode: "serial" });

const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

const TAMSEN = "1880 Tamsen Ridge Pl SE"; // SAMPLE-1002
const CORBEL = "812 N Corbel St"; // SAMPLE-1003
const LAKEVIEW = "5902 Lakeview Terrace SE"; // SAMPLE-1013
const KITCHEN = "White kitchen with an island and pendant lights";
const SAID = "Room for everyone at those bar stools.";
const OTTO_SAID = "Big kitchen, small yard.";

// Ines, signed in throughout, and her page.
let ines: Page;
let inesPage = "";

const newPage = async (browser: Browser, options = {}) => (await browser.newContext(options)).newPage();

// Someone's own page, by its address ("/people/<id>").
async function pageOf(page: Page) {
  await page.goto("/people/me");
  await page.waitForURL(/\/people\/[0-9a-f-]{36}$/);
  return new URL(page.url()).pathname;
}

// Until what was just done is saved, not only shown.
const saved = (page: Page) =>
  page.waitForResponse((res) => res.request().method() === "POST" && Boolean(res.request().headers()["next-action"]));

const cardLinks = (page: Page) => page.locator('main li > a[aria-label*=": "]');
// A card's link, by the home it opens.
const cardTo = (page: Page, key: string) => page.locator(`main li > a[href*="home=${key}&"]`);

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  ines = await signUpBuyer(browser, "ines.reel@example.com", "Ines Vale");
  // Oldest first: a like on Tamsen…
  await ines.goto("/homes/SAMPLE-1002");
  const tamsen = homeIn(ines, TAMSEN);
  await Promise.all([saved(ines), heartOf(tamsen).click()]);
  await expect(heartOf(tamsen)).toHaveAttribute("aria-pressed", "true");

  // …then Corbel: not the shingles, but the bar stools in its kitchen, and a word about them…
  await ines.goto("/homes/SAMPLE-1003");
  const corbel = homeIn(ines, CORBEL);
  await expect(corbel).toBeInViewport({ ratio: 0.9 });
  const shingles = await pick(corbel, "the cedar shingles");
  await shingles.getByRole("button", { name: /^Dislike the cedar shingles/ }).click();
  await expect(shingles.getByRole("button", { name: /^Dislike the cedar shingles/ })).toHaveAttribute("aria-pressed", "true");
  await shingles.getByRole("button", { name: "Close" }).click();
  await corbel.getByRole("button", { name: "Next photo" }).click();
  await expect(corbel.getByRole("button", { name: "Select the media wall" })).toBeAttached();
  await corbel.getByRole("button", { name: "Next photo" }).click();
  const stools = await likeInPhoto(corbel, "the bar stools");
  await stools.getByRole("button", { name: "Comment" }).click();
  const sheet = ines.getByRole("dialog", { name: "Comments" });
  await sheet.getByLabel("Comment on the bar stools").fill(SAID);
  await sheet.getByRole("button", { name: "Post", exact: true }).click();
  await expect(sheet).toBeHidden();

  // …and last, a like on Lakeview. Her page: Lakeview, Corbel, Tamsen.
  await ines.goto("/homes/SAMPLE-1013");
  const lakeview = homeIn(ines, LAKEVIEW);
  await Promise.all([saved(ines), heartOf(lakeview).click()]);
  await expect(heartOf(lakeview)).toHaveAttribute("aria-pressed", "true");
  inesPage = await pageOf(ines);
  await expect(async () => {
    await ines.goto(inesPage);
    await expect(cardLinks(ines)).toHaveCount(3, { timeout: 1000 });
  }).toPass({ timeout: 20_000 });
});

test.afterAll(async () => {
  test.setTimeout(120_000);
  for (const address of [LAKEVIEW, CORBEL, TAMSEN]) await takeBackAll(ines, address);
});

test("a card on someone's page opens their highlights on a stage that takes the window, each home saying whose take it is", async ({
  browser,
}) => {
  test.setTimeout(60_000);
  const page = await newPage(browser, DESKTOP);
  await page.goto(inesPage);
  await expect(cardLinks(page)).toHaveCount(3);
  const card = cardTo(page, "SAMPLE-1013");
  await card.click();
  await page.waitForURL(/\/reel\?from=[\w-]+&home=SAMPLE-1013/);
  const popout = page.getByRole("dialog", { name: "Homes" });
  const lakeview = homeIn(popout, LAKEVIEW);
  await expect(lakeview).toBeInViewport({ ratio: 0.9 });

  // Nearly all the window, rather than a box in the middle of it.
  const stage = (await popout.locator("[data-dark-ground]").boundingBox())!;
  expect(stage.width * stage.height).toBeGreaterThanOrEqual(0.9 * 1440 * 900);

  // Whose homes these are and how far through, across the top, to her page;
  // and the same homes on a page of their own.
  await expect(popout.getByRole("link", { name: "Ines's highlights" })).toHaveAttribute("href", inesPage);
  await expect(popout.getByText("· 1 of 3", { exact: true })).toBeVisible();
  await expect(popout.getByRole("link", { name: "Open full page" })).toHaveAttribute(
    "href",
    /^\/reel\?from=[\w-]+&home=SAMPLE-1013$/,
  );

  // The homes before and after: beside the stage, not faint on each home.
  const previous = popout.getByRole("button", { name: "Previous home", exact: true });
  const next = popout.getByRole("button", { name: "Next home", exact: true });
  await expect(previous).toBeDisabled();
  await expect(lakeview.getByRole("button", { name: "Go to the next home" })).toHaveCount(0);
  await next.click();
  const corbel = homeIn(popout, CORBEL);
  await expect(corbel).toBeInViewport({ ratio: 0.9 });
  await page.waitForURL(/home=SAMPLE-1003/);
  await expect(popout.getByText("· 2 of 3", { exact: true })).toBeVisible();
  // It opens on her photo, not its first: the kitchen, where she liked the bar stools.
  await expect(corbel.getByRole("img", { name: KITCHEN })).toBeInViewport();

  // Why it's here: her face and name, to her page, what she liked and what
  // she said. Not what she didn't like: that's for her own page only.
  const why = corbel.getByRole("region", { name: "Why it's here" });
  await expect(why.getByRole("link", { name: "Ines", exact: true })).toHaveAttribute("href", inesPage);
  await expect(why).toContainText("Ines liked the bar stools");
  await expect(why).toContainText(SAID);
  await expect(why.getByRole("button", { name: /^Didn't like/ })).toHaveCount(0);
  await expect(why).not.toContainText(/shingles|but not/);
  // A spot she picked out: its card opens on the photo, right there.
  const stools = corbel.getByRole("group", { name: /^bar stools$/i });
  // (Tapped while the home is still coming to rest, the card can miss its
  // photo; once settled, a tap opens it.)
  await expect(async () => {
    if (!(await stools.isVisible())) await why.getByRole("button", { name: "Liked the bar stools: show it" }).click();
    await expect(stools).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15_000 });
  await stools.getByRole("button", { name: "Close" }).click();
  await expect(stools).toBeHidden();

  // The keyboard goes on too, and at the end, a stop: all of hers, and Follow.
  await page.keyboard.press("ArrowDown");
  await expect(homeIn(popout, TAMSEN)).toBeInViewport({ ratio: 0.9 });
  await next.click();
  const end = popout.getByRole("region", { name: "The end" });
  await expect(end).toBeInViewport({ ratio: 0.9 });
  await expect(end.getByRole("heading", { level: 2 })).toHaveText("That's all 3 of Ines's highlights");
  // (Signed out, Follow is the way to sign in, back to her page.)
  await expect(end.getByRole("link", { name: "Follow Ines" })).toHaveAttribute(
    "href",
    `/login?next=${encodeURIComponent(inesPage)}`,
  );
  await expect(next).toBeDisabled();

  // Closed, back on her page, with the keyboard on the card that opened it.
  await popout.getByRole("button", { name: "Close", exact: true }).click();
  await expect(popout).toHaveCount(0);
  await page.waitForURL((url) => url.pathname === inesPage);
  await expect(card).toBeFocused();
});

test("under a filter, the pop-out holds only what the page shows, and keeps the filter when it's loaded again", async ({
  browser,
}) => {
  test.setTimeout(60_000);
  const page = await newPage(browser, DESKTOP);
  await page.goto(`${inesPage}?show=comments`);
  await expect(cardLinks(page)).toHaveCount(1);
  const card = cardTo(page, "SAMPLE-1003");
  await expect(card).toHaveAttribute("href", /^\/reel\?from=[\w-]+&show=comments&home=SAMPLE-1003&photo=2$/);
  await card.click();
  await page.waitForURL(/\/reel\?from=[\w-]+&show=comments&home=SAMPLE-1003/);
  const popout = page.getByRole("dialog", { name: "Homes" });
  await expect(homeIn(popout, CORBEL)).toBeInViewport({ ratio: 0.9 });
  // Only the one she commented on, and saying so.
  await expect(popout.getByRole("article")).toHaveCount(1);
  await expect(popout.getByRole("link", { name: "Ines's comments" })).toHaveAttribute("href", `${inesPage}?show=comments`);
  await expect(popout.getByText("· 1 of 1", { exact: true })).toBeVisible();
  await popout.getByRole("button", { name: "Next home", exact: true }).click();
  await expect(popout.getByRole("region", { name: "The end" }).getByRole("heading", { level: 2 })).toHaveText(
    "That's every home Ines commented on",
  );

  // Loaded again by its address: the full page, with the same filter, and back to it.
  await page.reload();
  await expect(page).toHaveURL(/show=comments/);
  await expect(page.getByRole("dialog", { name: "Homes" })).toHaveCount(0);
  await expect(homeIn(page, CORBEL)).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Back to Ines's comments" }).first()).toHaveAttribute(
    "href",
    `${inesPage}?show=comments`,
  );
});

test("a card from further down the page (Show earlier) opens on itself, with the page's own homes before it", async ({
  browser,
}) => {
  test.setTimeout(60_000);
  // "Show earlier" is the page from before a card's time. (A whole first
  // page of cards can't be made in one day here: there are only 13 homes.)
  const page = await newPage(browser, DESKTOP);
  await page.goto(inesPage);
  const corbelAt = await page
    .locator("main li")
    .filter({ has: page.locator('a[href*="home=SAMPLE-1003&"]') })
    .locator("time")
    .first()
    .getAttribute("datetime");
  await page.goto(`${inesPage}?before=${encodeURIComponent(corbelAt!)}`);
  await expect(cardLinks(page)).toHaveCount(1);
  await cardTo(page, "SAMPLE-1002").click();
  await page.waitForURL(/home=SAMPLE-1002/);
  const popout = page.getByRole("dialog", { name: "Homes" });
  await expect(homeIn(popout, TAMSEN)).toBeInViewport({ ratio: 0.9 });
  await expect(popout.getByText("· 3 of 3", { exact: true })).toBeVisible();
  // Before it, the page's card before it, not the newest of all.
  await popout.getByRole("button", { name: "Previous home", exact: true }).click();
  await expect(homeIn(popout, CORBEL)).toBeInViewport({ ratio: 0.9 });
  await popout.getByRole("button", { name: "Previous home", exact: true }).click();
  await expect(homeIn(popout, LAKEVIEW)).toBeInViewport({ ratio: 0.9 });
});

test("on a phone the pop-out is the whole screen, with whose take it is above the photo, opened with a tap", async ({
  browser,
}) => {
  test.setTimeout(60_000);
  const page = await newPage(browser, PHONE);
  await page.goto(inesPage);
  await cardTo(page, "SAMPLE-1003").click();
  await page.waitForURL(/home=SAMPLE-1003/);
  const popout = page.getByRole("dialog", { name: "Homes" });
  const corbel = homeIn(popout, CORBEL);
  await expect(corbel).toBeInViewport({ ratio: 0.9 });
  expect(await popout.boundingBox()).toEqual({ x: 0, y: 0, width: 390, height: 844 });

  const why = corbel.getByRole("region", { name: "Why it's here" });
  await expect(why).toBeVisible();
  await expect(why).toContainText("Ines's highlights · 2 of 3");
  const photo = (await corbel.getByRole("img", { name: KITCHEN }).boundingBox())!;
  const take = (await why.boundingBox())!;
  expect(take.y + take.height).toBeLessThanOrEqual(photo.y + 1);

  // One line until it's tapped; then all of it, in place.
  const toggle = why.getByRole("button", { expanded: false });
  await expect(toggle).toContainText("Ines liked the bar stools");
  await toggle.click();
  await expect(why.getByRole("button", { expanded: true })).toBeVisible();
  await expect(why.getByRole("link", { name: "Ines", exact: true })).toBeVisible();
  await expect(why.getByText(SAID)).toBeVisible();
});

test("privacy: hidden passes stay out, only the owner sees what they didn't like, and comments they liked never come along", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  // Otto likes Tamsen, passes on Lakeview, says something about Corbel, and
  // keeps his passes to himself.
  const otto = await signUpBuyer(browser, "otto.reel@example.com", "Otto Lind");
  await otto.goto("/homes/SAMPLE-1002");
  await Promise.all([saved(otto), heartOf(homeIn(otto, TAMSEN)).click()]);
  await expect(heartOf(homeIn(otto, TAMSEN))).toHaveAttribute("aria-pressed", "true");
  await otto.goto("/homes/SAMPLE-1013");
  const more = await openMore(otto, homeIn(otto, LAKEVIEW));
  await Promise.all([saved(otto), more.getByRole("button", { name: "Not for me" }).click()]);
  await otto.keyboard.press("Escape");
  await otto.goto("/homes/SAMPLE-1003");
  const thread = await openComments(otto, homeIn(otto, CORBEL));
  await thread.getByLabel("Add a comment").fill(OTTO_SAID);
  await thread.getByRole("button", { name: "Post", exact: true }).click();
  await expect(thread.getByText(OTTO_SAID)).toBeVisible();
  const ottoPage = await pageOf(otto);
  await otto.getByRole("button", { name: "Not quite right?" }).click();
  const controls = otto.getByRole("dialog", { name: "What others see" });
  const passes = controls.getByRole("switch", { name: "Show my passes on my page" });
  await Promise.all([saved(otto), passes.click()]);
  await expect(passes).toHaveAttribute("aria-checked", "false");
  await otto.keyboard.press("Escape");

  // His homes, as anyone else gets them: never the one he passed on, by any address.
  const visitor = await newPage(browser);
  const ottoId = ottoPage.split("/").pop();
  for (const address of [`/reel?from=${ottoId}&home=SAMPLE-1002`, `/reel?from=${ottoId}&show=passed&home=SAMPLE-1002`]) {
    await expect(async () => {
      const html = await (await visitor.request.get(address)).text();
      expect(html, address).toContain(TAMSEN);
      expect(html, address).not.toContain(LAKEVIEW);
      expect(html, address).not.toContain("SAMPLE-1013");
    }).toPass({ timeout: 20_000 });
    await visitor.goto(address);
    await expect(homeIn(visitor, TAMSEN)).toBeVisible();
    await expect(homeIn(visitor, LAKEVIEW)).toHaveCount(0);
  }

  // Ines likes what Otto said: on her own page, that's hers alone, and it
  // never comes along into her take on the home, even for her.
  await ines.goto("/homes/SAMPLE-1003");
  const chat = await openComments(ines, homeIn(ines, CORBEL));
  await chat.getByRole("button", { name: "Like Otto's comment" }).click();
  await expect(async () => {
    await ines.goto(inesPage);
    await expect(ines.locator("main")).toContainText("You liked Otto's comment", { timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await cardTo(ines, "SAMPLE-1003").click();
  const popout = ines.getByRole("dialog", { name: "Homes" });
  const corbel = homeIn(popout, CORBEL);
  await expect(corbel).toBeInViewport({ ratio: 0.9 });
  const why = corbel.getByRole("region", { name: "Why it's here" });
  await expect(why).toContainText("Your highlights");
  await why.getByRole("button", { expanded: false }).click();
  // Her own: what she didn't like too.
  await expect(why.getByRole("button", { name: "Didn't like the cedar shingles: show it" })).toBeVisible();
  await expect(why).not.toContainText(OTTO_SAID);
  await ines.keyboard.press("Escape");
  await expect(popout).toHaveCount(0);

  // Anyone else: no dislike, and nothing she liked of others'.
  await visitor.goto(inesPage);
  await cardTo(visitor, "SAMPLE-1003").click();
  const theirs = homeIn(visitor.getByRole("dialog", { name: "Homes" }), CORBEL).getByRole("region", { name: "Why it's here" });
  await theirs.getByRole("button", { expanded: false }).click();
  await expect(theirs.getByRole("button", { name: /^Liked the bar stools/ })).toBeVisible();
  await expect(theirs.getByRole("button", { name: /^Didn't like/ })).toHaveCount(0);
  await expect(theirs).not.toContainText(OTTO_SAID);

  for (const address of [TAMSEN, LAKEVIEW, CORBEL]) await takeBackAll(otto, address);
});

test("a client's homes are their agent's alone: on their page the agent sees who they are, and anyone else gets plain Browse homes", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const agent = await signInAgent(browser, "reel.agent@example.com", "Reed Marsh");
  const { urls } = await createShare(agent, ["812 N Corbel"], ["Jenny"]);
  // Jenny, signed in with just an email, likes the home on her link.
  const jenny = await signedIn(browser);
  const jennyPage = await pageOf(jenny);
  await jenny.goto(urls.Jenny);
  const home = homeIn(jenny, CORBEL);
  await home.scrollIntoViewIfNeeded();
  await expect(home).toBeInViewport({ ratio: 0.9 });
  await Promise.all([saved(jenny), heartOf(home).click()]);
  await expect(heartOf(home)).toHaveAttribute("aria-pressed", "true");

  // Her agent, on her page: the name they gave her (she has none of her own
  // yet), that she's theirs, and her homes and her link a tap away.
  await agent.goto(jennyPage);
  await expect(agent.getByRole("heading", { level: 1 })).toHaveText("Jenny");
  await expect(agent.getByText("Your client", { exact: true })).toBeVisible();
  await expect(agent.getByRole("link", { name: "Their link" })).toHaveAttribute("href", /^\/dashboard\/shares\/[0-9a-f-]{36}$/);
  const theirHomes = agent.getByRole("link", { name: "See their homes" });
  const href = (await theirHomes.getAttribute("href"))!;
  expect(href).toMatch(/^\/reel\?from=client:[0-9a-f-]{36}$/);
  await theirHomes.click();
  const popout = agent.getByRole("dialog", { name: "Homes" });
  const corbel = homeIn(popout, CORBEL);
  await expect(corbel).toBeInViewport({ ratio: 0.9 });
  const why = corbel.getByRole("region", { name: "Why it's here" });
  await expect(why).toContainText("Jenny's homes · 1 of 1");
  await expect(why).toContainText("Jenny liked this");
  await why.getByRole("button", { expanded: false }).click();
  await expect(why.getByText("Only you see this")).toBeVisible();
  await popout.getByRole("button", { name: "Close", exact: true }).first().click();
  await expect(popout).toHaveCount(0);

  // Another agent: nothing of hers. Her page as anyone's, and the same
  // address is the plain Browse homes.
  const other = await signInAgent(browser, "reel.other.agent@example.com", "Odile Brandt");
  await other.goto(jennyPage);
  await expect(other.getByRole("heading", { level: 1 })).toHaveText("A buyer");
  await expect(other.getByText("Your client", { exact: true })).toHaveCount(0);
  await other.goto(href);
  await expect(other.getByRole("article").first()).toBeVisible();
  await expect(other.getByRole("region", { name: "Why it's here" })).toHaveCount(0);
  await expect(other.getByText("Jenny's homes")).toHaveCount(0);
  expect(await (await other.request.get(href)).text()).not.toContain("Jenny's homes");
});

test("a link to a comment opens the home's comments right on it, and anything else is ignored", async ({ browser }) => {
  test.setTimeout(60_000);
  const page = await newPage(browser);
  await page.goto("/homes/SAMPLE-1003");
  const thread = await openComments(page, homeIn(page, CORBEL));
  const id = await thread.locator("[data-comment]").filter({ hasText: SAID }).first().getAttribute("data-comment");
  expect(id).toMatch(/^[0-9a-f-]{36}$/);

  await page.goto(`/homes/SAMPLE-1003?comment=${id}`);
  const sheet = page.getByRole("dialog", { name: "Comments" });
  await expect(sheet).toBeVisible();
  const said = sheet.locator(`[data-comment="${id}"]`);
  await expect(said).toHaveAttribute("data-flash", "");
  await expect(said).toBeInViewport();

  // Not a comment on that home, or not a comment at all: just the home.
  for (const address of [`/homes/SAMPLE-1002?comment=${id}`, "/homes/SAMPLE-1002?comment=not-a-comment"]) {
    await page.goto(address);
    await expect(homeIn(page, TAMSEN)).toBeInViewport({ ratio: 0.9 });
    await page.waitForTimeout(800);
    await expect(page.getByRole("dialog", { name: "Comments" })).toHaveCount(0);
  }
});

test("the third card opens on its own home, from someone's page and from the home feed", async ({ browser }) => {
  test.setTimeout(90_000);
  const page = await newPage(browser);
  await page.goto(inesPage);
  await expect(cardLinks(page)).toHaveCount(3);
  await cardLinks(page).nth(2).click();
  await page.waitForURL(/home=SAMPLE-1002/);
  await expect(homeIn(page.getByRole("dialog", { name: "Homes" }), TAMSEN)).toBeInViewport({ ratio: 0.9 });

  // Someone who follows her: the third home in their feed, the same.
  const follower = await signUpBuyer(browser, "wren.reel@example.com", "Wren Hale");
  await follower.goto(inesPage);
  await Promise.all([saved(follower), follower.getByRole("button", { name: "Follow Ines" }).click()]);
  await expect(follower.getByRole("button", { name: "Following Ines" })).toBeVisible();
  // (Following one person, their home opens on homes picked for them:
  // Following is a tap away, or in the address.)
  await follower.goto("/?lens=following");
  const links = follower.locator('a[href^="/reel?from=feed&home="]');
  const homes = async () => [
    ...new Set(
      await links.evaluateAll((all) => all.map((a) => new URL((a as HTMLAnchorElement).href).searchParams.get("home")!)),
    ),
  ];
  await expect.poll(async () => (await homes()).length).toBeGreaterThanOrEqual(3);
  const third = (await homes())[2];
  await follower.locator(`a[href^="/reel?from=feed&home=${third}"]`).first().click();
  await follower.waitForURL(new RegExp(`/reel\\?from=feed&home=${third}`));
  await expect(follower.getByRole("dialog", { name: "Homes" }).locator(`[data-home="${third}"]`)).toBeInViewport({
    ratio: 0.9,
  });
  await follower.getByRole("dialog", { name: "Homes" }).getByRole("button", { name: "Close", exact: true }).first().click();
  // Following her was only for this.
  await follower.goto(inesPage);
  await Promise.all([saved(follower), follower.getByRole("button", { name: "Following Ines" }).click()]);
  await expect(follower.getByRole("button", { name: "Follow Ines" })).toBeVisible();
});
