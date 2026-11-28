// Anyone, not only an agent, can send homes: the one box at the top of Home
// (and on /send as a page), where they say something, add a home, pick
// Someone and name them; then the conversation with that person opens in
// Messages, the link ready to copy at its foot. Whoever opens it sees who
// it's from by name, never as "your agent"; and what they say on it reaches
// the sender's Activity, going back to their link's page. Every link they've
// made is a conversation in Messages: who it's for, whether it's been opened,
// each home sent and what the friend made of it, and the link's own page with
// the link to copy again; never a surname, an email or a phone.
// On a home for sale, their Send is the home's main button: it opens the box
// with that home already picked, from Browse, from a home opened over their
// feed, and from an agent's own listing on the agent's profile.
import { expect, test, type Locator } from "@playwright/test";
import {
  enterListingYourself,
  heartOf,
  homeIn,
  joinAs,
  openComments,
  pickHome,
  sendToSomeone,
  signInAgent,
  signUpBuyer,
  threadComment,
  toFirstHome,
  toLinkReady,
  toWho,
} from "./helpers";

const QUILLAN = "1204 Quillan St SE";
// A tiny PNG, as a photo would arrive.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==",
  "base64",
);

test("someone who isn't an agent sends a home from the box on Home, and hears back in Messages and Activity", async ({ browser }) => {
  test.setTimeout(150_000);
  const maya = await signUpBuyer(browser, `maya.sends.${Date.now()}@example.com`, "Maya");

  // From their home: Send homes to someone, and the box opens right there.
  await maya.goto("/");
  await maya.getByRole("button", { name: /^Share homes/ }).click();
  const box = maya.locator("form[data-compose]");
  await expect(box.getByRole("heading", { level: 2 })).toHaveText("Share homes");
  await expect(box.getByRole("textbox", { name: "Say something" })).toBeFocused();
  // Nothing sent yet: Messages (where the old "Homes you sent" lands) says so,
  // with the one way on, sending homes: the same box as a page of its own,
  // already set to Someone, with Messages the way back.
  await maya.goto("/send/sent");
  await maya.waitForURL(/\/messages$/);
  await expect(maya.getByRole("heading", { level: 1 })).toHaveText("Messages");
  await expect(maya.getByText("No messages yet").filter({ visible: true })).toBeVisible();
  await maya.getByRole("link", { name: "Send homes" }).last().click();
  await maya.waitForURL(/\/send\?aud=someone$/);
  await expect(maya.getByRole("heading", { level: 1 })).toHaveText("Share homes");
  await expect(maya.getByRole("button", { name: "Who sees this: Private" })).toBeVisible();
  await expect(maya.getByRole("main").getByRole("link", { name: "Messages" })).toHaveAttribute("href", "/messages");
  await expect(maya.getByRole("list", { name: "Picked homes" })).toHaveCount(0);

  // Back on Home, in the box: the home, found by its address.
  await maya.goto("/");
  await maya.getByRole("button", { name: /^Share homes/ }).click();
  await pickHome(maya, QUILLAN);
  // (Picked, the search empties and stays open for another.)
  await expect(box.getByRole("combobox", { name: "Address, MLS number, or a link to the home" })).toHaveValue("");
  // Who it's for: Private (the button says Send), then a first name, with nothing about clients.
  await toWho(maya);
  await expect(box.getByRole("heading", { level: 2 })).toHaveText("Share homes");
  await expect(box.getByRole("button", { name: "Send", exact: true })).toBeVisible();
  const who = maya.getByRole("combobox", { name: "Who's it for?" });
  await expect(who).toHaveAttribute("placeholder", "A first name");
  await expect(box.getByText("Say who it's for.")).toBeVisible();
  await who.fill("Sam");
  await who.press("Enter");
  await expect(maya.getByRole("list", { name: "Who it's for" }).getByText("Sam", { exact: true })).toBeVisible();

  // Send: the conversation with Sam opens, her link ready to copy at its foot.
  await toLinkReady(maya);
  const ready = maya.getByRole("region", { name: "Links to send" });
  await expect(ready.getByRole("heading", { level: 2 })).toHaveText("Sam's link is ready");
  const link = await ready.getByLabel("Sam's link").inputValue();
  expect(link).toMatch(/\/s\/[\w-]{32}$/);
  await expect(maya.getByRole("main")).toContainText(QUILLAN);
  // Done puts it away: the conversation as it is, nothing more to send.
  await ready.getByRole("link", { name: "Done" }).click();
  await maya.waitForURL((url) => url.pathname.startsWith("/messages/") && !url.searchParams.has("sent"));
  await expect(maya.getByRole("region", { name: "Links to send" })).toHaveCount(0);

  // Messages: a conversation with Sam, the new one first, with the home she
  // sent and that nobody has opened it; the link's own page (with the link
  // to copy again) is at the head of the conversation.
  await maya.goto("/messages");
  await expect(maya).toHaveTitle("Messages · Porchcard");
  await expect(maya.getByRole("heading", { level: 1 })).toHaveText("Messages");
  const row = maya.getByRole("list", { name: "Conversations" }).getByRole("link", { name: /^Sam\b/ });
  await expect(row).toContainText("Not opened yet");
  await row.click();
  await maya.waitForURL(/\/messages\//);
  await expect(maya.getByRole("heading", { level: 1, name: "Sam" })).toBeVisible();
  const sends = maya.getByRole("list", { name: "Messages" });
  await expect(sends).toContainText("You sent 1 home");
  const card = sends.locator('[id^="home-"]').filter({ hasText: QUILLAN });
  await expect(card).toContainText("Not opened yet");
  // (Her own link, as Sam will see it.)
  await expect(card.getByRole("link", { name: new RegExp(QUILLAN) })).toHaveAttribute("href", /^\/s\/[\w-]{32}\?home=/);
  const details = maya.getByRole("link", { name: "Link details" });
  await expect(details).toHaveAttribute("href", /^\/send\/[\w-]+$/);
  const ownPage = (await details.getAttribute("href"))!;
  await maya.goto(ownPage);
  await expect(maya.getByRole("heading", { level: 1 })).toHaveText("Your link is ready");
  await expect(maya.getByLabel("Sam's link")).toHaveValue(link);
  await expect(maya.getByRole("link", { name: "Send another" })).toHaveAttribute("href", "/send");
  // And from the box for sending, Messages is in the bar.
  await maya.goto("/send");
  await expect(maya.getByRole("banner").getByRole("link", { name: /^Messages/ })).toHaveAttribute("href", "/messages");

  // Sam opens it: from Maya, by name, and nowhere "your agent".
  const sam = await (await browser.newContext()).newPage();
  await sam.goto(link);
  await expect(sam.getByRole("region", { name: "Welcome" })).toBeVisible();
  // Maya's conversation says so.
  await expect(async () => {
    await maya.goto("/messages");
    await expect(row).toContainText("Opened", { timeout: 1000 });
  }).toPass({ timeout: 20_000 });
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
  // Sam likes the home too. In Maya's conversation with him, under the home:
  // opened, his like, his one comment and what he said, by his first name
  // only; nowhere "your agent" or "your client".
  await sam.keyboard.press("Escape");
  await expect(chat).toBeHidden();
  await heartOf(homeIn(sam, QUILLAN)).click();
  await expect(heartOf(homeIn(sam, QUILLAN))).toHaveAttribute("aria-pressed", "true");
  // (Sam has signed up since, so the conversation is his now, under his
  // name in the list as before: in by its row, not the old address.)
  await expect(async () => {
    await maya.goto("/messages");
    await row.click();
    await maya.waitForURL(/\/messages\//, { timeout: 2000 });
    await expect(card).toContainText("Sam liked it", { timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await expect(card).toContainText(/Opened/);
  // What he said is a message of its own under the card, on his side, by his
  // first name, quoting the home; nothing of it inside the card.
  const porch = threadComment(maya, QUILLAN, "The porch is lovely.");
  await expect(porch).toHaveCount(1);
  await expect(porch).toContainText("Sam, ");
  await expect(porch.getByRole("link", { name: new RegExp(`About ${QUILLAN}`) })).toHaveAttribute("href", /^#home-/);
  await expect(card).not.toContainText("The porch is lovely.");
  await expect(card).not.toContainText("comment");
  await expect(maya.locator("body")).not.toContainText(/your agent|your client/i);
  // (Her own email is in her account menu; nobody's is in the conversation.)
  await expect(maya.locator("[data-messages]")).not.toContainText(/@example\.com/);
  // From the conversation to the link's page, and from there back to Messages.
  await maya.getByRole("link", { name: "Link details" }).click();
  await maya.waitForURL(ownPage);
  await maya.getByRole("main").getByRole("link", { name: "Messages" }).click();
  await maya.waitForURL(/\/messages$/);

  // Nobody else's to open; an agent's Send homes is the same box, on the same page.
  await sam.goto(ownPage);
  await expect(sam.getByText("Your link is ready")).toHaveCount(0);
  await expect(sam.locator("body")).not.toContainText(link.split("/s/")[1]);
  const agent = await signInAgent(browser, `ag.sends.${Date.now()}@example.com`, "Ag Sends");
  await agent.goto("/send");
  await expect(agent.locator("form[data-compose]")).toBeVisible();
  // (On its own, an agent's box opens to someone, as on their Home.)
  await expect(agent.getByRole("heading", { level: 1 })).toHaveText("Share homes");
  await expect(agent.getByRole("button", { name: "Who sees this: Private" })).toBeVisible();
  await toWho(agent);
  await expect(agent.getByRole("heading", { level: 1 })).toHaveText("Share homes");
  await expect(agent.getByRole("combobox", { name: "Who's it for?" })).toHaveAttribute("placeholder", "A client, or a first name");
  // And their links are conversations in Messages too.
  await agent.goto("/send/sent");
  await agent.waitForURL(/\/messages$/);
  await expect(agent.getByRole("heading", { level: 1 })).toHaveText("Messages");
});

test("Share, then Send to someone, on a home opens the box with that home picked, for someone: in Browse, over their own page, and on an agent's own listing", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const stamp = Date.now();
  const noor = await signUpBuyer(browser, `noor.sends.${stamp}@example.com`, "Noor");
  // (Share, under the photo, then Send to someone.)
  const send = (address: string, where: Locator = homeIn(noor, address)) => sendToSomeone(noor, where, address);
  // The box as it arrives with a home: open as a page, for someone, the home
  // among the picked ones with no searching, and room for another.
  const picked = noor.getByRole("list", { name: "Picked homes" });
  const arrivedWith = async (address: string) => {
    await expect(noor.getByRole("heading", { level: 1 })).toHaveText("Share homes");
    await expect(picked).toContainText(address);
    await expect(picked.getByRole("listitem")).toHaveCount(1);
    await expect(picked.getByRole("button", { name: `Remove ${address}` })).toBeVisible();
    await expect(noor.getByRole("button", { name: "Who sees this: Private" })).toBeVisible();
    await expect(noor.getByRole("combobox", { name: "Who's it for?" })).toBeVisible();
    await expect(noor.getByRole("button", { name: "Add a home" })).toBeVisible();
  };

  // A home on its own page: Send to someone, and the box has it.
  await noor.goto("/homes/SAMPLE-1009");
  await send(QUILLAN);
  await noor.waitForURL(/\/send\?home=SAMPLE-1009$/);
  await arrivedWith(QUILLAN);

  // A home opened from her own page (one she liked), in the pop-out over
  // it: the same button, and the pop-out is gone once she's in the box.
  await noor.goto("/homes/SAMPLE-1009");
  await heartOf(homeIn(noor, QUILLAN)).click();
  await expect(heartOf(homeIn(noor, QUILLAN))).toHaveAttribute("aria-pressed", "true");
  await noor.goto("/people/me");
  await noor.waitForURL(/\/people\/[\w-]+$/);
  const pin = noor.locator('a[href^="/reel?from="][href*="home=SAMPLE-1009"]').first();
  const pinned = new URL((await pin.getAttribute("href"))!, "http://x").searchParams.get("home")!;
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
  const open = stage.locator(`[data-home="${pinned}"]`);
  await expect(open).toBeInViewport({ ratio: 0.9 });
  const address = (await open.getAttribute("aria-label"))!;
  await send(address, open);
  await noor.waitForURL(new RegExp(`/send\\?home=${pinned}$`));
  await arrivedWith(address);
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
  await send(OWN);
  await noor.waitForURL((url) => url.pathname === "/send" && url.searchParams.get("home") === key);
  await arrivedWith(OWN);
  const who = noor.getByRole("combobox", { name: "Who's it for?" });
  await who.fill("Sam");
  await who.press("Enter");
  await toLinkReady(noor);
  await expect(noor.getByRole("region", { name: "Links to send" }).getByRole("heading", { level: 2 })).toHaveText("Sam's link is ready");
  await expect(noor.getByRole("list", { name: "Messages" })).toContainText(OWN);

  // Once the agent hides it, it's no longer one to arrive with: the box, with nothing picked.
  await agent.goto(editUrl);
  const details = agent.getByRole("form", { name: "Listing details" });
  await details.getByLabel("Show on my profile").uncheck();
  await details.getByRole("button", { name: "Save", exact: true }).click();
  await expect(agent.getByRole("main")).toContainText("Hidden");
  await noor.goto(`/send?home=${encodeURIComponent(key)}`);
  await expect(noor.getByRole("heading", { level: 1 })).toHaveText("Share homes");
  await expect(noor.getByRole("main")).not.toContainText(OWN);
  await expect(picked).toHaveCount(0);
  await expect(noor.getByRole("button", { name: "Add a home" })).toBeVisible();
});
