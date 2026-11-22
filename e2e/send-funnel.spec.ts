// Sending homes, a step at a time: which home (typed, or read out of a link
// to it on another site), who it's for or nobody, then the agent's own
// thoughts, given on the homes themselves (a like, a note), or skipped; then
// the link, ready to copy.
import { expect, test } from "@playwright/test";
import { homeIn, openComments, pick, signInAgent, pickHome } from "./helpers";

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
  await expect(agent.getByText("1 picked", { exact: true })).toBeVisible();
  // One that's picked isn't offered again; nothing that matches says so.
  await search.fill("quil");
  await expect(agent.getByRole("listbox", { name: "Homes that match" })).toContainText("No homes match that.");
  await search.fill("zzzz");
  await expect(agent.getByRole("listbox", { name: "Homes that match" })).toContainText("No homes match that.");
  await search.press("Escape");
  await expect(agent.getByRole("listbox", { name: "Homes that match" })).toHaveCount(0);
  await search.fill("");
  // The street with its city, as a home's card prints it, finds the home;
  // so do a few words of each, and a ZIP with the street. A street in
  // another city finds nothing.
  for (const typed of ["719 Saltmarsh Ln, Edmonds", "saltmarsh edmonds", "98020 saltmarsh"]) {
    await search.fill(typed);
    await expect(offered, typed).toHaveCount(1);
    await expect(offered, typed).toContainText("719 Saltmarsh Ln");
  }
  await search.fill("Saltmarsh Ln, Seattle");
  await expect(agent.getByRole("listbox", { name: "Homes that match" })).toContainText("No homes match that.");
  await search.fill("");
  // A tap picks too.
  await search.fill("Saltm");
  await agent.getByRole("option", { name: /719 Saltmarsh Ln/ }).click();
  await expect(agent.getByText("2 picked", { exact: true })).toBeVisible();
  await agent.getByRole("list", { name: "Picked homes" }).getByRole("button", { name: "Remove 719 Saltmarsh Ln" }).click();
  await expect(agent.getByText("1 picked", { exact: true })).toBeVisible();
  await agent.getByRole("button", { name: "Next", exact: true }).click();

  // Who it's for: Back keeps the home picked; left empty, it's a link anyone can use.
  await expect(agent.getByRole("heading", { level: 1 })).toHaveText("Who's it for?");
  await expect(agent.getByText("Step 2 of 3")).toBeVisible();
  await agent.getByRole("button", { name: "Back" }).click();
  await expect(agent.getByRole("list", { name: "Picked homes" })).toContainText("1204 Quillan St SE");
  await agent.getByRole("button", { name: "Next", exact: true }).click();
  await expect(agent.getByText("Leave it empty for a link anyone can use.")).toBeVisible();
  await agent.getByRole("button", { name: "Next", exact: true }).click();

  // Their feedback: first, what this step is, in the middle of the screen,
  // with the two ways on: add it (down to the home, as their client will see
  // it) or skip. Across the top it says the same.
  await agent.waitForURL(/\/s\/[\w-]+\?step=thoughts$/);
  const top = agent.getByRole("banner");
  await expect(top).toContainText("Step 3 of 3");
  await expect(top).toContainText("Add your feedback");
  await expect(agent.getByRole("heading", { level: 1, name: "Add your feedback" })).toBeInViewport();
  await expect(agent.getByRole("link", { name: "Skip this step" })).toHaveAttribute("href", /\/dashboard\/shares\/[\w-]+\/sent$/);
  await expect(agent.getByRole("region", { name: "Welcome" })).toHaveCount(0);
  // Nothing said before to bring over.
  await expect(agent.getByRole("button", { name: "Use the same feedback" })).toHaveCount(0);
  await agent.getByRole("button", { name: "Add feedback" }).click();
  await expect(homeIn(agent, "1204 Quillan St SE")).toBeInViewport({ ratio: 0.9 });
  // Nothing said: the way on is Skip.
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
  await pickHome(agent, "719 Saltmarsh");
  await agent.getByRole("button", { name: "Next", exact: true }).click();
  const who = agent.getByRole("combobox", { name: "Who's it for?" });
  await expect(who).toBeFocused();
  for (const name of ["Ana", "Ben"]) {
    await who.fill(name);
    await who.press("Enter");
  }
  await expect(agent.getByText("This link will be called Ana & Ben.")).toBeVisible();
  await agent.getByRole("button", { name: "Next", exact: true }).click();

  // Step 3: a note, and the blue shutters liked. (The price is just words:
  // what the agent thinks of it goes in the note.)
  await agent.waitForURL(/\/s\/[\w-]+\?step=thoughts$/);
  const home = homeIn(agent, "719 Saltmarsh Ln");
  await agent.getByRole("button", { name: "Add feedback" }).click();
  await expect(home).toBeInViewport({ ratio: 0.9 });
  // (Come to rest: a tap while it's still sliding into place can miss.)
  await expect.poll(async () => Math.abs((await home.boundingBox())?.y ?? 99)).toBeLessThan(1);
  const sheet = await openComments(agent, home);
  await sheet.getByLabel("Add a note").fill("Priced to move. Worth seeing this week.");
  await sheet.getByRole("button", { name: "Post", exact: true }).click();
  await expect(sheet.getByText("Priced to move. Worth seeing this week.")).toBeVisible();
  await agent.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  const card = await pick(home, "the blue shutters");
  const like = card.getByRole("button", { name: /^Like the blue shutters(,|$)/ });
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
  await pickHome(agent, "719 Saltmarsh");
  await agent.getByRole("button", { name: "Next", exact: true }).click();
  await who.fill("Cal");
  await who.press("Enter");
  await agent.getByRole("button", { name: "Next", exact: true }).click();
  await agent.waitForURL(/\/s\/[\w-]+\?step=thoughts$/);
  await expect(agent.getByText("You've already given feedback on this home, on another link.")).toBeVisible();
  await expect(top.getByRole("link", { name: "Skip", exact: true })).toBeVisible();
  await agent.getByRole("button", { name: "Use the same feedback" }).click();
  // It's on this link now: Done, the step's screen and its offer gone, and their note and like again.
  await expect(top.getByRole("link", { name: "Done", exact: true })).toBeVisible();
  await expect(agent.getByRole("button", { name: "Use the same feedback" })).toHaveCount(0);
  await expect(agent.getByRole("heading", { level: 1, name: "Add your feedback" })).toHaveCount(0);
  const again = homeIn(agent, "719 Saltmarsh Ln");
  const thread = await openComments(agent, again);
  await expect(thread.getByText("Priced to move. Worth seeing this week.")).toBeVisible();
  await agent.keyboard.press("Escape");
  await expect(thread).toBeHidden();
  const shutters = await pick(again, "the blue shutters");
  await expect(shutters.getByRole("button", { name: /^Like the blue shutters(,|$)/ })).toHaveAttribute("aria-pressed", "true");
  await agent.keyboard.press("Escape");
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

