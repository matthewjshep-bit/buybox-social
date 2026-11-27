// Sending homes is one box (/send): the homes (typed, or read out of a link to
// the home on another site, or picked from the ones offered), a few words,
// and who it's for; Send, and the conversation with them opens, each person's
// link ready to copy.
import { expect, test } from "@playwright/test";
import { pickHome, signInAgent, toLinkReady } from "./helpers";

const QUILLAN = "1204 Quillan St SE";
const SALTMARSH = "719 Saltmarsh Ln";

test("a home from a pasted Zillow link, found and picked in the box; named for someone, the link is ready in the conversation", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const agent = await signInAgent(browser, "flo.funnel@example.com", "Flo Funnel");
  await agent.goto("/send?aud=someone");
  await expect(agent).toHaveTitle("Share homes · Porchcard");
  await expect(agent.getByRole("heading", { level: 1 })).toHaveText("Share homes");
  await expect(agent.getByRole("button", { name: "Who sees this: Private" })).toBeVisible();
  // Nothing picked: nowhere to go yet, and it says why.
  const send = agent.getByRole("button", { name: "Send", exact: true });
  await expect(send).toBeDisabled();
  await expect(agent.getByText("Add a home to send.")).toBeVisible();

  // A link to the home on Zillow: its street is read out of it and found here.
  await agent.getByRole("button", { name: "Add a home" }).click();
  const search = agent.getByRole("combobox", { name: "Address, MLS number, or a link to the home" });
  await expect(search).toBeFocused();
  await search.fill("https://www.zillow.com/homedetails/1204-Quillan-St-SE-Olympia-WA-98501/48755123_zpid/");
  await expect(agent.getByRole("status").filter({ hasText: "From your link" })).toHaveText(`From your link: ${QUILLAN}`);
  const offered = agent.getByRole("listbox", { name: "Homes that match" }).getByRole("option");
  await expect(offered).toHaveCount(1);
  await expect(offered).toContainText(QUILLAN);
  // Each offered as a card: the price first, then the address, and a +.
  // (The option is the row itself: no button inside it to Tab to.)
  await expect(offered).toHaveAccessibleName(/^\$[\d,]+ · 1204 Quillan St SE/);
  await expect(offered.getByRole("button")).toHaveCount(0);
  // A link with no address in it says so.
  await search.fill("https://www.zillow.com/homes/for_sale/");
  await expect(agent.getByRole("status").filter({ hasText: "couldn't read" })).toHaveText(
    "We couldn't read an address from that link. Type the address instead.",
  );
  // Typed, it's offered right under the box as it's typed, and Enter (or a
  // tap) picks it. The box empties for the next.
  await search.fill("quil");
  await expect(offered).toHaveCount(1);
  await expect(offered).toContainText(QUILLAN);
  await expect(offered).toContainText("Olympia");
  await expect(search).toHaveAttribute("aria-expanded", "true");
  await search.press("Enter");
  const picked = agent.getByRole("list", { name: "Picked homes" });
  await expect(picked).toContainText(QUILLAN);
  await expect(picked.getByRole("listitem")).toHaveCount(1);
  await expect(search).toHaveValue("");
  await expect(agent.getByRole("listbox", { name: "Homes that match" })).toHaveCount(0);
  // One that's picked isn't offered again; nothing that matches says so.
  await search.fill("quil");
  await expect(agent.getByRole("status").filter({ hasText: "No homes match that." })).toBeVisible();
  await expect(agent.getByRole("listbox", { name: "Homes that match" })).toHaveCount(0);
  await search.fill("zzzz");
  await expect(agent.getByRole("status").filter({ hasText: "No homes match that." })).toBeVisible();
  // Escape clears what's typed.
  await search.press("Escape");
  await expect(search).toHaveValue("");
  await expect(agent.getByRole("listbox", { name: "Homes that match" })).toHaveCount(0);
  // The street with its city, as a home's card prints it, finds the home;
  // so do a few words of each, and a ZIP with the street. A street in
  // another city finds nothing.
  for (const typed of ["719 Saltmarsh Ln, Edmonds", "saltmarsh edmonds", "98020 saltmarsh"]) {
    await search.fill(typed);
    await expect(offered, typed).toHaveCount(1);
    await expect(offered, typed).toContainText(SALTMARSH);
  }
  await search.fill("Saltmarsh Ln, Seattle");
  await expect(agent.getByRole("status").filter({ hasText: "No homes match that." })).toBeVisible();
  await search.fill("");
  // A tap picks too; Remove puts it back.
  await search.fill("Saltm");
  await agent.getByRole("option", { name: /719 Saltmarsh Ln/ }).click();
  await expect(picked.getByRole("listitem")).toHaveCount(2);
  const remove = picked.getByRole("button", { name: `Remove ${SALTMARSH}` });
  expect((await remove.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await remove.click();
  await expect(picked.getByRole("listitem")).toHaveCount(1);
  await expect(picked).toContainText(QUILLAN);

  // A home, but nobody: it can't go yet, and it says why.
  await expect(send).toBeDisabled();
  await expect(agent.getByText("Say who it's for.")).toBeVisible();
  const who = agent.getByRole("combobox", { name: "Who's it for?" });
  await who.fill("Jo");
  await who.press("Enter");
  await expect(agent.getByRole("list", { name: "Who it's for" }).getByText("Jo", { exact: true })).toBeVisible();
  await expect(agent.getByText("Say who it's for.")).toHaveCount(0);
  await expect(send).toBeEnabled();

  // Send: the conversation with Jo opens, her link ready at its foot.
  await toLinkReady(agent);
  await expect(agent.getByRole("heading", { level: 1, name: "Jo" })).toBeVisible();
  const ready = agent.getByRole("region", { name: "Links to send" });
  await expect(ready.getByRole("heading", { level: 2 })).toHaveText("Jo's link is ready");
  const input = ready.getByLabel("Jo's link");
  await expect(input).toHaveAttribute("readonly", "");
  const link = await input.inputValue();
  expect(link).toMatch(/\/s\/[\w-]{32}$/);
  // The home she was sent is in the conversation.
  await expect(agent.getByRole("list", { name: "Messages" })).toContainText(QUILLAN);
  // It opens on the agent's welcome, then the home.
  const client = await (await browser.newContext()).newPage();
  await client.goto(link);
  await expect(client.getByRole("region", { name: "Welcome" })).toBeVisible();
  await expect(client.getByRole("heading", { level: 1 })).toHaveText("Jo, I picked this home for you");
  // Done leaves the link behind, in the conversation.
  const done = ready.getByRole("link", { name: "Done" });
  expect((await done.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await done.click();
  await agent.waitForURL((url) => url.pathname.startsWith("/messages/") && !url.searchParams.has("sent"));
  await expect(agent.getByRole("region", { name: "Links to send" })).toHaveCount(0);
});

test("for two people, with a few words: each has a link of their own, and reads the words on it; nobody else sees the link's page", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const agent = await signInAgent(browser, "fin.funnel@example.com", "Fin Funnel");
  await agent.goto("/send?aud=someone");
  await pickHome(agent, "719 Saltmarsh");
  // The words go with the homes. (The price is just words: what the agent
  // thinks of it goes here.)
  await agent.getByRole("textbox", { name: "Say something" }).fill("Priced to move. Worth seeing this week.");
  const who = agent.getByRole("combobox", { name: "Who's it for?" });
  for (const name of ["Ana", "Ben"]) {
    await who.fill(name);
    await who.press("Enter");
    await expect(agent.getByRole("list", { name: "Who it's for" }).getByText(name, { exact: true })).toBeVisible();
  }

  // Each has a link of their own, in the conversation with them.
  await toLinkReady(agent);
  const ready = agent.getByRole("region", { name: "Links to send" });
  await expect(ready.getByRole("heading", { level: 2 })).toHaveText("Their links are ready");
  const ana = await ready.getByLabel("Ana's link").inputValue();
  const ben = await ready.getByLabel("Ben's link").inputValue();
  expect(ana).toMatch(/\/s\/[\w-]{32}$/);
  expect(ben).toMatch(/\/s\/[\w-]{32}$/);
  expect(ana).not.toBe(ben);
  await expect(agent.getByRole("list", { name: "Messages" })).toContainText(SALTMARSH);

  // Ben reads what the agent said, on his own link, as he arrives.
  const client = await (await browser.newContext()).newPage();
  await client.goto(ben);
  const welcome = client.getByRole("region", { name: "Welcome" });
  await expect(welcome).toBeVisible();
  await expect(welcome).toContainText("Priced to move. Worth seeing this week.");
  await expect(welcome.getByRole("heading", { level: 1 })).toHaveText("Ben, I picked this home for you");

  // The link's own page, from the conversation.
  await agent.getByRole("link", { name: "Link details" }).click();
  await agent.waitForURL(/\/dashboard\/shares\/[\w-]+(\?tab=.*)?$/);
  await expect(agent.getByRole("main")).toContainText(SALTMARSH);
  const sharePath = new URL(agent.url()).pathname;
  // Their links again, to copy, under People & link.
  await agent.getByRole("link", { name: /^People & link/ }).click();
  await agent.waitForURL(/\?tab=people$/);
  await expect(agent.getByLabel("Ana's link")).toHaveValue(ana);
  await expect(agent.getByLabel("Ben's link")).toHaveValue(ben);

  // Someone else's link page isn't theirs to see.
  const other = await signInAgent(browser, "fox.funnel@example.com", "Fox Funnel");
  expect((await other.request.get(sharePath)).status()).toBe(404);
  expect((await other.request.get(`${sharePath}?tab=people`)).status()).toBe(404);
});

test("a new agent with no listings still has homes to send in the box, near where they are first, picked with a tap", async ({
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
  await agent.goto("/send?aud=someone");
  await expect(agent.getByRole("heading", { level: 1 })).toHaveText("Share homes");
  // Add a home: before anything's typed, homes are offered.
  await agent.getByRole("button", { name: "Add a home" }).click();
  const more = agent.getByRole("region", { name: "Popular and near you" });
  const homes = more.getByRole("button", { name: /^\$/ });
  await expect(homes.first()).toBeVisible();
  // Nothing of theirs: no groups for it, but never an empty box.
  await expect(agent.getByRole("region", { name: /^Your / })).toHaveCount(0);
  await expect(agent.getByRole("region", { name: "Homes you've liked, saved or sent" })).toHaveCount(0);
  await expect(more.getByRole("heading", { level: 3 })).toHaveText("Popular and near you");
  expect(await homes.count()).toBeGreaterThanOrEqual(3);
  // Near them first: a home in Olympia leads. (The sample listings have one
  // home in Olympia, SAMPLE-1009, and one in Port Townsend, SAMPLE-1010; both
  // for sale and from the MLS.)
  await expect(homes.first()).toContainText("Olympia");
  // Each home once.
  const names = await homes.allInnerTexts();
  expect(new Set(names).size).toBe(names.length);
  // A few at a time; the rest a tap away.
  const showMore = more.getByRole("button", { name: /^Show \d+ more$/ });
  await expect(showMore).toBeVisible();
  const shown = await homes.count();
  await showMore.click();
  await expect.poll(() => homes.count()).toBeGreaterThan(shown);
  await expect(showMore).toHaveCount(0);
  // And it's where she is that puts it first, not that it's the newest or
  // most liked (which would put it first for everyone): an agent in Port
  // Townsend, the same in every other way, has a Port Townsend home first.
  const other = await signInAgent(browser, `pia.near.${Date.now()}@example.com`, "Pia Near", "Port Townsend, WA");
  await other.goto("/send?aud=someone");
  await other.getByRole("button", { name: "Add a home" }).click();
  const theirs = other.getByRole("region", { name: "Popular and near you" }).getByRole("button", { name: /^\$/ });
  await expect(theirs.first()).toContainText("Port Townsend");
  await other.context().close();
  // Each one a big target: a photo, the price and the address, and a +.
  const first = homes.first();
  expect((await first.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  // One tap picks it, the same as a home found by typing: it leaves the
  // homes offered for the picked ones.
  // (The price on a line of its own, then " · " for a screen reader and the street.)
  const [, street] = (await first.innerText())
    .split("\n")
    .map((line) => line.trim().replace(/^·\s*/, ""))
    .filter(Boolean);
  const address = street;
  expect(address).toBe(QUILLAN);
  await first.click();
  const picked = agent.getByRole("list", { name: "Picked homes" });
  await expect(picked).toContainText(address);
  await expect(more.getByRole("button", { name: new RegExp(address) })).toHaveCount(0);
  await expect(homes.first()).not.toContainText("Olympia");
  // Remove puts it back where it was, at the head.
  await picked.getByRole("button", { name: `Remove ${address}` }).click();
  await expect(picked).toHaveCount(0);
  await expect(homes.first()).toContainText(address);
  await first.click();
  await expect(picked).toContainText(address);
  // Who it's for is right there, and nothing goes until someone's named.
  await expect(agent.getByRole("combobox", { name: "Who's it for?" })).toBeVisible();
  await expect(agent.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await expect(agent.getByText("Say who it's for.")).toBeVisible();
});
