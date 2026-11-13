import { expect, test } from "@playwright/test";
import { createShare, heartOf, homeIn, joinAs, signInAgent } from "./helpers";

test("signed in, the home page is a feed: an agent's clients in it, each home opening them all full screen, and a client and their agent follow each other", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const agent = await signInAgent(browser, "fern-feed@example.com", "Fern Feed");
  const { url, dashboardUrl } = await createShare(agent, ["1204 Quillan", "719 Saltmarsh"], ["Jo"]);

  // Jo signs up right on her link, to like a home.
  const jo = await (await browser.newContext()).newPage();
  await jo.addInitScript(() => localStorage.setItem("buybox:nudges", JSON.stringify({ photos: true, next: true })));
  await jo.goto(url);
  const quillan = homeIn(jo, "1204 Quillan St SE");
  await heartOf(quillan).click();
  await joinAs(jo, "Jo", "jo.feed@example.com");
  await expect(heartOf(quillan)).toHaveAttribute("aria-pressed", "true");

  // The agent's home page is their feed: what Jo did, and the way to all of it.
  await agent.goto("/");
  await expect(agent.getByRole("heading", { level: 1 })).toHaveText("Hi, Fern");
  await expect(agent.getByRole("link", { name: "Browse homes" }).first()).toHaveAttribute("href", "/reel");
  const card = agent.getByRole("link", { name: "1204 Quillan St SE: Jo, your client, liked this home" });
  await expect(card).toBeVisible();
  const item = agent.getByRole("listitem").filter({ has: card });
  await expect(item.getByRole("link", { name: "Everything from Jo" })).toHaveAttribute(
    "href",
    `${new URL(dashboardUrl).pathname}?tab=homes`,
  );

  // Tapped: the feed's homes full screen, on that one, and Back.
  await card.click();
  await agent.waitForURL(/\/reel\?from=feed&home=SAMPLE-/);
  await expect(homeIn(agent, "1204 Quillan St SE")).toBeInViewport({ ratio: 0.9 });
  await agent.getByRole("link", { name: "Back to your feed" }).first().click();
  await agent.waitForURL((u) => u.pathname === "/");

  // Jo and the agent follow each other.
  await jo.goto("/people/me");
  await jo.waitForURL(/\/people\/[\w-]+$/);
  const joPage = new URL(jo.url()).pathname;
  await jo.goto(`${joPage}/following`);
  await expect(jo.getByRole("list", { name: "People you follow" }).getByRole("link", { name: /Fern/ })).toBeVisible();
  await jo.goto(`${joPage}/followers`);
  await expect(jo.getByRole("list", { name: "Your followers" }).getByRole("link", { name: /Fern/ })).toBeVisible();

  // Jo's own home page: a feed with little in it yet, so homes picked for her.
  await jo.goto("/");
  await expect(jo.getByRole("heading", { name: "Picked for you" })).toBeVisible();
  const pick = jo.getByRole("region", { name: "Picked for you" }).getByRole("link").first();
  await pick.click();
  await jo.waitForURL(/\/reel\?home=SAMPLE-/);
  await expect(jo.getByRole("article").first()).toBeInViewport({ ratio: 0.9 });
});
