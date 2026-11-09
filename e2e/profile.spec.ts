// Someone's page: one card per home per day, filters and paging that work
// without scripts, and nothing from an agent's link, ever. The homes here are
// ones no later spec counts likes on (the Scorecard's quiet Heron and counted
// Alder are left alone, or left as they were found).
import { readFileSync } from "node:fs";
import { expect, test, type Page, type Route } from "@playwright/test";
import type { Listing } from "../lib/listings/types";
import {
  buildCards,
  cardTime,
  dayHeading,
  dayOf,
  feedPage,
  filterCards,
  pageOf,
  parseBefore,
  PROFILE_ROW_LIMIT,
  type FeedFilters,
  type ProfileCard,
  type ProfileRows,
  withoutPasses,
} from "../lib/profile";
import {
  checkStory,
  hashOf,
  inputOf,
  shownStory,
  storyOf,
  templateOf,
  updatedLabel,
  voiceOf,
  type StoredStory,
  type TasteStory,
} from "../lib/taste-story";
import {
  commentIn,
  createShare,
  heartOf,
  homeIn,
  likeInPhoto,
  openComments,
  openMore,
  openScorecard,
  pick,
  settle,
  signInAgent,
  signUpBuyer,
} from "./helpers";
import { takeBackAll } from "./own-page";

const CORBEL = "812 N Corbel St";
const HERON = "88 Heron Bluff Rd";
const QUILLAN = "1204 Quillan St SE";
const LAKEVIEW = "5902 Lakeview Terrace SE";
const SECRET = "Between us, we'd offer 40 under.";

// A card on the page, found by the link that opens its home.
const cardOf = (page: Page, name: string | RegExp) =>
  page.getByRole("listitem").filter({ has: page.getByRole("link", { name }) });

const cardLinks = (page: Page) => page.locator('main li > a[aria-label*=": "]');

