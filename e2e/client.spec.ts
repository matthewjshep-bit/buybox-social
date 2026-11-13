import { expect, test } from "@playwright/test";
import { clientRow, signedIn, createShare, heartOf, homeIn, joinAs, likeInPhoto, openComments, openMore, signInAgent } from "./helpers";

test("an agent's client page: what they want, remove and restore, add homes, private only", async ({
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
  // No Tinder-style buttons: passing is "Not for me", under More.
  await expect(olympia.getByRole("button", { name: /^(Pass|Dislike)$/ })).toHaveCount(0);
  const more = await openMore(joe, olympia);
  await more.getByRole("button", { name: "Not for me" }).click();
  const why = more.getByRole("group", { name: "What made you pass?" });
  await why.getByRole("button", { name: "Exterior" }).click();
  await expect(why.getByRole("button", { name: "Exterior" })).toHaveAttribute("aria-pressed", "true");
  await joe.keyboard.press("Escape");
  const chat = await openComments(joe, olympia);
  await chat.getByLabel("Add a comment").fill("Not a fan of farmhouse sinks.");
  await chat.getByRole("button", { name: "Post", exact: true }).click();
  await expect(chat.getByText("Not a fan of farmhouse sinks.")).toBeVisible();
  await joe.keyboard.press("Escape");
  // The last screen says the agent sees it all.
  await expect(joe.getByText("You've reacted to 2 of 2 homes.")).toBeAttached();
  await expect(joe.getByText("Gwen Agent sees what you liked and said.")).toBeAttached();

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
  await expect(agent.getByRole("heading", { name: "Add homes for Joe" })).toBeVisible();
  await expect(agent.getByRole("button", { name: /10421 Halvard/ })).toHaveCount(0);
  await agent.getByRole("button", { name: /812 N Corbel/ }).click();
  await agent.getByRole("button", { name: "Add 1 home to Joe's link" }).click();
  await agent.waitForURL("**/dashboard/shares/*");
  await expect(agent.getByRole("region", { name: "812 N Corbel St" })).toBeVisible();
  await joe.reload();
  await expect(homeIn(joe, "812 N Corbel St")).toBeVisible();

  // The dashboard lists the client by name, with how they came down on each home.
  await agent.goto("/dashboard");
  const row = clientRow(agent, "Joe");
  await expect(row).toBeVisible();
  await expect(row).toContainText(/3\s*homes sent/);
  await expect(row).toContainText(/1\s*liked/);
  await expect(row).toContainText(/1\s*passed/);
  // ...and only what Joe did, never the public's.
  await expect(row).not.toContainText("Stella");
  await expect(row).not.toContainText("that staircase!");
});
