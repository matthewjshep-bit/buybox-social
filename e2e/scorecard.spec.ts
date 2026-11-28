import { readFileSync } from "node:fs";
import { expect, test, type Browser, type Locator } from "@playwright/test";
import type { FeedPost } from "../lib/feed";
import type { Listing } from "../lib/listings/types";
import { likeId, NO_PHOTO_LIKES } from "../lib/photos";
import { NO_REACTION, type ReactionState } from "../lib/reactions";
import { buildScorecard } from "../lib/scorecard";
import type { PhotoThing, TimelineComment, TimelineItem, TimelineReaction } from "../lib/timeline";
import {
  signedIn,
  commentIn,
  commentsOf,
  createShare,
  heartOf,
  homeIn,
  joinAs,
  likeInPhoto,
  linkHomes,
  linkPorchcard,
  openComments,
  openMore,
  openScorecard,
  expectFeedback,
  notForMe,
  pick,
  settle,
  signInAgent,
  passOn,
  keepLinksPrivate,
} from "./helpers";

// The Porchcard: everything people think of a home in one place. On the
// homes themselves it's an agent's alone, going through a link's homes (or a
// client's), from "Feedback" in the home's More menu (the "…" by its price):
// what everyone makes of the home, as a public page may say it (no private
// pass, no name from anyone's link). Everyone else has no way to it. The row
// under the photo is everyone's: the heart, Comments, Share, and Save at the
// far right. What each person on a link thinks, by name, is the agent's on
// that link's own page.

