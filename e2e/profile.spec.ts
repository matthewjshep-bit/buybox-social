// Someone's page: one card per home per day, filters and paging that work
// without scripts, and nothing from an agent's link, ever. The homes here are
// ones no later spec counts likes on.
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import type { Listing } from "../lib/listings/types";
import { buildCards, dayHeading, feedBound, filterCards, pageOf, type ProfileRows } from "../lib/profile";
import { createShare, heartOf, homeIn, likeInPhoto, openMore, pick, settle, signInAgent, signUpBuyer } from "./helpers";

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
  const sentence = "liked the wraparound porch and price but not the cedar shingles";
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

  // Filters are links: what you said, what you didn't like, what you liked.
  await lena.getByRole("link", { name: "Comments", exact: true }).click();
  await expect(lena).toHaveURL(/\?show=comments$/);
  await expect(lena.getByRole("link", { name: "Comments", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(cardLinks(lena)).toHaveCount(1);
  await expect(link).toBeVisible();
  await lena.getByRole("link", { name: "Passed", exact: true }).click();
  await expect(lena).toHaveURL(/\?show=passed$/);
  await expect(cardLinks(lena)).toHaveCount(1);
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
  await visitor.getByRole("link", { name: "Wraparound porch 1" }).click();
  await expect(visitor).toHaveURL(/\?about=Wraparound\+porch$/);
  await expect(cardLinks(visitor)).toHaveCount(1);
  await visitor.getByRole("link", { name: "Remove Wraparound porch" }).click();
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
});

test("an empty page says what will show up there", async ({ browser }) => {
  const jo = await signUpBuyer(browser, "jo@example.com", "Jo Reyes");
  await jo.goto("/people/me");
  await jo.waitForURL(/\/people\/[0-9a-f-]{36}$/);
  await expect(jo.getByRole("heading", { level: 1 })).toHaveText("Jo (you)");
  await expect(jo.getByText("Your page fills up as you go")).toBeVisible();
  await expect(jo.getByRole("link", { name: "See homes" })).toHaveAttribute("href", "/");
  await expect(jo.getByRole("link", { name: "Comments", exact: true })).toHaveCount(0);

  const anon = await (await browser.newContext()).newPage();
  await anon.goto(jo.url());
  await expect(anon.getByRole("heading", { level: 1 })).toHaveText("Jo");
  await expect(anon.getByText("Nothing to show yet")).toBeVisible();
  await expect(anon.getByText("Jo hasn't liked anything yet.")).toBeVisible();
  expect((await anon.goto("/people/not-a-person"))!.status()).toBe(404);
});

// [P] Private to the link: a pass, a spot dislike and a comment made on an
// agent's link never reach that person's public page, in words or in the HTML.
test("what someone does on an agent's link never shows on their page", async ({ browser }) => {
  test.setTimeout(90_000);
  const agent = await signInAgent(browser, "profile-agent@example.com", "Avery Agent");
  const { url } = await createShare(agent, ["1204 Quillan"], ["Toby"]);

  // In public, one like.
  const rowan = await signUpBuyer(browser, "rowan@example.com", "Rowan Vale");
  await rowan.goto("/homes/SAMPLE-1011");
  const alder = homeIn(rowan, ALDER);
  await heartOf(alder).click();
  await expect(heartOf(alder)).toHaveAttribute("aria-pressed", "true");

  // On the agent's link, in the same browser: words about a spot, a dislike of it, and a pass.
  await rowan.goto(url);
  const quillan = homeIn(rowan, QUILLAN);
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
    await expect(main).not.toContainText(/red front door|Passes on|Yard/i);
    await page.getByRole("link", { name: "Passed", exact: true }).click();
    await expect(page.getByText("Nothing passed on yet.")).toBeVisible();
    await page.getByRole("link", { name: "Comments", exact: true }).click();
    await expect(page.getByText("No comments yet.")).toBeVisible();
    expect(await (await page.request.get(profileUrl)).text()).toContain(ALDER);
    for (const path of [profileUrl, `${profileUrl}?show=passed`, `${profileUrl}?show=comments`]) {
      const html = await (await page.request.get(path)).text();
      for (const secret of [SECRET, QUILLAN, "SAMPLE-1009", "Toby", "Red front door", "red front door"]) {
        expect(html).not.toContain(secret);
      }
    }
  }
});