test("a new agent with no listings still has homes to send on step 1, near where they are first, picked with a tap", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  // Signed up in Olympia, with no listings and nothing liked or sent.
  const agent = await signInAgent(browser, `nell.near.${Date.now()}@example.com`, "Nell Near", "Olympia, WA");
  // Signing in lands on Home, like everyone.
  expect(new URL(agent.url()).pathname).toBe("/");
  // Where she is was kept (so the order below has it to go on).
  await agent.goto("/people/me");
  await expect(agent.getByText("Olympia, WA")).toBeVisible();
  await agent.goto("/dashboard/new");
  await expect(agent.getByRole("heading", { level: 1 })).toHaveText("Send homes");
  // Nothing of theirs: no groups for it, but never an empty page.
  await expect(agent.getByRole("region", { name: /^Your / })).toHaveCount(0);
  await expect(agent.getByRole("region", { name: "Homes you've liked, saved or sent" })).toHaveCount(0);
  const more = agent.getByRole("region", { name: "Homes to send" });
  const homes = more.getByRole("button", { name: /^\$/ });
  await expect(homes.first()).toBeVisible();
  expect(await homes.count()).toBeGreaterThanOrEqual(3);
  // Near them first: a home in Olympia leads. (The sample listings have one
  // home in Olympia, SAMPLE-1009, and one in Port Townsend, SAMPLE-1010; both
  // for sale and from the MLS.)
  await expect(homes.first()).toContainText("Olympia");
  // Each home once.
  const names = await homes.allInnerTexts();
  expect(new Set(names).size).toBe(names.length);
  // And it's where she is that puts it first, not that it's the newest or
  // most liked (which would put it first for everyone): an agent in Port
  // Townsend, the same in every other way, has a Port Townsend home first.
  const other = await signInAgent(browser, `pia.near.${Date.now()}@example.com`, "Pia Near", "Port Townsend, WA");
  await other.goto("/dashboard/new");
  const theirs = other.getByRole("region", { name: "Homes to send" }).getByRole("button", { name: /^\$/ });
  await expect(theirs.first()).toContainText("Port Townsend");
  await other.context().close();
  // Each one a big target: a photo, the price and the address, and "Pick".
  const first = homes.first();
  expect((await first.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(first).toContainText("Pick");
  await expect(first).toHaveAttribute("aria-pressed", "false");

  // One tap picks it, the same as a home found by typing: the count, the
  // tray, and the way on.
  const address = (await first.locator("span.truncate").first().innerText()).trim();
  await first.click();
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(first).toContainText("Picked");
  await expect(agent.getByText("1 picked", { exact: true })).toBeVisible();
  await expect(agent.getByRole("list", { name: "Picked homes" })).toContainText(address);
  // A second tap puts it back.
  await first.click();
  await expect(agent.getByText("0 picked", { exact: true })).toBeVisible();
  await expect(agent.getByRole("button", { name: "Pick a home" })).toBeDisabled();
  await first.click();
  await agent.getByRole("button", { name: "Next", exact: true }).click();
  await expect(agent.getByText("Step 2 of 3")).toBeVisible();
  await expect(agent.getByRole("combobox", { name: "Who's it for?" })).toBeFocused();
});
