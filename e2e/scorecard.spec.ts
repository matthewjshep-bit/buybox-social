import { expect, test, type Browser, type Locator } from "@playwright/test";
import { createShare, heartOf, homeIn, joinAs, likeInPhoto, openComments, openMore, openScorecard, pick, settle, signInAgent } from "./helpers";

// The Scorecard: everything people think of a home in one place, from the
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

test("a quiet home: the rail's Scorecard says nobody has weighed in, then your take, the facts and the home", async ({
  browser,
}) => {
  const page = await page$(browser);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/homes/SAMPLE-1010");
  const home = homeIn(page, HERON);
  await settled(home);

  // Like, Comments, Scorecard, Share, More, down the rail.
  const rail = home.locator("[data-keep-clear]").filter({ has: page.getByRole("button", { name: /^Like (?!the )/ }) });
  const names = [/^Like 88 Heron Bluff Rd/, /^Comments/, "Scorecard", "Share", "More options"];
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

  // The line above the price, about the home as a whole, opens the Scorecard.
  const line = home.getByRole("group", { name: "Recent activity" }).getByRole("button").last();
  await expect(line).toHaveAccessibleName(/^You liked this\. .+\. See the scorecard\.$/);
  await line.click();
  await expect(page.getByRole("dialog", { name: "Scorecard" })).toBeVisible();
  await page.keyboard.press("Escape");

  // Beside the map, a home is just a look: no Scorecard there.
  const map = await page$(browser, { viewport: { width: 1400, height: 900 } });
  await map.goto("/search");
  await expect(map.getByRole("article").first()).toBeInViewport();
  await expect(map.getByRole("button", { name: "Scorecard", exact: true })).toHaveCount(0);
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
  const uma = await page$(browser);
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
  const vic = await page$(browser);
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

  // The public Scorecard: likes, counted (Uma's and Vic's front door without
  // their names); Uma's words only as a number; no pass, no dislike, no name
  // from the link.
  const card = await openScorecard(wes, wesHome);
  await expect(card.getByLabel("3 people liked it")).toBeVisible();
  await expect(card.getByLabel(/passed$/)).toHaveCount(0);
  await expect(card.getByText("People pass on")).toHaveCount(0);
  await expect(card.getByText("Gave people pause")).toHaveCount(0);
  await expect(card.getByText("and 1 in private chats")).toBeVisible();
  await expect(card).not.toContainText(/pass/i);
  await expect(card).not.toContainText(/Uma|Vic|Saturday/);
  await expect(card.getByText(WES_SAYS)).toBeVisible();
  await expect(card.getByLabel("Activity")).not.toContainText("pass");
  for (const path of ["/", "/homes/SAMPLE-1011"]) {
    const html = await (await wes.request.get(path)).text();
    expect(html).not.toContain(UMA_SAYS);
    expect(html).not.toMatch(/\bUma\b|\bVic\b/);
  }

  // "See all" opens the comments, and they stay open.
  await card.getByRole("button", { name: "See all 1 comment" }).click();
  const comments = wes.getByRole("dialog", { name: "Comments" });
  await expect(comments).toBeVisible();
  await wes.waitForTimeout(600);
  await expect(comments).toBeVisible();
  await expect(comments.getByText(WES_SAYS)).toBeVisible();
  // ...and back: what everyone thinks.
  await comments.getByRole("button", { name: /^See the scorecard/ }).click();
  await expect(card).toBeVisible();

  // A spot in the photos goes to the photo, its card open.
  const front = card.getByRole("button", { name: "Front door, photo 1, 2 likes. Show it on the photo" });
  await front.click();
  await expect(card).toBeHidden();
  const spot = wesHome.getByRole("group", { name: "Front door" });
  await expect(spot).toBeVisible();
  await settle(spot);
  await spot.getByRole("button", { name: "Close" }).click();

  // The description's "more" opens the Scorecard at "About this home".
  await wesHome.getByRole("button", { name: "more", exact: true }).click();
  await expect(card).toBeVisible();
  await expect(card.getByRole("heading", { name: "About this home" })).toBeInViewport();
  await wes.keyboard.press("Escape");

  // On the link: names, where they agree, the pass and the dislike, and
  // nothing from the public page.
  await uma.reload();
  const umaCard = await openScorecard(uma, homeIn(uma, ALDER));
  await expect(umaCard.getByText("From the people on this link · only they and Sage Agent see this")).toBeVisible();
  await expect(umaCard).toContainText("You liked it · Vic passed");
  await expect(umaCard.getByRole("heading", { name: "Where you agree" })).toBeVisible();
  await expect(umaCard).toContainText("Both like: Exterior · Front door");
  await expect(umaCard.getByText("People pass on")).toBeVisible();
  await expect(umaCard.getByText("Price 1")).toBeVisible();
  await expect(umaCard.getByText("Gave people pause")).toBeVisible();
  await expect(umaCard.getByRole("button", { name: /^Lawn, photo 1, 1 person didn't like it\./ })).toBeVisible();
  await expect(umaCard.getByText(UMA_SAYS)).toBeVisible();
  await expect(umaCard).not.toContainText(/\bWes\b|front walk is lovely/);
  await expect(umaCard.getByRole("button", { name: "Message Sage" })).toBeVisible();
  const linkHtml = await (await uma.request.get(urls.Uma)).text();
  expect(linkHtml).not.toContain(WES_SAYS);
  expect(linkHtml).not.toMatch(/\bWes\b/);
});

test("on a desktop, the Scorecard is a tab beside the comments, and the panel says what people think", async ({
  browser,
}) => {
  const page = await page$(browser, DESKTOP);
  await page.goto("/homes/SAMPLE-1011");
  const home = homeIn(page, ALDER);
  await settled(home);

  // In the white panel, in brief: how people feel and what they say, and the way in.
  const brief = home.getByRole("heading", { name: "What people think" }).locator("..");
  await expect(brief).toBeVisible();
  await expect(brief.getByLabel("3 people liked it")).toBeVisible();
  await brief.getByRole("button", { name: "Open the scorecard" }).click();
  const card = page.getByRole("dialog", { name: "Scorecard" });
  await expect(card).toBeVisible();
  // Beside the photo, not over it, and the tab that's showing has the keyboard.
  expect(await card.evaluate((el) => el.matches(":modal"))).toBe(false);
  const tabs = card.getByRole("tablist");
  await expect(tabs.getByRole("tab", { name: "Scorecard" })).toHaveAttribute("aria-selected", "true");
  await expect(tabs.getByRole("tab", { name: "Scorecard" })).toBeFocused();

  // The tabs switch in place: one panel, its name following the tab.
  await tabs.getByRole("tab", { name: /^Comments/ }).click();
  const comments = page.getByRole("dialog", { name: "Comments" });
  await expect(comments).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(comments.getByRole("tab", { name: /^Comments/ })).toHaveAttribute("aria-selected", "true");
  await comments.getByRole("tab", { name: /^Comments/ }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(card).toBeVisible();
  await expect(card.getByRole("tab", { name: "Scorecard" })).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(comments).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(comments).toBeHidden();

  // Who liked it, in the panel, opens it too.
  await home.getByRole("button", { name: /^Liked by .+\. See the scorecard$/ }).click();
  await expect(card).toBeVisible();
  // A spot in the photos: the photo shows it, the Scorecard stays.
  await card.getByRole("button", { name: /^Front door, photo 1, / }).click();
  await expect(home.getByRole("group", { name: "Front door" })).toBeVisible();
  await expect(card).toBeVisible();
});
