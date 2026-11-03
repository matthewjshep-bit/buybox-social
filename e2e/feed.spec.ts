import { expect, test, type Page } from "@playwright/test";
import { createShare, signInAgent, signUpBuyer } from "./helpers";

async function expectLogoGoesHome(page: Page) {
  const logo = page.getByRole("link", { name: "BuyBox Social" });
  await expect(logo).toHaveAttribute("href", "/");
}

test("signed-in feed for buyers and agents, sign-up prompts, and the logo on every page", async ({
  browser,
}) => {
  // An agent's client likes a home's yard on a private link, and another dislikes it.
  const agent = await signInAgent(browser, "fran@example.com", "Fran Agent");
  const { url } = await createShare(agent, ["96 Fernhollow"]);
  const client = await (await browser.newContext()).newPage();
  await client.goto(url);
  await client.getByRole("group", { name: "Your reaction" }).getByRole("button", { name: /^Like/ }).click();
  await client.getByRole("textbox", { name: "First name" }).fill("Toby");
  await client.getByRole("button", { name: "Continue" }).click();
  await client.getByRole("group", { name: "What do you like?" }).getByRole("button", { name: "Yard" }).click();
  await expect(client.getByRole("group", { name: "Your reaction" }).getByRole("button", { name: /^Like/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // That agent's feed names their own client, and says what they liked.
  await agent.goto("/");
  await expect(agent.getByRole("heading", { name: "Your feed" })).toBeVisible();
  const agentPost = agent.getByRole("article", { name: "96 Fernhollow Ln" });
  await expect(agentPost).toContainText("Toby, your client, liked the yard");
  await expect(agent.getByRole("link", { name: "New share" })).toBeVisible();

  // A buyer signs up and sees the same activity anonymously.
  const buyer = await signUpBuyer(browser, "bea@example.com", "Bea Buyer");
  const pageErrors: string[] = [];
  buyer.on("pageerror", (error) => pageErrors.push(error.message));
  await expect(buyer.getByRole("heading", { name: "Your feed" })).toBeVisible();
  await expect(buyer.getByRole("link", { name: "New share" })).toHaveCount(0);
  const post = buyer.getByRole("article", { name: "96 Fernhollow Ln" });
  await expect(post).toContainText("A buyer liked the yard");
  await expect(post).toContainText("1 like");
  await expect(post).toContainText("Yard 1");
  await expect(buyer.getByText("Toby")).toHaveCount(0);

  // Reacting and commenting need no name prompt: the account supplies it.
  const reaction = post.getByRole("group", { name: "Your reaction" });
  await reaction.getByRole("button", { name: /^Like/ }).click();
  await expect(reaction.getByRole("button", { name: /^Like/ })).toHaveAttribute("aria-pressed", "true");
  await expect(buyer.getByRole("textbox", { name: "First name" })).toBeHidden();
  await post.getByRole("group", { name: "What do you like?" }).getByRole("button", { name: "Vibe" }).click();
  await post.getByRole("button", { name: "Done" }).click();
  await expect(post).toContainText("Liked by Bea and 1 other");
  await expect(post).toContainText("Bea liked the vibe");
  await post.getByLabel("Add a comment").fill("Those trees are gorgeous.");
  await post.getByRole("button", { name: "Post" }).click();
  await expect(post).toContainText("Bea Those trees are gorgeous.");
  await expect(post).toContainText("Bea commented");

  // Sorting by reactions: the most-liked home comes first.
  await buyer.getByRole("link", { name: "Most liked" }).click();
  await expect(buyer).toHaveURL(/\?sort=liked$/);
  await expect(buyer.getByRole("link", { name: "Most liked" })).toHaveAttribute("aria-current", "page");
  await expect(buyer.getByRole("article").first()).toHaveAccessibleName("96 Fernhollow Ln");

  // The buyer's activity is tied to their account, not this browser, and on a
  // desktop screen each post spreads across the page instead of a phone-width column.
  const elsewhere = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await elsewhere.goto("/login");
  await elsewhere.getByLabel("Email").fill("bea@example.com");
  await elsewhere.getByRole("button", { name: "Continue" }).click();
  await elsewhere.waitForURL((u) => u.pathname === "/");
  const again = elsewhere.getByRole("article", { name: "96 Fernhollow Ln" });
  await expect(again.getByRole("group", { name: "Your reaction" }).getByRole("button", { name: /^Like/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const postBox = await again.boundingBox();
  expect(postBox!.width).toBeGreaterThan(1000);
  const photo = await again.getByRole("group", { name: /Photos of/ }).boundingBox();
  const headline = await again.getByText("Bea commented").boundingBox();
  expect(headline!.x).toBeGreaterThan(photo!.x + photo!.width - 1);

  // "Details" opens the pop-out over the feed.
  await post.getByRole("link", { name: "Details" }).click();
  const dialog = buyer.getByRole("dialog", { name: "Home details" });
  await expect(dialog.getByText("Those trees are gorgeous.")).toBeVisible();
  await expect(
    dialog.getByRole("group", { name: "Your reaction" }).getByRole("button", { name: /^Like/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await buyer.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  // Buyers don't get the agent dashboard.
  await buyer.goto("/dashboard");
  await expect(buyer).toHaveURL(/localhost:\d+\/$/);

  // Signed out, the home page is the landing page with sign-up prompts.
  const anon = await (await browser.newContext()).newPage();
  await anon.goto("/");
  await expect(anon.getByRole("heading", { name: "Your feed" })).toHaveCount(0);
  await expect(anon.getByRole("link", { name: "Sign up free" }).first()).toBeVisible();
  await expect(anon.getByRole("heading", { name: "Homes people are talking about" })).toBeVisible();

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
