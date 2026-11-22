import { expect, test, type Page } from "@playwright/test";
import { clientRow, createShare, heartOf, homeIn, joinAs, openComments, signInAgent, signUpBuyer } from "./helpers";

const saved = (page: Page) =>
  page.waitForResponse((res) => res.request().method() === "POST" && Boolean(res.request().headers()["next-action"]));

test("an agent's home is everyone's home, a feed with nothing of their clients on it; what a client said is on Clients, with Reply; her home: her agent's homes first", async ({
  browser,
}) => {
  test.setTimeout(150_000);
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
  // Someone else on Porchcard follows Fern: someone to offer her.
  await agent.goto("/people/me");
  await agent.waitForURL(/\/people\/[\w-]+$/);
  const fernPage = new URL(agent.url()).pathname;
  const prudence = await signUpBuyer(browser, "prudence.feed@example.com", "Prudence Feed");
  await prudence.goto(fernPage);
  await Promise.all([saved(prudence), prudence.getByRole("button", { name: "Follow Fern" }).click()]);
  await expect(prudence.getByRole("button", { name: "Following Fern" })).toHaveAttribute("aria-pressed", "true");
  await prudence.context().close();

  // The agent's home: the same feed as anyone's, with nothing of their
  // clients on it (those are on Clients), and the way to send homes.
  await agent.goto("/");
  // Home, not a second dashboard: no label saying so, and no greeting to read past.
  await expect(agent.getByRole("heading", { level: 1 })).toHaveText("Your home");
  await expect(agent.getByRole("main")).not.toContainText("Agent dashboard");
  await expect(agent.getByRole("main")).not.toContainText("Hi Fern");
  await expect(agent.getByRole("link", { name: "Send homes to a client" })).toHaveAttribute("href", "/dashboard/new");
  await expect(agent.getByRole("region", { name: "Your clients" })).toHaveCount(0);
  await expect(agent.getByRole("group", { name: "Show" })).toHaveCount(0);
  await expect(agent.getByText("Send your first homes")).toHaveCount(0);
  // Beside the feed, what her clients are doing (only she sees it): Jo
  // opened the link and liked a home. People to follow are for everyone else.
  await expect(agent.getByRole("region", { name: "People to follow" })).toHaveCount(0);
  const activity = agent.getByRole("region", { name: /^Client activity/ });
  await expect(activity).toContainText("Only you see this");
  await expect(activity.getByRole("link", { name: /Jo liked 1204 Quillan St SE/ })).toBeVisible();
  await expect(activity.getByRole("link", { name: /Jo opened your link/ })).toBeVisible();

  // Jo asks something.
  const chat = await openComments(jo, quillan);
  await chat.getByLabel("Add a comment").fill("Is the basement finished?");
  await chat.getByRole("button", { name: "Post", exact: true }).click();
  await expect(chat.getByLabel("Add a comment")).toHaveValue("");

  // [P] What she said on her link is in Client activity, never in the feed;
  // a tap there goes to what she did, on her page among the agent's clients.
  await agent.reload();
  const stream = agent.getByRole("region", { name: "Your feed" });
  // (No home's card in the feed has it: a card's link says "address: why".)
  const homeCards = stream.getByRole("listitem").filter({ has: agent.getByRole("link", { name: /^[^:]+: / }) });
  await expect(homeCards.filter({ hasText: "Is the basement finished?" })).toHaveCount(0);
  const said = activity.getByRole("link", { name: /Jo commented on 1204 Quillan St SE/ });
  await expect(said).toContainText("Is the basement finished?");
  await said.click();
  await agent.waitForURL(/\/dashboard\/clients\/acct%3A[\w-]+#did$/);

  // Her page among the agent's clients: what she said, and Reply right
  // there. Her card opens her homes in a pop-out over the page, on that one;
  // Escape closes it, back where it was.
  await agent.goto("/dashboard");
  await clientRow(agent, "Jo").getByRole("link", { name: /^Jo\b/ }).first().click();
  await agent.waitForURL(/\/dashboard\/clients\/acct%3A[\w-]+$/);
  const joClientPage = new URL(agent.url()).pathname;
  const card = agent.getByRole("listitem").filter({ hasText: "Only you see this" }).filter({ hasText: "Is the basement finished?" });
  await expect(card).toContainText("1204 Quillan St SE");
  const box = card.getByRole("textbox", { name: "Reply to Jo" });
  await expect(box).toBeVisible();
  await box.fill("Yes, it was finished in 2019.");
  await box.press("Enter");
  await expect(card.getByRole("list", { name: "Your replies" })).toContainText("Yes, it was finished in 2019.");
  // It's in the conversation on her link: the agent's page for it shows it.
  await agent.goto(`${dashboardUrl}?tab=homes`);
  await expect(agent.getByText("Yes, it was finished in 2019.")).toBeVisible();
  await agent.goto(joClientPage);
  await expect(card.getByRole("textbox", { name: "Reply to Jo" })).toBeVisible();
  const open = card.getByRole("link", { name: /^1204 Quillan St SE: / });
  await expect(open).toHaveAttribute("href", /^\/reel\?from=client%3A[\w-]+&home=SAMPLE-\d+/);
  // (By its top corner: the photos in the middle swipe, and open it themselves.)
  await open.click({ position: { x: 20, y: 20 } });
  await agent.waitForURL(/\/reel\?from=client%3A[\w-]+&home=SAMPLE-/);
  const popout = agent.getByRole("dialog", { name: "Homes" });
  await expect(homeIn(popout, "1204 Quillan St SE")).toBeInViewport({ ratio: 0.9 });
  await agent.keyboard.press("Escape");
  await expect(popout).toHaveCount(0);
  await agent.waitForURL((u) => u.pathname === joClientPage);
  // The Following stream, by its own address (a link sent, a reload), fills
  // the screen, with Back.
  await agent.goto(`/reel?from=feed&home=SAMPLE-1004`);
  await expect(agent.getByRole("link", { name: "Back to your feed" }).first()).toBeVisible();

  // Jo and the agent follow each other.
  await jo.goto("/people/me");
  await jo.waitForURL(/\/people\/[\w-]+$/);
  const joPage = new URL(jo.url()).pathname;
  await jo.goto(`${joPage}/following`);
  await expect(jo.getByRole("list", { name: "People you follow" }).getByRole("link", { name: /Fern/ })).toBeVisible();
  await jo.goto(`${joPage}/followers`);
  await expect(jo.getByRole("list", { name: "Your followers" }).getByRole("link", { name: /Fern/ })).toBeVisible();

  // What Jo likes in public is in Fern's Following feed, as anyone's is, and
  // marked as her client's: "Your client" beside her name.
  await jo.goto("/homes/SAMPLE-1001");
  const publicHeart = heartOf(jo.getByRole("article").first());
  await Promise.all([saved(jo), publicHeart.click()]);
  await expect(publicHeart).toHaveAttribute("aria-pressed", "true");
  await agent.goto("/");
  const hers = agent.getByRole("region", { name: "Your feed" }).getByRole("listitem").filter({ hasText: "Jo" }).first();
  await expect(hers).toContainText("Your client");

  // A client and her profile are one person, a tap apart either way. Jo
  // signed up, so on the Clients page her profile is right there; on her
  // client page it's a button; and her profile sends her agent back to her
  // client page.
  await agent.goto("/dashboard");
  const toProfile = clientRow(agent, "Jo").getByRole("link", { name: /^View profile\b.*\bJo$/ });
  await expect(toProfile).toHaveAttribute("href", joPage);
  expect((await toProfile.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await agent.goto(joClientPage);
  await expect(agent.getByRole("link", { name: "View profile", exact: true })).toHaveAttribute("href", joPage);
  await agent.getByRole("link", { name: "View profile", exact: true }).click();
  await agent.waitForURL((u) => u.pathname === joPage);
  await expect(agent.getByText("Your client", { exact: true })).toBeVisible();
  await expect(agent.getByRole("link", { name: "Client page", exact: true })).toHaveAttribute("href", joClientPage);

  // Jo's own home: the homes Fern sent her first, the one she hasn't rated
  // yet waiting, a tap from her own link.
  await jo.goto("/");
  const link = new URL(url).pathname;
  const fromAgent = jo.getByRole("region", { name: "1 new home for you" });
  await expect(fromAgent).toContainText("From Fern Feed");
  await expect(fromAgent).toContainText("1 of 2 rated");
  // See them opens her link on the home still waiting, not the one she rated.
  await expect(fromAgent.getByRole("link", { name: /^See them/ })).toHaveAttribute(
    "href",
    new RegExp(`^${link}\\?home=SAMPLE-\\d+$`),
  );
  // Fern's answer is there too.
  await expect(fromAgent).toContainText("Fern: Yes, it was finished in 2019.");
  // And from anywhere, under her initial.
  const banner = jo.getByRole("banner");
  await banner.getByRole("button", { name: "Account menu" }).click();
  await expect(banner.getByRole("link", { name: "Homes from Fern" })).toHaveAttribute("href", link);
  await jo.keyboard.press("Escape");

  // No homes picked for her under it: nothing here is a recommendation.
  await expect(jo.getByRole("region", { name: "Homes for you" })).toHaveCount(0);
  await expect(jo.getByRole("group", { name: "Show" })).toHaveCount(0);
});
