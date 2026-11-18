// Sending homes, a step at a time: which home (typed, or read out of a link
// to it on another site), who it's for or nobody, then the agent's own
// thoughts, given on the homes themselves (a like, a note), or skipped; then
// the link, ready to copy.
import { expect, test } from "@playwright/test";
import { homeIn, settle, signInAgent } from "./helpers";

test("a home from a pasted Zillow link, nobody named, their thoughts skipped: three steps and the link", async ({ browser }) => {
  test.setTimeout(90_000);
  const agent = await signInAgent(browser, "flo.funnel@example.com", "Flo Funnel");
  await agent.goto("/dashboard/new");
  await expect(agent.getByRole("heading", { level: 1 })).toHaveText("Send homes");
  await expect(agent.getByText("Step 1 of 3")).toBeVisible();
  // Nothing picked: nowhere to go yet.
  await expect(agent.getByRole("button", { name: "Pick a home" })).toBeDisabled();
  await expect(agent.getByRole("button", { name: "Back" })).toHaveCount(0);

  // A link to the home on Zillow: its street is read out of it and found here.
  const search = agent.getByRole("combobox", { name: "Address, MLS number, or a link to the home" });
  await search.fill("https://www.zillow.com/homedetails/1204-Quillan-St-SE-Olympia-WA-98501/48755123_zpid/");
  await expect(agent.getByRole("status").filter({ hasText: "From your link" })).toHaveText("From your link: 1204 Quillan St SE");
  const offered = agent.getByRole("listbox", { name: "Homes that match" }).getByRole("option");
  await expect(offered).toHaveCount(1);
  await expect(offered).toContainText("1204 Quillan St SE");
  // A link with no address in it says so.
  await search.fill("https://www.zillow.com/homes/for_sale/");
  await expect(agent.getByRole("status").filter({ hasText: "couldn't read" })).toBeVisible();
  // Typed, it's offered right under the box as it's typed: the part typed
  // stands out, and Enter (or a tap) picks it. The box empties for the next.
  await search.fill("quil");
  await expect(offered).toHaveCount(1);
  await expect(offered).toContainText("1204 Quillan St SE");
  await expect(offered).toContainText("Olympia");
  await expect(search).toHaveAttribute("aria-expanded", "true");
  await search.press("Enter");
  await expect(agent.getByRole("list", { name: "Picked homes" })).toContainText("1204 Quillan St SE");
  await expect(search).toHaveValue("");
  await expect(agent.getByRole("listbox", { name: "Homes that match" })).toHaveCount(0);
  await expect(agent.getByText("1 of 3 picked")).toBeVisible();
  // One that's picked isn't offered again; nothing that matches says so.
  await search.fill("quil");
  await expect(agent.getByRole("listbox", { name: "Homes that match" })).toContainText("No homes match that.");
  await search.fill("zzzz");
  await expect(agent.getByRole("listbox", { name: "Homes that match" })).toContainText("No homes match that.");
  await search.press("Escape");
  await expect(agent.getByRole("listbox", { name: "Homes that match" })).toHaveCount(0);
  await search.fill("");
  // A tap picks too.
  await search.fill("Saltm");
  await agent.getByRole("option", { name: /719 Saltmarsh Ln/ }).click();
  await expect(agent.getByText("2 of 3 picked")).toBeVisible();
  await agent.getByRole("list", { name: "Picked homes" }).getByRole("button", { name: "Remove 719 Saltmarsh Ln" }).click();
  await expect(agent.getByText("1 of 3 picked")).toBeVisible();
  await agent.getByRole("button", { name: "Next", exact: true }).click();

  // Who it's for: Back keeps the home picked; left empty, it's a link anyone can use.
  await expect(agent.getByRole("heading", { level: 1 })).toHaveText("Who's it for?");
  await expect(agent.getByText("Step 2 of 3")).toBeVisible();
  await agent.getByRole("button", { name: "Back" }).click();
  await expect(agent.getByRole("list", { name: "Picked homes" })).toContainText("1204 Quillan St SE");
  await agent.getByRole("button", { name: "Next", exact: true }).click();
  await expect(agent.getByText("Leave it empty for a link anyone can use.")).toBeVisible();
  await agent.getByRole("button", { name: "Next", exact: true }).click();

  // Their thoughts: on the home itself, as their client will see it, straight
  // to it (no welcome), with what to do said across the top. Skipped, here.
  await agent.waitForURL(/\/s\/[\w-]+\?step=thoughts$/);
  const top = agent.getByRole("banner");
  await expect(top).toContainText("Step 3 of 3");
  await expect(top).toContainText("Like or comment");
  await expect(homeIn(agent, "1204 Quillan St SE")).toBeInViewport({ ratio: 0.9 });
  await expect(agent.getByRole("region", { name: "Welcome" })).toHaveCount(0);
  // Nothing said, and nothing said before to bring over: the way on is Skip.
  await expect(top.getByRole("button", { name: "Use it here" })).toHaveCount(0);
  await expect(top.getByRole("link", { name: "Done", exact: true })).toHaveCount(0);
  await top.getByRole("link", { name: "Skip", exact: true }).click();

  // The link, and nothing else to work out.
  await agent.waitForURL(/\/dashboard\/shares\/[\w-]+\/sent$/);
  await expect(agent.getByRole("heading", { level: 1 })).toHaveText("Your link is ready");
  await expect(agent.getByRole("main")).toContainText("1204 Quillan St SE");
  const link = await agent.getByLabel("Your link is ready").inputValue();
  expect(link).toMatch(/\/s\/[\w-]{32}$/);
  // It opens on the agent's welcome, then the home, for anyone.
  const client = await (await browser.newContext()).newPage();
  await client.goto(link);
  await expect(client.getByRole("region", { name: "Welcome" })).toBeVisible();
  // Done goes to the link's own page; Send another, back to the first step.
  await expect(agent.getByRole("link", { name: "Send another" })).toHaveAttribute("href", "/dashboard/new");
  await agent.getByRole("link", { name: "Done", exact: true }).click();
  await agent.waitForURL(/\/dashboard\/shares\/[\w-]+\?tab=/);
});

