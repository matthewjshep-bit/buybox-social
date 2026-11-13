import { expect, test, type Page } from "@playwright/test";
import { createShare, heartOf, homeIn, joinAs, signInAgent, toFirstHome } from "./helpers";

// A client's own link leads on to the rest of Porchcard and never ends in a
// dead end: signed in, their menu and the bell are in the agent's header; a
// notification can open it on one home; the end of it offers a next step;
// the agent is a person with a page; and someone added by mistake can leave.

async function saveContact(agent: Page, { phone, email }: { phone?: string; email?: string }) {
  await agent.goto("/dashboard/profile");
  if (phone !== undefined) await agent.getByLabel("Phone for clients (optional)").fill(phone);
  if (email !== undefined) await agent.getByLabel("Email for clients (optional)").fill(email);
  await agent.getByRole("button", { name: "Save" }).click();
  await agent.waitForURL(/\/dashboard$/);
}

// Down to the end of the link, past every home.
async function toEnd(page: Page, heading: string) {
  await expect(async () => {
    await page.evaluate(() => {
      const reel = document.querySelector<HTMLElement>("[data-reel]")!;
      reel.scrollTo({ top: reel.scrollHeight });
    });
    await expect(page.getByRole("heading", { name: heading })).toBeInViewport({ timeout: 1500 });
  }).toPass({ timeout: 20_000 });
}

