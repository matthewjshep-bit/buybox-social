import { expect, test } from "@playwright/test";
import { createShare, heartOf, homeIn, joinAs, openComments, signInAgent } from "./helpers";

test("an agent's home: their client's face, what she's waiting on them for, a reply right there, and her day opening her homes; her home: her agent's homes first, and more picked for her", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const agent = await signInAgent(browser, "fern-feed@example.com", "Fern Feed");
  const { url } = await createShare(agent, ["1204 Quillan", "719 Saltmarsh"], ["Jo"]);

  // Jo signs up right on her link, to like a home.
  const jo = await (await browser.newContext()).newPage();
  await jo.addInitScript(() => localStorage.setItem("buybox:nudges", JSON.stringify({ photos: true, next: true })));
  await jo.goto(url);
  const quillan = homeIn(jo, "1204 Quillan St SE");
  await heartOf(quillan).click();
  await joinAs(jo, "Jo", "jo.feed@example.com");
  await expect(heartOf(quillan)).toHaveAttribute("aria-pressed", "true");

  // The agent's home: Jo's face among their clients, along the top, after
  // the way to send homes to anyone.
  await agent.goto("/");
  await expect(agent.getByRole("heading", { level: 1 })).toHaveText("Hi, Fern");
  const faces = agent.getByRole("navigation", { name: "Your clients" });
  await expect(faces.getByRole("link", { name: "Send homes" })).toHaveAttribute("href", "/dashboard/new?focus=to");
  await expect(faces.getByRole("link", { name: /^Jo\b/ })).toHaveAttribute("href", /^\/reel\?from=client%3A[\w-]+$/);
  // None of a buyer's home: nothing picked for them, nobody to follow.
  await expect(agent.getByText("Picked for you")).toHaveCount(0);
  await expect(agent.getByText("People to follow")).toHaveCount(0);
  await expect(agent.getByRole("region", { name: "More homes for you" })).toHaveCount(0);

  // Jo asks something.
  const chat = await openComments(jo, quillan);
  await chat.getByLabel("Add a comment").fill("Is the basement finished?");
  await chat.getByRole("button", { name: "Post", exact: true }).click();
  await expect(chat.getByLabel("Add a comment")).toHaveValue("");

  // It waits for the agent at the top of their home, with Reply right there.
  await agent.reload();
  const needs = agent.getByRole("region", { name: "Needs you" });
  const row = needs.getByRole("listitem").filter({ hasText: "Is the basement finished?" });
  await expect(row).toContainText("Jo on 1204 Quillan St SE");
  // (The row itself opens her homes on that one, at what she said.)
  await expect(row.getByRole("link").first()).toHaveAttribute(
    "href",
    /^\/reel\?from=client%3A[\w-]+&home=SAMPLE-\d+&comment=[0-9a-f-]{36}$/,
  );
  await row.getByRole("button", { name: "Reply to Jo" }).click();
  const box = needs.getByRole("textbox", { name: "Reply to Jo" });
  await expect(box).toBeFocused();
  await box.fill("Yes, it was finished in 2019.");
  await needs.getByRole("button", { name: "Send", exact: true }).click();
  // Sent from right there: the row says so and stays put.
  await expect(row.getByRole("status")).toContainText("Sent to Jo");
  await expect(box).toHaveCount(0);
  // It's in the conversation on her link: the agent's page for it shows it.
  await row.getByRole("link", { name: "Open their link" }).click();
  await agent.waitForURL(/\/dashboard\/shares\/[\w-]+\?tab=homes/);
  await expect(agent.getByText("Yes, it was finished in 2019.")).toBeVisible();

  // Answered, it's gone from Needs you. Jo's day is a card in the Clients
  // stream: the home she liked opens her homes in a pop-out over the page,
  // on that one; Escape closes it, back where it was.
  await agent.goto("/");
  await expect(needs.getByText("Is the basement finished?")).toHaveCount(0);
  const day = agent.getByRole("listitem").filter({ hasText: "Only you see this" }).filter({ hasText: "Jo" });
  await expect(day).toContainText("Jo reacted to 1 home");
  await expect(day).toContainText("“Is the basement finished?”");
  const thumb = day.getByRole("link", { name: "1204 Quillan St SE, liked" });
  await thumb.click();
  await agent.waitForURL(/\/reel\?from=client%3A[\w-]+&home=SAMPLE-/);
  const popout = agent.getByRole("dialog", { name: "Homes" });
  await expect(homeIn(popout, "1204 Quillan St SE")).toBeInViewport({ ratio: 0.9 });
  await agent.keyboard.press("Escape");
  await expect(popout).toHaveCount(0);
  await agent.waitForURL((u) => u.pathname === "/");
  await expect(thumb).toBeFocused();
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

  // Jo's own home: her agent first along the top, and the homes Fern sent
  // her, the one she hasn't rated yet waiting, a tap from her own link.
  await jo.goto("/");
  const link = new URL(url).pathname;
  await expect(jo.getByRole("navigation", { name: "People" }).getByRole("link", { name: /^Fern, your agent/ })).toHaveAttribute(
    "href",
    link,
  );
  const fromAgent = jo.getByRole("region", { name: "1 new home for you" });
  await expect(fromAgent).toContainText("From Fern Feed");
  await expect(fromAgent).toContainText("you've rated 1 of 2");
  await expect(fromAgent.getByRole("link", { name: /^See them/ })).toHaveAttribute("href", link);
  // Fern's answer is there too.
  await expect(fromAgent).toContainText("Fern: Yes, it was finished in 2019.");
  // And from anywhere, under her initial.
  const banner = jo.getByRole("banner");
  await banner.getByRole("button", { name: "Your profile" }).click();
  await expect(banner.getByRole("link", { name: "Homes from Fern" })).toHaveAttribute("href", link);
  await jo.keyboard.press("Escape");

  // Then more homes picked for her: the first opens them in the same order.
  const more = jo.getByRole("region", { name: "More homes for you" });
  const pin = more.getByRole("listitem").first().getByRole("link");
  await expect(pin).toHaveAttribute("href", /^\/reel\?from=picks&home=SAMPLE-\d+$/);
  await pin.click();
  await jo.waitForURL(/\/reel\?from=picks&home=SAMPLE-/);
  await expect(jo.getByRole("article").first()).toBeInViewport({ ratio: 0.9 });
});
