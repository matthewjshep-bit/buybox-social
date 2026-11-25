// The comments under a card in a feed (a person's page, Home's "Your feed"),
// as LinkedIn has them: a few at a time, the ones with something to them
// first (an agent's, someone you follow, one that's been answered or liked,
// one about a spot), "See N more comments" for the rest, the time right
// after each name, and what you've just said at the top whatever its rank.
// (The thread on the home full screen is unchanged: every comment, the
// agent's first, then the newest.)
import { expect, test, type Locator, type Page } from "@playwright/test";
import { homeIn, openComments, signInAgent, signUpBuyer } from "./helpers";

// A home no other test says much about.
const KEY = "SAMPLE-1012";
const FOXGLOVE = "24611 SE Foxglove Pl";

// Who says what. (First names alone: the thread names people by their first name.)
const SAID = {
  Avery: "Priced to move: the garage alone is worth a look.",
  Bea: "Too far out for us, honestly.",
  Cal: "Is that a three-car garage? Looks huge in the photos.",
  Dev: "Nice lot, not sure about the HOA.",
  Eli: "We toured it Sunday. Quiet street, big kitchen.",
  Fay: "The backyard faces west, so evening sun.",
} as const;
const REPLY = "Yes, three cars and room for a workbench.";
const MINE = "Thanks all, booking a tour this week.";

// Says a word about the home, full screen, the way anyone does.
async function sayOnHome(page: Page, words: string) {
  await page.goto(`/homes/${KEY}`);
  const thread = await openComments(page, homeIn(page, FOXGLOVE));
  await thread.getByLabel("Add a comment").fill(words);
  await thread.getByRole("button", { name: "Post", exact: true }).click();
  await expect(thread.getByText(words)).toBeVisible();
  // (Posted, not just shown: the box empties once it's saved.)
  await expect(thread.getByLabel("Add a comment")).toHaveValue("");
  return thread;
}

// The first line of a comment's row under a card: who said it (and that
// they're an agent), then when, with the words on the line under it.
const firstLineOf = (row: Locator) => row.locator(":scope > div > p").first().locator(":scope > span").first();