// The feed's grouping and paging, without a server: days are Seattle days,
// and every page holds whole cards, none twice and none skipped.
const LISTINGS = new Map(
  (JSON.parse(readFileSync("supabase/seed/listings.json", "utf8")) as Listing[]).map((listing) => [
    listing.ListingKey,
    { ...listing, Media: [...listing.Media].sort((a, b) => a.Order - b.Order) },
  ]),
);
const empty = (): ProfileRows => ({ reactions: [], likes: [], dislikes: [], comments: [], commentLikes: [], listings: LISTINGS });
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
  rows.reactions.push({ listing_key: "SAMPLE-1001", reaction: "like", liked: ["vibe"], disliked: [], at: new Date("2026-11-06T18:00:00Z") });
  rows.likes.push(
    { listing_key: "SAMPLE-1001", media_key: "SAMPLE-1001-1", tag: "Front door", aspect: "exterior", at: new Date("2026-11-06T17:00:00Z") },
    { listing_key: "SAMPLE-1001", media_key: "facts", tag: "Price", aspect: "price", at: new Date("2026-11-06T17:30:00Z") },
    // 11:30 at night on the 5th in Seattle, though already the 6th in UTC.
    { listing_key: "SAMPLE-1001", media_key: "SAMPLE-1001-2", tag: "Built-in shelves", aspect: "aesthetic", at: new Date("2026-11-06T07:30:00Z") },
  );
  rows.dislikes.push({ listing_key: "SAMPLE-1003", media_key: "SAMPLE-1003-2", tag: "Media wall", at: new Date("2026-10-28T19:00:00Z") });
  rows.comments.push(
    comment("c1", "SAMPLE-1001", "2026-11-06T17:05:00Z", { media_key: "SAMPLE-1001-1", spot: "Front door", likes: 2, replies: 1 }),
    comment("c2", "SAMPLE-1008", "2026-11-03T19:00:00Z", { reply_to_id: "sam", reply_to_name: "Sam" }),
    // A spot tapped right by the red front door reads as the door.
    comment("c3", "SAMPLE-1009", "2026-09-14T19:00:00Z", { media_key: "SAMPLE-1009-1", spot: "@57.5,60.5" }),
  );

  const cards = buildCards(rows);
  expect(cards.map((card) => [card.home.key, card.day, dayHeading(card.day, now), card.sentence])).toEqual([
    ["SAMPLE-1001", "2026-11-06", "Today", "liked the vibe, front door and price"],
    ["SAMPLE-1001", "2026-11-05", "Yesterday", "liked the built-in shelves"],
    ["SAMPLE-1008", "2026-11-03", "Earlier this week", "commented on this home"],
    ["SAMPLE-1003", "2026-10-28", "October 28", "didn't like the media wall"],
    ["SAMPLE-1009", "2026-09-14", "September 2026", "commented on the red front door"],
  ]);
  const [today] = cards;
  expect(today.at).toBe("2026-11-06T18:00:00.000Z");
  expect(today.photo).toMatchObject({ index: 0, width: 1400, height: 1050 });
  // The door was liked and talked about: one pin, the newest (the comment).
  expect(today.pins).toEqual([{ x: 0.62, y: 0.68, kind: "comment" }]);
  expect(today.facts).toEqual([{ kind: "like", phrase: "the price" }]);
  expect(today.comments).toMatchObject([{ spot: "the front door", likes: 2, replies: 1, replyTo: null }]);
  // Yesterday's photo is the one with the shelves in it.
  expect(cards[1].photo?.index).toBe(1);
  expect(cards[2].comments[0].replyTo).toEqual({ name: "Sam", profileId: "sam" });

  const keys = (list: typeof cards) => list.map((card) => `${card.home.key} ${card.day}`);
  expect(keys(filterCards(cards, "liked", null))).toEqual(["SAMPLE-1001 2026-11-06", "SAMPLE-1001 2026-11-05"]);
  expect(keys(filterCards(cards, "passed", null))).toEqual(["SAMPLE-1003 2026-10-28"]);
  expect(keys(filterCards(cards, "comments", null))).toHaveLength(3);
  expect(keys(filterCards(cards, "all", "Front door"))).toEqual(["SAMPLE-1001 2026-11-06"]);
  // The shelves and the media wall are both in living rooms.
  expect(keys(filterCards(cards, "all", "aesthetic"))).toEqual(["SAMPLE-1001 2026-11-05", "SAMPLE-1003 2026-10-28"]);
});

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

  // Paging the way the server does: each page reads only rows before its bound.
  const seen: string[] = [];
  let before: string | null = null;
  for (let page = 0; page < 10; page++) {
    const bound = feedBound(before);
    const window: ProfileRows = bound
      ? { ...rows, likes: rows.likes.filter((like) => like.at < new Date(bound)) }
      : rows;
    const result = pageOf(buildCards(window), before);
    expect(result.cards.length).toBeGreaterThanOrEqual(page === 0 ? 20 : 1);
    // Each card is exactly the card the whole feed has.
    for (const card of result.cards) expect(card).toEqual(all.find((c) => c.id === card.id));
    seen.push(...result.cards.map((card) => card.id));
    before = result.earlier;
    if (!before) break;
  }
  expect(seen).toEqual(all.map((card) => card.id));
  const first = pageOf(all, null);
  expect(first.cards).toHaveLength(20);
  expect(first.earlier).toBe(first.cards[19].at);

  // Two cards from the very same moment across a page break stay together.
  const tied = all.map((card, i) => (i === 20 ? { ...card, at: all[19].at } : card));
  const page = pageOf(tied, null);
  expect(page.cards).toHaveLength(21);
  expect(page.earlier).toBe(all[19].at);
  expect(pageOf(tied, page.earlier).cards[0].id).toBe(all[21].id);
});
