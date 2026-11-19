import { expect, test, type Page } from "@playwright/test";
import { createShare, heartOf, homeIn, joinAs, openComments, signInAgent, signUpBuyer } from "./helpers";

const saved = (page: Page) =>
  page.waitForResponse((res) => res.request().method() === "POST" && Boolean(res.request().headers()["next-action"]));

test("an agent's home is everyone's home, with their clients under the box to send homes: what a client said beside her name, Reply right there, and what she did on her own page; her home: her agent's homes first, and more picked for her", async ({
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

  // The agent's home: Jo among their clients, as a person, to her page;
  // and the way to send homes to anyone.
  await agent.goto("/");
  // Home, not a second dashboard: no label saying so, and no greeting to read past.
  await expect(agent.getByRole("heading", { level: 1 })).toHaveText("Your home");
  await expect(agent.getByRole("main")).not.toContainText("Agent dashboard");
  await expect(agent.getByRole("main")).not.toContainText("Hi Fern");
  await expect(agent.getByRole("link", { name: "Send homes to a client" })).toHaveAttribute("href", "/dashboard/new");
  const clients = agent.getByRole("region", { name: "Your clients" });
  const joThere = clients.getByRole("link", { name: /^Jo\b/ });
  await expect(joThere).toHaveAttribute("href", /^\/dashboard\/clients\/acct%3A[\w-]+$/);
  // Theirs alone to see, and it says so.
  await expect(clients).toContainText("Only you see this");
  // And all of a buyer's home under it: the pills, people to follow, homes picked for them.
  await expect(agent.getByText("Picked for you")).toHaveCount(0);
  const lenses = agent.getByRole("group", { name: "Show" });
  await expect(lenses.getByRole("button", { name: "Following" })).toBeVisible();
  await expect(lenses.getByRole("button", { name: "For you" })).toBeVisible();
  const people = agent.getByRole("region", { name: "People to follow" });
  await expect(people).toHaveCount(1);
  await expect(people.getByRole("listitem").first()).toContainText("Prudence");
  await expect(people.getByRole("listitem").first()).toContainText("Follows you");
  // (Her own client isn't someone to follow: she follows her already.)
  await expect(people.getByRole("link", { name: /^Jo\b/ })).toHaveCount(0);
  const picked = agent.getByRole("region", { name: "Homes for you" });
  expect(await picked.getByRole("listitem").count()).toBeGreaterThanOrEqual(6);

  // Jo asks something.
  const chat = await openComments(jo, quillan);
  await chat.getByLabel("Add a comment").fill("Is the basement finished?");
  await chat.getByRole("button", { name: "Post", exact: true }).click();
  await expect(chat.getByLabel("Add a comment")).toHaveValue("");

  // It's beside her name, marked as new, with one Reply; she's the one waiting.
  await agent.reload();
  await expect(joThere).toContainText("“Is the basement finished?”");
  await expect(joThere).toContainText("new since you last looked");
  await expect(clients).toContainText("1 waiting");
  // [P] What she said on her link is in her agent's clients card and nowhere
  // else on the page: never in the feed.
  await expect(agent.getByRole("region", { name: "What's new" })).not.toContainText("Is the basement finished?");
  await expect(agent.getByRole("heading", { name: "Client activity" })).toHaveCount(0);
  // Reply opens the box right there, ready to type in.
  const replyTo = clients.getByRole("button", { name: "Reply to Jo" });
  expect((await replyTo.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await replyTo.click();
  const box = clients.getByRole("textbox", { name: "Reply to Jo" });
  await expect(box).toBeFocused();
  await expect(box).toHaveAttribute("placeholder", "Reply to Jo…");
  await box.fill("Yes, it was finished in 2019.");
  await box.press("Enter");
  // Sent from right there: it says so, and goes on saying so once she isn't
  // waiting any more (her line is how she's doing again, Reply is gone, and
  // so is the mark that something's new).
  await expect(clients.getByRole("status")).toContainText("Sent to Jo");
  await expect(box).toHaveValue("");
  await expect(joThere).toContainText("Liked 1 of 2 homes");
  await expect(joThere).not.toContainText("new since you last looked");
  await expect(replyTo).toHaveCount(0);
  await expect(clients).not.toContainText("waiting");
  await expect(clients.getByRole("status")).toContainText("Sent to Jo");
  // It's in the conversation on her link: the agent's page for it shows it.
  await agent.goto(`${dashboardUrl}?tab=homes`);
  await expect(agent.getByText("Yes, it was finished in 2019.")).toBeVisible();

  // What she did is on her own page, a tap from her name on Home: her card,
  // the answer on it, and Reply there for more. Her card opens her homes in a
  // pop-out over the page, on that one; Escape closes it, back where it was.
  await agent.goto("/");
  await joThere.click();
  await agent.waitForURL(/\/dashboard\/clients\/acct%3A[\w-]+$/);
  const joClientPage = new URL(agent.url()).pathname;
  const card = agent.getByRole("listitem").filter({ hasText: "Only you see this" }).filter({ hasText: "Is the basement finished?" });
  await expect(card).toContainText("1204 Quillan St SE");
  await expect(card.getByRole("list", { name: "Your replies" })).toContainText("Yes, it was finished in 2019.");
  await expect(card.getByRole("textbox", { name: "Reply to Jo" })).toBeVisible();
  const open = card.getByRole("link", { name: /^1204 Quillan St SE: / });
  await expect(open).toHaveAttribute("href", /^\/reel\?from=client%3A[\w-]+&home=SAMPLE-\d+/);
  await open.click();
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

  // Jo's own home: the homes Fern sent her first, the one she hasn't rated
  // yet waiting, a tap from her own link.
  await jo.goto("/");
  const link = new URL(url).pathname;
  const fromAgent = jo.getByRole("region", { name: "1 new home for you" });
  await expect(fromAgent).toContainText("From Fern Feed");
  await expect(fromAgent).toContainText("1 of 2 rated");
  await expect(fromAgent.getByRole("link", { name: /^See them/ })).toHaveAttribute("href", link);
  // Fern's answer is there too.
  await expect(fromAgent).toContainText("Fern: Yes, it was finished in 2019.");
  // And from anywhere, under her initial.
  const banner = jo.getByRole("banner");
  await banner.getByRole("button", { name: "Account menu" }).click();
  await expect(banner.getByRole("link", { name: "Homes from Fern" })).toHaveAttribute("href", link);
  await jo.keyboard.press("Escape");

  // Then homes picked for her: the first opens them in the same order.
  const more = jo.getByRole("region", { name: "Homes for you" });
  const pin = more.getByRole("listitem").first().getByRole("link");
  // On a phone, one column: each photo as wide as the page, and nothing runs off its side.
  const page = jo.viewportSize()!.width;
  expect((await pin.locator("img").boundingBox())!.width).toBeGreaterThan(page - 40);
  expect(await jo.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page);
  await expect(pin).toHaveAttribute("href", /^\/reel\?from=picks&home=SAMPLE-\d+$/);
  await pin.click();
  await jo.waitForURL(/\/reel\?from=picks&home=SAMPLE-/);
  await expect(jo.getByRole("article").first()).toBeInViewport({ ratio: 0.9 });
});
