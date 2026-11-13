import { expect, test } from "@playwright/test";
import { createShare, heartOf, homeIn, joinAs, signInAgent } from "./helpers";

test("a client's page: one part at a time, people added and taken off, and anyone who signed up linked to their profile", async ({
  browser,
  request,
}) => {
  test.setTimeout(90_000);
  const agent = await signInAgent(browser, "pia-people@example.com", "Pia People");
  const { urls, dashboardUrl } = await createShare(agent, ["1204 Quillan", "719 Saltmarsh"], ["Ben", "Nina"]);
  const parts = agent.getByRole("navigation", { name: "Parts of this page" });
  const people = agent.getByRole("region", { name: "People on this link" });

  // Not opened yet: it starts on sending it, each person with their own link,
  // and only the part asked for is on the page.
  await expect(parts.getByRole("link", { name: /People & link/ })).toHaveAttribute("aria-current", "page");
  await expect(people.getByLabel("Ben's link")).toBeVisible();
  await expect(people.getByLabel("Nina's link")).toBeVisible();
  await expect(people.getByText("Hasn't signed up yet")).toHaveCount(2);
  await expect(agent.getByRole("region", { name: "1204 Quillan St SE" })).toHaveCount(0);

  // Ben signs up right on his link to like a home.
  const ben = await (await browser.newContext()).newPage();
  await ben.goto(urls.Ben);
  const quillan = homeIn(ben, "1204 Quillan St SE");
  await heartOf(quillan).click();
  await joinAs(ben, "Ben");
  await expect(heartOf(quillan)).toHaveAttribute("aria-pressed", "true");

  // Opened now, so the page starts on the homes, and Ben's name goes to his profile.
  await agent.goto(dashboardUrl);
  await expect(parts.getByRole("link", { name: /Homes/ })).toHaveAttribute("aria-current", "page");
  const home = agent.getByRole("region", { name: "1204 Quillan St SE" });
  await expect(home.getByRole("link", { name: "Ben", exact: true })).toHaveAttribute("href", /^\/people\/[\w-]+$/);
  await expect(agent.getByText("On this link:").getByRole("link", { name: "Ben", exact: true })).toBeVisible();

  // What they want: Ben linked; Nina, who hasn't signed up, not.
  await parts.getByRole("link", { name: "What they want" }).click();
  const want = agent.getByRole("region", { name: "What they each want" });
  await expect(want.getByRole("link", { name: "Ben", exact: true })).toBeVisible();
  await expect(want).toContainText("Nina hasn't reacted yet");
  await expect(want.getByRole("link", { name: "Nina", exact: true })).toHaveCount(0);

  // People: Ben's profile, one tap away.
  await parts.getByRole("link", { name: /People & link/ }).click();
  await expect(people.getByRole("link", { name: "View profile of Ben" })).toHaveAttribute("href", /^\/people\/[\w-]+$/);
  await expect(people.getByText("Hasn't signed up yet")).toHaveCount(1);

  // Taking Nina off asks first, and Keep keeps her.
  await people.getByRole("button", { name: "Remove Nina" }).click();
  const ask = people.getByRole("group", { name: /^Remove Nina from this link\?/ });
  await expect(ask).toContainText("Their link stops working");
  await ask.getByRole("button", { name: "Keep Nina" }).click();
  await expect(ask).toHaveCount(0);
  await expect(people.getByRole("button", { name: "Remove Nina" })).toBeFocused();

  // Yes: she's off it, her link no longer opens, and the link's name follows.
  await people.getByRole("button", { name: "Remove Nina" }).click();
  await ask.getByRole("button", { name: "Remove Nina" }).click();
  await expect(people.getByLabel("Nina's link")).toHaveCount(0);
  await expect(agent.getByRole("heading", { level: 1 })).toHaveText("Ben");
  expect((await request.get(urls.Nina)).status()).toBe(404);
  await expect(homeIn(ben, "1204 Quillan St SE")).toBeVisible();

  // The last one on a link stays.
  await expect(people.getByRole("button", { name: /^Remove/ })).toHaveCount(0);
});