test("a profile is one card per home per day, with the photo and the spots picked in it", async ({ browser }) => {
  test.setTimeout(90_000);
  const lena = await signUpBuyer(browser, "lena@example.com", "Lena Park");
  const pageErrors: string[] = [];
  lena.on("pageerror", (error) => pageErrors.push(error.message));

  // Several things on one home: the home itself, the porch (liked and talked
  // about), the shingles (not liked) and the price.
  await lena.goto("/homes/SAMPLE-1003");
  const corbel = homeIn(lena, CORBEL);
  await heartOf(corbel).click();
  await expect(heartOf(corbel)).toHaveAttribute("aria-pressed", "true");
  const porch = await likeInPhoto(corbel, "the wraparound porch");
  await porch.getByRole("button", { name: "Comment" }).click();
  const sheet = lena.getByRole("dialog", { name: "Comments" });
  await sheet.getByLabel("Comment on the wraparound porch").fill("That porch is the whole reason I'd move.");
  await sheet.getByRole("button", { name: "Post", exact: true }).click();
  await expect(sheet).toBeHidden();
  const shingles = await pick(corbel, "the cedar shingles");
  await shingles.getByRole("button", { name: /^Dislike the cedar shingles/ }).click();
  await expect(shingles.getByRole("button", { name: "Dislike the cedar shingles, 1 dislike", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await shingles.getByRole("button", { name: "Close" }).click();
  await corbel.getByRole("button", { name: /^\$[\d,]+/ }).click();
  const price = corbel.getByRole("group", { name: "Price" });
  await expect(price).toBeVisible();
  await settle(price);
  await price.getByRole("button", { name: "Like the price", exact: true }).click();
  await expect(price.getByRole("button", { name: "Like the price, 1 like", exact: true })).toHaveAttribute("aria-pressed", "true");

  // And just a like on another.
  await lena.goto("/homes/SAMPLE-1009");
  const quillan = homeIn(lena, QUILLAN);
  await heartOf(quillan).click();
  await expect(heartOf(quillan)).toHaveAttribute("aria-pressed", "true");

  await lena.goto("/people/me");
  await lena.waitForURL(/\/people\/[0-9a-f-]{36}$/);
  const profileUrl = lena.url();
  await expect(lena.getByRole("heading", { level: 1 })).toHaveText("Lena (you)");
  const main = lena.locator("main");
  await expect(main).toContainText(/Looking since \w+ · 2 homes/);
  await expect(main).toContainText("2 liked · 0 passed · 1 comment");
  await expect(lena.getByText("Everyone can see this page. What you do on an agent's link never shows here.")).toBeVisible();
  await expect(lena.getByRole("button", { name: "Share my page" })).toBeVisible();

  // One card per home, newest first, under "Today".
  await expect(lena.getByRole("heading", { level: 2, name: "Today" })).toBeVisible();
  await expect(cardLinks(lena)).toHaveCount(2);
  await expect(cardLinks(lena).first()).toHaveAttribute("aria-label", `${QUILLAN}: liked this`);
  // The price they liked is a chip, so the sentence keeps to the photo.
  const sentence = "liked the wraparound porch but not the cedar shingles";
  const link = lena.getByRole("link", { name: `${CORBEL}: ${sentence}`, exact: true });
  await expect(link).toHaveAttribute("href", "/homes/SAMPLE-1003?photo=0");
  const card = cardOf(lena, `${CORBEL}: ${sentence}`);
  await expect(card).toContainText(`You ${sentence}`);
  await expect(card.getByRole("img", { name: "Shingled home with a wraparound porch and green lawn" })).toBeVisible();
  // The fact they liked, and what they said, about the spot they said it about.
  await expect(card.getByRole("listitem").filter({ hasText: "Liked" })).toHaveText("Liked the price");
  await expect(card).toContainText("the wraparound porch");
  await expect(card).toContainText("That porch is the whole reason I'd move.");
  // A hotspot lands on each spot: the newest (the shingles), and the porch.
  const newest = card.locator("[data-newest]");
  await expect(newest).toHaveAttribute("data-pin", "dislike");
  await expect(newest).toHaveAttribute("style", /left: ?25%; ?top: ?42%/);
  await expect(card.locator("[data-pin]")).toHaveCount(2);
  await expect(card.locator("[data-pin=comment]")).toHaveAttribute("style", /left: ?55%; ?top: ?60%/);

  // A card shows its focus ring inside its rounded edge, where nothing cuts it off.
  await lena.getByRole("link", { name: "Comments", exact: true }).focus();
  await lena.keyboard.press("Tab");
  await expect(cardLinks(lena).first()).toBeFocused();
  expect(
    await cardLinks(lena)
      .first()
      .evaluate((el) => [getComputedStyle(el).outlineStyle, parseFloat(getComputedStyle(el).outlineOffset)]),
  ).toEqual(["solid", -3]);

  // Filters are links: what you said, what you passed on, what you liked. A
  // home they liked isn't one they passed on, whatever they didn't like in it.
  await lena.getByRole("link", { name: "Comments", exact: true }).click();
  await expect(lena).toHaveURL(/\?show=comments$/);
  await expect(lena.getByRole("link", { name: "Comments", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(cardLinks(lena)).toHaveCount(1);
  await expect(link).toBeVisible();
  await lena.getByRole("link", { name: "Passed", exact: true }).click();
  await expect(lena).toHaveURL(/\?show=passed$/);
  await expect(lena.getByText("Nothing passed on yet.")).toBeVisible();
  await expect(cardLinks(lena)).toHaveCount(0);
  await lena.getByRole("link", { name: "Liked", exact: true }).click();
  await expect(cardLinks(lena)).toHaveCount(2);
  expect(pageErrors).toEqual([]);

  // Someone else, with scripts off: the same page, not theirs, and everything still works.
  const visitor = await (await browser.newContext({ javaScriptEnabled: false })).newPage();
  await visitor.goto(profileUrl);
  await expect(visitor.getByRole("heading", { level: 1 })).toHaveText("Lena");
  await expect(visitor.getByRole("button", { name: "Share my page" })).toHaveCount(0);
  await expect(visitor.getByText(/agent's link never shows here/)).toHaveCount(0);
  await expect(cardOf(visitor, `${CORBEL}: ${sentence}`)).toContainText(`Lena ${sentence}`);
  await visitor.getByRole("link", { name: "Comments", exact: true }).click();
  await expect(visitor).toHaveURL(/\?show=comments$/);
  await expect(cardLinks(visitor)).toHaveCount(1);
  await visitor.getByRole("link", { name: "All", exact: true }).click();
  await expect(cardLinks(visitor)).toHaveCount(2);
  await expect(visitor.getByRole("link", { name: "Show earlier" })).toHaveCount(0);

  // What they love shows just those cards, until it's taken off.
  const loves = visitor.getByRole("group", { name: "Loves" });
  await loves.getByRole("link", { name: "Loves Wraparound porch, 1 home" }).click();
  await expect(visitor).toHaveURL(/\?about=Wraparound\+porch&side=like$/);
  await expect(cardLinks(visitor)).toHaveCount(1);
  await visitor.getByRole("link", { name: "Remove Wraparound porch" }).click();
  await expect(cardLinks(visitor)).toHaveCount(2);
  // Only topics from what they've done: anything else in the address is ignored.
  await visitor.goto(`${profileUrl}?about=Free+money`);
  await expect(visitor.getByRole("link", { name: /^Remove/ })).toHaveCount(0);
  await expect(visitor.locator("main")).not.toContainText("Free money");
  await expect(cardLinks(visitor)).toHaveCount(2);

  // Earlier pages start where a page ends.
  const newestAt = (await visitor.locator("main li time").first().getAttribute("datetime"))!;
  await visitor.goto(`${profileUrl}?before=${encodeURIComponent(newestAt)}`);
  await expect(cardLinks(visitor)).toHaveCount(1);
  await expect(visitor.getByRole("link", { name: `${CORBEL}: ${sentence}` })).toBeVisible();
  const oldestAt = (await visitor.locator("main li time").first().getAttribute("datetime"))!;
  await visitor.goto(`${profileUrl}?before=${encodeURIComponent(oldestAt)}`);
  await expect(visitor.getByText("That's everything")).toBeVisible();
  await visitor.getByRole("link", { name: "Back to the newest" }).click();
  await expect(cardLinks(visitor)).toHaveCount(2);
  // A moment from the far future is ignored, not an error.
  expect((await visitor.goto(`${profileUrl}?before=%2B275760-09-13T00%3A00%3A00.000Z`))!.status()).toBe(200);
  await expect(cardLinks(visitor)).toHaveCount(2);
});

test("a card opens its home over the page, on the photo it's about with the spot, and closing comes back to it", async ({
  browser,
}) => {
  test.setTimeout(60_000);
  const noor = await signUpBuyer(browser, "noor@example.com", "Noor Hale");
  await noor.goto("/homes/SAMPLE-1003");
  const corbel = homeIn(noor, CORBEL);
  await expect(corbel).toBeInViewport({ ratio: 0.9 });
  await corbel.getByRole("button", { name: "Next photo" }).click();
  await expect(corbel.getByRole("button", { name: "Select the media wall" })).toBeAttached();
  await corbel.getByRole("button", { name: "Next photo" }).click();
  await likeInPhoto(corbel, "the subway backsplash");

  await noor.goto("/people/me");
  await noor.waitForURL(/\/people\/[0-9a-f-]{36}$/);
  const link = noor.getByRole("link", { name: `${CORBEL}: liked the subway backsplash`, exact: true });
  await expect(link).toHaveAttribute("href", "/homes/SAMPLE-1003?photo=2");
  await link.click();
  const popout = noor.getByRole("dialog", { name: "Home details" });
  await expect(popout).toBeVisible();
  const home = popout.getByRole("article", { name: CORBEL });
  await expect(home.getByText("Kitchen · 3 of 3", { exact: true })).toBeVisible();
  await expect(home.getByRole("img", { name: "White kitchen with an island and pendant lights" })).toBeInViewport();
  // What she did there leads the line at the photo's foot, with a hotspot on it.
  await expect(home.getByRole("group", { name: "Recent activity" })).toContainText("subway backsplash");
  await expect(home.locator("[data-spot-highlight]")).toHaveCount(1);

  // Closed, the keyboard is back on the card that opened it.
  await noor.keyboard.press("Escape");
  await expect(popout).toBeHidden();
  await expect(link).toBeFocused();
});

test("an empty page says what will show up there", async ({ browser }) => {
  const jo = await signUpBuyer(browser, "jo@example.com", "Jo Reyes");
  await jo.goto("/people/me");
  await jo.waitForURL(/\/people\/[0-9a-f-]{36}$/);
  await expect(jo.getByRole("heading", { level: 1 })).toHaveText("Jo (you)");
  await expect(jo.getByText("Your page fills up as you go")).toBeVisible();
  await expect(jo.getByRole("link", { name: "See homes" })).toHaveAttribute("href", "/");
  await expect(jo.getByRole("link", { name: "Comments", exact: true })).toHaveCount(0);
  // Nothing yet says itself: no row of zeros above it.
  await expect(jo.locator("main")).not.toContainText("0 liked");

  const anon = await (await browser.newContext()).newPage();
  await anon.goto(jo.url());
  await expect(anon.getByRole("heading", { level: 1 })).toHaveText("Jo");
  await expect(anon.getByText("Nothing to show yet")).toBeVisible();
  await expect(anon.getByText("Jo hasn't liked anything yet.")).toBeVisible();
  expect((await anon.goto("/people/not-a-person"))!.status()).toBe(404);
});

// Signed in with just an email, so no name yet: their page never stands in
// with "Someone". It says "Your page" and asks with the prompt the homes use.
test("a page with no name yet asks for one", async ({ browser }) => {
  const cy = await (await browser.newContext()).newPage();
  await cy.goto("/login");
  await cy.getByLabel("Email").fill("cy@example.com");
  await cy.getByRole("button", { name: "Continue" }).click();
  await cy.waitForURL((url) => !url.pathname.startsWith("/login"));
  await cy.goto("/people/me");
  await cy.waitForURL(/\/people\/[0-9a-f-]{36}$/);
  await expect(cy.getByRole("heading", { level: 1 })).toHaveText("Your page");
  await expect(cy).toHaveTitle("Your page · BuyBox Social");
  await expect(cy.locator("main")).not.toContainText("Someone");

  // Anyone else sees a buyer.
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(cy.url());
  await expect(anon.getByRole("heading", { level: 1 })).toHaveText("A buyer");
  await expect(anon).toHaveTitle("A buyer · BuyBox Social");
  await expect(anon.locator("main")).not.toContainText("Someone");
  await expect(anon.getByRole("button", { name: "Add your first name" })).toHaveCount(0);

  // Named, it's theirs, and the keyboard is on it.
  await cy.getByRole("button", { name: "Add your first name" }).click();
  const prompt = cy.getByRole("dialog", { name: "What's your first name?" });
  await prompt.getByLabel("First name").fill("Cy");
  await prompt.getByRole("button", { name: "Continue" }).click();
  await expect(prompt).toBeHidden();
  const heading = cy.getByRole("heading", { level: 1 });
  await expect(heading).toHaveText("Cy (you)");
  await expect(heading).toBeFocused();
  await expect(cy.getByRole("status").filter({ hasText: "Name saved" })).toBeVisible();
  await expect(cy.getByRole("button", { name: "Add your first name" })).toHaveCount(0);
  await expect(cy).toHaveTitle("Cy · BuyBox Social");
  await anon.reload();
  await expect(anon.getByRole("heading", { level: 1 })).toHaveText("Cy");
});

// [P] Private to the link: a pass, a spot like, a spot dislike and a comment
// made on an agent's link never reach that person's public page, in words or
// in the HTML. Each is checked as saved on the link first, so the absence
// below means something.
test("what someone does on an agent's link never shows on their page", async ({ browser }) => {
  test.setTimeout(120_000);
  const agent = await signInAgent(browser, "profile-agent@example.com", "Avery Agent");
  const { url } = await createShare(agent, ["1204 Quillan"], ["Toby"]);

  // In public, one like.
  const rowan = await signUpBuyer(browser, "rowan@example.com", "Rowan Vale");
  await rowan.goto("/homes/SAMPLE-1013");
  const lakeview = homeIn(rowan, LAKEVIEW);
  await heartOf(lakeview).click();
  await expect(heartOf(lakeview)).toHaveAttribute("aria-pressed", "true");

  // On the agent's link, in the same browser: a like of one spot, words about
  // another, a dislike of it, and a pass.
  await rowan.goto(url);
  const quillan = homeIn(rowan, QUILLAN);
  const fence = await likeInPhoto(quillan, "the picket fence");
  await fence.getByRole("button", { name: "Close" }).click();
  const door = await pick(quillan, "the red front door");
  await door.getByRole("button", { name: "Comment" }).click();
  const sheet = rowan.getByRole("dialog", { name: "Comments" });
  await sheet.getByLabel("Comment on the red front door").fill(SECRET);
  await sheet.getByRole("button", { name: "Post", exact: true }).click();
  await expect(sheet).toBeHidden();
  const again = await pick(quillan, "the red front door");
  await again.getByRole("button", { name: /^Dislike the red front door/ }).click();
  await expect(again.getByRole("button", { name: "Dislike the red front door, 1 dislike", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await again.getByRole("button", { name: "Close" }).click();
  const more = await openMore(rowan, quillan);
  await more.getByRole("button", { name: "Not for me" }).click();
  const why = more.getByRole("group", { name: "What made you pass?" });
  await why.getByRole("button", { name: "Yard" }).click();
  await expect(why.getByRole("button", { name: "Yard" })).toHaveAttribute("aria-pressed", "true");
  await rowan.keyboard.press("Escape");

  // All of it was saved on the link, not just shown there: a fresh load of
  // the link, drawn from the server, has the pass, the like, the dislike and the words.
  await expect(async () => {
    await rowan.goto(url);
    const saved = homeIn(rowan, QUILLAN);
    // The pass and why, as the Scorecard has them from the server.
    const take = await openScorecard(rowan, saved);
    await expect(take.getByText("You passed on this.")).toBeVisible({ timeout: 2000 });
    await expect(take.locator("p").filter({ hasText: /^What you didn't like:/ })).toContainText("Yard", { timeout: 2000 });
    await rowan.keyboard.press("Escape");
    await expect(take).toBeHidden();
    // The like and the dislike in the photos, and the words about the door,
    // as the link's comments have them from the server.
    await saved.scrollIntoViewIfNeeded();
    await expect(saved).toBeInViewport({ ratio: 0.9, timeout: 2000 });
    const chat = await openComments(rowan, saved);
    const cards = chat.getByRole("listitem");
    await expect(cards.filter({ hasText: /liked the picket fence/ })).toBeAttached({ timeout: 2000 });
    await expect(cards.filter({ hasText: /didn't like .*red front door/ })).toBeAttached({ timeout: 2000 });
    await expect(
      cards.filter({ hasText: "Between us, we'd offer 40 under." }).getByRole("button", { name: /^About the red front door/ }),
    ).toBeAttached({ timeout: 2000 });
    await rowan.keyboard.press("Escape");
    await expect(chat).toBeHidden();
  }).toPass({ timeout: 30_000 });

  // Their page has the public like and nothing else, for them and for anyone.
  await rowan.goto("/people/me");
  await rowan.waitForURL(/\/people\/[0-9a-f-]{36}$/);
  const profileUrl = rowan.url();
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(profileUrl);
  for (const page of [rowan, anon]) {
    const main = page.locator("main");
    await expect(page.getByRole("link", { name: `${LAKEVIEW}: liked this` })).toBeVisible();
    await expect(cardLinks(page)).toHaveCount(1);
    await expect(main).toContainText("1 liked · 0 passed · 0 comments");
    await expect(main).toContainText("1 home");
    await expect(main).not.toContainText(QUILLAN);
    await expect(main).not.toContainText(SECRET);
    await expect(main).not.toContainText(/red front door|picket fence|Passes on|Yard/i);
    await page.getByRole("link", { name: "Passed", exact: true }).click();
    await expect(page.getByText("Nothing passed on yet.")).toBeVisible();
    await page.getByRole("link", { name: "Comments", exact: true }).click();
    await expect(page.getByText("No comments yet.")).toBeVisible();
    expect(await (await page.request.get(profileUrl)).text()).toContain(LAKEVIEW);
    for (const path of [profileUrl, `${profileUrl}?show=passed`, `${profileUrl}?show=comments`, `${profileUrl}?show=liked`]) {
      const html = await (await page.request.get(path)).text();
      for (const secret of [SECRET, QUILLAN, "SAMPLE-1009", "Toby", "Red front door", "red front door", "icket fence"]) {
        expect(html).not.toContain(secret);
      }
    }
  }
});

// The comments someone liked are theirs to see: on their own page, marked as
// only theirs, and nowhere on the page anyone else sees.
test("the comments someone liked show only on their own page", async ({ browser }) => {
  test.setTimeout(90_000);
  const WORDS = "That red door sold me.";
  const odessa = await signUpBuyer(browser, "odessa@example.com", "Odessa Finch");
  await odessa.goto("/homes/SAMPLE-1009");
  const thread = await openComments(odessa, homeIn(odessa, QUILLAN));
  await thread.getByLabel("Add a comment").fill(WORDS);
  await thread.getByRole("button", { name: "Post", exact: true }).click();
  await expect(thread.getByText(WORDS)).toBeVisible();

  const kit = await signUpBuyer(browser, "kit@example.com", "Kit Lane");
  await kit.goto("/homes/SAMPLE-1009");
  const chat = await openComments(kit, homeIn(kit, QUILLAN));
  await chat.getByRole("button", { name: "Like Odessa's comment" }).click();
  // Saved, not just shown.
  await expect(async () => {
    await kit.goto("/homes/SAMPLE-1009");
    const kept = await openComments(kit, homeIn(kit, QUILLAN));
    await expect(kept.getByRole("button", { name: "Like Odessa's comment, 1 like" })).toHaveAttribute("aria-pressed", "true", {
      timeout: 1000,
    });
  }).toPass({ timeout: 20_000 });

  await kit.goto("/people/me");
  await kit.waitForURL(/\/people\/[0-9a-f-]{36}$/);
  const profileUrl = kit.url();
  await expect(kit.getByRole("link", { name: `${QUILLAN}: liked Odessa's comment` })).toBeVisible();
  const own = kit.locator("main");
  await expect(own).toContainText("You liked Odessa's comment");
  await expect(own).toContainText("Only you see this");
  await expect(own).toContainText(WORDS);

  for (const anon of [
    await (await browser.newContext()).newPage(),
    await (await browser.newContext({ javaScriptEnabled: false })).newPage(),
  ]) {
    await anon.goto(profileUrl);
    await expect(anon.getByRole("heading", { level: 1 })).toHaveText("Kit");
    await expect(anon.getByText("Kit hasn't liked anything yet.")).toBeVisible();
    await expect(anon.locator("main")).not.toContainText(/Only you see this|Odessa|red door sold me/);
    const html = await (await anon.request.get(profileUrl)).text();
    for (const secret of ["Only you see this", "Odessa", WORDS]) expect(html).not.toContain(secret);
  }
});

// The feed's grouping, filters and paging, without a server: days are Seattle
// days, and every page holds whole cards, none twice and none skipped.
const LISTINGS = new Map(
  (JSON.parse(readFileSync("supabase/seed/listings.json", "utf8")) as Listing[]).map((listing) => [
    listing.ListingKey,
    { ...listing, Media: [...listing.Media].sort((a, b) => a.Order - b.Order) },
  ]),
);
const empty = (): ProfileRows => ({
  reactions: [],
  likes: [],
  dislikes: [],
  comments: [],
  commentLikes: [],
  listings: LISTINGS,
  standing: new Map(),
  floor: null,
  later: new Set(),
});
const comment = (id: string, listing_key: string, at: string, more: Partial<ProfileRows["comments"][number]> = {}) => ({
  id,
  listing_key,
  body: `Comment ${id}`,
  at: new Date(at),
  media_key: null,
  spot: null,
  reply_to_id: null,
  reply_to_name: null,
  likes: 0,
  replies: 0,
  ...more,
});

test("cards group by home and Seattle day, under Today, Yesterday and dates", () => {
  // Noon in Seattle on Friday, November 6.
  const now = new Date("2026-11-06T20:00:00Z");
  const rows = empty();
  rows.reactions.push(
    { listing_key: "SAMPLE-1001", reaction: "like", liked: ["vibe"], disliked: [], at: new Date("2026-11-06T18:00:00Z") },
    { listing_key: "SAMPLE-1003", reaction: "dislike", liked: [], disliked: ["price"], at: new Date("2026-10-30T19:00:00Z") },
  );
  rows.standing.set("SAMPLE-1001", "like").set("SAMPLE-1003", "dislike");
  rows.likes.push(
    { listing_key: "SAMPLE-1001", media_key: "SAMPLE-1001-1", tag: "Front door", aspect: "exterior", at: new Date("2026-11-06T17:00:00Z") },
    { listing_key: "SAMPLE-1001", media_key: "facts", tag: "Price", aspect: "price", at: new Date("2026-11-06T17:30:00Z") },
    // 11:30 at night on the 5th in Seattle, though already the 6th in UTC.
    { listing_key: "SAMPLE-1001", media_key: "SAMPLE-1001-2", tag: "Built-in shelves", aspect: "aesthetic", at: new Date("2026-11-06T07:30:00Z") },
  );
  rows.dislikes.push(
    { listing_key: "SAMPLE-1001", media_key: "SAMPLE-1001-1", tag: "Dormer windows", at: new Date("2026-11-06T16:00:00Z") },
    { listing_key: "SAMPLE-1003", media_key: "SAMPLE-1003-2", tag: "Media wall", at: new Date("2026-10-28T19:00:00Z") },
  );
  rows.comments.push(
    comment("c1", "SAMPLE-1001", "2026-11-06T17:05:00Z", { media_key: "SAMPLE-1001-1", spot: "Front door", likes: 2, replies: 1 }),
    comment("c2", "SAMPLE-1008", "2026-11-03T19:00:00Z", { reply_to_id: "sam", reply_to_name: "Sam" }),
    // A spot tapped right by the red front door reads as the door.
    comment("c3", "SAMPLE-1009", "2026-09-14T19:00:00Z", { media_key: "SAMPLE-1009-1", spot: "@57.5,60.5" }),
  );

  const cards = buildCards(rows);
  expect(cards.map((card) => [card.home.key, card.day, dayHeading(card.day, now), card.sentence])).toEqual([
    // The price they liked is a chip, not more words.
    ["SAMPLE-1001", "2026-11-06", "Today", "liked the vibe and front door but not the dormer windows"],
    ["SAMPLE-1001", "2026-11-05", "Yesterday", "liked the built-in shelves"],
    ["SAMPLE-1008", "2026-11-03", "Earlier this week", "commented on this home"],
    ["SAMPLE-1003", "2026-10-30", "October 30", "passed, didn't like the price"],
    ["SAMPLE-1003", "2026-10-28", "October 28", "didn't like the media wall"],
    ["SAMPLE-1009", "2026-09-14", "September 2026", "commented on the red front door"],
  ]);
  const [today] = cards;
  expect(today.at).toBe("2026-11-06T18:00:00.000Z");
  expect(today.photo).toMatchObject({ index: 0, width: 1400, height: 1050 });
  // The door was liked and talked about: one pin, the newest (the comment); and the windows.
  expect(today.pins).toHaveLength(2);
  expect(today.pins[0]).toEqual({ x: 0.62, y: 0.68, kind: "comment" });
  expect(today.pins[1].kind).toBe("dislike");
  expect(today.facts).toEqual([{ kind: "like", phrase: "the price" }]);
  expect(today.comments).toMatchObject([
    { spot: { name: "the front door", fact: false }, likes: 2, replies: 1, replyTo: null },
  ]);
  // Yesterday's photo is the one with the shelves in it.
  expect(cards[1].photo?.index).toBe(1);
  expect(cards[2].comments[0].replyTo).toEqual({ name: "Sam", profileId: "sam" });

  const keys = (list: ProfileCard[]) => list.map((card) => `${card.home.key} ${card.day}`);
  // In step with the counts: likes of a liked home, passes of a passed one.
  expect(keys(filterCards(cards, "liked", null))).toEqual(["SAMPLE-1001 2026-11-06", "SAMPLE-1001 2026-11-05"]);
  expect(keys(filterCards(cards, "passed", null))).toEqual(["SAMPLE-1003 2026-10-30", "SAMPLE-1003 2026-10-28"]);
  expect(keys(filterCards(cards, "comments", null))).toHaveLength(3);
  expect(keys(filterCards(cards, "all", "Front door"))).toEqual(["SAMPLE-1001 2026-11-06"]);
  // The shelves and the media wall are both in living rooms: liked in one, not in the other.
  expect(keys(filterCards(cards, "all", "aesthetic"))).toEqual(["SAMPLE-1001 2026-11-05", "SAMPLE-1003 2026-10-28"]);
  expect(keys(filterCards(cards, "all", "aesthetic", "like"))).toEqual(["SAMPLE-1001 2026-11-05"]);
  expect(keys(filterCards(cards, "all", "aesthetic", "pass"))).toEqual(["SAMPLE-1003 2026-10-28"]);
  expect(keys(filterCards(cards, "all", "price", "like"))).toEqual(["SAMPLE-1001 2026-11-06"]);
  expect(keys(filterCards(cards, "all", "price", "pass"))).toEqual(["SAMPLE-1003 2026-10-30"]);

  // Beside each card, only what its heading doesn't already say.
  expect(cardTime("2026-11-06T18:00:00Z", now)).toBe("2h");
  expect(cardTime("2026-11-06T19:59:30Z", now)).toBe("just now");
  expect(cardTime("2026-11-06T05:22:00Z", now)).toBe("9:22 pm");
  expect(cardTime("2026-11-05T05:22:00Z", now)).toBe("Wed 9:22 pm");
  expect(cardTime("2026-10-28T19:00:00Z", now)).toBe("12:00 pm");
  expect(cardTime("2026-09-14T19:00:00Z", now)).toBe("Sep 14");
});

test("a card's sentence names a few things and counts the rest", () => {
  const rows = empty();
  const at = (minute: number) => new Date(Date.UTC(2026, 9, 20, 18, minute));
  const like = (media_key: string, tag: string, minute: number) => ({ listing_key: "SAMPLE-1001", media_key, tag, at: at(minute) });
  rows.reactions.push({ listing_key: "SAMPLE-1001", reaction: "like", liked: ["vibe", "location"], disliked: [], at: at(5) });
  rows.likes.push(
    like("SAMPLE-1001-1", "Covered porch", 1),
    like("SAMPLE-1001-2", "Built-in shelves", 2),
    like("SAMPLE-1001-3", "Marble counters", 3),
    like("SAMPLE-1001-3", "Hexagon backsplash", 4),
    like("SAMPLE-1001-4", "@3,97", 6),
    like("facts", "Address", 7),
  );
  rows.dislikes.push(like("SAMPLE-1001-4", "Pedestal sink", 8));
  const [card] = buildCards(rows);
  expect(card.sentence).toBe("liked the vibe, location, hexagon backsplash and 3 more but not the pedestal sink");

  // Spots with no name are counted when that's all there is; a fact alone is said.
  const spots = empty();
  spots.likes.push(like("SAMPLE-1001-4", "@3,97", 1), like("SAMPLE-1001-4", "@97,3", 2));
  expect(buildCards(spots)[0].sentence).toBe("liked 2 spots in the photos");
  // Each is its own to take back, told apart, newest first.
  expect(buildCards(spots)[0].controls).toEqual([
    { kind: "spots", sentiment: "like", name: "a spot in photo 4", spots: [{ mediaKey: "SAMPLE-1001-4", tag: "@97,3" }] },
    { kind: "spots", sentiment: "like", name: "a second spot in photo 4", spots: [{ mediaKey: "SAMPLE-1001-4", tag: "@3,97" }] },
  ]);
  const fact = empty();
  fact.likes.push(like("facts", "Price", 1));
  expect(buildCards(fact)[0].sentence).toBe("liked the price");

  // Not liking one thing in a home they haven't decided on: a full card, though neither liked nor passed.
  const doubt = empty();
  doubt.dislikes.push(like("SAMPLE-1001-4", "Pedestal sink", 1));
  expect(buildCards(doubt)[0]).toMatchObject({ sentence: "didn't like the pedestal sink", quiet: false, liked: false, passed: false });
  expect(buildCards(doubt)[0].photo?.index).toBe(3);
});

test("only real moments page the feed", () => {
  expect(parseBefore("+275760-09-13T00:00:00.000Z")).toBeNull();
  expect(parseBefore("+010000-01-01T00:00:00.000Z")).toBeNull();
  expect(parseBefore("1999-12-31T00:00:00Z")).toBeNull();
  expect(parseBefore("not a date")).toBeNull();
  expect(parseBefore("2026-11-05T05:22:00Z")).toBe("2026-11-05T05:22:00.000Z");
});

// What the database gives a page starting at `before`: each kind's newest
// rows before it, at most `limit` of them, and the homes they did more with
// later that same day (`loadRows`).
const KINDS = ["reactions", "likes", "dislikes", "comments", "commentLikes"] as const;
function read(all: ProfileRows, before: string | null, limit: number): ProfileRows {
  const until = before ? Date.parse(before) : Infinity;
  const newest = <T extends { at: Date }>(list: T[]) =>
    list
      .filter((row) => +row.at < until)
      .sort((a, b) => +b.at - +a.at)
      .slice(0, limit);
  const rows: ProfileRows = {
    ...all,
    reactions: newest(all.reactions),
    likes: newest(all.likes),
    dislikes: newest(all.dislikes),
    comments: newest(all.comments),
    commentLikes: newest(all.commentLikes),
  };
  const floors = KINDS.flatMap((kind) => (rows[kind].length >= limit ? [+rows[kind].at(-1)!.at] : []));
  const firsts = new Map<string, number>();
  // The same, leaving out passes and anything on a home they passed on.
  const kept = new Map<string, number>();
  for (const kind of KINDS) {
    for (const row of all[kind] as { listing_key: string; at: Date; reaction?: string }[]) {
      if (+row.at >= until && +row.at < until + 25 * 3_600_000) {
        firsts.set(row.listing_key, Math.min(firsts.get(row.listing_key) ?? Infinity, +row.at));
        const pass =
          kind === "dislikes" ||
          (kind === "reactions" && row.reaction === "dislike") ||
          (kind === "likes" && all.standing.get(row.listing_key) === "dislike");
        if (!pass) kept.set(row.listing_key, Math.min(kept.get(row.listing_key) ?? Infinity, +row.at));
      }
    }
  }
  const sameDay = (map: Map<string, number>) =>
    new Set([...map].filter(([, at]) => before && dayOf(new Date(at)) === dayOf(before)).map(([key]) => key));
  return {
    ...rows,
    floor: floors.length ? new Date(Math.max(...floors)) : null,
    later: sameDay(firsts),
    laterKept: sameDay(kept),
  };
}

// Pages through everything as the server does, checking every card shows
// once, in order, and whole, unless one kind held more than a read's worth on
// its day alone.
function pageThrough(
  all: ProfileRows,
  limit: number,
  filters: FeedFilters = { show: "all", about: null, side: null },
  view: (rows: ProfileRows) => ProfileRows = (rows) => rows,
) {
  const full = filterCards(buildCards(view(all)), filters.show, filters.about, filters.side);
  const crowded = new Set<string>();
  for (const kind of KINDS) {
    const perDay = new Map<string, number>();
    for (const row of all[kind] as { at: Date }[]) perDay.set(dayOf(row.at), (perDay.get(dayOf(row.at)) ?? 0) + 1);
    for (const [day, n] of perDay) if (n >= limit) crowded.add(day);
  }
  const seen: string[] = [];
  const sizes: number[] = [];
  let before: string | null = null;
  for (let page = 0; page < 1000; page++) {
    const result = feedPage(view(read(all, before, limit)), filters, before);
    for (const card of result.cards) {
      const whole = full.find((c) => c.id === card.id);
      expect(whole, `${card.id} is in the feed`).toBeDefined();
      if (!crowded.has(card.day)) expect(card).toEqual(whole);
    }
    seen.push(...result.cards.map((card) => card.id));
    sizes.push(result.cards.length);
    if (result.earlier) expect(before === null || result.earlier < before, "each page starts further back").toBe(true);
    before = result.earlier;
    if (!before) break;
  }
  expect(before, "paging ends").toBeNull();
  expect(seen).toEqual(full.map((card) => card.id));
  return sizes;
}

test("pages hold whole cards, none twice and none skipped", () => {
  const rows = empty();
  const keys = [...LISTINGS.keys()];
  const start = Date.parse("2026-11-06T20:00:00Z");
  // Seventy likes about four hours apart across the homes, so some days have several on one home.
  for (let i = 0; i < 70; i++) {
    const listing = LISTINGS.get(keys[(i * 5) % keys.length])!;
    const photo = listing.Media[i % listing.Media.length];
    rows.likes.push({
      listing_key: listing.ListingKey,
      media_key: photo.MediaKey!,
      tag: photo.ImageOf!,
      aspect: null,
      at: new Date(start - i * 4 * 3_600_000),
    });
  }
  const all = buildCards(rows);
  expect(all.length).toBeGreaterThan(40);
  const sizes = pageThrough(rows, PROFILE_ROW_LIMIT);
  expect(sizes[0]).toBe(20);
  // However few rows a read may take, nothing is skipped.
  pageThrough(rows, 12);
  pageThrough(rows, 3);

  // Two cards from the very same moment across a page break stay together.
  const tied = all.map((card, i) => (i === 20 ? { ...card, at: all[19].at } : card));
  const page = pageOf(tied);
  expect(page.cards).toHaveLength(21);
  expect(page.earlier).toBe(all[19].at);
});

test("every kind of thing pages through, whatever the filter", () => {
  const rows = empty();
  const keys = [...LISTINGS.keys()];
  const start = Date.parse("2026-11-06T20:00:00Z");
  for (let i = 0; i < 120; i++) {
    const listing = LISTINGS.get(keys[(i * 7) % keys.length])!;
    const photo = listing.Media[i % listing.Media.length];
    const at = new Date(start - i * 3 * 3_600_000 - (i % 5) * 60_000);
    const spot = { listing_key: listing.ListingKey, media_key: photo.MediaKey!, tag: photo.ImageOf!, at };
    if (i % 3 === 0) rows.likes.push({ ...spot, aspect: null });
    else if (i % 3 === 1) rows.dislikes.push(spot);
    else rows.comments.push(comment(`m${i}`, listing.ListingKey, at.toISOString(), i % 2 ? { media_key: photo.MediaKey!, spot: photo.ImageOf! } : {}));
  }
  for (const [i, key] of keys.slice(0, 8).entries()) {
    const reaction = i % 2 ? "dislike" : "like";
    rows.reactions.push({ listing_key: key, reaction, liked: [], disliked: [], at: new Date(start - i * 20 * 3_600_000) });
    rows.standing.set(key, reaction);
  }
  for (const show of ["all", "liked", "passed", "comments"] as const) {
    for (const limit of [PROFILE_ROW_LIMIT, 9, 4]) pageThrough(rows, limit, { show, about: null, side: null });
  }
  pageThrough(rows, 5, { show: "all", about: "kitchen", side: "pass" });
  // As someone else sees it when passes are private: still whole pages, and
  // nothing from a home they passed on.
  for (const limit of [PROFILE_ROW_LIMIT, 9, 4]) pageThrough(rows, limit, { show: "all", about: null, side: null }, withoutPasses);
  const seen = buildCards(withoutPasses(rows));
  expect(seen.length).toBeGreaterThan(10);
  expect(seen.some((card) => card.passed || rows.standing.get(card.home.key) === "dislike" && !card.commented)).toBe(false);
});

// One kind running past a read's worth in a day can't hide what came before it.
test("a day with more than a read's worth still lets earlier days through", () => {
  const rows = empty();
  const keys = [...LISTINGS.keys()];
  const now = Date.parse("2026-11-06T20:00:00Z");
  const hour = 3_600_000;
  const a = LISTINGS.get(keys[0])!;
  for (let i = 0; i < 520; i++) {
    rows.likes.push({
      listing_key: a.ListingKey,
      media_key: a.Media[0].MediaKey!,
      tag: `@${(i % 100) + 0.1},${Math.floor(i / 100) + 1}.5`,
      aspect: null,
      at: new Date(now - i * 60_000),
    });
  }
  const b = LISTINGS.get(keys[1])!;
  for (let i = 0; i < 10; i++) {
    rows.likes.push({ listing_key: b.ListingKey, media_key: b.Media[0].MediaKey!, tag: `@50,${i + 10}`, aspect: null, at: new Date(now - 48 * hour - i * 60_000) });
  }
  for (let d = 3; d < 33; d++) {
    const key = keys[2 + (d % 11)];
    rows.reactions.push({ listing_key: key, reaction: "like", liked: [], disliked: [], at: new Date(now - d * 24 * hour - d * 60_000) });
  }
  for (const r of rows.reactions) rows.standing.set(r.listing_key, "like");
  pageThrough(rows, PROFILE_ROW_LIMIT);
  expect(buildCards(rows).map((card) => card.id)).toContain(`${b.ListingKey}|2026-11-04`);
});

// Words that must never be in what a page says about someone's taste.
const NEVER_SAID =
  /\b(she|he|her|his|him|hers|family|kids?|children|pets?|dogs?|partner|husband|wife|job|safe|schools?|quiet|family-friendly|up-and-coming|exclusive|always|hates?)\b|!/i;

// The taste story with no API key, as e2e always runs: a headline from the
// data, the template in two voices, chips that never contradict each other,
// and switches that keep things off the page for everyone else.
test("the taste story is written from the data, and what someone switches off stays theirs", async ({ browser }) => {
  test.setTimeout(150_000);
  const WEXFORD = "3518 Wexford Ave N";
  const SALTMARSH = "719 Saltmarsh Ln";
  const LAKEVIEW = "5902 Lakeview Terrace SE";
  const nadia = await signUpBuyer(browser, "nadia@example.com", "Nadia Cole");
  const pageErrors: string[] = [];
  nadia.on("pageerror", (error) => pageErrors.push(error.message));

  // Two homes liked for the vibe and the layout; two passed on for the
  // layout and the price. The layout is a tie, so it's on neither side.
  for (const [key, address] of [
    ["SAMPLE-1007", WEXFORD],
    ["SAMPLE-1008", SALTMARSH],
  ]) {
    await nadia.goto(`/homes/${key}`);
    const home = homeIn(nadia, address);
    await heartOf(home).click();
    await expect(heartOf(home)).toHaveAttribute("aria-pressed", "true");
    const more = await openMore(nadia, home);
    const also = more.getByRole("group", { name: "What else do you like?" });
    for (const aspect of ["Vibe", "Layout"]) {
      await also.getByRole("button", { name: aspect }).click();
      await expect(also.getByRole("button", { name: aspect })).toHaveAttribute("aria-pressed", "true");
    }
    await nadia.keyboard.press("Escape");
  }
  for (const [key, address] of [
    ["SAMPLE-1009", QUILLAN],
    ["SAMPLE-1013", LAKEVIEW],
  ]) {
    await nadia.goto(`/homes/${key}`);
    const home = homeIn(nadia, address);
    const more = await openMore(nadia, home);
    await more.getByRole("button", { name: "Not for me" }).click();
    const why = more.getByRole("group", { name: "What made you pass?" });
    for (const aspect of ["Layout", "Price"]) {
      await why.getByRole("button", { name: aspect }).click();
      await expect(why.getByRole("button", { name: aspect })).toHaveAttribute("aria-pressed", "true");
    }
    await nadia.keyboard.press("Escape");
  }

  // Saved, not just shown.
  const main = nadia.locator("main");
  await expect(async () => {
    await nadia.goto("/people/me");
    await expect(main).toContainText("2 liked · 2 passed", { timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  const profileUrl = nadia.url();
  const own = nadia.getByRole("region", { name: "Your taste" });
  // The headline is what they love, then where, how much and how big: the
  // two homes they liked are in Edmonds and Seattle, $689K and $749K, 2 beds.
  const headline = "Vibe · Edmonds · $689K–$749K · 2 beds";
  await expect(own.getByText(headline, { exact: true })).toBeVisible();
  await expect(own).toContainText("You tend to like the vibe, and usually pass on the price.");
  await expect(own).toContainText("From your 2 likes and 2 passes · updated today");
  await expect(own).not.toContainText("Written by AI");
  await expect(own.getByRole("group", { name: "Loves" }).getByRole("link")).toHaveText(["Vibe 2"]);
  await expect(own.getByRole("group", { name: "Passes on" }).getByRole("link")).toHaveText(["Price 2"]);
  // Liked twice and passed on twice: neither a love nor a pass.
  await expect(own.getByRole("link", { name: /Layout/ })).toHaveCount(0);
  expect(await own.innerText()).not.toMatch(NEVER_SAID);

  // Anyone else reads the same, in Nadia's name, and the headline describes the page.
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(profileUrl);
  const theirs = visitor.getByRole("region", { name: "Nadia's taste" });
  await expect(theirs).toContainText("Nadia tends to like the vibe, and usually passes on the price.");
  await expect(theirs).toContainText("From Nadia's 2 likes and 2 passes · updated today");
  await expect(visitor.locator('meta[name="description"]')).toHaveAttribute("content", headline);
  await expect(visitor.locator('meta[property="og:description"]')).toHaveAttribute("content", headline);
  await expect(visitor.getByRole("button", { name: "Not quite right?" })).toHaveCount(0);
  expect(await theirs.innerText()).not.toMatch(NEVER_SAID);

  // One love switched off: off their page and out of the words for everyone
  // else, kept (and marked) for Nadia, and remembered.
  await nadia.getByRole("button", { name: "Not quite right?" }).click();
  const sheet = nadia.getByRole("dialog", { name: "What others see" });
  const vibe = sheet.getByRole("switch", { name: "Show Vibe in my taste" });
  await expect(vibe).toHaveAccessibleDescription("2 homes");
  await vibe.click();
  await expect(vibe).toHaveAttribute("aria-checked", "false");
  await expect(own.getByRole("link", { name: "Loves Vibe, 2 homes, only you see this" })).toBeVisible();
  await expect(own).toContainText("You usually pass on the price.");
  await nadia.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await nadia.reload();
  await nadia.getByRole("button", { name: "Not quite right?" }).click();
  await expect(sheet.getByRole("switch", { name: "Show Vibe in my taste" })).toHaveAttribute("aria-checked", "false");
  await nadia.keyboard.press("Escape");

  await visitor.reload();
  await expect(theirs.getByText("Edmonds · $689K–$749K · 2 beds", { exact: true })).toBeVisible();
  await expect(theirs).toContainText("Nadia usually passes on the price.");
  await expect(theirs).toContainText("From Nadia's 2 likes and 2 passes · updated today");
  await expect(theirs.getByRole("group", { name: "Loves" })).toHaveCount(0);
  await expect(theirs).not.toContainText(/vibe/i);

  // Passes kept private: gone for everyone else, still there for Nadia, and
  // its chip goes off with it, saying why.
  await nadia.getByRole("button", { name: "Not quite right?" }).click();
  const passSwitch = sheet.getByRole("switch", { name: "Show my passes on my page" });
  await expect(passSwitch).toHaveAttribute("aria-checked", "true");
  await expect(passSwitch).toHaveAccessibleDescription(/Each home's own page still shows that you passed/);
  await passSwitch.click();
  await expect(passSwitch).toHaveAttribute("aria-checked", "false");
  const price = sheet.getByRole("switch", { name: "Show Price in my taste" });
  await expect(price).toBeDisabled();
  await expect(price).toHaveAttribute("aria-checked", "false");
  await expect(price).toHaveAccessibleDescription("2 homes · Hidden with your passes");
  // That leaves two homes anyone else can see: too few to say anything
  // about, so Nadia is told how to get a description back.
  await expect(own).toContainText("Only you see what you pass on");
  await expect(own).toContainText("Like a few more homes and a short description of your taste will appear here.");
  await expect(own).not.toContainText("pass on the price");
  await nadia.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(own.getByRole("group", { name: "Passes on" }).getByRole("link")).toHaveText(["Price 2"]);
  await expect(nadia.getByRole("link", { name: "Passed", exact: true })).toBeVisible();

  // Everyone else: nothing hints at the passes, not even a headline from the
  // homes they can't see; and with the vibe off there's nothing else to show.
  await visitor.reload();
  await expect(theirs).toHaveCount(0);
  await expect(visitor.getByRole("link", { name: "Passed", exact: true })).toHaveCount(0);
  await expect(visitor.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "What Nadia likes in homes, on BuyBox Social.",
  );
  const counts = visitor.locator("main section").first();
  await expect(counts).toContainText("2 liked · 0 comments");
  await expect(counts).not.toContainText("passed");
  await expect(cardLinks(visitor)).toHaveCount(2);
  await visitor.goto(`${profileUrl}?show=passed`);
  await expect(visitor.getByText("Nadia keeps passes private.")).toBeVisible();
  await expect(cardLinks(visitor)).toHaveCount(0);
  for (const path of [profileUrl, `${profileUrl}?show=passed`, `${profileUrl}?about=price&side=pass`]) {
    const html = await (await visitor.request.get(path)).text();
    for (const secret of [QUILLAN, LAKEVIEW, "passes on the price", "Passes on", "didn't like", headline]) {
      expect(html, `${path} hides ${secret}`).not.toContain(secret);
    }
  }

  // The vibe back on: below the threshold, others see just the chips.
  await nadia.getByRole("button", { name: "Not quite right?" }).click();
  await sheet.getByRole("switch", { name: "Show Vibe in my taste" }).click();
  await expect(sheet.getByRole("switch", { name: "Show Vibe in my taste" })).toHaveAttribute("aria-checked", "true");
  await expect(own.getByRole("link", { name: "Loves Vibe, 2 homes" })).toBeVisible();
  await nadia.keyboard.press("Escape");
  await visitor.goto(profileUrl);
  await expect(theirs.getByRole("group", { name: "Loves" }).getByRole("link")).toHaveText(["Vibe 2"]);
  await expect(theirs.getByRole("group", { name: "Passes on" })).toHaveCount(0);
  await expect(theirs).not.toContainText(/tends to like|usually|From Nadia|Like a few more/);
  expect(pageErrors).toEqual([]);
});

// Set while Heron has something on it from the test below.
let madeOnHeron = false;

// Stopped halfway: Quinn's answer goes first (it keeps Pia's comment), then
// all of Pia's, so no later spec sees them.
test.afterEach(async ({ browser }) => {
  if (!madeOnHeron) return;
  await takeBackAll(await signUpBuyer(browser, "quinn@example.com", "Quinn Ash"), HERON);
  await takeBackAll(await signUpBuyer(browser, "pia.own@example.com", "Pia Moreno"), HERON);
  madeOnHeron = false;
});

// Your own page lets you take back what you did there: your like, what you
// liked in a photo, a comment (unless someone else has answered it). Only
// yours, and only there: nobody else gets the menu, and the server refuses a
// comment that isn't yours, however it's asked. Everything made here is gone
// again by the end, even if it stops halfway.
test("on your own page you can take back a like or a comment, and nobody else can", async ({ browser }) => {
  test.setTimeout(180_000);
  const FIRST = "Wildflowers right up to the door.";
  const SECOND = "Is the meadow part of the lot?";
  const ANSWER = "It is, all the way to the fence.";
  // Her own email: nobody another spec signs up.
  const pia = await signUpBuyer(browser, "pia.own@example.com", "Pia Moreno");
  const pageErrors: string[] = [];
  pia.on("pageerror", (error) => pageErrors.push(error.message));

  await pia.goto("/homes/SAMPLE-1010");
  const heron = homeIn(pia, HERON);
  madeOnHeron = true;
  await heartOf(heron).click();
  await expect(heartOf(heron)).toHaveAttribute("aria-pressed", "true");
  const siding = await likeInPhoto(heron, "the red siding");
  await siding.getByRole("button", { name: "Close" }).click();
  const thread = await openComments(pia, heron);
  for (const words of [FIRST, SECOND]) {
    // Once the last one has gone and the box is empty again.
    await expect(thread.getByLabel("Add a comment")).toHaveValue("");
    await thread.getByLabel("Add a comment").fill(words);
    await thread.getByRole("button", { name: "Post", exact: true }).click();
    await expect(thread.getByText(words)).toBeVisible();
  }

  // Saved, not just shown.
  const card = (sentence: string) => pia.getByRole("link", { name: `${HERON}: ${sentence}`, exact: true });
  await expect(async () => {
    await pia.goto("/people/me");
    await expect(card("liked the red siding")).toBeVisible({ timeout: 1000 });
    await expect(pia.locator("main")).toContainText(SECOND, { timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  const profileUrl = pia.url();

  // "Share my page": the phone's share sheet where there is one; else the
  // link is copied, and a toast says so.
  await pia.evaluate(() => {
    const w = window as unknown as { shared: unknown[]; copied: string[] };
    w.shared = [];
    w.copied = [];
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text: string) => void w.copied.push(text) },
    });
  });
  await pia.getByRole("button", { name: "Share my page" }).click();
  await expect(pia.getByRole("status").filter({ hasText: "Link copied" })).toBeVisible();
  expect(await pia.evaluate(() => (window as unknown as { copied: string[] }).copied)).toEqual([profileUrl]);
  await pia.evaluate(() => {
    const w = window as unknown as { shared: unknown[] };
    Object.defineProperty(navigator, "share", { configurable: true, value: async (data: unknown) => void w.shared.push(data) });
  });
  await pia.getByRole("button", { name: "Share my page" }).click();
  await expect
    .poll(() => pia.evaluate(() => (window as unknown as { shared: unknown[] }).shared))
    .toEqual([{ title: "Pia on BuyBox Social", url: profileUrl }]);

  // Everything on the card she can take back, by name.
  const options = pia.getByRole("button", { name: `Options for ${HERON}` });
  const sheet = pia.getByRole("dialog", { name: `Options for ${HERON}` });
  const row = (name: string) => sheet.getByRole("button", { name, exact: true });
  const deleteOf = (words: string) => row("Delete my comment").filter({ hasText: words });
  await options.click();
  await expect(sheet.getByRole("list").getByRole("button")).toHaveCount(4);
  for (const name of ["Remove my like", "Remove my like of the red siding"]) await expect(row(name)).toBeVisible();
  await expect(deleteOf(FIRST)).toHaveAccessibleDescription(`“${FIRST}”`);
  await expect(deleteOf(SECOND)).toBeVisible();

  // What deleting a comment sends names the comment; this once, it's kept
  // back from the server, to send again below as someone it isn't theirs to delete.
  const isAction = (route: Route) => route.request().method() === "POST" && Boolean(route.request().headers()["next-action"]);
  let first = "";
  await pia.route("**/people/**", (route) => {
    if (!isAction(route)) return route.continue();
    first = route.request().postData() ?? "";
    return route.abort();
  });
  await deleteOf(FIRST).click();
  await expect(sheet.getByRole("heading", { name: "Delete your comment?" })).toBeVisible();
  // Asked first, with focus on Cancel: a second Enter doesn't delete it for good.
  await expect(sheet.getByRole("button", { name: "Cancel" })).toBeFocused();
  await expect(sheet.getByRole("button", { name: "Delete comment" })).toHaveAccessibleDescription(
    new RegExp(`${FIRST}.*You can't undo this`),
  );
  await sheet.getByRole("button", { name: "Delete comment" }).click();
  await expect(sheet.getByRole("alert")).toHaveText("Couldn't do that. Try again.");
  expect(first).toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  await pia.unroute("**/people/**");
  await pia.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  // Someone answers the first.
  const quinn = await signUpBuyer(browser, "quinn@example.com", "Quinn Ash");
  await quinn.goto("/homes/SAMPLE-1010");
  const chat = await openComments(quinn, homeIn(quinn, HERON));
  await commentIn(chat, "Pia", FIRST).getByRole("button", { name: "Reply to Pia", exact: true }).click();
  await chat.getByLabel("Reply to Pia").fill(ANSWER);
  await chat.getByRole("button", { name: "Post", exact: true }).first().click();
  await expect(chat.getByRole("list", { name: "Replies to Pia" }).getByText(ANSWER)).toBeVisible();

  // Now it can't go from her page, and the server says the same when asked directly.
  await pia.reload();
  await options.click();
  await expect(deleteOf(FIRST)).toHaveAttribute("aria-disabled", "true");
  await expect(deleteOf(FIRST)).toHaveAccessibleDescription(/Comments with replies can't be deleted here/);
  await expect(deleteOf(SECOND)).not.toHaveAttribute("aria-disabled");
  await pia.route("**/people/**", (route) => (isAction(route) ? route.continue({ postData: first }) : route.continue()));
  await deleteOf(SECOND).click();
  await sheet.getByRole("button", { name: "Delete comment" }).click();
  await expect(sheet.getByRole("alert")).toHaveText("Comments with replies can't be deleted here.");
  await pia.unroute("**/people/**");
  await pia.keyboard.press("Escape");

  // Quinn, sending her comment as his own to delete, is refused.
  await quinn.goto("/people/me");
  await quinn.waitForURL(/\/people\/[0-9a-f-]{36}$/);
  await quinn.route("**/people/**", (route) => (isAction(route) ? route.continue({ postData: first }) : route.continue()));
  await quinn.getByRole("button", { name: `Options for ${HERON}` }).click();
  const quinnSheet = quinn.getByRole("dialog", { name: `Options for ${HERON}` });
  await quinnSheet.getByRole("button", { name: "Delete my comment", exact: true }).click();
  await quinnSheet.getByRole("button", { name: "Delete comment" }).click();
  await expect(quinnSheet.getByRole("alert")).toHaveText("That comment isn't there anymore.");
  await quinn.unroute("**/people/**");

  // Anyone else: both comments still there, and no menu, not even in the HTML.
  for (const anon of [
    await (await browser.newContext()).newPage(),
    await (await browser.newContext({ javaScriptEnabled: false })).newPage(),
  ]) {
    await anon.goto(profileUrl);
    await expect(anon.getByRole("heading", { level: 1 })).toHaveText("Pia");
    await expect(anon.locator("main")).toContainText(FIRST);
    await expect(anon.locator("main")).toContainText(SECOND);
    await expect(anon.getByRole("button", { name: /^Options for/ })).toHaveCount(0);
    const html = await (await anon.request.get(profileUrl)).text();
    for (const secret of ["Options for", "Remove my like", "Delete my comment"]) expect(html).not.toContain(secret);
  }

  // Her own page without scripts: nothing there that can't work without them.
  const still = await (
    await browser.newContext({ javaScriptEnabled: false, storageState: await pia.context().storageState() })
  ).newPage();
  await still.goto(profileUrl);
  await expect(still.getByRole("heading", { level: 1 })).toHaveText("Pia (you)");
  for (const name of ["Share my page", `Options for ${HERON}`]) {
    const button = still.getByRole("button", { name, includeHidden: true });
    await expect(button).toHaveCount(1);
    await expect(button).toBeHidden();
  }
  await still.context().close();

  // Quinn takes his answer back for real.
  await quinnSheet.getByRole("button", { name: "Delete comment" }).click();
  await expect(quinn.getByRole("status").filter({ hasText: "Comment deleted" })).toBeVisible();
  await expect(quinn.getByText("Your page fills up as you go")).toBeVisible();

  // Pia takes back one thing at a time; the card keeps up, and focus stays on its menu.
  // While one is on its way it says so, and the rest wait.
  await pia.reload();
  await options.click();
  let release = () => {};
  const held = new Promise<void>((done) => (release = done));
  await pia.route("**/people/**", async (route) => {
    if (!isAction(route)) return route.continue();
    await held;
    return route.continue();
  });
  await row("Remove my like of the red siding").click();
  await expect(row("Removing…")).toBeVisible();
  await expect(row("Remove my like")).toHaveAttribute("aria-disabled", "true");
  release();
  await expect(pia.getByRole("status").filter({ hasText: "Like removed" })).toBeVisible();
  await pia.unroute("**/people/**");
  await expect(sheet).toBeHidden();
  await expect(card("liked this")).toBeVisible();
  await expect(options).toBeFocused();
  await options.click();
  await row("Remove my like").click();
  await expect(card("commented on this home")).toBeVisible();
  await expect(pia.locator("main")).toContainText("0 liked · 0 passed · 2 comments");
  for (const words of [FIRST, SECOND]) {
    await options.click();
    await expect(deleteOf(words)).not.toHaveAttribute("aria-disabled");
    await deleteOf(words).click();
    await sheet.getByRole("button", { name: "Delete comment" }).click();
    await expect(pia.locator("main")).not.toContainText(words);
  }
  await expect(pia.getByRole("status").filter({ hasText: "Comment deleted" })).toBeVisible();
  // With the last of it gone, the card goes, and focus moves on rather than off the page.
  await expect(pia.getByText("Your page fills up as you go")).toBeVisible();
  await expect(pia.getByRole("link", { name: "See homes" })).toBeFocused();
  expect(pageErrors).toEqual([]);

  // And off the home, for everyone.
  await pia.goto("/homes/SAMPLE-1010");
  const after = await openComments(pia, homeIn(pia, HERON));
  for (const words of [FIRST, SECOND, ANSWER]) await expect(after.getByText(words)).toHaveCount(0);
  madeOnHeron = false;
});

// A small taste, without a server: enough rows to check the rules exactly.
function tasteRows() {
  const rows = empty();
  const at = new Date("2026-11-01T18:00:00Z");
  const react = (listing_key: string, reaction: "like" | "dislike", liked: Aspect[], disliked: Aspect[] = []) => {
    rows.reactions.push({ listing_key, reaction, liked, disliked, at });
    rows.standing.set(listing_key, reaction);
  };
  react("SAMPLE-1001", "like", ["kitchen", "light", "yard"]);
  react("SAMPLE-1003", "like", ["kitchen", "light", "yard"]);
  react("SAMPLE-1007", "like", ["light"], ["yard"]);
  react("SAMPLE-1009", "dislike", [], ["price", "yard"]);
  react("SAMPLE-1010", "dislike", [], ["price"]);
  // Two homes where they liked the address: still never a "love".
  for (const key of ["SAMPLE-1001", "SAMPLE-1003"]) {
    rows.likes.push({ listing_key: key, media_key: "facts", tag: "Address", aspect: "location", at });
  }
  return rows;
}
type Aspect = "kitchen" | "light" | "yard" | "price" | "location";
const NOW = Date.parse("2026-11-06T20:00:00Z");

test("chips never contradict, facts are never loves, and the template speaks in two voices", () => {
  const story = storyOf(tasteRows(), { hidden: [], hidePasses: false }, NOW);
  expect(story.enough).toBe(true);
  // Natural light on three homes, the kitchen on two; the yard is liked on
  // two and passed on two, so it's on neither side. The address never is.
  expect(story.loves.map((chip) => [chip.label, chip.homes])).toEqual([
    ["Natural light", 3],
    ["Kitchen", 2],
  ]);
  expect(story.passes.map((chip) => [chip.label, chip.homes])).toEqual([["Price", 2]]);
  const loved = new Set(story.loves.map((chip) => chip.key));
  expect(story.passes.some((chip) => loved.has(chip.key))).toBe(false);
  expect(story.loves.some((chip) => ["location", "price", "Address"].includes(chip.key))).toBe(false);
  expect(story.headline).toBe("Natural light · Seattle · $725K–$985K · 2–4 beds");
  expect(story.template).toEqual({
    named: "{name} tends to like the natural light and kitchen, and usually passes on the price.",
    you: "You tend to like the natural light and kitchen, and usually pass on the price.",
  });
  expect(voiceOf(story.template!, "Maya", false)).toBe(
    "Maya tends to like the natural light and kitchen, and usually passes on the price.",
  );
  for (const text of [story.template!.named, story.template!.you]) expect(text).not.toMatch(NEVER_SAID);

  // The same taste always hashes the same; a new like changes it.
  expect(storyOf(tasteRows(), { hidden: [], hidePasses: false }, NOW).hash).toBe(story.hash);
  const more = tasteRows();
  more.likes.push({ listing_key: "SAMPLE-1010", media_key: "SAMPLE-1010-1", tag: "Bay window", aspect: "light", at: new Date(NOW) });
  expect(storyOf(more, { hidden: [], hidePasses: false }, NOW).hash).not.toBe(story.hash);
  // The model never reads an address, the listing's own words, or anyone's name.
  const input = JSON.stringify(story.input);
  expect(input).not.toMatch(/Larkmoor|Corbel|PublicRemarks|Address/);

  // Switched off: marked for them, left out of the words and the input.
  const quiet = storyOf(tasteRows(), { hidden: ["kitchen"], hidePasses: true }, NOW);
  expect(quiet.loves.find((chip) => chip.key === "kitchen")?.hidden).toBe(true);
  expect(quiet.template).toEqual({
    named: "{name} tends to like the natural light.",
    you: "You tend to like the natural light.",
  });
  expect(quiet.withheld).toContain("kitchen");
  expect(quiet.input.loves.map((t) => t.term)).toEqual(["Natural light"]);
  expect(quiet.input.passes).toEqual([]);
  expect(quiet.input.homes.some((home) => home.verdict === "pass" || home.disliked.length > 0)).toBe(false);
  expect(JSON.stringify(quiet.input)).not.toMatch(/kitchen/i);
  // With passes private, nothing on a home they passed on shows, likes included,
  // and a love counts only the homes anyone can see.
  const passedLike = tasteRows();
  passedLike.likes.push({ listing_key: "SAMPLE-1009", media_key: "SAMPLE-1009-1", tag: "Red front door", aspect: "exterior", at: new Date(NOW) });
  passedLike.likes.push({ listing_key: "SAMPLE-1010", media_key: "SAMPLE-1010-1", tag: "Bay window", aspect: "light", at: new Date(NOW) });
  expect(withoutPasses(passedLike).likes.map((row) => row.listing_key)).toEqual(["SAMPLE-1001", "SAMPLE-1003"]);
  const counted = (hidePasses: boolean) =>
    storyOf(passedLike, { hidden: [], hidePasses }, NOW).loves.find((chip) => chip.key === "light")?.homes;
  expect([counted(false), counted(true)]).toEqual([4, 3]);
  // On their own page the chips count everything (as their feed does), so
  // keeping passes private never recounts or reorders them.
  const own = (hidePasses: boolean) =>
    storyOf(passedLike, { hidden: [], hidePasses }, NOW).own.loves.map((chip) => `${chip.label} ${chip.homes}`);
  expect(own(true)).toEqual(own(false));
  expect(own(true)).toContain("Natural light 4");

  // Whether there's enough to say is decided by what others see: one liked
  // home and two passes kept private is one home, so no headline and no words.
  const oneLike = empty();
  for (const [key, reaction] of [
    ["SAMPLE-1001", "like"],
    ["SAMPLE-1009", "dislike"],
    ["SAMPLE-1010", "dislike"],
  ] as const) {
    oneLike.reactions.push({ listing_key: key, reaction, liked: [], disliked: [], at: new Date(NOW) });
    oneLike.standing.set(key, reaction);
  }
  expect(storyOf(oneLike, { hidden: [], hidePasses: false }, NOW)).toMatchObject({ enough: true, hasPasses: true });
  expect(storyOf(oneLike, { hidden: [], hidePasses: true }, NOW)).toMatchObject({
    enough: false,
    headline: null,
    template: null,
  });

  // A named thing they love leads the headline over an aspect.
  const thing = tasteRows();
  for (const media of ["SAMPLE-1001-2", "SAMPLE-1004-2"]) {
    const key = media.slice(0, 11);
    thing.likes.push({ listing_key: key, media_key: media, tag: "Hardwood floors", aspect: null, at: new Date(NOW) });
  }
  const floors = storyOf(thing, { hidden: [], hidePasses: false }, NOW);
  expect(floors.loves.map((chip) => chip.label)).toContain("Hardwood floors");
  expect(floors.headline).toMatch(/^Hardwood floors · /);

  // Below the threshold: no sentences, and chips from a single home.
  const few = empty();
  few.reactions.push({ listing_key: "SAMPLE-1012", reaction: "like", liked: [], disliked: [], at: new Date(NOW) });
  few.likes.push({ listing_key: "SAMPLE-1012", media_key: "SAMPLE-1012-1", tag: "Three-car garage", aspect: "exterior", at: new Date(NOW) });
  few.standing.set("SAMPLE-1012", "like");
  const small = storyOf(few, { hidden: [], hidePasses: false }, NOW);
  expect(small).toMatchObject({ enough: false, headline: null, template: null });
  expect(small.loves.map((chip) => `${chip.label} ${chip.homes}`)).toContain("Three-car garage 1");

  // Long names make it shorter, never longer than a few lines.
  const long = templateOf(["A".repeat(60), "B".repeat(60), "C".repeat(60)], ["D".repeat(60), "E".repeat(60)]);
  expect(long!.named.length).toBeLessThanOrEqual(240);
  expect(updatedLabel("2026-11-06T18:00:00Z", NOW)).toBe("today");
  expect(updatedLabel("2026-11-04T18:00:00Z", NOW)).toBe("2d");
  expect(updatedLabel("2026-10-28T18:00:00Z", NOW)).toBe("Oct 28");
});

test("words the model writes go on a page only if they hold up", () => {
  const story = storyOf(tasteRows(), { hidden: [], hidePasses: false }, NOW);
  const good = {
    named: "{name} tends to like natural light and a good kitchen, and usually passes on the price.",
    you: "You tend to like natural light and a good kitchen, and usually pass on the price.",
    loves: ["Natural light", "Kitchen"],
    passes: ["Price"],
  };
  expect(checkStory(good, story)).toMatchObject({ ok: true });
  const fails = (change: Partial<typeof good>) => checkStory({ ...good, ...change }, story).ok;
  // Why some words about the natural light and the price fail ("ok" when
  // they don't), said to them the same way unless given.
  const toYou = (named: string) =>
    named
      .replace(/(^|\. )\{name\} (tends|usually|often)/g, (_, start, word) => `${start}You ${word === "tends" ? "tend" : word}`)
      .replace(/passes on/g, "pass on");
  const why = (named: string, you = toYou(named), loves = ["Natural light"], passes = ["Price"]) => {
    const result = checkStory({ named, you, loves, passes }, story);
    return result.ok ? "ok" : result.reason;
  };
  const says = (named: string, you?: string) => why(named, you) === "ok";
  expect(why("{name} tends to like natural light, and usually passes on the price.")).toBe("ok");
  expect(why("{name} tends to like homes with lots of natural light, and usually passes on the price.")).toBe("ok");
  // Two sentences, each about them.
  expect(why("{name} tends to like natural light. {name} usually passes on the price.")).toBe("ok");
  // Someone else's name, wherever it is and whatever its case: their own
  // comments can name other people, and the model reads those.
  expect(why("{name} tends to like natural light and usually passes on the price. Jordan often likes natural light.")).toBe(
    "named: word",
  );
  expect(why("{name} tends to like natural light, like jordan, and usually passes on the price.")).toBe("named: word");
  expect(why("{name} tends to like natural light, and usually passes on the price. Bo often likes natural light.")).toBe(
    "named: word",
  );
  expect(why("{name} tends to like natural light, like Sam, and usually passes on the price.")).toBe("named: name");
  expect(says("{name} tends to like natural light, and usually passes on the price. Often in Seattle.")).toBe(true);
  // A thing that isn't theirs, in the words even when the list leaves it out.
  expect(why("{name} tends to like the wine cellar and natural light, and usually passes on the price.")).toBe("named: word");
  // What the lists say it's about has to be what the words are about.
  expect(fails({ loves: ["Natural light", "Kitchen"], named: "{name} tends to like natural light, and usually passes on the price." })).toBe(false);
  // No pronoun, not even "they"; the placeholder only as the named subject.
  expect(why("{name} tends to like natural light, and she usually passes on the price.")).toBe("named: pronoun");
  expect(why("{name} tends to like natural light, and they usually pass on the price.")).toBe("named: pronoun");
  expect(why("{name} tends to like natural light, as you do, and usually passes on the price.")).toBe("named: pronoun");
  const plain = "{name} tends to like natural light, and usually passes on the price.";
  expect(why(plain, "You tend to like natural light, as {name} does, and usually pass on the price.")).toBe("you: placeholder");
  // A guess about their life or a neighbourhood, an absolute.
  expect(why(plain, "You tend to like natural light and room for the kids, and usually pass on the price.")).toBe("you: denylist");
  expect(why("{name} tends to like quiet streets and natural light, and usually passes on the price.")).toBe("named: denylist");
  expect(why("{name} tends to like natural light near good schools, and usually passes on the price.")).toBe("named: denylist");
  expect(why("{name} always picks natural light, and usually passes on the price.")).toBe("named: denylist");
  // A number or a price.
  expect(why("{name} tends to like natural light in homes around $900,000, and usually passes on the price.")).toBe(
    "named: number",
  );
  expect(why("{name} tends to like natural light and 3 bedrooms, and usually passes on the price.")).toBe("named: number");
  expect(why("{name} tends to like natural light and three bedrooms, and usually passes on the price.")).toBe("named: word");
  // The wrong voice, shouting, too many sentences, no hedge.
  expect(why("Maya tends to like natural light, and usually passes on the price.")).toBe("named: subject");
  expect(why(plain, plain)).toBe("you: subject");
  expect(why("{name} tends to like natural light, and usually passes on the price!")).toBe("named: sentences");
  expect(why("{name} tends to like natural light. Really. Really.", "You tend to like natural light. Really. Really.", ["Natural light"], [])).toBe(
    "named: sentences",
  );
  expect(why("{name} loves natural light.", "You love natural light.", ["Natural light"], [])).toBe("named: hedge");
  // A thing that isn't in their taste, is on just one home, or is on the other side.
  expect(fails({ loves: ["Wine cellar"] })).toBe(false);
  expect(fails({ loves: ["Yard"] })).toBe(false);
  expect(fails({ loves: ["Bay window"] })).toBe(false);
  expect(fails({ passes: ["Natural light"] })).toBe(false);
  expect(checkStory({ named: "{name} tends to like light." }, story).ok).toBe(false);
  // Cities and decades of homes they like are fair to name.
  const city = (place: string) => why(`{name} tends to like natural light, often in ${place}, and usually passes on the price.`);
  expect(city("Seattle")).toBe("ok");
  expect(city("Tacoma")).toBe("ok");
  expect(city("Spokane")).toBe("named: name");

  // Nothing they've switched off, and nothing about passes once those are private.
  const quiet = storyOf(tasteRows(), { hidden: ["kitchen"], hidePasses: true }, NOW);
  expect(checkStory(good, quiet).ok).toBe(false);
  expect(
    checkStory(
      {
        named: "{name} tends to like natural light.",
        you: "You tend to like natural light.",
        loves: ["Natural light"],
        passes: [],
      },
      quiet,
    ).ok,
  ).toBe(true);
  expect(
    checkStory(
      {
        named: "{name} tends to like natural light but not the price.",
        you: "You tend to like natural light but not the price.",
        loves: ["Natural light"],
        passes: [],
      },
      quiet,
    ).ok,
  ).toBe(false);

  // What shows: the model's words while they hold, else the template; and
  // it's asked again only when what it's written from has changed.
  const row = (summary: StoredStory["summary"], source: StoredStory["source"], hash = story.hash): StoredStory => ({
    input_hash: hash,
    summary,
    source,
    model: "claude-opus-5-5",
    created_at: new Date("2026-11-04T18:00:00Z"),
  });
  const shown = (stored: StoredStory | null, writing = true, s: TasteStory = story) => shownStory(stored, s, writing);
  expect(shown(null, false)).toMatchObject({ ai: false, refresh: false, text: story.template });
  expect(shown(null)).toMatchObject({ ai: false, refresh: true });
  expect(shown(row(good, "ai"))).toMatchObject({ ai: true, refresh: false, at: "2026-11-04T18:00:00.000Z" });
  expect(shown(row(good, "ai", "older"))).toMatchObject({ ai: true, refresh: true });
  expect(shown(row({ ...good, named: "{name} tends to like natural light, like her mother." }, "ai"))).toMatchObject({
    ai: false,
  });
  expect(shown(row({ ...story.template!, tried: true }, "template"))).toMatchObject({ ai: false, refresh: false });
  expect(shown(row({ ...story.template! }, "template"))).toMatchObject({ ai: false, refresh: true });
  // Words written before they switched something off are never shown after.
  expect(shown(row(good, "ai"), true, storyOf(tasteRows(), { hidden: ["kitchen"], hidePasses: false }, NOW))).toMatchObject({
    ai: false,
    refresh: true,
  });
  expect(hashOf(inputOf(tasteRows(), { hidden: [], hidePasses: false }, NOW))).toBe(story.hash);
});
