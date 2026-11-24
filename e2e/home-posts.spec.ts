// A post: from your own page, a few words about a home you pick there, by
// its address or MLS number. It's on your page as a post, in your followers'
// feeds (where, as on Facebook, they can answer right under it, their face
// beside the box), and it opens the homes full screen.
import { expect, test } from "@playwright/test";
import { commentIn, signUpBuyer } from "./helpers";

const LARKMOOR = "4127 Larkmoor Ave NE";
const WORDS = "Drove by this one today. That porch!";

test("someone posts about a home from their page; a follower sees it in their feed and comments right under it", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const pia = await signUpBuyer(browser, "pia.posts@example.com", "Pia Posts");
  await pia.goto("/people/me");
  await pia.waitForURL(/\/people\/[\w-]+$/);
  const piaPage = new URL(pia.url()).pathname;

  // Ravi follows her.
  const ravi = await signUpBuyer(browser, "ravi.posts@example.com", "Ravi Posts");
  await ravi.goto(piaPage);
  await ravi.getByRole("button", { name: "Follow Pia" }).click();
  await expect(ravi.getByRole("button", { name: /^Following/ })).toBeVisible();

  // Pia finds the home by its street and city, and says what she thinks.
  await pia.getByRole("button", { name: "Post or save a home…" }).click();
  const form = pia.getByRole("form", { name: "Post or save a home" });
  await form.getByRole("searchbox", { name: "Which home? Address, city, ZIP or MLS number" }).fill(`${LARKMOOR}, Seattle`);
  await form.getByRole("list", { name: "Homes" }).getByRole("button", { name: new RegExp(LARKMOOR) }).click();
  await expect(form).toContainText(LARKMOOR);
  // Save is there beside Post (it keeps the home for her alone, with nothing
  // said: e2e/saved-homes.spec.ts); Post waits for something to say.
  await expect(form.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  await expect(form.getByRole("button", { name: "Post", exact: true })).toBeDisabled();
  await form.getByRole("textbox", { name: "What do you think of it?" }).fill(WORDS);
  await form.getByRole("button", { name: "Post", exact: true }).click();
  await expect(pia.getByRole("status").filter({ hasText: "Posted" })).toBeVisible();

  // On her page, first: a post, with what she said.
  const card = pia.locator("main li").filter({ hasText: WORDS }).first();
  await expect(card).toContainText("You posted about this home");
  await expect(card).toContainText(LARKMOOR);

  // Anyone on her page sees it as hers, and it opens the homes full screen.
  await ravi.goto(piaPage);
  const hers = ravi.locator("main li").filter({ hasText: WORDS }).first();
  await expect(hers).toContainText("Pia posted about this home");
  await expect(hers.locator("[data-card-link]")).toHaveAttribute("href", /^\/reel\?from=[\w-]+&home=SAMPLE-/);
  // Not someone else's page: no box to post on it.
  await expect(ravi.getByRole("button", { name: "Post or save a home…" })).toHaveCount(0);

  // Ravi's feed has it, with one small bar under it: the home's likes and
  // how many comments it has (her post is one). No box until he asks: the
  // bubble unfurls the comments right there, with the box under them, and
  // what he says joins the thread. Tapped again, they fold away.
  await ravi.goto("/");
  const inFeed = ravi.getByRole("listitem").filter({ hasText: WORDS }).first();
  await expect(inFeed).toContainText(LARKMOOR);
  await expect(inFeed.getByRole("textbox")).toHaveCount(0);
  const bubble = inFeed.getByRole("button", { name: /^Comments, \d+$/ });
  await expect(bubble).toHaveAttribute("aria-expanded", "false");
  // (However many others said something about it, in a run with other tests.)
  const before = Number((await bubble.getAttribute("aria-label"))!.replace(/\D/g, ""));
  await bubble.click();
  const thread = inFeed.getByRole("region", { name: "Comments" });
  await expect(thread).toBeVisible();
  await expect(commentIn(thread, "Pia", WORDS)).toBeVisible();
  const box = thread.getByRole("textbox", { name: "Add a comment" });
  await box.fill("Love a porch like that.");
  await box.press("Enter");
  await expect(commentIn(thread, "Ravi", "Love a porch like that.")).toBeVisible();
  await expect(box).toHaveValue("");
  const after = inFeed.getByRole("button", { name: `Comments, ${before + 1}` });
  await expect(after).toHaveAttribute("aria-expanded", "true");
  await after.click();
  await expect(thread).toHaveCount(0);
  await expect(ravi).toHaveURL(/\/$/);
});
