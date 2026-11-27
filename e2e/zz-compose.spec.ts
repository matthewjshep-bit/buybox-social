// (Named to run last: a post leaves its words on each home's public
// conversation, and earlier specs count those homes' comments exactly.)
// The one box for saying something and sending homes, as a post is written
// on LinkedIn or Facebook: words alone are a post; several homes are one
// post, a card with a small carousel of them, the facts and the bar under it
// following the home showing.
import { expect, test } from "@playwright/test";
import { commentIn, homeIn, openComments, pickHome, signUpBuyer } from "./helpers";

const CORBEL = "812 N Corbel St";
const FERNHOLLOW = "96 Fernhollow Ln";

test("words alone are a post: on your page and in a follower's feed, with no home, no price and no bar", async ({ browser }) => {
  test.setTimeout(120_000);
  const WORDS = "Open houses all weekend. Who's coming with me?";
  const tess = await signUpBuyer(browser, "tess.textpost@example.com", "Tess Textpost");
  await tess.goto("/people/me");
  await tess.waitForURL(/\/people\/[\w-]+$/);
  const tessPage = new URL(tess.url()).pathname;

  // Una follows her.
  const una = await signUpBuyer(browser, "una.textfollows@example.com", "Una Textfollows");
  await una.goto(tessPage);
  await una.getByRole("button", { name: "Follow Tess" }).click();
  await expect(una.getByRole("button", { name: /^Following/ })).toBeVisible();

  // Tess says something, with no home, and posts it.
  await tess.getByRole("button", { name: /^Share homes/ }).click();
  const form = tess.locator("form[data-compose]");
  await expect(form.getByRole("heading", { level: 2, name: "Share homes" })).toBeVisible();
  await expect(form.getByRole("button", { name: "Who sees this: Public" })).toBeVisible();
  await form.getByRole("textbox", { name: "Say something" }).fill(WORDS);
  await expect(form.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
  await form.getByRole("button", { name: "Post", exact: true }).click();
  await expect(tess.getByRole("status").filter({ hasText: "Posted" })).toBeVisible();
  await expect(form).toHaveCount(0);

  // On her page: "You posted", the words, and nothing of a home: no price,
  // no heart, no comments, nothing to open full screen.
  const card = tess.locator("main li[data-post]").filter({ hasText: WORDS }).first();
  await expect(card.locator("[data-card-line]")).toHaveText(/^You posted\s·\s/);
  await expect(card).not.toContainText("$");
  await expect(card.getByRole("button", { name: /^Like/ })).toHaveCount(0);
  await expect(card.getByRole("button", { name: /^Comments/ })).toHaveCount(0);
  await expect(card.locator("[data-card-link]")).toHaveCount(0);

  // In Una's feed, the same, as Tess's.
  await una.goto("/");
  const inFeed = una.getByRole("region", { name: "Your feed" }).locator("li[data-post]").filter({ hasText: WORDS }).first();
  await expect(inFeed.locator("[data-card-line]")).toHaveText(/^Tess posted\s·\s/);
  await expect(inFeed).not.toContainText("$");
  await expect(inFeed.getByRole("button", { name: /^Like/ })).toHaveCount(0);
});

test("two homes in one post: a carousel named for the author, each home on its slide, the facts and the heart under it following the home showing; the words on each home's thread", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const WORDS = "Two to see this Saturday. Thoughts?";
  const nadia = await signUpBuyer(browser, "nadia.twohomes@example.com", "Nadia Twohomes");
  await nadia.goto("/people/me");
  await nadia.waitForURL(/\/people\/[\w-]+$/);

  await nadia.getByRole("button", { name: /^Share homes/ }).click();
  const form = nadia.locator("form[data-compose]");
  await expect(form.getByRole("heading", { level: 2, name: "Share homes" })).toBeVisible();
  await pickHome(nadia, CORBEL);
  await pickHome(nadia, FERNHOLLOW);
  await expect(form.getByRole("list", { name: "Picked homes" }).getByRole("listitem")).toHaveCount(2);
  await form.getByRole("textbox", { name: "Say something" }).fill(WORDS);
  await form.getByRole("button", { name: "Post", exact: true }).click();
  await expect(nadia.getByRole("status").filter({ hasText: "Posted" })).toBeVisible();

  // One card: the two homes to swipe through, named for her.
  const card = nadia.locator("main li[data-post]").filter({ hasText: WORDS }).first();
  await expect(card.locator("[data-card-line]")).toHaveText(/^You posted 2 homes\s·\s/);
  await expect(card).toContainText(WORDS);
  const carousel = card.getByRole("group", { name: "Homes in Nadia's post" });
  await expect(carousel).toBeVisible();
  const first = carousel.getByRole("group", { name: `${CORBEL}, 1 of 2` });
  const second = carousel.getByRole("group", { name: `${FERNHOLLOW}, 2 of 2` });
  await expect(first).toBeVisible();
  await expect(second).toHaveCount(1);
  // Each home named on its photo: the street alone.
  await expect(first).toHaveText(CORBEL);
  await expect(second).toHaveText(FERNHOLLOW);
  await expect(carousel.locator("[data-home-count]")).toHaveText("1 of 2");
  await expect(carousel.getByRole("button", { name: "Next home" })).toHaveCount(1);
  await expect(carousel.getByRole("button", { name: "Previous home" })).toHaveCount(1);

  // The facts and the bar are the first home's.
  const facts = card.locator("[data-card-link]");
  await expect(facts).toContainText("$724,900");
  await expect(facts).toContainText(CORBEL);
  await expect(facts).toHaveAttribute("href", /^\/reel\?from=[\w-]+&home=SAMPLE-1003$/);
  await expect(card.getByRole("button", { name: new RegExp(`^Like ${CORBEL}`) })).toBeVisible();
  await expect(card.getByRole("button", { name: new RegExp(`^Like ${FERNHOLLOW}`) })).toHaveCount(0);

  // Swiped to the second home, they follow it.
  await carousel.locator(":scope > div").first().evaluate((el) => el.scrollTo({ left: el.clientWidth }));
  await expect(carousel.locator("[data-home-count]")).toHaveText("2 of 2");
  await expect(facts).toContainText(FERNHOLLOW);
  await expect(facts).toContainText("$839,000");
  await expect(facts).toHaveAttribute("href", /^\/reel\?from=[\w-]+&home=SAMPLE-1004$/);
  await expect(card.getByRole("button", { name: new RegExp(`^Like ${FERNHOLLOW}`) })).toBeVisible();
  await expect(card.getByRole("button", { name: new RegExp(`^Like ${CORBEL}`) })).toHaveCount(0);

  // Her words are on each home's public thread, as a comment of hers.
  await nadia.goto("/homes/SAMPLE-1003");
  const corbel = homeIn(nadia, CORBEL);
  await expect(corbel).toBeVisible();
  const thread = await openComments(nadia, corbel);
  await expect(commentIn(thread, "Nadia", WORDS)).toBeVisible();
});