test("signed in on their own link, a client has their menu and the bell, the agent's page, and a next step at the end", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const agent = await signInAgent(browser, "lena-continuity@example.com", "Lena Marsh");
  await saveContact(agent, { phone: "(206) 555-0177" });
  const { urls } = await createShare(agent, ["4127 Larkmoor", "96 Fernhollow"], ["Jamie"]);

  // Jamie signs up right on the link, liking the first home.
  const page = await (await browser.newContext()).newPage();
  await page.goto(urls.Jamie);
  const header = page.getByRole("banner");
  // Signed out: the agent's header as it always was, with no menu or bell.
  await expect(header.getByRole("button", { name: "Your profile" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Activity/ })).toHaveCount(0);
  await toFirstHome(page);
  const larkmoor = homeIn(page, "4127 Larkmoor Ave NE");
  await heartOf(larkmoor).click();
  await joinAs(page, "Jamie");
  await expect(heartOf(larkmoor)).toHaveAttribute("aria-pressed", "true");

  // Saved, not only shown (the like goes in once they've joined).
  await expect(async () => {
    await page.reload();
    await toFirstHome(page);
    await expect(heartOf(larkmoor)).toHaveAttribute("aria-pressed", "true", { timeout: 1000 });
  }).toPass({ timeout: 20_000 });

  // Back on it later: they're signed in, so the link leads on to the rest of Porchcard.
  await page.reload();
  await expect(header.getByRole("button", { name: "Your profile" })).toBeVisible();
  const bell = header.getByRole("link", { name: /^Activity/ });
  await expect(bell).toBeVisible();
  await expect(bell).toHaveAttribute("href", "/activity");
  // Contact is still there beside them (on a phone, as its icon).
  await expect(header.getByRole("button", { name: "Contact" })).toBeVisible();
  // Nothing in the header runs off the side of a phone.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // The agent is a person on Porchcard: their name on the welcome screen goes to their page.
  const welcome = page.getByRole("region", { name: "Welcome" });
  const agentPage = welcome.getByRole("link", { name: /Lena Marsh/ });
  await expect(agentPage).toHaveAttribute("href", /^\/people\/[0-9a-f-]{36}$/);
  const agentHref = (await agentPage.getAttribute("href"))!;

  // Contact, signed in: the agent's page and following them (they follow each
  // other since Jamie joined), as well as the ways to reach them.
  await header.getByRole("button", { name: "Contact" }).click();
  const contact = page.getByRole("dialog", { name: "Contact Lena Marsh" });
  await expect(contact).toBeVisible();
  await expect(contact.getByRole("link", { name: /Lena Marsh/ })).toHaveAttribute("href", agentHref);
  await expect(contact.getByRole("button", { name: /^Follow(ing)? Lena$/ })).toBeVisible();
  await expect(contact.getByRole("link", { name: "Text Lena" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(contact).toBeHidden();

  // The end of the link: what's next, never a dead end.
  await toEnd(page, "That's every home");
  const next = page.getByRole("region", { name: "What's next" });
  await expect(next).toBeVisible();
  await expect(next).toContainText("You liked 1 home");
  // Ask for more: a text to the agent, about the home they liked.
  await expect(next.getByRole("link", { name: "Ask Lena for more like these" })).toHaveAttribute(
    "href",
    `sms:2065550177?&body=${encodeURIComponent("Hi Lena, could you send me more homes like 4127 Larkmoor Ave NE?")}`,
  );
  await expect(next.getByRole("link", { name: "Back to your Porchcard home" })).toHaveAttribute("href", "/");
  // A word with the agent: Contact.
  await next.getByRole("button", { name: "Message Lena" }).click();
  await expect(contact).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(contact).toBeHidden();
  // Back to the home they liked, in one tap.
  await next.getByRole("button", { name: "4127 Larkmoor Ave NE" }).click();
  await expect(larkmoor).toBeInViewport({ ratio: 0.9 });
  await expect(larkmoor).toBeFocused();

  // Straight to a home from a notification about it, past the welcome screen.
  await page.goto(`${urls.Jamie}?home=SAMPLE-1004`);
  await expect(homeIn(page, "96 Fernhollow Ln")).toBeInViewport({ ratio: 0.9 });
  await expect(welcome).not.toBeInViewport();
  // A home that isn't on the link opens it as usual, on the welcome screen.
  await page.goto(`${urls.Jamie}?home=SAMPLE-1008`);
  await expect(welcome).toBeInViewport();

  // Signed out, the end still has its next steps; the way home is for the signed in.
  const stranger = await (await browser.newContext()).newPage();
  await saveContact(agent, { phone: "", email: "lena@marsh.example" });
  await stranger.goto(urls.Jamie);
  await toEnd(stranger, "That's every home");
  const theirs = stranger.getByRole("region", { name: "What's next" });
  // No phone now: an email, the same words.
  await expect(theirs.getByRole("link", { name: "Ask Lena for more like these" })).toHaveAttribute(
    "href",
    /^mailto:lena@marsh\.example\?subject=/,
  );
  await expect(theirs.getByRole("link", { name: "Back to your Porchcard home" })).toHaveCount(0);
  await expect(stranger.getByRole("button", { name: /Leave this link/ })).toHaveCount(0);
});

test("someone added to a link they didn't expect can leave it, and the agent no longer sees them on it", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const agent = await signInAgent(browser, "lena-leave@example.com", "Lena Marsh");
  const { urls, dashboardUrl } = await createShare(agent, ["4127 Larkmoor", "96 Fernhollow"], ["Jamie", "Pat"]);

  const jamie = await (await browser.newContext()).newPage();
  await jamie.goto(urls.Jamie);
  await toFirstHome(jamie);
  await heartOf(homeIn(jamie, "4127 Larkmoor Ave NE")).click();
  await joinAs(jamie, "Jamie");
  await expect(heartOf(homeIn(jamie, "4127 Larkmoor Ave NE"))).toHaveAttribute("aria-pressed", "true");
  await jamie.reload();

  // From Contact: a quiet way off it, asked once more first.
  await jamie.getByRole("banner").getByRole("button", { name: "Contact" }).click();
  const contact = jamie.getByRole("dialog", { name: "Contact Lena Marsh" });
  const leave = contact.getByRole("button", { name: "Not for you? Leave this link" });
  await leave.click();
  const confirm = jamie.getByRole("dialog", { name: "Leave this link?" });
  await expect(confirm).toBeVisible();
  await expect(confirm).toHaveAccessibleDescription("Lena won't see your likes and comments on it any more.");
  // It starts on Cancel, and Escape cancels, leaving Contact open.
  await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
  await jamie.keyboard.press("Escape");
  await expect(confirm).toBeHidden();
  await expect(contact).toBeVisible();
  await expect(leave).toBeFocused();

  // Leaving takes them home.
  await leave.click();
  await confirm.getByRole("button", { name: "Leave", exact: true }).click();
  await jamie.waitForURL((url) => url.pathname === "/");

  // Their link is gone.
  const response = await jamie.goto(urls.Jamie);
  expect(response?.status()).toBe(404);
  await expect(jamie.getByRole("heading", { name: "This link isn't available" })).toBeVisible();

  // The agent's package page lists only Pat now, and is named for Pat alone.
  await agent.goto(`${dashboardUrl}?tab=people`);
  await expect(agent.getByRole("heading", { level: 1 })).toHaveText("Pat");
  await expect(agent.getByLabel("Pat's link")).toBeAttached();
  await expect(agent.getByLabel("Jamie's link")).toHaveCount(0);

  // Pat, who hasn't signed in, has no way to leave (nor does anyone else).
  const pat = await (await browser.newContext()).newPage();
  await pat.goto(urls.Pat);
  await toFirstHome(pat);
  await pat.getByRole("banner").getByRole("button", { name: "Contact" }).click();
  await expect(pat.getByRole("dialog", { name: "Contact Lena Marsh" })).toBeVisible();
  await expect(pat.getByRole("button", { name: /Leave this link/ })).toHaveCount(0);
});

test("a quick Send named for someone, opened on a new device, starts the name prompt with their name", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const agent = await signInAgent(browser, "sam-continuity@example.com", "Sam Sender");
  // The phone's share sheet, stood in for: it keeps what it was handed.
  await agent.context().addInitScript(() => {
    const w = window as unknown as { shared: ShareData[] };
    w.shared = [];
    Object.defineProperty(Navigator.prototype, "share", {
      configurable: true,
      value: (data: ShareData) => {
        w.shared.push(data);
        return Promise.resolve();
      },
    });
  });
  await agent.goto("/homes/SAMPLE-1004");
  await homeIn(agent, "96 Fernhollow Ln").getByRole("button", { name: "Send to a client", exact: true }).click();
  const sheet = agent.getByRole("dialog", { name: "Sent. Who's it for?" });
  await expect(sheet).toBeVisible();
  const forWhom = sheet.getByRole("combobox", { name: "Who's it for? (optional)" });
  await forWhom.fill("Toby");
  await forWhom.press("Enter");
  await expect(sheet.getByRole("list", { name: "Who it's for" })).toContainText("Toby");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toBeHidden();
  await expect(agent.getByRole("status").filter({ hasText: "Saved. Their link greets Toby." })).toBeVisible();
  const url = await agent.evaluate(() => (window as unknown as { shared: ShareData[] }).shared[0]?.url ?? "");
  expect(url).toMatch(/\/s\/[\w-]{32}$/);

  // Opened for the first time, on a phone that's never seen it.
  const client = await (await browser.newContext()).newPage();
  await client.goto(url);
  await toFirstHome(client);
  await heartOf(homeIn(client, "96 Fernhollow Ln")).click();
  const prompt = client.getByRole("dialog", { name: "Sign up to like and comment" });
  const name = prompt.getByRole("textbox", { name: "First name" });
  await expect(name).toHaveValue("Toby");
  await expect(name).toHaveAccessibleDescription("Sam sent this to Toby. Not Toby? Type your name.");
});
