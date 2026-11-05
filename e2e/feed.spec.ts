import { expect, test, type Page } from "@playwright/test";
import {
  commentIn,
  createShare,
  heartOf,
  homeIn,
  likeInPhoto,
  openComments,
  openMore,
  photoList,
  pick,
  scrollToEnd,
  signInAgent,
  signUpBuyer,
} from "./helpers";

async function expectLogoGoesHome(page: Page) {
  const logo = page.getByRole("link", { name: "BuyBox Social" });
  await expect(logo).toHaveAttribute("href", "/");
}

test("the feed: full-screen homes, a heart, comments in a sheet, endless scroll, and the logo on every page", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  // An agent's client likes a home, and the evergreens in its photo, on a private link.
  const agent = await signInAgent(browser, "fran@example.com", "Fran Agent");
  const { url } = await createShare(agent, ["96 Fernhollow"], ["Toby"]);
  const client = await (await browser.newContext()).newPage();
  await client.goto(url);
  await expect(client.getByRole("heading", { level: 1 })).toHaveText("Toby, I picked this home for you");
  const clientHome = homeIn(client, "96 Fernhollow Ln");
  await heartOf(clientHome).click();
  await expect(heartOf(clientHome)).toHaveAttribute("aria-pressed", "true");
  await likeInPhoto(clientHome, "the evergreens");

  // That agent's feed names their own client, and says what they liked.
  await agent.goto("/");
  await expect(homeIn(agent, "96 Fernhollow Ln")).toContainText("Toby, your client, liked the evergreens");

  // A buyer signs up and sees the same activity anonymously.
  const buyer = await signUpBuyer(browser, "bea@example.com", "Bea Buyer");
  const pageErrors: string[] = [];
  buyer.on("pageerror", (error) => pageErrors.push(error.message));
  const post = homeIn(buyer, "96 Fernhollow Ln");
  await expect(post).toContainText("A buyer liked the evergreens");
  await expect(post).toContainText("$839,000");
  await expect(post).toContainText("3 beds");
  await expect(post).toContainText("2 baths");
  await expect(post).toContainText("2,120 sq ft");
  await expect(post.getByRole("button", { name: "Like 96 Fernhollow Ln, 1 like" })).toHaveAttribute("aria-pressed", "false");
  // The like is on the evergreens themselves, in the photo.
  await post.scrollIntoViewIfNeeded();
  const evergreens = await pick(post, "the evergreens");
  await expect(evergreens.getByRole("button", { name: "Like the evergreens, 1 like" })).toBeVisible();
  await evergreens.getByRole("button", { name: "Close" }).click();
  // No more Hinge-style Pass and Like buttons.
  await expect(buyer.getByRole("button", { name: /^(Pass|Dislike)$/ })).toHaveCount(0);
  await expect(buyer.getByText("Toby")).toHaveCount(0);

  // The heart likes it; the account supplies the name.
  await heartOf(post).click();
  await expect(post.getByRole("button", { name: "Like 96 Fernhollow Ln, 2 likes" })).toHaveAttribute("aria-pressed", "true");
  await expect(buyer.getByRole("textbox", { name: "First name" })).toBeHidden();
  // Double-tapping a photo likes what it shows, too.
  await post.scrollIntoViewIfNeeded();
  await post.getByRole("group", { name: /Photos of/ }).dblclick();
  // Hovering the heart lists everything in the photo; the double-tap liked the exterior.
  const list = await photoList(post);
  await expect(list.getByRole("button", { name: /^Like the exterior/ })).toHaveAttribute("aria-pressed", "true");
  await expect(list.getByRole("button", { name: /^Like the evergreens/ })).toHaveAttribute("aria-pressed", "false");
  await expect(heartOf(post)).toHaveAttribute("aria-pressed", "true");

  // Comments open in a sheet: who said what, and who liked what.
  const sheet = await openComments(buyer, post);
  const thread = sheet.getByRole("list", { name: "Comments and likes" });
  await expect(thread).toContainText(/A buyer liked the evergreens · .+ · private chat/);
  await sheet.getByLabel("Add a comment").fill("Those trees are gorgeous.");
  await sheet.getByRole("button", { name: "Post", exact: true }).click();
  await expect(commentIn(thread, "Bea", "Those trees are gorgeous.")).toBeVisible();
  await expect(thread).toContainText("You liked the exterior");
  await buyer.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(post).toContainText("Bea commented");
  await expect(post.getByRole("button", { name: "Comments, 1" })).toBeVisible();

  // More: what else you like, which photos can't show.
  let more = await openMore(buyer, post);
  const likes = more.getByRole("group", { name: "What else do you like?" });
  await expect(likes.getByRole("button")).toHaveText(["Vibe", "Layout", "Location", "Price"]);
  await likes.getByRole("button", { name: "Vibe" }).click();
  await expect(likes.getByRole("button", { name: "Vibe" })).toHaveAttribute("aria-pressed", "true");
  await buyer.keyboard.press("Escape");

  // ...or "not for me", and why.
  const other = homeIn(buyer, "10421 Halvard Way NE");
  more = await openMore(buyer, other);
  await more.getByRole("button", { name: "Not for me" }).click();
  await expect(more.getByRole("button", { name: "Not for me" })).toHaveAttribute("aria-pressed", "true");
  await more.getByRole("group", { name: "What made you pass?" }).getByRole("button", { name: "Price" }).click();
  await more.getByRole("button", { name: "Next home" }).click();
  await expect(more).toBeHidden();

  // ↓ moves to the next home.
  const top = () => buyer.evaluate(() => document.querySelector<HTMLElement>("[data-reel]")!.scrollTop);
  const before = await top();
  await buyer.keyboard.press("ArrowDown");
  await expect.poll(top).toBeGreaterThan(before);

  // It keeps going until every home has been shown.
  await scrollToEnd(buyer);
  await expect(buyer.getByRole("article")).toHaveCount(13);

  // The buyer's activity is tied to their account, and on a desktop screen
  // the home spreads across it, with the buttons down the right.
  const elsewhere = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await elsewhere.goto("/login");
  await elsewhere.getByLabel("Email").fill("bea@example.com");
  await elsewhere.getByRole("button", { name: "Continue" }).click();
  await elsewhere.waitForURL((u) => u.pathname === "/");
  // Homes you've reacted to come after new ones, so open this one's own link.
  await elsewhere.goto("/homes/SAMPLE-1004");
  const again = homeIn(elsewhere, "96 Fernhollow Ln");
  await expect(heartOf(again)).toHaveAttribute("aria-pressed", "true");
  await again.scrollIntoViewIfNeeded();
  expect((await again.boundingBox())!.width).toBeGreaterThan(1400);
  const price = await again.getByText("$839,000").boundingBox();
  const heart = await heartOf(again).boundingBox();
  expect(heart!.x).toBeGreaterThan(price!.x + 600);

  // Buyers don't get the agent dashboard, and the old picks page goes home.
  await buyer.goto("/dashboard");
  await expect(buyer).toHaveURL(/localhost:\d+\/$/);
  await buyer.goto("/picks");
  await expect(buyer).toHaveURL(/localhost:\d+\/$/);

  // Signed out, it opens on what this is and a way to sign up, then homes,
  // and there's a page for agents.
  const anon = await (await browser.newContext()).newPage();
  await anon.goto("/");
  await expect(anon.getByRole("heading", { level: 1 })).toHaveText("Every home for sale, one swipe at a time.");
  await expect(anon.getByRole("article").first()).toBeAttached();
  await expect(anon.getByRole("link", { name: "Sign up", exact: true })).toBeVisible();
  await anon.goto("/for-agents");
  await expect(anon.getByRole("heading", { level: 1 })).toHaveText("Know what your clients think of every home.");

  // The logo is on every page and always goes home.
  await expectLogoGoesHome(anon);
  await anon.goto("/login");
  await expectLogoGoesHome(anon);
  await anon.goto("/homes/SAMPLE-1004");
  await expectLogoGoesHome(anon);
  await expectLogoGoesHome(client);
  await agent.goto("/dashboard");
  await expectLogoGoesHome(agent);
  await client.getByRole("link", { name: "BuyBox Social" }).click();
  await expect(client).toHaveURL(/localhost:\d+\/$/);

  expect(pageErrors).toEqual([]);
});
