import { expect, test, type Locator, type Page } from "@playwright/test";
import { signedIn, enterCode,
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
  settle,
  signInAgent,
  signUpBuyer,
  passOn, keepLinksPrivate } from "./helpers";

// The latest comments under a home's photo (under its row of things to do),
// headed by how many liked it.
const latestOf = (home: Locator) => home.getByRole("group", { name: "Latest comments" });

async function expectLogoGoesHome(page: Page) {
  const logo = page.getByRole("link", { name: "Porchcard", exact: true });
  await expect(logo).toHaveAttribute("href", "/");
}

test("the feed: full-screen homes, a heart, comments in one thread under the photo, endless scroll, and the logo on every page", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  // An agent's client likes a home, and the evergreens in its photo, on a private link.
  const agent = await signInAgent(browser, "fran@example.com", "Fran Agent");
  const { url } = await createShare(agent, ["96 Fernhollow"], ["Toby"]);
  const client = await signedIn(browser);
  await client.goto(url);
  await expect(client.getByRole("heading", { level: 1 })).toHaveText("Toby, I picked this home for you");
  const clientHome = homeIn(client, "96 Fernhollow Ln");
  await heartOf(clientHome).click();
  await expect(heartOf(clientHome)).toHaveAttribute("aria-pressed", "true");
  // (Saved before the agent looks.)
  const evergreensSaved = client.waitForResponse(
    (res) =>
      res.request().method() === "POST" &&
      Boolean(res.request().headers()["next-action"]) &&
      /evergreen/i.test(res.request().postData() ?? ""),
  );
  await likeInPhoto(clientHome, "the evergreens");
  await evergreensSaved;
  // (She keeps what she does on links to them, so here her like is a count:
  // what's public by default is lib/link-public's, not this test's.)
  await keepLinksPrivate(client);
  await client.goto(url);

  // The agent's Notifications name their own client, and say what they
  // liked, which only they see. (Each home below is opened by its own link,
  // which opens the feed on it: where it falls on the home page depends on
  // what every earlier spec liked.)
  await agent.goto("/activity");
  const liked = agent.getByRole("main").getByRole("listitem").filter({ hasText: "Toby liked 96 Fernhollow Ln" });
  await expect(liked).toBeVisible();
  await expect(liked).toContainText("Your client");
  // The home itself counts the like under its photo, where the comments go.
  // Nothing goes round over the photo any more.
  await agent.goto("/homes/SAMPLE-1004");
  const agentsHome = homeIn(agent, "96 Fernhollow Ln");
  await expect(latestOf(agentsHome)).toContainText("1 like");
  await expect(agentsHome.getByRole("group", { name: "Recent activity" })).toHaveCount(0);

  // A buyer signs up and sees the same like, with no one named: a count under
  // the photo, and in the comments "A buyer" from a private chat.
  const buyer = await signUpBuyer(browser, "bea@example.com", "Bea Buyer");
  const pageErrors: string[] = [];
  buyer.on("pageerror", (error) => pageErrors.push(error.message));
  await buyer.goto("/homes/SAMPLE-1004");
  const post = homeIn(buyer, "96 Fernhollow Ln");
  await expect(latestOf(post)).toContainText("1 like");
  await expect(post.getByRole("group", { name: "Recent activity" })).toHaveCount(0);
  await expect(post.locator("[data-photo-caption]")).toHaveCount(0);
  // The price, size and address are in the head, above the photo.
  const head = post.locator("[data-home-head]");
  await expect(head).toContainText("$839,000");
  await expect(head).toContainText("3 bd · 2 ba · 2,120 sq ft");
  await expect(head).toContainText("96 Fernhollow Ln, Gig Harbor");
  await expect(head.getByRole("button", { name: "About this home" })).toHaveAttribute("aria-expanded", "false");
  const photoFrame = post.locator("[data-photo-frame]").first();
  expect((await head.boundingBox())!.y + (await head.boundingBox())!.height).toBeLessThanOrEqual((await photoFrame.boundingBox())!.y + 1);
  // The head opens what the home is: the description, who listed it, the details.
  await head.getByRole("button", { name: "About this home" }).click();
  const about = post.getByRole("region", { name: "About this home" });
  await expect(about).toBeVisible();
  await expect(about).toContainText("Tucked among tall evergreens");
  await expect(about).toContainText("Listed by Elise Navarro · Cascade Key Real Estate");
  await expect(about).toContainText("Price per sq ft");
  await buyer.keyboard.press("Escape");
  await expect(about).toBeHidden();
  await expect(post.getByRole("button", { name: "Like 96 Fernhollow Ln, 1 like" })).toHaveAttribute("aria-pressed", "false");
  // The like is on the evergreens themselves, in the photo.
  await post.scrollIntoViewIfNeeded();
  const evergreens = await pick(post, "the evergreens");
  await expect(evergreens.getByRole("button", { name: "Like the evergreens, 1 like", exact: true })).toBeVisible();
  await evergreens.getByRole("button", { name: "Close" }).click();
  // Yes or no to the home itself is one tap, in the row right under the photo.
  await expect(post.getByRole("button", { name: "Pass on this home" })).toBeVisible();
  await expect(heartOf(post)).toBeVisible();
  // The X first, the heart beside it, both under the photo's foot, in the
  // row of things to do; nothing sits on the photo.
  const corners = (await photoFrame.boundingBox())!;
  const actions = post.locator("[data-actions]");
  const heartBox = (await heartOf(post).boundingBox())!;
  const passBox = (await post.getByRole("button", { name: "Pass on this home" }).boundingBox())!;
  expect(passBox.y).toBeGreaterThanOrEqual(corners.y + corners.height - 1);
  expect(heartBox.y).toBeGreaterThanOrEqual(corners.y + corners.height - 1);
  expect(Math.abs(heartBox.y - passBox.y)).toBeLessThan(2);
  expect(heartBox.x).toBeGreaterThan(passBox.x + passBox.width - 1);
  expect(heartBox.width).toBeGreaterThanOrEqual(44);
  expect(heartBox.height).toBeGreaterThanOrEqual(44);
  await expect(actions.getByRole("button", { name: "Pass on this home" })).toHaveCount(1);
  await expect(actions.getByRole("button", { name: /^Like 96 Fernhollow Ln/ })).toHaveCount(1);
  await expect(actions.getByRole("button", { name: /^Comments/ })).toHaveCount(1);
  await expect(buyer.getByText("Toby")).toHaveCount(0);

  // The heart likes it; the account supplies the name.
  await heartOf(post).click();
  await expect(post.getByRole("button", { name: "Like 96 Fernhollow Ln, 2 likes" })).toHaveAttribute("aria-pressed", "true");
  await expect(buyer.getByRole("textbox", { name: "First name" })).toBeHidden();
  // Double-tapping a photo likes what it shows, too.
  await post.scrollIntoViewIfNeeded();
  await post.locator("[data-photo-frame] img").first().dblclick();
  // Its heart pops in the middle of the photo, not down behind the words.
  const burst = post.locator("[data-photo-frame] [class*='heart-pop']");
  await expect(burst).toHaveCount(1);
  await settle(burst);
  const popped = (await burst.boundingBox())!;
  const tapped = (await burst.locator("xpath=ancestor::*[@data-photo-frame][1]").boundingBox())!;
  expect(Math.abs(popped.y + popped.height / 2 - (tapped.y + tapped.height / 2))).toBeLessThan(2);
  // Hovering the heart lists everything in the photo; the double-tap liked the exterior.
  const list = await photoList(post);
  await expect(list.getByRole("button", { name: /^Like the exterior/ })).toHaveAttribute("aria-pressed", "true");
  await expect(list.getByRole("button", { name: /^Like the evergreens/ })).toHaveAttribute("aria-pressed", "false");
  await expect(heartOf(post)).toHaveAttribute("aria-pressed", "true");

  // Comments unfurl in place, dark, under the photo: one thread, no sheet.
  // Who liked is only a count: the client's private like reaches the public
  // page as one of the likes, never as her name, her words, or what she liked.
  const thread = await openComments(buyer, post);
  await expect(buyer.getByRole("dialog", { name: "Comments" })).toHaveCount(0);
  await expect(buyer.getByRole("list", { name: "Comments and likes" })).toHaveCount(0);
  await expect(thread.getByRole("heading", { level: 2 })).toHaveText("Comments");
  await expect(thread).toContainText("2 likes");
  await expect(thread).toContainText("No comments yet.");
  await expect(thread).not.toContainText("Toby");
  await expect(thread).not.toContainText(/liked/i);
  await expect(thread).not.toContainText(/evergreens|exterior/);
  await expect(thread).not.toContainText("A buyer");
  await thread.getByLabel("Add a comment").fill("Those trees are gorgeous.");
  await thread.getByRole("button", { name: "Post", exact: true }).click();
  const comments = thread.locator('ul[data-comment-list][aria-label="Comments"]');
  await expect(commentIn(comments, "Bea", "Those trees are gorgeous.")).toBeVisible();
  await expect(thread.getByRole("heading", { level: 2 })).toHaveText("1 comment");
  // Still only the one row: nobody's likes, yours included, get a row of their own.
  await expect(comments.getByRole("listitem")).toHaveCount(1);
  await expect(thread).not.toContainText(/liked/i);
  await expect(thread).not.toContainText("Toby");
  await buyer.keyboard.press("Escape");
  await expect(thread).toBeHidden();
  // Under the photo, the way a post reads: how many liked it (both of you),
  // then the comment, by name. Tapping it opens the comments again.
  await expect(latestOf(post)).toContainText("2 likes");
  const row = latestOf(post).getByRole("listitem").filter({ hasText: "Those trees are gorgeous." });
  await expect(row).toContainText("Bea");
  await expect(post.getByRole("button", { name: "Comments, 1" })).toBeVisible();
  await row.getByRole("button").click();
  await expect(thread).toBeVisible();
  await buyer.keyboard.press("Escape");
  await expect(thread).toBeHidden();

  // More: what else you like, which photos can't show.
  let more = await openMore(buyer, post);
  const likes = more.getByRole("group", { name: "What else do you like?" });
  await expect(likes.getByRole("button")).toHaveText(["Vibe", "Layout", "Location", "Price"]);
  await likes.getByRole("button", { name: "Vibe" }).click();
  await expect(likes.getByRole("button", { name: "Vibe" })).toHaveAttribute("aria-pressed", "true");
  await buyer.keyboard.press("Escape");

  // ...or "not for me", and why.
  await buyer.goto("/homes/SAMPLE-1005");
  const other = homeIn(buyer, "10421 Halvard Way NE");
  more = await passOn(buyer, other);
  await more.getByRole("group", { name: "What made you pass?" }).getByRole("button", { name: "Price" }).click();
  await buyer.keyboard.press("Escape");
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
  // the home reads as it does on a phone, in one column down the middle: the
  // head, the photo, the row of things to do under it, then the comments.
  const elsewhere = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await elsewhere.goto("/login");
  await elsewhere.getByLabel("Email").fill("bea@example.com");
  await elsewhere.getByRole("button", { name: "Continue" }).click();
  await enterCode(elsewhere);
  await elsewhere.waitForURL((u) => u.pathname === "/");
  // Homes you've reacted to come after new ones, so open this one's own link.
  await elsewhere.goto("/homes/SAMPLE-1004");
  const again = homeIn(elsewhere, "96 Fernhollow Ln");
  await expect(heartOf(again)).toHaveAttribute("aria-pressed", "true");
  await again.scrollIntoViewIfNeeded();
  expect((await again.boundingBox())!.width).toBeGreaterThan(1400);
  const price = (await again.locator('[data-fact="Price"]').boundingBox())!;
  await expect(again.locator('[data-fact="Price"]')).toHaveText("$839,000");
  const heart = (await heartOf(again).boundingBox())!;
  const panel = (await again.locator("[data-words]").boundingBox())!;
  const wideHead = (await again.locator("[data-home-head]").boundingBox())!;
  const widePhoto = (await again.locator("[data-photo-frame]").first().boundingBox())!;
  // No panel beside the photo: the head and the words are at most 44rem
  // wide, in the middle of the window, the photo between them.
  for (const part of [wideHead, panel, widePhoto]) {
    expect(part.width).toBeLessThanOrEqual(705);
    expect(Math.abs(part.x + part.width / 2 - 720)).toBeLessThanOrEqual(1);
  }
  expect(price.y + 20).toBeLessThanOrEqual(widePhoto.y + 1);
  expect(Math.abs(panel.y - (widePhoto.y + widePhoto.height))).toBeLessThanOrEqual(1);
  // The heart is in the words' first row, right under the photo, not on it.
  expect(heart.y).toBeGreaterThanOrEqual(widePhoto.y + widePhoto.height - 1);
  expect(heart.y - (widePhoto.y + widePhoto.height)).toBeLessThanOrEqual(12);
  expect(heart.x).toBeGreaterThanOrEqual(panel.x);
  expect(heart.x + heart.width).toBeLessThanOrEqual(panel.x + panel.width);
  expect(heart.y).toBeGreaterThan(price.y);

  // Buyers don't get the agent dashboard.
  await buyer.goto("/dashboard");
  await expect(buyer).toHaveURL(/localhost:\d+\/$/);

  // Signed out, the home page says what this is, Browse homes opens on a
  // home, and there's a page for agents, with the home page's words to them.
  const anon = await (await browser.newContext()).newPage();
  await anon.goto("/");
  await expect(anon.getByRole("heading", { level: 1 })).toHaveText("The social way to shop for homes.");
  await expect(anon.getByRole("main").getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "#start");
  await anon.goto("/reel");
  await expect(anon.getByRole("article").first()).toBeAttached();
  await anon.goto("/");
  await expect(anon.getByRole("banner").getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  await anon.goto("/for-agents");
  await expect(anon.getByRole("heading", { level: 1 })).toHaveText("Send a few homes. Learn exactly what they want.");

  // The logo is on every page (all but the site's bar on a signed-in phone,
  // below) and always goes home.
  await expectLogoGoesHome(anon);
  await anon.goto("/login");
  await expectLogoGoesHome(anon);
  await anon.goto("/homes/SAMPLE-1004");
  await expectLogoGoesHome(anon);
  await expectLogoGoesHome(client);
  // Signed in on a phone, the site's bar gives the logo's room to the
  // places' names: Home, first among them, goes where the logo went. From a
  // tablet up the logo is back.
  await agent.goto("/dashboard");
  const bar = agent.getByRole("banner");
  await expect(bar.getByRole("link", { name: "Porchcard", exact: true })).toBeHidden();
  await expect(bar.getByRole("link", { name: "Home", exact: true })).toHaveAttribute("href", "/");
  await expect(bar.getByRole("link", { name: "Home", exact: true })).toBeVisible();
  await agent.setViewportSize({ width: 1024, height: 768 });
  await expectLogoGoesHome(agent);
  await client.getByRole("link", { name: "Porchcard", exact: true }).click();
  await expect(client).toHaveURL(/localhost:\d+\/$/);

  expect(pageErrors).toEqual([]);
});