test("under a card, three comments lead by relevance, See more shows the rest, each with its time by the name, and yours goes to the top", async ({
  browser,
}) => {
  test.setTimeout(300_000);

  // An agent and five buyers each say one thing about the home; Fay answers Cal.
  const agent = await signInAgent(browser, "avery.feedc@example.com", "Avery Lists");
  await sayOnHome(agent, SAID.Avery);
  const bea = await signUpBuyer(browser, "bea.feedc@example.com", "Bea");
  await sayOnHome(bea, SAID.Bea);
  const cal = await signUpBuyer(browser, "cal.feedc@example.com", "Cal");
  await sayOnHome(cal, SAID.Cal);
  const dev = await signUpBuyer(browser, "dev.feedc@example.com", "Dev");
  await sayOnHome(dev, SAID.Dev);
  const eli = await signUpBuyer(browser, "eli.feedc@example.com", "Eli");
  await sayOnHome(eli, SAID.Eli);
  // (Eli's own page, where his comment is a card with the bar under it.)
  await eli.goto("/people/me");
  await eli.waitForURL(/\/people\/[0-9a-f-]{36}$/);
  const eliPage = new URL(eli.url()).pathname;
  const fay = await signUpBuyer(browser, "fay.feedc@example.com", "Fay");
  const fays = await sayOnHome(fay, SAID.Fay);
  await fays.getByRole("button", { name: "Reply to Cal", exact: true }).click();
  const field = fays.getByLabel("Reply to Cal");
  await expect(field).toBeFocused();
  await field.fill(REPLY);
  await fays.getByRole("button", { name: "Post", exact: true }).click();
  await expect(fays.getByRole("list", { name: "Replies to Cal" }).getByText(REPLY)).toBeVisible();

  // Gus follows Eli, and reads the home's comments under Eli's card on his page.
  const gus = await signUpBuyer(browser, "gus.feedc@example.com", "Gus");
  await gus.goto(eliPage);
  await gus.getByRole("button", { name: "Follow Eli" }).click();
  await expect(gus.getByRole("button", { name: "Following Eli" })).toHaveAttribute("aria-pressed", "true");
  await gus.goto(eliPage);
  const card = gus.getByRole("listitem").filter({ has: gus.getByRole("link", { name: `${FOXGLOVE}: commented on this home` }) });
  await expect(card).toBeVisible();
  // Seven comments: six, and Fay's answer among them.
  const bubble = card.getByRole("button", { name: /^Comments(, \d+)?$/ });
  await expect(bubble).toHaveAccessibleName("Comments, 7");
  await bubble.click();
  const thread = card.getByRole("region", { name: "Comments" });
  await expect(thread).toBeVisible();
  const list = thread.locator("ul[data-comment-list]");
  const rows = list.locator(":scope > li[data-comment]");

  // Three to start: the agent's, then Eli's (Gus follows him), then Cal's
  // (it was answered). The three with nothing to them wait behind See more.
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText(SAID.Avery);
  await expect(rows.nth(0)).toContainText("Agent");
  await expect(rows.nth(1)).toContainText(SAID.Eli);
  await expect(rows.nth(2)).toContainText(SAID.Cal);
  await expect(rows.nth(2).getByRole("button", { name: "View 1 reply" })).toBeVisible();
  for (const words of [SAID.Bea, SAID.Dev, SAID.Fay]) await expect(thread).not.toContainText(words);
  const more = thread.getByRole("button", { name: "See 3 more comments" });
  await expect(more).toBeVisible();
  expect((await more.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  // See more: all six, the rest newest first, and nothing more to see.
  await more.click();
  await expect(rows).toHaveCount(6);
  await expect(rows.nth(3)).toContainText(SAID.Fay);
  await expect(rows.nth(4)).toContainText(SAID.Dev);
  await expect(rows.nth(5)).toContainText(SAID.Bea);
  await expect(thread.getByRole("button", { name: /^See \d+ more comments?$/ })).toHaveCount(0);
  // Fay's answer stays folded under Cal's.
  await expect(thread.getByText(REPLY)).toHaveCount(0);

  // Each row: the name, then the time right after it on the same line; the
  // words on the line under.
  const order = ["Avery", "Eli", "Cal", "Fay", "Dev", "Bea"] as const;
  for (const [i, who] of order.entries()) {
    const line = firstLineOf(rows.nth(i));
    await expect(line.locator("time")).toHaveCount(1);
    await expect(line).toHaveText(new RegExp(`^${who}\\s*(Agent)?\\s*·\\s*(just now|\\d+[mhd])$`));
    const [name, time] = [(await line.locator("a, b").first().boundingBox())!, (await line.locator("time").boundingBox())!];
    expect(time.y).toBeLessThan(name.y + name.height);
    expect(time.x).toBeGreaterThan(name.x);
    // (The words are under it, not on the same line.)
    const words = (await rows.nth(i).getByText(SAID[who]).boundingBox())!;
    expect(words.y).toBeGreaterThanOrEqual(name.y + name.height - 1);
  }
  // Names go to their pages; an agent's is marked.
  await expect(firstLineOf(rows.nth(1)).getByRole("link", { name: "Eli" })).toHaveAttribute("href", eliPage);

  // Gus says something: it's the first row, with no likes or answers to
  // earn the place, and the bubble counts it.
  const box = thread.getByRole("textbox", { name: "Add a comment" });
  await box.fill(MINE);
  await box.press("Enter");
  await expect(rows.first()).toContainText(MINE);
  await expect(rows.first()).toContainText("Gus");
  await expect(rows).toHaveCount(7);
  await expect(rows.nth(1)).toContainText(SAID.Avery);
  await expect(box).toHaveValue("");
  await expect(card.getByRole("button", { name: "Comments, 8" })).toHaveAttribute("aria-expanded", "true");
});
