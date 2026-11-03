import { expect, test } from "@playwright/test";
import { createShare, signInAgent } from "./helpers";

test("an agent's client page: rename, what they want, remove and restore, add homes, private only", async ({
  browser,
}) => {
  const agent = await signInAgent(browser, "gwen@example.com", "Gwen Agent");
  const { url } = await createShare(agent, ["10421 Halvard", "1204 Quillan"]);

  // The client can be renamed in place.
  await agent.getByRole("button", { name: "Rename" }).click();
  await agent.getByLabel("Client's name").fill("Joe");
  await agent.getByRole("button", { name: "Save" }).click();
  await expect(agent.getByRole("heading", { level: 1, name: "Joe" })).toBeVisible();

  // Joe likes one home's kitchen and passes on the other's exterior.
  const joe = await (await browser.newContext()).newPage();
  await joe.goto(url);
  await expect(joe.getByRole("heading", { level: 1 })).toHaveText("Joe, I picked these 2 homes for you");
  const kirkland = joe.getByRole("article", { name: "10421 Halvard Way NE" });
  await kirkland.getByRole("group", { name: "Your reaction" }).getByRole("button", { name: /^Like/ }).click();
  await joe.getByRole("textbox", { name: "First name" }).fill("Joe");
  await joe.getByRole("button", { name: "Continue" }).click();
  await kirkland.getByRole("group", { name: "What do you like?" }).getByRole("button", { name: "Kitchen" }).click();
  await kirkland.getByRole("button", { name: "Done" }).click();

  const olympia = joe.getByRole("article", { name: "1204 Quillan St SE" });
  // Client links say Pass, not Dislike.
  await expect(olympia.getByRole("button", { name: /^Dislike/ })).toHaveCount(0);
  await olympia.getByRole("group", { name: "Your reaction" }).getByRole("button", { name: /^Pass/ }).click();
  await olympia.getByRole("group", { name: "What don't you like?" }).getByRole("button", { name: "Exterior" }).click();
  await olympia.getByRole("button", { name: "Done" }).click();
  await expect(olympia.getByText("You passed, didn't like the exterior.")).toBeVisible();
  await olympia.getByLabel("Add a comment").fill("Not a fan of farmhouse sinks.");
  await olympia.getByRole("button", { name: "Post comment" }).click();
  await expect(olympia.getByText("Not a fan of farmhouse sinks.")).toBeVisible();

  // Someone else reacts to the same home in public.
  const stranger = await (await browser.newContext()).newPage();
  await stranger.goto("/homes/SAMPLE-1005");
  await stranger.getByRole("group", { name: "Your reaction" }).getByRole("button", { name: /^Like/ }).click();
  await stranger.getByRole("textbox", { name: "First name" }).fill("Stella");
  await stranger.getByRole("button", { name: "Continue" }).click();
  await expect(
    stranger.getByRole("group", { name: "Your reaction" }).getByRole("button", { name: /^Like/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await stranger.getByLabel("Add a comment").fill("Public: that staircase!");
  await stranger.getByRole("button", { name: "Post comment" }).click();
  await expect(stranger.getByText("Public: that staircase!")).toBeVisible();

  // Joe's link and the agent's page show only Joe and the agent, never public activity.
  await joe.reload();
  await expect(joe.getByText("Public: that staircase!")).toHaveCount(0);
  await expect(joe.getByText("Stella")).toHaveCount(0);
  await agent.reload();
  await expect(agent.getByText("Public: that staircase!")).toHaveCount(0);
  await expect(agent.getByText("Stella")).toHaveCount(0);

  // What Joe wants, summed up across every home.
  const profile = agent.getByRole("region", { name: "What Joe wants" });
  await expect(profile).toContainText("Joe liked 1 of 2 homes · passed 1");
  await expect(profile.getByText("Kitchen 1")).toBeVisible();
  await expect(profile.getByText("Exterior 1")).toBeVisible();

  // Removing a home takes it off Joe's link but keeps everything he said.
  await agent.getByRole("button", { name: "Remove 1204 Quillan St SE" }).click();
  const removed = agent.getByRole("region", { name: "Removed from their link" });
  await expect(removed.getByRole("heading", { name: "1204 Quillan St SE" })).toBeVisible();
  await expect(removed.getByText("Not a fan of farmhouse sinks.")).toBeVisible();
  await expect(removed.getByText("Joe passed, didn't like the exterior")).toBeVisible();
  await expect(profile).toContainText("of 2 homes");
  await expect(profile.getByText("Exterior 1")).toBeVisible();
  await joe.reload();
  await expect(joe.getByRole("article", { name: "1204 Quillan St SE" })).toHaveCount(0);
  await expect(joe.getByRole("heading", { level: 1 })).toHaveText("Joe, I picked this home for you");

  // ...and it can come back.
  await removed.getByRole("button", { name: "Restore 1204 Quillan St SE" }).click();
  await expect(agent.getByRole("region", { name: "Removed from their link" })).toHaveCount(0);
  await joe.reload();
  await expect(joe.getByRole("article", { name: "1204 Quillan St SE" })).toBeVisible();

  // More homes can go on the same link, so Joe's history stays in one place.
  await agent.getByRole("link", { name: "Add homes" }).click();
  await expect(agent.getByRole("heading", { name: "Add homes for Joe" })).toBeVisible();
  await expect(agent.getByRole("button", { name: /10421 Halvard/ })).toHaveCount(0);
  await agent.getByRole("button", { name: /812 N Corbel/ }).click();
  await agent.getByRole("button", { name: "Add 1 home to Joe's link" }).click();
  await agent.waitForURL("**/dashboard/shares/*");
  await expect(agent.getByRole("region", { name: "812 N Corbel St" })).toBeVisible();
  await joe.reload();
  await expect(joe.getByRole("article", { name: "812 N Corbel St" })).toBeVisible();

  // The dashboard lists the client by name.
  await agent.goto("/dashboard");
  await expect(agent.getByRole("link", { name: /Joe/ })).toBeVisible();
});