const HERON = "88 Heron Bluff Rd";
const ALDER = "16420 NE Alder Crest Way";
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false };
const IPHONE = { viewport: { width: 393, height: 660 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

const settled = async (home: Locator) => {
  await expect(home).toBeInViewport({ ratio: 0.9 });
  await expect.poll(async () => Math.abs((await home.boundingBox())?.y ?? 99)).toBeLessThan(1);
};

const page$ = async (browser: Browser, options = {}) => (await browser.newContext(options)).newPage();

// The row under the photo (the heart, Comments, Share, then Save at the
// far right), and the comment bar alone at the foot: the same on every home, at
// every width. Nothing sits on the photo.
const rowUnder = async (home: Locator, names: (string | RegExp)[], pill: string | RegExp) => {
  const actions = home.locator("[data-actions]");
  await expect(actions.getByRole("button")).toHaveCount(names.length);
  for (const [i, name] of names.entries()) await expect(actions.getByRole("button").nth(i)).toHaveAccessibleName(name);
  // Each a fingertip tall.
  for (const height of await actions.getByRole("button").evaluateAll((all) => all.map((el) => el.getBoundingClientRect().height))) {
    expect(height).toBeGreaterThanOrEqual(44);
  }
  const bar = home.locator("[data-bar-row]");
  await expect(bar.getByRole("button")).toHaveCount(1);
  await expect(bar.getByRole("button")).toHaveAccessibleName(pill);
  // The row under the photo, the bar under the row.
  const photo = (await home.getByRole("group", { name: /^Photos of/ }).getByRole("img").first().boundingBox())!;
  const row = (await actions.boundingBox())!;
  const foot = (await bar.boundingBox())!;
  expect(row.y).toBeGreaterThanOrEqual(photo.y + photo.height - 1);
  expect(foot.y).toBeGreaterThanOrEqual(row.y + row.height - 1);
};

// Under the photo, where a post has its latest comments: the bold "N likes"
// line, then the comments themselves.
const latestIn = (home: Locator) => home.getByRole("group", { name: "Latest comments" });
// How many likes that line counts (none: no line at all).
const likesUnder = async (home: Locator) => {
  const line = latestIn(home).getByText(/^\d+ likes?$/);
  return (await line.count()) ? Number((await line.innerText()).match(/\d+/)![0]) : 0;
};

test("a quiet home, for an agent going through a link's homes: the Porchcard under the photo says nobody has weighed in, then your take, the facts and the home", async ({
  browser,
}) => {
  test.setTimeout(60_000);
  const agent = await signInAgent(browser, "quincy-quiet@example.com", "Quincy Quiet");
  const pageErrors: string[] = [];
  agent.on("pageerror", (error) => pageErrors.push(error.message));
  const { dashboardUrl } = await createShare(agent, ["88 Heron Bluff"]);
  const home = await linkHomes(agent, dashboardUrl, "SAMPLE-1010", HERON);
  await settled(home);

  // Under the photo, one row: the heart, Comments, Share and Save; at the
  // foot, the comment bar alone. Nothing on the photo. Feedback is in More.
  await rowUnder(home, [`Like ${HERON}`, "Comments", `Share ${HERON}`, `Save ${HERON}`], /…$/);

  // Nobody's said or liked anything: one card for it all, then the rest in order.
  const card = await openScorecard(agent, home);
  await expect(card.getByText("Nothing yet", { exact: true })).toBeVisible();
  // (It's for reading: nothing in it says yes or no to the home. That's the heart and the X on the photo.)
  await expect(card.getByRole("heading", { level: 3 })).toHaveText(["The facts", "About this home"]);
  await expect(card.getByRole("button", { name: /I like it|Not for me|Change your take/ })).toHaveCount(0);
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
  await agent.keyboard.press("Escape");
  await expect(card).toBeHidden();

  // Under the photo, where a post has its latest comments: nothing said yet,
  // said quietly. (No line rolling through who did what: that's gone.)
  await expect(latestIn(home).getByText("No comments yet.")).toBeVisible();
  await expect(home.getByRole("group", { name: "Recent activity" })).toHaveCount(0);

  // The heart on the photo, and the card then counts it.
  await heartOf(home).click();
  await expect(heartOf(home)).toHaveAttribute("aria-pressed", "true");
  const again = await openScorecard(agent, home);
  await expect(again.getByLabel("1 person liked it")).toBeVisible();
  await agent.keyboard.press("Escape");
  await expect(again).toBeHidden();

  // So does the line under the photo, in bold, with nothing to tap: the
  // Porchcard stays in More.
  await expect(latestIn(home).getByText("1 like", { exact: true })).toBeVisible();
  await expect(latestIn(home).getByRole("button")).toHaveCount(0);
  await expectFeedback(agent, home);
  expect(pageErrors).toEqual([]);
});

test("for everyone else there's no Porchcard: nothing in More, and a comment under the photo opens its comments", async ({
  browser,
}) => {
  const page = await page$(browser);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/homes/SAMPLE-1010");
  const home = homeIn(page, HERON);
  await settled(home);

  // Under the photo, one row: the heart, Comments, Share and Save; the
  // comment bar alone at the foot.
  await rowUnder(home, [/^Like 88 Heron Bluff Rd/, /^Comments/, `Share ${HERON}`, `Save ${HERON}`], "Add a comment…");
  await expectFeedback(page, home, false);

  // A like, and the line under the photo counts it. (No line rolling through
  // who did what.)
  const before = await likesUnder(home);
  await heartOf(home).click();
  await joinAs(page, "Hal");
  await expect(heartOf(home)).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => likesUnder(home)).toBe(before + 1);
  await expect(home.getByRole("group", { name: "Recent activity" })).toHaveCount(0);

  // A word, and it's under the photo too, with his name: it opens the
  // comments, which have no way on to a Porchcard.
  const HAL_SAYS = "The porch looks straight out over the meadow.";
  let comments = await openComments(page, home);
  await comments.getByLabel("Add a comment").fill(HAL_SAYS);
  await comments.getByRole("button", { name: "Post", exact: true }).click();
  await expect(comments.getByText(HAL_SAYS)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(comments).toBeHidden();
  const row = latestIn(home).getByRole("button").filter({ hasText: HAL_SAYS });
  await expect(row).toContainText("Hal");
  await row.click();
  comments = commentsOf(home);
  await expect(comments).toBeVisible();
  await expect(comments.getByText("What people think")).toHaveCount(0);
  await expect(comments.getByRole("button", { name: /Feedback/ })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Feedback" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(comments).toBeHidden();
  // Signed in now, as on the page before: still Save, still no Porchcard.
  await page.reload();
  await expect(homeIn(page, HERON).getByRole("button", { name: `Save ${HERON}`, exact: true })).toBeVisible();
  await expectFeedback(page, homeIn(page, HERON), false);

  // Beside the map, a home is just a look: no Porchcard there.
  const map = await page$(browser, { viewport: { width: 1400, height: 900 } });
  await map.goto("/search");
  await expect(map.getByRole("article").first()).toBeInViewport();
  await expect(map.getByRole("button", { name: "Feedback", exact: true })).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("public and private: a link's people, passes and words stay on the link, and the public stays off it", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const LAWN = "the lawn";
  const UMA_SAYS = "Could we see it on Saturday morning?";
  const WES_SAYS = "That front walk is lovely in the evening.";
  const agent = await signInAgent(browser, "sage@example.com", "Sage Agent");
  const { urls, dashboardUrl } = await createShare(agent, ["16420 NE Alder Crest"], ["Uma", "Vic"]);

  // Uma likes it, the front door with it, and says something to the agent.
  const uma = await signedIn(browser);
  await uma.goto(urls.Uma);
  const umaHome = homeIn(uma, ALDER);
  await heartOf(umaHome).click();
  await expect(heartOf(umaHome)).toHaveAttribute("aria-pressed", "true");
  await likeInPhoto(umaHome, "the front door");
  // (She keeps what she does on links to them: Edit profile's switch, off.
  // What's public there by default is lib/link-public's, not this test's.)
  await keepLinksPrivate(uma);
  await uma.goto(urls.Uma);
  const chat = await openComments(uma, umaHome);
  await expect(chat.getByText("Only Sage Agent and people on this link see this.")).toBeVisible();
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
  const vicMore = await passOn(vic, vicHome);
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
  // [P] The public comments: his own words, and nothing of the link's
  // (no name, no pass, none of Uma's words).
  await expect(wesChat).not.toContainText(/\bUma\b|\bVic\b|Saturday/);
  await expect(wesChat).not.toContainText(/pass/i);
  await wes.keyboard.press("Escape");
  await heartOf(wesHome).click();
  await expect(heartOf(wesHome)).toHaveAttribute("aria-pressed", "true");
  // No Porchcard for him: the row under the photo as everyone has it (Share
  // and Save), and what the home is opens from the head above the photo,
  // with nothing about anyone in it.
  await rowUnder(
    wesHome,
    [/^Like 16420 NE Alder Crest Way/, /^Comments/, `Share ${ALDER}`, `Save ${ALDER}`],
    "Add a comment…",
  );
  const wesHead = wesHome.getByRole("button", { name: "About this home", exact: true });
  await expect(wesHead).toHaveAttribute("aria-expanded", "false");
  await wesHead.click();
  const wesAbout = wesHome.getByRole("region", { name: "About this home" });
  await expect(wesAbout).toBeVisible();
  await expect(wesAbout.getByText(/^Listed by /)).toBeVisible();
  await expect(wes.getByRole("dialog", { name: "Feedback" })).toHaveCount(0);
  // [P] Nothing of the link's there, nor anywhere under the photo.
  await expect(wesAbout).not.toContainText(/\bUma\b|\bVic\b|Saturday/);
  await expect(wesHome.locator("[data-words]")).not.toContainText(/\bUma\b|\bVic\b|Saturday|pass/i);
  await wes.keyboard.press("Escape");
  await expect(wesAbout).toBeHidden();
  for (const path of ["/", "/homes/SAMPLE-1011"]) {
    const html = await (await wes.request.get(path)).text();
    expect(html).not.toContain(UMA_SAYS);
    expect(html).not.toMatch(/\bUma\b|\bVic\b/);
  }

  // [P] The Porchcard on the home itself is only ever what a public page may
  // say. Another agent, going through a link of her own with this home on it:
  // likes, counted (Uma's and Vic's front door without their names); Uma's
  // words only as a number; no pass, no dislike, no name from Sage's link.
  const tess = await signInAgent(browser, "tess-other@example.com", "Tess Other");
  const hers = await createShare(tess, ["16420 NE Alder Crest"], ["Jo"]);
  await tess.setViewportSize(IPHONE.viewport);
  const tessHome = await linkHomes(tess, hers.dashboardUrl, "SAMPLE-1011", ALDER);
  await settled(tessHome);
  const card = await openScorecard(tess, tessHome);
  await expect(card.getByLabel("3 people liked it")).toBeVisible();
  await expect(card.getByLabel(/passed$/)).toHaveCount(0);
  await expect(card.getByText("Didn't like", { exact: true })).toHaveCount(0);
  await expect(card.getByText("Didn't like in the photos")).toHaveCount(0);
  await expect(card.getByText("and 1 more comment in private chats")).toBeVisible();
  await expect(card).not.toContainText(/pass/i);
  await expect(card).not.toContainText(/Uma|Vic|Saturday/);
  await expect(card.getByLabel("Activity")).not.toContainText("pass");
  const tessHtml = await (await tess.request.get(tess.url())).text();
  expect(tessHtml).not.toContain(UMA_SAYS);
  expect(tessHtml).not.toMatch(/\bUma\b|\bVic\b/);

  // What people said is in the comments, a tap away (they take the
  // Porchcard's place), and they stay open.
  await card.getByRole("button", { name: "See the 1 comment" }).click();
  const comments = commentsOf(tessHome);
  await expect(comments).toBeVisible();
  await expect(card).toBeHidden();
  await tess.waitForTimeout(600);
  await expect(comments).toBeVisible();
  await expect(comments.getByText(WES_SAYS)).toBeVisible();
  await expect(comments).not.toContainText(/\bUma\b|\bVic\b|Saturday/);
  // ...and back: folded away, Feedback is in More, where it was.
  await comments.getByRole("button", { name: "Hide comments" }).click();
  await expect(comments).toBeHidden();
  await openScorecard(tess, tessHome);
  await expect(card).toBeVisible();

  // A spot in the photos goes to the photo, its card open.
  const front = card.getByRole("button", { name: "Front door, photo 1, 2 likes. Show it on the photo" });
  await front.click();
  await expect(card).toBeHidden();
  const spot = tessHome.getByRole("group", { name: "Front door" });
  await expect(spot).toBeVisible();
  await settle(spot);
  await spot.getByRole("button", { name: "Close" }).click();

  // The head above the photo opens what the home is: all of it, every detail,
  // who listed it; a tap on the head again puts it away. (More has nothing
  // about the home any more.)
  const tessHead = tessHome.getByRole("button", { name: "About this home", exact: true });
  await tessHead.click();
  const tessAbout = tessHome.getByRole("region", { name: "About this home" });
  await expect(tessAbout).toBeVisible();
  await expect(tessHead).toHaveAttribute("aria-expanded", "true");
  await expect(tessAbout.getByText(/^Listed by /)).toBeVisible();
  await expect(tessAbout.getByText("Price per sq ft")).toBeVisible();
  // [P] And nothing of Sage's link in it.
  await expect(tessAbout).not.toContainText(/\bUma\b|\bVic\b|Saturday/);
  await tessHead.click();
  await expect(tessAbout).toBeHidden();
  await expect(tessHead).toHaveAttribute("aria-expanded", "false");
  const tessMore = await openMore(tess, tessHome);
  await expect(tessMore.getByRole("heading", { name: "About this home" })).toHaveCount(0);
  await tess.keyboard.press("Escape");
  await expect(tessMore).toBeHidden();

  // On the link, under the photo: the heart, Comments and Share (the home,
  // not the link; nothing to save, and no Porchcard), and the comment bar
  // alone at the foot.
  await uma.reload();
  await rowUnder(homeIn(uma, ALDER), [/^Like 16420 NE Alder Crest Way/, /^Comments/, `Share ${ALDER}`], /what you think…$/);
  await expectFeedback(uma, homeIn(uma, ALDER), false);
  // [P] What she said is in the link's comments; Wes's public words never are.
  const umaComments = await openComments(uma, homeIn(uma, ALDER));
  await expect(umaComments.getByText(UMA_SAYS)).toBeVisible();
  await expect(umaComments.getByText("What people think")).toHaveCount(0);
  await expect(umaComments).not.toContainText(/\bWes\b|front walk is lovely/);
  const linkHtml = await (await uma.request.get(urls.Uma)).text();
  expect(linkHtml).not.toContain(WES_SAYS);
  expect(linkHtml).not.toMatch(/\bWes\b/);

  // [P] The link's people by name, the pass and the dislike are the agent's,
  // on the link's own page: and nothing from the public page, nor from the
  // other agent's link.
  const theirs = await linkPorchcard(agent, dashboardUrl, ALDER);
  await expect(theirs).toContainText("Only people on this link see this");
  await expect(theirs).toContainText("Uma liked it · Vic passed");
  const people = theirs
    .locator("section")
    .filter({ has: agent.getByRole("heading", { name: "What each person thinks" }) });
  const person = (name: string) => people.getByRole("listitem").filter({ has: agent.getByText(name, { exact: true }) });
  await expect(person("Uma")).toContainText("Liked it");
  await expect(person("Uma")).toContainText("Front door");
  await expect(person("Uma")).toContainText(`“${UMA_SAYS}”`);
  await expect(person("Vic")).toContainText("Passed");
  await expect(person("Vic")).toContainText("Price");
  await expect(theirs.getByRole("button", { name: /^Lawn, photo 1, 1 person didn't like it\./ })).toBeVisible();
  await expect(theirs).not.toContainText(/\bWes\b|front walk is lovely|A buyer|\bJo\b|\bTess\b/);
  // One home on the link: nothing to compare it with.
  await expect(theirs.getByRole("heading", { name: /^Compare/ })).toHaveCount(0);
});

test("on a desktop the home reads as on a phone, in one column: the facts above the photo, the latest comments under it, and for an agent in a link's homes the Porchcard rises from the foot", async ({
  browser,
}) => {
  test.setTimeout(90_000);
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

  // One column down the middle of the screen, read like a post: the facts
  // above the photo in the head, and the head opens the rest of what the
  // home is (who listed it, every detail) over the photo; Escape puts it
  // away. Under the photo, the latest comments themselves, the way a post
  // reads. (No panel beside the photo, no line rolling through who did what.)
  await expect(home.locator("[data-split]")).toHaveCount(0);
  const head = home.locator("[data-home-head]");
  await expect(head.locator("[data-fact='Address']")).toContainText(ALDER);
  const [headBox, photoBox, frame] = [
    (await head.boundingBox())!,
    (await home.getByRole("group", { name: /^Photos of/ }).getByRole("img").first().boundingBox())!,
    (await home.boundingBox())!,
  ];
  expect(headBox.y + headBox.height).toBeLessThanOrEqual(photoBox.y + 1);
  // (One column: 44rem at most, as wide as the photo's space, never under 30rem.)
  expect(headBox.width).toBeLessThanOrEqual(44 * 16 + 1);
  expect(headBox.width).toBeGreaterThanOrEqual(30 * 16 - 1);
  expect(photoBox.width).toBeLessThanOrEqual(headBox.width + 1);
  expect(Math.abs(headBox.x + headBox.width / 2 - (frame.x + frame.width / 2))).toBeLessThan(2);
  expect(Math.abs(photoBox.x + photoBox.width / 2 - (frame.x + frame.width / 2))).toBeLessThan(2);
  const about = home.getByRole("region", { name: "About this home" });
  await expect(about).toBeHidden();
  await expect(home.getByText("Price per sq ft")).toBeHidden();
  const headButton = head.getByRole("button", { name: "About this home", exact: true });
  await expect(headButton).toHaveAttribute("aria-expanded", "false");
  await headButton.click();
  await expect(about).toBeVisible();
  await expect(headButton).toHaveAttribute("aria-expanded", "true");
  await expect(about.getByText("Price per sq ft")).toBeVisible();
  await expect(about.getByText(/^Listed by /)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(about).toBeHidden();
  const words = home.locator("[data-words]");
  const latest = latestIn(words);
  await expect(latest.getByText(/^\d+ likes?$/)).toBeVisible();
  // Whole rows only, in the room the screen leaves under the photo: his
  // word, the newest, with his name, where a row fits; else just the way to
  // all of them.
  await expect(latest.getByRole("button")).not.toHaveCount(0);
  const kofiRow = latest.getByRole("button").filter({ hasText: "The walk up to the door is lovely." });
  if (await kofiRow.count()) await expect(kofiRow).toContainText("Kofi");
  else await expect(latest.getByRole("button", { name: /^View all \d+ comments$/ })).toBeVisible();
  await expect(home.getByRole("group", { name: "Recent activity" })).toHaveCount(0);
  // The row under the photo, the same for everyone: the heart, Comments,
  // Share and Save, no Porchcard; and the comment bar alone at the foot. (On
  // a desktop as on a phone: nothing on the photo.)
  await rowUnder(
    home,
    [/^Like 16420 NE Alder Crest Way/, /^Comments, \d+$/, `Share ${ALDER}`, `Save ${ALDER}`],
    "Add a comment…",
  );
  await expect(words.getByRole("button", { name: `Share ${ALDER}`, exact: true })).toHaveAttribute("title", "Share");
  await words.getByRole("button", { name: /^Comments, \d+$/ }).click();
  const said = commentsOf(home);
  await expect(commentIn(said, "Kofi", "The walk up to the door is lovely.")).toBeVisible();
  // The comments open where the latest were, over the photo, with the way
  // back at their head: no dialog, no tabs, no Porchcard to turn to.
  await expect(page.getByRole("dialog", { name: "Comments" })).toHaveCount(0);
  await expect(said.getByRole("tablist")).toHaveCount(0);
  await expect(said.getByRole("button", { name: "Hide comments" })).toBeVisible();
  await expect(home.locator("[data-actions]")).toBeHidden();
  // (A sheet from the foot, up past the middle of where the photo was.)
  await expect.poll(async () => (await said.boundingBox())!.y).toBeLessThan(photoBox.y + photoBox.height / 2);
  await page.keyboard.press("Escape");
  await expect(said).toBeHidden();
  await expect(home.locator("[data-actions]")).toBeVisible();
  await expectFeedback(page, home, false);

  // An agent, going through a link's homes with this one on it: what people
  // think is the Porchcard, from More, risen from the
  // foot of the screen as on a phone; what the home is, it leaves to the head.
  const phone = await signInAgent(browser, "dale-desktop@example.com", "Dale Desktop");
  const { dashboardUrl } = await createShare(phone, ["16420 NE Alder Crest"]);
  const agent = await page$(browser, { ...DESKTOP, storageState: await phone.context().storageState() });
  const pageErrors: string[] = [];
  agent.on("pageerror", (error) => pageErrors.push(error.message));
  const theirs = await linkHomes(agent, dashboardUrl, "SAMPLE-1011", ALDER);
  await settled(theirs);
  const card = await openScorecard(agent, theirs);
  await expect(card.getByLabel(/^\d+ (person|people) liked it$/)).toBeVisible();
  // The whole card, facts and all, as on a phone (no panel beside the photo to leave them to).
  await expect(card.getByRole("heading", { name: "The facts" })).toHaveCount(1);
  // Over the home, from the foot, and no tabs: the comments are under the photo.
  expect(await card.evaluate((el) => el.matches(":modal"))).toBe(true);
  // (Once it has slid up.)
  await expect
    .poll(async () => {
      const box = (await card.boundingBox())!;
      return Math.round(box.y + box.height);
    })
    .toBe(DESKTOP.viewport.height);
  await expect(card.getByRole("tablist")).toHaveCount(0);
  await agent.keyboard.press("Escape");
  await expect(card).toBeHidden();

  // The comments from the keyboard: the Porchcard gives way to them, under the photo.
  await openScorecard(agent, theirs);
  await card.getByRole("button", { name: /^See the \d+ comments?$/ }).press("Enter");
  const comments = commentsOf(theirs);
  await expect(comments).toBeVisible();
  await expect(card).toBeHidden();
  await expect(agent.getByRole("dialog")).toHaveCount(0);
  await agent.keyboard.press("Escape");
  await expect(comments).toBeHidden();
  await openScorecard(agent, theirs);
  // A spot in the photos goes to the photo, its card open, as on a phone.
  const row = card.getByRole("button", { name: /^Front door, photo 1, / });
  await row.press("Enter");
  await expect(card).toBeHidden();
  const spot = theirs.getByRole("group", { name: "Front door" });
  await expect(spot).toBeVisible();
  await settle(spot);
  await spot.getByRole("button", { name: "Close" }).click();
  await expect(spot).toBeHidden();
  expect(pageErrors).toEqual([]);
});

test("on a link with more than one home, the agent's Porchcard sets this one beside the others, from the link alone", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const QUILLAN = "1204 Quillan St SE";
  const LAKEVIEW = "5902 Lakeview Terrace SE";
  const agent = await signInAgent(browser, "cleo-compare@example.com", "Cleo Compare");
  const { urls, dashboardUrl } = await createShare(agent, ["1204 Quillan", "5902 Lakeview"], ["Ana", "Bo"]);
  // (Each tap shows at once and saves behind it: wait for each to be saved,
  // not just shown, since another page reads them straight after.)
  const pass = async (home: Locator, aspect: string) => {
    const page = home.page();
    const saved = () =>
      page.waitForResponse((res) => res.request().method() === "POST" && Boolean(res.request().headers()["next-action"]));
    // Not for me, in More (which goes on to the next home), then back on it, and More to say why.
    let save = saved();
    await notForMe(await openMore(page, home)).click();
    await save;
    await home.scrollIntoViewIfNeeded();
    const more = await openMore(page, home);
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
  await pass(homeIn(zed, LAKEVIEW), "Price");
  await zed.keyboard.press("Escape");

  // Ana likes the first for where it is, and passes on the second's price.
  const ana = await signedIn(browser);
  await ana.goto(urls.Ana);
  const quillan = homeIn(ana, QUILLAN);
  await heartOf(quillan).click();
  await expect(heartOf(quillan)).toHaveAttribute("aria-pressed", "true");
  const more = await openMore(ana, quillan);
  const likes = more.getByRole("group", { name: "What else do you like?" });
  await likes.getByRole("button", { name: "Location" }).click();
  await expect(likes.getByRole("button", { name: "Location" })).toHaveAttribute("aria-pressed", "true");
  await ana.keyboard.press("Escape");
  await expect(more).toBeHidden();
  await pass(homeIn(ana, LAKEVIEW), "Price");
  await ana.keyboard.press("Escape");
  await expect(more).toBeHidden();
  // (No Porchcard for her on the link: it's the agent's.)
  await expectFeedback(ana, homeIn(ana, LAKEVIEW), false);

  // Bo passes on the first, for its price too.
  const bo = await signedIn(browser);
  await bo.goto(urls.Bo);
  await pass(homeIn(bo, QUILLAN), "Price");

  // The first home's Porchcard, on the agent's page for the link: each home a
  // column, this one first; whether people liked it, then each aspect anyone
  // has a view on. (Once Bo's pass is in: the wait for it above can be met by
  // another save on his link, such as the time on the home.)
  const price = (card: Locator) =>
    card.getByRole("row").filter({ has: agent.getByRole("rowheader", { name: "Price", exact: true }) }).getByRole("cell");
  await expect(async () => {
    const opened = await linkPorchcard(agent, dashboardUrl, QUILLAN);
    await expect(price(opened).first()).toHaveText(/^\s*1 pass$/, { timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  const card = agent.getByRole("dialog", { name: "Feedback" });
  await expect(card.getByRole("heading", { name: "Compare with the other home" })).toBeVisible();
  const table = card.getByRole("table", { name: /^This home beside the other home/ });
  await expect(table.getByRole("columnheader")).toHaveText(["Aspect", `This home, ${QUILLAN}`, LAKEVIEW]);
  const cells = (label: string) =>
    table.getByRole("row").filter({ has: agent.getByRole("rowheader", { name: label, exact: true }) }).getByRole("cell");
  // [P] From the link alone: Zed's heart, front door and pass in public count
  // for nothing here (no second like, no Exterior row, no second pass), and
  // nobody from the public is named.
  await expect(cells("Overall")).toHaveText([/^1 like 1 pass$/, /^\s*1 pass$/]);
  await expect(cells("Location")).toHaveText([/^1 like\s*$/, /None$/]);
  await expect(cells("Price")).toHaveText([/^\s*1 pass$/, /^\s*1 pass$/]);
  await expect(table.getByRole("rowheader")).toHaveText(["Overall", "Price", "Location"]);
  await expect(card).not.toContainText(/\bZed\b/);

  // Ana changes her mind on the link: it counts, in this home's column.
  const changed = ana.waitForResponse(
    (res) => res.request().method() === "POST" && Boolean(res.request().headers()["next-action"]),
  );
  await notForMe(await openMore(ana, homeIn(ana, QUILLAN))).click();
  await changed;
  await expect(async () => {
    const again = await linkPorchcard(agent, dashboardUrl, QUILLAN);
    await expect(
      again.getByRole("row").filter({ has: agent.getByRole("rowheader", { name: "Overall", exact: true }) }).getByRole("cell").first(),
    ).toHaveText(/^\s*2 passes$/, { timeout: 1000 });
  }).toPass({ timeout: 20_000 });

  // Going through the link's homes, the Porchcard on a home is what everyone
  // thinks of it, as on a page of its own: no link to compare within.
  const theirs = await linkHomes(agent, dashboardUrl, "SAMPLE-1009", QUILLAN);
  const card2 = await openScorecard(agent, theirs);
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

test("a spot on nothing named reads as where it is, as the Porchcard says it: outside, in the kitchen, or in photo 3", () => {
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