test("for two people, with the agent's like and note on the home: each has a link, and reads what the agent thought", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const agent = await signInAgent(browser, "fin.funnel@example.com", "Fin Funnel");
  await agent.goto("/dashboard/new");
  await agent.getByRole("button", { name: /719 Saltmarsh/ }).click();
  await agent.getByRole("button", { name: "Next", exact: true }).click();
  const who = agent.getByRole("combobox", { name: "Who's it for?" });
  await expect(who).toBeFocused();
  for (const name of ["Ana", "Ben"]) {
    await who.fill(name);
    await who.press("Enter");
  }
  await expect(agent.getByText("This link will be called Ana & Ben.")).toBeVisible();
  await agent.getByRole("button", { name: "Next", exact: true }).click();

  // Step 3: the price liked, with a note on it.
  await agent.waitForURL(/\/s\/[\w-]+\?step=thoughts$/);
  const home = homeIn(agent, "719 Saltmarsh Ln");
  await expect(home).toBeInViewport({ ratio: 0.9 });
  const price = home.locator('[data-fact="Price"]');
  await price.click();
  const card = home.getByRole("group", { name: "Price" });
  await settle(card);
  await card.getByRole("button", { name: /^Add a note on the price/ }).click();
  const sheet = agent.getByRole("dialog", { name: "Comments" });
  await sheet.getByLabel("Add a note on the price").fill("Priced to move. Worth seeing this week.");
  await sheet.getByRole("button", { name: "Post", exact: true }).click();
  await expect(sheet).toBeHidden();
  await price.click();
  await settle(card);
  const like = card.getByRole("button", { name: /^Like the price/ });
  await like.click();
  await expect(like).toHaveAttribute("aria-pressed", "true");
  await agent.keyboard.press("Escape");
  // Something's said: it's Done now, not Skip.
  const top = agent.getByRole("banner");
  await expect(top.getByRole("link", { name: "Skip", exact: true })).toHaveCount(0);
  await top.getByRole("link", { name: "Done", exact: true }).click();

  // Each has a link of their own.
  await agent.waitForURL(/\/dashboard\/shares\/[\w-]+\/sent$/);
  await expect(agent.getByRole("heading", { level: 1 })).toHaveText("Your links are ready");
  await expect(agent.getByRole("main")).toContainText("719 Saltmarsh Ln · for Ana, Ben");
  const ana = await agent.getByLabel("Ana's link").inputValue();
  const ben = await agent.getByLabel("Ben's link").inputValue();
  expect(ana).not.toBe(ben);
  // Ben reads what the agent thought, on his own link.
  const client = await (await browser.newContext()).newPage();
  await client.goto(ben);
  await expect(client.getByText("Priced to move. Worth seeing this week.").first()).toBeAttached();
  // The same home again, for someone else: what they thought of it is a tap from being there too.
  await agent.goto("/dashboard/new");
  await agent.getByRole("button", { name: /719 Saltmarsh/ }).click();
  await agent.getByRole("button", { name: "Next", exact: true }).click();
  await who.fill("Cal");
  await who.press("Enter");
  await agent.getByRole("button", { name: "Next", exact: true }).click();
  await agent.waitForURL(/\/s\/[\w-]+\?step=thoughts$/);
  await expect(top).toContainText("You've shared your take on this home before.");
  await expect(top.getByRole("link", { name: "Skip", exact: true })).toBeVisible();
  await top.getByRole("button", { name: "Use it here" }).click();
  // It's on this link now: Done, the offer gone, and their note on the price again.
  await expect(top.getByRole("link", { name: "Done", exact: true })).toBeVisible();
  await expect(top.getByRole("button", { name: "Use it here" })).toHaveCount(0);
  await expect(homeIn(agent, "719 Saltmarsh Ln").locator('[data-fact="Price"]')).toHaveAccessibleName(/your note, 1 like$/);
  await top.getByRole("link", { name: "Done", exact: true }).click();
  await agent.waitForURL(/\/dashboard\/shares\/[\w-]+\/sent$/);
  const cal = await (await browser.newContext()).newPage();
  await cal.goto(await agent.getByLabel("Cal's link").inputValue());
  await expect(cal.getByText("Priced to move. Worth seeing this week.").first()).toBeAttached();
  // (Once each: brought over, not doubled, and Ana's and Ben's link is as it was.)
  await client.reload();
  await expect(client.getByText("Priced to move. Worth seeing this week.").first()).toBeAttached();

  // Someone else's "ready" page isn't theirs to see.
  const other = await signInAgent(browser, "fox.funnel@example.com", "Fox Funnel");
  expect((await other.request.get(new URL(agent.url()).pathname)).status()).toBe(404);
});
