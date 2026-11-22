// Anyone, not only an agent, can send homes: the same three steps (which
// home, who it's for, their own feedback or none), then the link. Whoever
// opens it sees who it's from by name, never as "your agent"; and what they
// say on it reaches the sender's Activity, going back to their link's page.
// Every link they've made is kept on "Homes you sent": who it's for, whether
// it's been opened, and the link to copy again; nothing of what a friend
// liked there, or when or how far they looked.
// On a home for sale, their Send is the home's main button: it goes on to the
// same three steps with that home picked, from Browse, from a home opened
// over their feed, and from an agent's own listing on the agent's profile.
import { expect, test } from "@playwright/test";
import { enterListingYourself, heartOf, homeIn, joinAs, openComments, pickHome, signInAgent, signUpBuyer, toFirstHome } from "./helpers";

const QUILLAN = "1204 Quillan St SE";
// A tiny PNG, as a photo would arrive.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==",
  "base64",
);

test("someone who isn't an agent sends a home in three steps, and hears back in Activity", async ({ browser }) => {
  test.setTimeout(150_000);
  const maya = await signUpBuyer(browser, `maya.sends.${Date.now()}@example.com`, "Maya");

  // From their home: Send homes, and the first step.
  await maya.goto("/");
  await maya.getByRole("link", { name: "Send homes to someone" }).click();
  await maya.waitForURL(/\/send$/);
  await expect(maya.getByRole("heading", { level: 1 })).toHaveText("Send homes");
  await expect(maya.getByText("Step 1 of 3")).toBeVisible();
  // Nothing sent yet: no way back to it offered, and its page says so.
  await expect(maya.getByRole("main").getByRole("link", { name: "Homes you sent" })).toHaveCount(0);
  await maya.goto("/send/sent");
  await expect(maya.getByRole("heading", { level: 1 })).toHaveText("Homes you sent");
  await expect(maya.getByRole("main")).toContainText("Nothing sent yet");
  await maya.getByRole("main").getByRole("link", { name: "Send homes" }).last().click();
  await maya.waitForURL(/\/send$/);
  await pickHome(maya, QUILLAN);
  await maya.getByRole("button", { name: "Next", exact: true }).click();

  // Who it's for: a first name, with nothing about clients.
  const who = maya.getByRole("combobox", { name: "Who's it for?" });
  await expect(who).toHaveAttribute("placeholder", "A first name");
  await who.fill("Sam");
  await who.press("Enter");
  await expect(maya.getByText("This link will be called Sam.")).toBeVisible();
  await maya.getByRole("button", { name: "Next", exact: true }).click();

  // Their feedback, or none: skipped here, straight to the link.
  await maya.waitForURL(/\/s\/[\w-]+\?step=thoughts$/);
  await expect(maya.getByRole("heading", { level: 1, name: "Add your feedback" })).toBeInViewport();
  await expect(maya.getByText("so Sam sees what you think")).toBeVisible();
  await maya.getByRole("link", { name: "Skip this step" }).click();
  await maya.waitForURL(/\/send\/[\w-]+$/);
  const ownPage = new URL(maya.url()).pathname;
  await expect(maya.getByRole("heading", { level: 1 })).toHaveText("Your link is ready");
  await expect(maya.getByRole("main")).toContainText(QUILLAN);
  const link = await maya.getByLabel("Sam's link").inputValue();
  expect(link).toMatch(/\/s\/[\w-]{32}$/);
  await expect(maya.getByRole("link", { name: "Send another" })).toHaveAttribute("href", "/send");
  await expect(maya.getByRole("main").getByRole("link", { name: "Homes you sent" })).toHaveAttribute("href", "/send/sent");

  // Done lands on every link she's made, the new one first: who it's for,
  // the home, that nobody has opened it, and the link to copy again.
  await maya.getByRole("link", { name: "Done", exact: true }).click();
  await maya.waitForURL(/\/send\/sent$/);
  await expect(maya).toHaveTitle("Homes you sent · Porchcard");
  await expect(maya.getByRole("heading", { level: 1 })).toHaveText("Homes you sent");
  const row = maya.getByRole("list", { name: "Homes you sent" }).getByRole("listitem").first();
  await expect(row.getByRole("link", { name: "Sam", exact: true })).toHaveAttribute("href", ownPage);
  await expect(row).toContainText(QUILLAN);
  await expect(row.getByText("Not opened yet", { exact: true })).toBeVisible();
  await expect(row.getByRole("button", { name: "Copy link for Sam" })).toBeVisible();
  await expect(row.getByRole("link", { name: /^Open/ })).toHaveCount(0);
  // And from the first step of sending, now there's one to go back to.
  await maya.getByRole("main").getByRole("link", { name: "Send homes" }).click();
  await maya.waitForURL(/\/send$/);
  await maya.getByRole("main").getByRole("link", { name: "Homes you sent" }).click();
  await maya.waitForURL(/\/send\/sent$/);

  // Sam opens it: from Maya, by name, and nowhere "your agent".
  const sam = await (await browser.newContext()).newPage();
  await sam.goto(link);
  await expect(sam.getByRole("region", { name: "Welcome" })).toBeVisible();
  // Maya's row says so, just that (not when), with the way into its page.
  await expect(async () => {
    await maya.goto("/send/sent");
    await expect(row.getByText("Opened", { exact: true })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await expect(row.getByRole("link", { name: /^Open/ })).toHaveAttribute("href", ownPage);
  await expect(row.getByRole("button", { name: /Copy link/ })).toHaveCount(0);
  await expect(sam.getByRole("banner")).toContainText("Maya");
  await expect(sam.locator("body")).not.toContainText(/your agent/i);
  await toFirstHome(sam);
  const chat = await openComments(sam, homeIn(sam, QUILLAN));
  await chat.getByRole("textbox").first().fill("The porch is lovely.");
  await chat.getByRole("textbox").first().press("Enter");
  await joinAs(sam, "Sam");
  await expect(chat.getByText("The porch is lovely.")).toBeVisible();

  // Maya hears of it in Activity: Sam, not "Your client", and back to her link's page.
  const line = maya.getByRole("main").getByRole("listitem").filter({ hasText: "Sam" }).first();
  // (Once what Sam said has been saved.)
  await expect(async () => {
    await maya.goto("/activity");
    await expect(line).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await expect(maya.getByRole("main")).not.toContainText("Your client");
  await expect(line.locator(`a[href^="${ownPage}"]`).first()).toBeAttached();
  // From her link's page, into the link itself, where what Sam said is.
  await maya.goto(ownPage);
  await maya.getByRole("link", { name: "See what they said" }).click();
  await maya.waitForURL(/\/s\/[\w-]+$/);
  await expect(maya.getByText("The porch is lovely.").first()).toBeAttached();
  // Sam likes the home too. On "Homes you sent" it's opened, with one
  // comment: not what Sam liked, how much he looked at, or when; and nothing
  // an agent's list would add.
  await sam.keyboard.press("Escape");
  await expect(chat).toBeHidden();
  await heartOf(homeIn(sam, QUILLAN)).click();
  await expect(heartOf(homeIn(sam, QUILLAN))).toHaveAttribute("aria-pressed", "true");
  await maya.goto("/send/sent");
  await expect(row.getByText("Opened · 1 comment", { exact: true })).toBeVisible();
  await expect(row).not.toContainText(/Liked|saw |Waiting for you|New|Opened (today|yesterday|at|\d)/);
  // From a link's page, back to them all.
  await maya.goto(ownPage);
  await maya.getByRole("main").getByRole("link", { name: "Homes you sent" }).click();
  await maya.waitForURL(/\/send\/sent$/);

  // Nobody else's to open; an agent's Send homes is on their dashboard.
  await sam.goto(ownPage);
  await expect(sam.getByText("Your link is ready")).toHaveCount(0);
  await expect(sam.locator("body")).not.toContainText(link.split("/s/")[1]);
  const agent = await signInAgent(browser, `ag.sends.${Date.now()}@example.com`, "Ag Sends");
  await agent.goto("/send");
  await agent.waitForURL(/\/dashboard\/new$/);
  // And their links are on its Links tab.
  await agent.goto("/send/sent");
  await agent.waitForURL(/\/dashboard\/links$/);
  await expect(agent.getByRole("heading", { level: 1 })).toHaveText("Links");
});

test("Send on a home goes on to the three steps with that home picked: in Browse, over their own page, and on an agent's own listing", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const stamp = Date.now();
  const noor = await signUpBuyer(browser, `noor.sends.${stamp}@example.com`, "Noor");
  // (Send, on the photo's corner.)
  const send = (address: string) => homeIn(noor, address).getByRole("button", { name: `Send ${address}`, exact: true });

  // A home on its own page: Send, and the first step has it, with no searching.
  await noor.goto("/homes/SAMPLE-1009");
  await send(QUILLAN).click();
  await noor.waitForURL(/\/send\?home=SAMPLE-1009$/);
  await expect(noor.getByRole("heading", { level: 1 })).toHaveText("Send this home");
  await expect(noor.getByText("Step 1 of 3")).toBeVisible();
  await expect(noor.getByRole("main")).toContainText(QUILLAN);
  await expect(noor.getByRole("button", { name: "Add another home" })).toBeVisible();

  // A home opened from her own page (one she liked), in the pop-out over
  // it: the same button, and the pop-out is gone once she's on Send homes.
  await noor.goto("/homes/SAMPLE-1009");
  await heartOf(homeIn(noor, QUILLAN)).click();
  await expect(heartOf(homeIn(noor, QUILLAN))).toHaveAttribute("aria-pressed", "true");
  await noor.goto("/people/me");
  await noor.waitForURL(/\/people\/[\w-]+$/);
  const pin = noor.locator('a[href^="/reel?from="][href*="home=SAMPLE-1009"]').first();
  const picked = new URL((await pin.getAttribute("href"))!, "http://x").searchParams.get("home")!;
  // (A tap on the card's photo opens it, as a person would: the photos swipe,
  // over the card's own link, which is there for the keyboard.)
  await noor
    .getByRole("listitem")
    .filter({ has: noor.locator('a[data-card-link][href*="home=SAMPLE-1009"]') })
    .first()
    .getByRole("group", { name: /^Photos of / })
    .click();
  await noor.waitForURL(/\/reel\?from=[\w-]+&home=SAMPLE-1009/);
  const stage = noor.getByRole("dialog", { name: "Homes" });
  const open = stage.locator(`[data-home="${picked}"]`);
  await expect(open).toBeInViewport({ ratio: 0.9 });
  const address = (await open.getAttribute("aria-label"))!;
  await expect(open.getByRole("button", { name: /^Share/ })).toHaveCount(0);
  await open.getByRole("button", { name: `Send ${address}`, exact: true }).click();
  await noor.waitForURL(new RegExp(`/send\\?home=${picked}$`));
  await expect(noor.getByRole("heading", { level: 1 })).toHaveText("Send this home");
  await expect(noor.getByRole("main")).toContainText(address);
  await expect(stage).toHaveCount(0);

  // An agent's own listing, on the agent's profile.
  const OWN = "31 Sendable Ct";
  const agent = await signInAgent(browser, `olga.owns.${stamp}@example.com`, "Olga Owns");
  await agent.goto("/dashboard/listings/new");
  const form = await enterListingYourself(agent);
  await form.getByLabel("Add photos").setInputFiles([{ name: "one.png", mimeType: "image/png", buffer: PNG }]);
  await form.getByLabel("Street address").fill(OWN);
  await form.getByLabel("City").fill("Kent");
  await form.getByLabel("ZIP").fill("98030");
  await form.getByLabel("Price", { exact: true }).fill("510000");
  await form.getByLabel("Beds").fill("4");
  await form.getByLabel("Baths").fill("2");
  await form.getByLabel("Sq ft", { exact: true }).fill("1900");
  await form.getByRole("button", { name: "Add listing" }).click();
  await agent.waitForURL(/\/dashboard\/listings$/);
  await agent.getByRole("list", { name: "Your listings" }).getByRole("link", { name: `Edit ${OWN}` }).click();
  await agent.waitForURL(/\/dashboard\/listings\/OWN-[\w-]+$/);
  const editUrl = new URL(agent.url()).pathname;
  const key = decodeURIComponent(editUrl.split("/").pop()!);
  await agent.goto("/people/me");
  await agent.waitForURL(/\/people\/[\w-]+$/);
  const profile = new URL(agent.url()).pathname;

  // Noor opens it from there and sends it: it arrives picked, and it's on the link she makes.
  await noor.goto(profile);
  await noor.getByRole("list", { name: "Listings" }).getByRole("link", { name: new RegExp(OWN) }).first().click();
  await noor.waitForURL(/\/reel\?from=listings/);
  await send(OWN).click();
  await noor.waitForURL((url) => url.pathname === "/send" && url.searchParams.get("home") === key);
  await expect(noor.getByRole("heading", { level: 1 })).toHaveText("Send this home");
  await expect(noor.getByRole("main")).toContainText(OWN);
  await noor.getByRole("button", { name: "Next", exact: true }).click();
  const who = noor.getByRole("combobox", { name: "Who's it for?" });
  await who.fill("Sam");
  await who.press("Enter");
  await noor.getByRole("button", { name: "Next", exact: true }).click();
  await noor.waitForURL(/\/s\/[\w-]+\?step=thoughts$/);
  await noor.getByRole("link", { name: "Skip this step" }).click();
  await noor.waitForURL(/\/send\/[\w-]+$/);
  await expect(noor.getByRole("heading", { level: 1 })).toHaveText("Your link is ready");
  await expect(noor.getByRole("main")).toContainText(OWN);

  // Once the agent hides it, it's no longer one to arrive with: the usual first step.
  await agent.goto(editUrl);
  const details = agent.getByRole("form", { name: "Listing details" });
  await details.getByLabel("Show on my profile").uncheck();
  await details.getByRole("button", { name: "Save", exact: true }).click();
  await expect(agent.getByRole("main")).toContainText("Hidden");
  await noor.goto(`/send?home=${encodeURIComponent(key)}`);
  await expect(noor.getByRole("heading", { level: 1 })).toHaveText("Send homes");
  await expect(noor.getByRole("main")).not.toContainText(OWN);
});
