// Someone's page: one card per home per day, filters and paging that work
// without scripts, and nothing from an agent's link, ever. The homes here are
// ones no later spec counts likes on.
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
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
} from "../lib/profile";
import {
  createShare,
  heartOf,
  homeIn,
  likeInPhoto,
  openComments,
  openMore,
  pick,
  settle,
  signInAgent,
  signUpBuyer,
} from "./helpers";

const CORBEL = "812 N Corbel St";
const HERON = "88 Heron Bluff Rd";
const ALDER = "16420 NE Alder Crest Way";
const QUILLAN = "1204 Quillan St SE";
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
  await lena.goto("/homes/SAMPLE-1010");
  const heron = homeIn(lena, HERON);
  await heartOf(heron).click();
  await expect(heartOf(heron)).toHaveAttribute("aria-pressed", "true");

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
  await expect(cardLinks(lena).first()).toHaveAttribute("aria-label", `${HERON}: liked this`);
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
  // Pins land on the spots: their initial on the newest (the shingles), a dot on the porch.
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
  await rowan.goto("/homes/SAMPLE-1011");
  const alder = homeIn(rowan, ALDER);
  await heartOf(alder).click();
  await expect(heartOf(alder)).toHaveAttribute("aria-pressed", "true");

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
    await expect(saved.getByRole("button", { name: /passed, didn't like the yard/ })).toBeVisible({ timeout: 2000 });
    // What's on a photo shows once its home is on screen.
    await saved.scrollIntoViewIfNeeded();
    await expect(saved).toBeInViewport({ ratio: 0.9, timeout: 2000 });
    await expect(saved.getByRole("button", { name: /^Picket fence: .*1 like/ })).toBeAttached({ timeout: 2000 });
    await expect(
      saved.getByRole("button", { name: /^Red front door: .*Between us, we'd offer 40 under\..*1 dislike/ }),
    ).toBeAttached({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });

  // Their page has the public like and nothing else, for them and for anyone.
  await rowan.goto("/people/me");
  await rowan.waitForURL(/\/people\/[0-9a-f-]{36}$/);
  const profileUrl = rowan.url();
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(profileUrl);
  for (const page of [rowan, anon]) {
    const main = page.locator("main");
    await expect(page.getByRole("link", { name: `${ALDER}: liked this` })).toBeVisible();
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
    expect(await (await page.request.get(profileUrl)).text()).toContain(ALDER);
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
  const WORDS = "The heron on the mailbox sold me.";
  const odessa = await signUpBuyer(browser, "odessa@example.com", "Odessa Finch");
  await odessa.goto("/homes/SAMPLE-1010");
  const thread = await openComments(odessa, homeIn(odessa, HERON));
  await thread.getByLabel("Add a comment").fill(WORDS);
  await thread.getByRole("button", { name: "Post", exact: true }).click();
  await expect(thread.getByText(WORDS)).toBeVisible();

  const kit = await signUpBuyer(browser, "kit@example.com", "Kit Lane");
  await kit.goto("/homes/SAMPLE-1010");
  const chat = await openComments(kit, homeIn(kit, HERON));
  await chat.getByRole("button", { name: "Like Odessa's comment" }).click();
  // Saved, not just shown.
  await expect(async () => {
    await kit.goto("/homes/SAMPLE-1010");
    const kept = await openComments(kit, homeIn(kit, HERON));
    await expect(kept.getByRole("button", { name: "Like Odessa's comment, 1 like" })).toHaveAttribute("aria-pressed", "true", {
      timeout: 1000,
    });
  }).toPass({ timeout: 20_000 });

  await kit.goto("/people/me");
  await kit.waitForURL(/\/people\/[0-9a-f-]{36}$/);
  const profileUrl = kit.url();
  await expect(kit.getByRole("link", { name: `${HERON}: liked Odessa's comment` })).toBeVisible();
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
    await expect(anon.locator("main")).not.toContainText(/Only you see this|Odessa|heron on the mailbox/);
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
  for (const kind of KINDS) {
    for (const row of all[kind] as { listing_key: string; at: Date }[]) {
      if (+row.at >= until && +row.at < until + 25 * 3_600_000) {
        firsts.set(row.listing_key, Math.min(firsts.get(row.listing_key) ?? Infinity, +row.at));
      }
    }
  }
  return {
    ...rows,
    floor: floors.length ? new Date(Math.max(...floors)) : null,
    later: new Set([...firsts].filter(([, at]) => before && dayOf(new Date(at)) === dayOf(before)).map(([key]) => key)),
  };
}

// Pages through everything as the server does, checking every card shows
// once, in order, and whole, unless one kind held more than a read's worth on
// its day alone.
function pageThrough(all: ProfileRows, limit: number, filters: FeedFilters = { show: "all", about: null, side: null }) {
  const full = filterCards(buildCards(all), filters.show, filters.about, filters.side);
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
    const result = feedPage(read(all, before, limit), filters, before);
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
