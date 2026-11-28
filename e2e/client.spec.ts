import { expect, test } from "@playwright/test";
import { signedIn, createShare, heartOf, homeIn, joinAs, likeInPhoto, openComments, pickHome, signInAgent, passOn, threadComment, threadHome, threadRow } from "./helpers";

test("an agent's link page: what they want, remove and restore, add homes; their conversation says how each home went, private only", async ({
  browser,
}) => {
  const agent = await signInAgent(browser, "gwen@example.com", "Gwen Agent");
  const { url, dashboardUrl } = await createShare(agent, ["10421 Halvard", "1204 Quillan"], ["Joe"]);

  // Named for the one person on it; nobody types a title.
  await expect(agent.getByRole("heading", { level: 1 })).toHaveText("Joe");
  await expect(agent.getByRole("button", { name: /Rename/ })).toHaveCount(0);

  // Joe likes one home's kitchen and passes on the other's exterior.
  const joe = await signedIn(browser);
  await joe.goto(url);
  await expect(joe.getByRole("heading", { level: 1 })).toHaveText("Joe, I picked these 2 homes for you");
  const kirkland = homeIn(joe, "10421 Halvard Way NE");
  await heartOf(kirkland).click();
  await expect(heartOf(kirkland)).toHaveAttribute("aria-pressed", "true");
  await kirkland.getByRole("button", { name: "Next photo" }).click();
  await likeInPhoto(kirkland, "the floating staircase");

  const olympia = homeIn(joe, "1204 Quillan St SE");
  // Passing is "Not for me", under More; why, for anyone who'd like to say, is there too.
  const more = await passOn(joe, olympia);
  const why = more.getByRole("group", { name: "What made you pass?" });
  await why.getByRole("button", { name: "Exterior" }).click();
  await expect(why.getByRole("button", { name: "Exterior" })).toHaveAttribute("aria-pressed", "true");
  await joe.keyboard.press("Escape");
  const chat = await openComments(joe, olympia);
  await chat.getByLabel("Add a comment").fill("Not a fan of farmhouse sinks.");
  await chat.getByRole("button", { name: "Post", exact: true }).click();
  await expect(chat.getByText("Not a fan of farmhouse sinks.")).toBeVisible();
  await joe.keyboard.press("Escape");
  // The last screen says the agent sees it all, and leads on to more homes like these.
  await expect(joe.getByText("2 of 2 rated")).toBeAttached();
  await expect(joe.getByText("Gwen Agent sees your likes and comments.")).toBeAttached();
  await expect(joe.getByRole("region", { name: "The end" }).getByRole("link", { name: "See more homes like these" })).toHaveAttribute("href", "/");

  // Someone else reacts to the same home in public.
  const stranger = await (await browser.newContext()).newPage();
  await stranger.goto("/homes/SAMPLE-1005");
  const publicHome = homeIn(stranger, "10421 Halvard Way NE");
  await heartOf(publicHome).click();
  await joinAs(stranger, "Stella");
  await expect(heartOf(publicHome)).toHaveAttribute("aria-pressed", "true");
  const publicChat = await openComments(stranger, publicHome);
  await publicChat.getByLabel("Add a comment").fill("Public: that staircase!");
  await publicChat.getByRole("button", { name: "Post", exact: true }).click();
  await expect(publicChat.getByText("Public: that staircase!")).toBeVisible();

  // Joe's link and the agent's page show only Joe and the agent, never public activity.
  await joe.reload();
  await expect(joe.getByText("Public: that staircase!")).toHaveCount(0);
  await expect(joe.getByText("Stella")).toHaveCount(0);
  await agent.reload();
  await expect(agent.getByText("Public: that staircase!")).toHaveCount(0);
  await expect(agent.getByText("Stella")).toHaveCount(0);

  // What Joe wants, summed up across every home.
  await agent.goto(`${dashboardUrl}?tab=want`);
  const profile = agent.getByRole("region", { name: "What Joe wants" });
  await expect(profile).toContainText("Joe liked 1 of 2 homes · passed on 1");
  await expect(profile.getByText("Floating staircase", { exact: true })).toBeVisible();
  await expect(profile.getByText("Exterior", { exact: true })).toBeVisible();
  await agent.goto(`${dashboardUrl}?tab=homes`);
  await expect(agent.getByRole("region", { name: "10421 Halvard Way NE" })).toContainText(
    "Joe liked the floating staircase",
  );

  // Removing a home takes it off Joe's link but keeps everything he said.
  await agent.getByRole("button", { name: "Remove 1204 Quillan St SE" }).click();
  const removed = agent.getByRole("region", { name: "Removed from their link" });
  await expect(removed.getByRole("heading", { name: "1204 Quillan St SE" })).toBeVisible();
  await expect(removed.getByText("Not a fan of farmhouse sinks.")).toBeVisible();
  await expect(removed.getByText("Joe passed, didn't like the exterior")).toBeVisible();
  await agent.goto(`${dashboardUrl}?tab=want`);
  await expect(profile).toContainText("of 2 homes");
  await expect(profile.getByText("Exterior", { exact: true })).toBeVisible();
  await agent.goto(`${dashboardUrl}?tab=homes`);
  await joe.reload();
  await expect(homeIn(joe, "1204 Quillan St SE")).toHaveCount(0);
  await expect(joe.getByRole("heading", { level: 1 })).toHaveText("Joe, I picked this home for you");

  // ...and it can come back.
  await removed.getByRole("button", { name: "Restore 1204 Quillan St SE" }).click();
  await expect(agent.getByRole("region", { name: "Removed from their link" })).toHaveCount(0);
  await joe.reload();
  await expect(homeIn(joe, "1204 Quillan St SE")).toBeVisible();

  // More homes can go on the same link, so Joe's history stays in one place.
  await agent.getByRole("link", { name: "Send more homes" }).click();
  await agent.waitForURL(/\/send\?share=/);
  await expect(agent.getByRole("heading", { level: 1 })).toHaveText("Share homes with Joe");
  await expect(agent.getByRole("form", { name: "Share homes with Joe" })).toContainText("To Joe");
  await pickHome(agent, "812 N Corbel");
  await agent.getByRole("button", { name: "Send", exact: true }).click();
  // Then his conversation, the new home in it; the link's page has it too.
  await agent.waitForURL((u) => /^\/messages\/.+/.test(u.pathname) && !u.searchParams.has("sent"));
  await expect(threadHome(agent, "812 N Corbel St")).toBeVisible();
  await agent.goto(`${dashboardUrl}?tab=homes`);
  await expect(agent.getByRole("region", { name: "812 N Corbel St" })).toBeVisible();
  await joe.reload();
  await expect(homeIn(joe, "812 N Corbel St")).toBeVisible();

  // Messages lists him by name (the Clients page leads there now), his words
  // on the line under it while they wait for an answer.
  await agent.goto("/dashboard");
  await agent.waitForURL(/\/messages$/);
  const row = threadRow(agent, "Joe");
  await expect(row).toBeVisible();
  await expect(row).toContainText("“Not a fan of farmhouse sinks.”");
  await expect(row.getByText("Waiting", { exact: true })).toBeVisible();
  // ...and only what Joe did, never the public's.
  await expect(row).not.toContainText("Stella");
  await expect(row).not.toContainText("that staircase!");

  // His conversation says how it's gone: the one send, now three homes, each
  // a card with how he came down on it; what he said is a message of its
  // own under the cards, quoting the home, under his name.
  await row.getByRole("link").click();
  await agent.waitForURL(/\/messages\/.+/);
  await expect(agent.getByRole("heading", { level: 1 })).toHaveText("Joe");
  const thread = agent.getByRole("list", { name: "Messages" });
  await expect(thread.locator("li[id^='send-']")).toHaveCount(1);
  await expect(thread).toContainText("You sent 3 homes");
  await expect(thread.locator("li[id^='home-']")).toHaveCount(3);
  await expect(threadHome(agent, "10421 Halvard Way NE")).toContainText("Joe liked it");
  const passed = threadHome(agent, "1204 Quillan St SE");
  await expect(passed).toContainText("Joe passed");
  await expect(passed).not.toContainText(/comment|farmhouse/);
  const said = threadComment(agent, "1204 Quillan St SE", "Not a fan of farmhouse sinks.");
  await expect(said).toContainText("Joe");
  await expect(said.getByRole("link", { name: /About 1204 Quillan St SE/ })).toHaveAttribute("href", "#home-SAMPLE-1009");
  await expect(thread.locator("li[id^='comment-']")).toHaveCount(1);
  await expect(threadHome(agent, "812 N Corbel St")).not.toContainText(/liked|passed|comment/);
  // Nothing of anyone else's, and each home is a tap to the home itself, as his link has it.
  await expect(thread).not.toContainText("Stella");
  await expect(thread).not.toContainText("that staircase!");
  await expect(passed.getByRole("link").first()).toHaveAttribute("href", /\/reel\?from=share%3A[\w-]+&home=SAMPLE-1009$/);
  // The link's own page, with what he wants, is a tap from the top.
  await expect(agent.getByRole("link", { name: "Link details" })).toHaveAttribute("href", new URL(dashboardUrl).pathname);
});
