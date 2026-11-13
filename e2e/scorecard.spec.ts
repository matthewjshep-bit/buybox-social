import { readFileSync } from "node:fs";
import { expect, test, type Browser, type Locator } from "@playwright/test";
import type { FeedPost } from "../lib/feed";
import type { Listing } from "../lib/listings/types";
import { likeId, NO_PHOTO_LIKES } from "../lib/photos";
import { NO_REACTION, type ReactionState } from "../lib/reactions";
import { buildScorecard } from "../lib/scorecard";
import type { PhotoThing, TimelineComment, TimelineItem, TimelineReaction } from "../lib/timeline";
import { signedIn, commentIn, createShare, heartOf, homeIn, joinAs, likeInPhoto, openComments, openMore, openScorecard, pick, settle, signInAgent } from "./helpers";

// The Porchcard: everything people think of a home in one place, from the
// button on its rail, after Comments. What it may show depends on where you
// are: a public page never has a private pass or name; an agent's link has
// only its own people.

const HERON = "88 Heron Bluff Rd";
const ALDER = "16420 NE Alder Crest Way";
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false };
const IPHONE = { viewport: { width: 393, height: 660 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

const settled = async (home: Locator) => {
  await expect(home).toBeInViewport({ ratio: 0.9 });
  await expect.poll(async () => Math.abs((await home.boundingBox())?.y ?? 99)).toBeLessThan(1);
};

const page$ = async (browser: Browser, options = {}) => (await browser.newContext(options)).newPage();

test("a quiet home: the rail's Porchcard says nobody has weighed in, then your take, the facts and the home", async ({
  browser,
}) => {
  const page = await page$(browser);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/homes/SAMPLE-1010");
  const home = homeIn(page, HERON);
  await settled(home);

  // Like, Comments, Porchcard, Share, More, down the rail.
  const rail = home.locator("[data-rail]");
  const names = [/^Like 88 Heron Bluff Rd/, /^Comments/, "Porchcard", "Share", "More options"];
  await expect(rail.getByRole("button")).toHaveCount(names.length);
  for (const [i, name] of names.entries()) await expect(rail.getByRole("button").nth(i)).toHaveAccessibleName(name);

  // Nobody's said or liked anything: one card for it all, then the rest in order.
  const card = await openScorecard(page, home);
  await expect(card.getByText("No one has weighed in yet.")).toBeVisible();
  await expect(card.getByText("Tap anything in a photo to like it or say something about it.")).toBeVisible();
  await expect(card.getByRole("heading", { level: 3 })).toHaveText(["Your take", "The facts", "About this home"]);
  await expect(card.getByText("88 Heron Bluff Rd, Port Townsend")).toBeVisible();
  // Price per square foot: the price over the living area, rounded.
  const perFoot = card.locator("dl > div").filter({ hasText: "Price per sq ft" });
  await expect(perFoot.getByRole("definition")).toHaveText(`$${Math.round(525000 / 980)}`);
  await expect(card.locator("dl > div").filter({ hasText: "Year built" }).getByRole("definition")).toHaveText("1979");
  await expect(card.getByText(/^A red cabin on an open meadow/)).toBeAttached();
  await expect(card.getByText("Listed by Lena Marsh · Sample Realty")).toBeAttached();
  await expect(card.getByText("Sample listing, fictional and not for sale")).toBeAttached();
  // No passes, no activity line to speak of.
  await expect(card.getByText("People pass on")).toHaveCount(0);

  // "I like it", right there: your take says so, and the heart agrees.
  await card.getByRole("button", { name: "I like it" }).click();
  await joinAs(page, "Hal");
  await expect(card.getByText("You liked this")).toBeVisible();
  await expect(card.getByLabel("1 person liked it")).toBeVisible();
  // Changing your mind is More's job.
  await card.getByRole("button", { name: "Change your take" }).click();
  const more = page.getByRole("dialog", { name: "More" });
  await expect(more).toBeVisible();
  await expect(card).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(more).toBeHidden();
  await expect(heartOf(home)).toHaveAttribute("aria-pressed", "true");

  // The line above the price, about the home as a whole, opens the Porchcard.
  const line = home.getByRole("group", { name: "Recent activity" }).getByRole("button").last();
  await expect(line).toHaveAccessibleName(/^You liked this\. .+\. See the Porchcard\.$/);
  await line.click();
  await expect(page.getByRole("dialog", { name: "Porchcard" })).toBeVisible();
  await page.keyboard.press("Escape");

  // Beside the map, a home is just a look: no Porchcard there.
  const map = await page$(browser, { viewport: { width: 1400, height: 900 } });
  await map.goto("/search");
  await expect(map.getByRole("article").first()).toBeInViewport();
  await expect(map.getByRole("button", { name: "Porchcard", exact: true })).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("public and private: a link's people, passes and words stay on the link, and the public stays off it", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const LAWN = "the lawn";
  const UMA_SAYS = "Could we see it on Saturday morning?";
  const WES_SAYS = "That front walk is lovely in the evening.";
  const agent = await signInAgent(browser, "sage@example.com", "Sage Agent");
  const { urls } = await createShare(agent, ["16420 NE Alder Crest"], ["Uma", "Vic"]);

  // Uma likes it, the front door with it, and says something to the agent.
  const uma = await signedIn(browser);
  await uma.goto(urls.Uma);
  const umaHome = homeIn(uma, ALDER);
  await heartOf(umaHome).click();
  await expect(heartOf(umaHome)).toHaveAttribute("aria-pressed", "true");
  await likeInPhoto(umaHome, "the front door");
  const chat = await openComments(uma, umaHome);
  await chat.getByLabel("Add a comment").fill(UMA_SAYS);
  await chat.getByRole("button", { name: "Post", exact: true }).click();
  await expect(chat.getByText(UMA_SAYS)).toBeVisible();
  await uma.keyboard.press("Escape");

  // Vic likes the front door too, doesn't like the lawn, and passes on the price.
  const vic = await signedIn(browser);
  await vic.goto(urls.Vic);
  const vicHome = homeIn(vic, ALDER);
  const door = await likeInPhoto(vicHome, "the front door");
  await door.getByRole("button", { name: "Close" }).click();
  const lawn = await pick(vicHome, LAWN);
  await lawn.getByRole("button", { name: /^Dislike / }).click();
  await expect(lawn.getByRole("button", { name: /^Dislike / })).toHaveAttribute("aria-pressed", "true");
  await lawn.getByRole("button", { name: "Close" }).click();
  const vicMore = await openMore(vic, vicHome);
  await vicMore.getByRole("button", { name: "Not for me" }).click();
  await vicMore.getByRole("group", { name: "What made you pass?" }).getByRole("button", { name: "Price" }).click();
  await expect(
    vicMore.getByRole("group", { name: "What made you pass?" }).getByRole("button", { name: "Price" }),
  ).toHaveAttribute("aria-pressed", "true");
  await vic.keyboard.press("Escape");

  // Wes, in public, says something and likes it.
  const wes = await page$(browser, IPHONE);
  await wes.goto("/homes/SAMPLE-1011");
  const wesHome = homeIn(wes, ALDER);
  await settled(wesHome);
  const wesChat = await openComments(wes, wesHome);
  await wesChat.getByLabel("Add a comment").fill(WES_SAYS);
  await wesChat.getByRole("button", { name: "Post", exact: true }).click();
  await joinAs(wes, "Wes");
  await expect(wesChat.getByText(WES_SAYS)).toBeVisible();
  await wes.keyboard.press("Escape");
  await heartOf(wesHome).click();
  await expect(heartOf(wesHome)).toHaveAttribute("aria-pressed", "true");

  // The public Porchcard: likes, counted (Uma's and Vic's front door without
  // their names); Uma's words only as a number; no pass, no dislike, no name
  // from the link.
  const card = await openScorecard(wes, wesHome);
  await expect(card.getByLabel("3 people liked it")).toBeVisible();
  await expect(card.getByLabel(/passed$/)).toHaveCount(0);
  await expect(card.getByText("What people didn't like")).toHaveCount(0);
  await expect(card.getByText("Gave people pause")).toHaveCount(0);
  await expect(card.getByText("and 1 more comment in private chats")).toBeVisible();
  await expect(card).not.toContainText(/pass/i);
  await expect(card).not.toContainText(/Uma|Vic|Saturday/);
  await expect(card.getByLabel("Activity")).not.toContainText("pass");
  for (const path of ["/", "/homes/SAMPLE-1011"]) {
    const html = await (await wes.request.get(path)).text();
    expect(html).not.toContain(UMA_SAYS);
    expect(html).not.toMatch(/\bUma\b|\bVic\b/);
  }

  // What people said is in the comments, a tap away, and they stay open.
  await card.getByRole("button", { name: "See the 1 comment" }).click();
  const comments = wes.getByRole("dialog", { name: "Comments" });
  await expect(comments).toBeVisible();
  await wes.waitForTimeout(600);
  await expect(comments).toBeVisible();
  await expect(comments.getByText(WES_SAYS)).toBeVisible();
  // ...and back: what everyone thinks.
  await comments.getByRole("button", { name: /^See the Porchcard/ }).click();
  await expect(card).toBeVisible();

  // A spot in the photos goes to the photo, its card open.
  const front = card.getByRole("button", { name: "Front door, photo 1, 2 likes. Show it on the photo" });
  await front.click();
  await expect(card).toBeHidden();
  const spot = wesHome.getByRole("group", { name: "Front door" });
  await expect(spot).toBeVisible();
  await settle(spot);
  await spot.getByRole("button", { name: "Close" }).click();

  // The description's "more" opens the Porchcard at "About this home".
  await wesHome.getByRole("button", { name: "more", exact: true }).click();
  await expect(card).toBeVisible();
  await expect(card.getByRole("heading", { name: "About this home" })).toBeInViewport();
  await wes.keyboard.press("Escape");

  // On the link: the same buttons down the side (no Share on a link of
  // one's own), then names, where they agree, the pass and the dislike, and
  // nothing from the public page.
  await uma.reload();
  const umaRail = homeIn(uma, ALDER).locator("[data-rail]");
  const onLink = [/^Like 16420 NE Alder Crest Way/, /^Comments/, "Porchcard", "More options"];
  await expect(umaRail.getByRole("button")).toHaveCount(onLink.length);
  for (const [i, name] of onLink.entries()) await expect(umaRail.getByRole("button").nth(i)).toHaveAccessibleName(name);
  const umaCard = await openScorecard(uma, homeIn(uma, ALDER));
  await expect(umaCard.getByText("From the people on this link · only they and Sage Agent see this")).toBeVisible();
  await expect(umaCard).toContainText("You liked it · Vic passed");
  await expect(umaCard.getByRole("heading", { name: "Where you agree" })).toBeVisible();
  await expect(umaCard).toContainText("Both like: Exterior · Front door");
  await expect(umaCard.getByText("What people didn't like")).toBeVisible();
  await expect(umaCard.getByRole("button", { name: /^Price 1 person/ })).toBeVisible();
  await expect(umaCard.getByText("Gave people pause")).toBeVisible();
  await expect(umaCard.getByRole("button", { name: /^Lawn, photo 1, 1 person didn't like it\./ })).toBeVisible();
  await expect(umaCard).not.toContainText(/\bWes\b|front walk is lovely/);
  await expect(umaCard.getByRole("button", { name: "Message Sage" })).toBeVisible();
  // One home on the link: nothing to compare it with.
  await expect(umaCard.getByRole("heading", { name: /^Compare/ })).toHaveCount(0);
  // What she said is in the link's comments; Wes's public words never are.
  await umaCard.getByRole("button", { name: "See the 1 comment" }).click();
  const umaComments = uma.getByRole("dialog", { name: "Comments" });
  await expect(umaComments.getByText(UMA_SAYS)).toBeVisible();
  await expect(umaComments).not.toContainText(/\bWes\b|front walk is lovely/);
  const linkHtml = await (await uma.request.get(urls.Uma)).text();
  expect(linkHtml).not.toContain(WES_SAYS);
  expect(linkHtml).not.toMatch(/\bWes\b/);
});

test("on a desktop, the panel says what the home is and what people said, and the Porchcard is a tab beside the comments", async ({
  browser,
}) => {
  const page = await page$(browser, DESKTOP);
  await page.goto("/homes/SAMPLE-1011");
  const home = homeIn(page, ALDER);
  await settled(home);
  // Something for it to say: a like, its front door, and a word.
  await heartOf(home).click();
  await joinAs(page, "Kofi");
  await expect(heartOf(home)).toHaveAttribute("aria-pressed", "true");
  const door = await likeInPhoto(home, "the front door");
  await door.getByRole("button", { name: "Close" }).click();
  const chat = await openComments(page, home);
  await chat.getByLabel("Add a comment").fill("The walk up to the door is lovely.");
  await chat.getByRole("button", { name: "Post", exact: true }).click();
  await expect(chat.getByText("The walk up to the door is lovely.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(chat).toBeHidden();

  // The panel says what the home is; the words themselves are in the
  // comments, a tap away on its row of things to do.
  const panel = home.locator("[data-words]");
  await expect(panel.getByText("Price per sq ft")).toBeVisible();
  await expect(panel.getByRole("list", { name: "Comments and likes" })).toHaveCount(0);
  await panel.getByRole("button", { name: /^Comments, \d+$/ }).click();
  const said = page.getByRole("dialog", { name: "Comments" });
  await expect(commentIn(said, "Kofi", "The walk up to the door is lovely.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(said).toBeHidden();
  // What people think is the Porchcard, from the buttons beside the photo;
  // what the home is, it leaves to the panel.
  await home.getByRole("button", { name: "Porchcard", exact: true }).click();
  const card = page.getByRole("dialog", { name: "Porchcard" });
  await expect(card).toBeVisible();
  await expect(card.getByLabel(/^\d+ (person|people) liked it$/)).toBeVisible();
  await expect(card.getByRole("heading", { name: "The facts" })).toHaveCount(0);
  // Beside the photo, not over it, and the tab that's showing has the keyboard.
  expect(await card.evaluate((el) => el.matches(":modal"))).toBe(false);
  const tabs = card.getByRole("tablist");
  await expect(tabs.getByRole("tab", { name: "Porchcard" })).toHaveAttribute("aria-selected", "true");
  await expect(tabs.getByRole("tab", { name: "Porchcard" })).toBeFocused();

  // The tabs switch in place: one panel, its name following the tab.
  await tabs.getByRole("tab", { name: /^Comments/ }).click();
  const comments = page.getByRole("dialog", { name: "Comments" });
  await expect(comments).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(comments.getByRole("tab", { name: /^Comments/ })).toHaveAttribute("aria-selected", "true");
  await comments.getByRole("tab", { name: /^Comments/ }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(card).toBeVisible();
  await expect(card.getByRole("tab", { name: "Porchcard" })).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(comments).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(comments).toBeHidden();

  // The panel's own Porchcard button opens it too.
  await home.locator("[data-words]").getByRole("button", { name: "Porchcard", exact: true }).click();
  await expect(card).toBeVisible();
  // The comments from the keyboard: there, with the keyboard on their tab.
  await card.getByRole("button", { name: /^See the \d+ comments?$/ }).press("Enter");
  await expect(comments).toBeVisible();
  await expect(comments.getByRole("tab", { name: /^Comments/ })).toBeFocused();
  await comments.getByRole("tab", { name: "Porchcard" }).click();
  await expect(card).toBeVisible();
  // A spot in the photos: the photo shows it, the Porchcard stays. From the
  // keyboard, the spot's card takes it, and gives it back to the row.
  const row = card.getByRole("button", { name: /^Front door, photo 1, / });
  await row.press("Enter");
  const spot = home.getByRole("group", { name: "Front door" });
  await expect(spot).toBeVisible();
  await expect(card).toBeVisible();
  await expect(spot.getByRole("button", { name: /^Like the front door/ })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(spot).toBeHidden();
  await expect(card).toBeVisible();
  await expect(row).toBeFocused();
});

test("on a link with more than one home, the Porchcard sets this one beside the others, from the link alone", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const QUILLAN = "1204 Quillan St SE";
  const LAKEVIEW = "5902 Lakeview Terrace SE";
  const agent = await signInAgent(browser, "cleo-compare@example.com", "Cleo Compare");
  const { urls } = await createShare(agent, ["1204 Quillan", "5902 Lakeview"], ["Ana", "Bo"]);
  // (Each tap shows at once and saves behind it: wait for each to be saved,
  // not just shown, since another page reads them straight after.)
  const pass = async (more: Locator, aspect: string) => {
    const saved = () =>
      more.page().waitForResponse((res) => res.request().method() === "POST" && Boolean(res.request().headers()["next-action"]));
    let save = saved();
    await more.getByRole("button", { name: "Not for me" }).click();
    await save;
    const why = more.getByRole("group", { name: "What made you pass?" });
    save = saved();
    await why.getByRole("button", { name: aspect }).click();
    await expect(why.getByRole("button", { name: aspect })).toHaveAttribute("aria-pressed", "true");
    await save;
  };

  // In public, Zed likes the first and its red front door, and passes on the
  // second's price: none of it may count on the link.
  const zed = await page$(browser);
  await zed.goto("/homes/SAMPLE-1009");
  const zedQuillan = homeIn(zed, QUILLAN);
  await heartOf(zedQuillan).click();
  await joinAs(zed, "Zed");
  await expect(heartOf(zedQuillan)).toHaveAttribute("aria-pressed", "true");
  const door = await likeInPhoto(zedQuillan, "the red front door");
  await door.getByRole("button", { name: "Close" }).click();
  await zed.goto("/homes/SAMPLE-1013");
  const zedMore = await openMore(zed, homeIn(zed, LAKEVIEW));
  await pass(zedMore, "Price");
  await zed.keyboard.press("Escape");

  // Ana likes the first for where it is, and passes on the second's price.
  const ana = await signedIn(browser);
  await ana.goto(urls.Ana);
  const quillan = homeIn(ana, QUILLAN);
  await heartOf(quillan).click();
  await expect(heartOf(quillan)).toHaveAttribute("aria-pressed", "true");
  let more = await openMore(ana, quillan);
  const likes = more.getByRole("group", { name: "What else do you like?" });
  await likes.getByRole("button", { name: "Location" }).click();
  await expect(likes.getByRole("button", { name: "Location" })).toHaveAttribute("aria-pressed", "true");
  await ana.keyboard.press("Escape");
  await expect(more).toBeHidden();
  more = await openMore(ana, homeIn(ana, LAKEVIEW));
  await pass(more, "Price");
  await ana.keyboard.press("Escape");
  await expect(more).toBeHidden();

  // Bo passes on the first, for its price too.
  const bo = await signedIn(browser);
  await bo.goto(urls.Bo);
  more = await openMore(bo, homeIn(bo, QUILLAN));
  await pass(more, "Price");

  // The first home's Porchcard: each home a column, this one first; whether
  // people liked it, then each aspect anyone has a view on. (Once Bo's pass
  // is in: the wait for it above can be met by another save on his link,
  // such as the time on the home.)
  await expect(async () => {
    await ana.reload();
    const opened = await openScorecard(ana, homeIn(ana, QUILLAN));
    await expect(
      opened
        .getByRole("row")
        .filter({ has: ana.getByRole("rowheader", { name: "Price", exact: true }) })
        .getByRole("cell")
        .first(),
    ).toHaveText(/^\s*1 pass$/, { timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  const card = ana.getByRole("dialog", { name: "Porchcard" });
  await expect(card.getByRole("heading", { name: "Compare with the other home" })).toBeVisible();
  const table = card.getByRole("table", { name: /^This home beside the other home/ });
  await expect(table.getByRole("columnheader")).toHaveText(["Aspect", `This home, ${QUILLAN}`, LAKEVIEW]);
  const cells = (label: string) =>
    table.getByRole("row").filter({ has: ana.getByRole("rowheader", { name: label, exact: true }) }).getByRole("cell");
  // [P] From the link alone: Zed's heart, front door and pass in public count
  // for nothing here (no second like, no Exterior row, no second pass), and
  // nobody from the public is named.
  await expect(cells("Overall")).toHaveText([/^1 like 1 pass$/, /^\s*1 pass$/]);
  await expect(cells("Location")).toHaveText([/^1 like\s*$/, /None$/]);
  await expect(cells("Price")).toHaveText([/^\s*1 pass$/, /^\s*1 pass$/]);
  await expect(table.getByRole("rowheader")).toHaveText(["Overall", "Price", "Location"]);
  await expect(card).not.toContainText(/\bZed\b/);

  // What you've just done counts at once, in this home's column.
  await card.getByRole("button", { name: "Change your take" }).click();
  more = ana.getByRole("dialog", { name: "More" });
  await more.getByRole("button", { name: "Not for me" }).click();
  await expect(more.getByRole("button", { name: "Not for me" })).toHaveAttribute("aria-pressed", "true");
  await ana.keyboard.press("Escape");
  const again = await openScorecard(ana, homeIn(ana, QUILLAN));
  await expect(
    again.getByRole("row").filter({ has: ana.getByRole("rowheader", { name: "Overall", exact: true }) }).getByRole("cell").first(),
  ).toHaveText(/^\s*2 passes$/);

  // A home's own page is no link: nothing to compare.
  const page = await page$(browser);
  await page.goto("/homes/SAMPLE-1009");
  const card2 = await openScorecard(page, homeIn(page, QUILLAN));
  await expect(card2.getByRole("heading", { name: /^Compare/ })).toHaveCount(0);
});

// The Porchcard as built from a link's conversation, without a browser: the
// kitchen photo of 4127 Larkmoor, and three people on the link.
const LARKMOOR = (JSON.parse(readFileSync("supabase/seed/listings.json", "utf8")) as Listing[]).find(
  (listing) => listing.ListingKey === "SAMPLE-1001",
)!;
const KITCHEN_PHOTO = "SAMPLE-1001-3";
const AT = "2026-11-01T10:00:00.000Z";
const liked = (tag: string): PhotoThing => ({ tag, mediaUrl: null, mediaKey: KITCHEN_PHOTO, spot: tag, at: AT });
const personOf = (name: string, state: ReactionState, photos: PhotoThing[] = []): TimelineReaction => ({
  kind: "reaction",
  id: name,
  personKey: name,
  name,
  at: AT,
  mine: false,
  state,
  photos,
  photoDislikes: [],
});
const said = (name: string, body: string, isAgent = false): TimelineComment => ({
  kind: "comment",
  id: `${name}-${body}`,
  personKey: isAgent ? undefined : name,
  name,
  isAgent,
  body,
  at: AT,
  mine: false,
  parentId: null,
  likes: 0,
  likedByMe: false,
});
const linkPost = (timeline: TimelineItem[]): FeedPost => ({
  listing: LARKMOOR,
  headline: null,
  likes: 0,
  likers: [],
  dislikes: 0,
  aspects: { liked: {}, disliked: {} },
  publicComments: 0,
  privateComments: 0,
  timeline,
  photoLikes: {
    ...NO_PHOTO_LIKES,
    counts: Object.fromEntries(
      timeline.flatMap((item) => (item.kind === "reaction" ? item.photos.map((t) => [likeId(KITCHEN_PHOTO, t.spot!), 1]) : [])),
    ),
  },
  mine: NO_REACTION,
  buzz: { sends: 0, views: 0, lastActivityAt: null, trending: false },
  reasons: [],
});

test("someone who passed on the kitchen doesn't like the kitchen, whatever they hearted in its photos", () => {
  const nina = personOf("Nina", { reaction: "like", liked: ["kitchen"], disliked: [] });
  const owen = personOf("Owen", { reaction: "like", liked: ["yard"], disliked: [] });
  const passed = { reaction: "dislike", liked: [], disliked: ["kitchen"] } as ReactionState;

  // Ben hearts the kitchen photo as a whole (it's named "Kitchen", like the
  // specific), and passes on the home for its kitchen.
  for (const mode of ["agent", "share"] as const) {
    const card = buildScorecard(
      linkPost([personOf("Ben", passed, [liked("Kitchen")]), nina, owen, said("Nina", "Love it"), said("Jordan Rivera", "Same", true)]),
      mode,
    );
    expect(card.agree).toEqual([
      { label: "Only Nina", things: ["Kitchen"] },
      { label: "Only Owen", things: ["Yard"] },
    ]);
    expect(card.say?.sentences).toEqual(["Ben didn't like the kitchen."]);
    if (mode === "agent") {
      const ben = card.people!.find((person) => person.name === "Ben")!;
      expect(ben.likes).toEqual([]);
      expect(ben.passes).toEqual(["Kitchen"]);
      // What people said, apart from the agent's own reply.
      expect([card.feel.comments, card.feel.yours]).toEqual([1, 1]);
    }
  }

  // A heart on something in it (the marble counters) is still a like of
  // that, and still not of the kitchen.
  const card = buildScorecard(linkPost([personOf("Ben", passed, [liked("Marble counters")]), nina, owen]), "agent");
  const ben = card.people!.find((person) => person.name === "Ben")!;
  expect(ben.likes).toEqual(["Marble counters"]);
  expect(ben.passes).toEqual(["Kitchen"]);
  expect(card.agree).toEqual([
    { label: "Only Ben", things: ["Marble counters"] },
    { label: "Only Nina", things: ["Kitchen"] },
    { label: "Only Owen", things: ["Yard"] },
  ]);
  expect(card.say?.sentences).toEqual(["Ben didn't like the kitchen."]);
});

test("the numbers agree: a pass with a heart in the photos is among the likes, and the line under the bar says only who passed", () => {
  const fan = (name: string) => personOf(name, { reaction: "like", liked: [], disliked: [] });
  const fans = ["Ann", "Bea", "Cy", "Di", "Ed"].map(fan);
  // Ben hearts the marble counters, then passes; Cal just passes. On the
  // public page, Ben's heart counts among the likes: six liked it, two passed.
  const ben = personOf("Ben", { reaction: "dislike", liked: [], disliked: [] }, [liked("Marble counters")]);
  const cal = personOf("Cal", { reaction: "dislike", liked: [], disliked: [] });
  const card = buildScorecard({ ...linkPost([...fans, ben, cal]), likes: 6, dislikes: 2 }, "public");
  expect([card.feel.likes, card.feel.passes, card.feel.people]).toEqual([6, 2, 7]);
  // Not "5 liked it" under "6 liked it".
  expect(card.feel.split).toBe("2 of 7 passed");

  // Nobody passed: how many of them liked it.
  const all = buildScorecard({ ...linkPost(fans), likes: 5 }, "public");
  expect(all.feel.split).toBe("5 of 5 liked it");
  // Under five people, no line at all.
  expect(buildScorecard({ ...linkPost(fans.slice(1)), likes: 4 }, "public").feel.split).toBeNull();
});

test("a spot on nothing named reads as where it is, as the line above the price says it: outside, in the kitchen, or in photo 3", () => {
  // A corner of the front photo and of the kitchen photo, on nothing named.
  const corners = ["SAMPLE-1001-1", KITCHEN_PHOTO].map(
    (mediaKey): PhotoThing => ({ tag: "@97,3", mediaUrl: null, mediaKey, spot: "@97,3", at: AT }),
  );
  const post = {
    ...linkPost([personOf("Ben", { reaction: "like", liked: [], disliked: [] }, corners)]),
    photoLikes: { ...NO_PHOTO_LIKES, counts: Object.fromEntries(corners.map((t) => [likeId(t.mediaKey!, t.spot!), 1])) },
  };
  const names = (p: FeedPost) => buildScorecard(p, "agent").photos?.loved.map((row) => row.name).sort();
  expect(names(post)).toEqual(["A spot in the kitchen", "A spot outside"]);
  // A photo nobody has said the room of: which photo it is.
  const unnamed = { ...LARKMOOR, Media: LARKMOOR.Media.map((m) => ({ ...m, ImageOf: undefined })) };
  expect(names({ ...post, listing: unnamed })).toEqual(["A spot in photo 1", "A spot in photo 3"]);
});

test("a heart on a comment in the public feed stays once it's saved, and the count with it", async ({ browser }) => {
  const SAYS = "The porch light at dusk sold me.";
  const page = await page$(browser, IPHONE);
  await page.goto("/homes/SAMPLE-1011");
  let chat = await openComments(page, homeIn(page, ALDER));
  await chat.getByLabel("Add a comment").fill(SAYS);
  await chat.getByRole("button", { name: "Post", exact: true }).click();
  await joinAs(page, "Lior");
  await expect(chat.getByText(SAYS)).toBeVisible();

  // From a fresh page, so the comment is the one the server has.
  const open = async () => {
    await page.goto("/homes/SAMPLE-1011");
    chat = await openComments(page, homeIn(page, ALDER));
    const item = chat.locator("li[data-comment]").filter({ hasText: SAYS });
    return { item, heart: item.getByRole("button", { name: /^Like your comment/ }), id: await item.getAttribute("data-comment") };
  };
  // Tap the heart and wait for that like to be saved (not just shown), then a beat.
  const tap = async (heart: Locator, id: string | null) => {
    const saved = page.waitForResponse(
      (r) => r.request().method() === "POST" && (r.request().postData() ?? "").includes(id ?? "none"),
    );
    await heart.click();
    await saved;
    await page.waitForTimeout(500);
  };

  let { item, heart, id } = await open();
  await expect(heart).toHaveAttribute("aria-pressed", "false");
  await tap(heart, id);
  await expect(heart).toHaveAttribute("aria-pressed", "true");
  await expect(heart).toHaveAccessibleName("Like your comment, 1 like");
  await expect(item.getByText("1 like", { exact: true })).toBeVisible();

  ({ item, heart, id } = await open());
  await expect(heart).toHaveAttribute("aria-pressed", "true");
  await tap(heart, id);
  await expect(heart).toHaveAttribute("aria-pressed", "false");
  await expect(heart).toHaveAccessibleName("Like your comment");
  await expect(item.getByText(/^\d+ likes?$/)).toHaveCount(0);

  ({ heart } = await open());
  await expect(heart).toHaveAttribute("aria-pressed", "false");
});
