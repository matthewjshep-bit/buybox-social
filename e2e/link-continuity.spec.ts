import { expect, test, type Page } from "@playwright/test";
import { createShare, heartOf, homeIn, joinAs, openComments, pastNameStep, saveDetails, signInAgent, toFirstHome } from "./helpers";

// A client's own link leads on to the rest of Porchcard and never ends in a
// dead end: signed in, their menu and the bell are in the agent's header; a
// notification can open it on one home; the end of it offers a next step;
// the agent is a person with a page; and someone added by mistake can leave.

async function saveContact(agent: Page, { phone, email }: { phone?: string; email?: string }) {
  await agent.goto("/dashboard/profile");
  if (phone !== undefined) await agent.getByLabel("Phone for clients (optional)").fill(phone);
  if (email !== undefined) await agent.getByLabel("Email for clients (optional)").fill(email);
  await saveDetails(agent);
}

// Down to the end of the link, past every home.
// (Its heading asks while there's a home they haven't said yes or no to.)
const END = /^(That's all|What did you think\?)$/;
async function toEnd(page: Page, heading: string | RegExp = END) {
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
  await expect(header.getByRole("button", { name: "Account menu" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Notifications/ })).toHaveCount(0);
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
  await expect(header.getByRole("button", { name: "Account menu" })).toBeVisible();
  const bell = header.getByRole("link", { name: /^Notifications/ });
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

  // The end of the link: one thing to do. With a home still unrated, it asks.
  await toEnd(page, "What did you think?");
  const end = page.getByRole("region", { name: "The end" });
  await expect(end.getByText("Tap the heart or the X on each home.")).toBeVisible();
  // Every home on the link is there, small, with what they made of it: the one they liked says so.
  const homes = page.getByRole("list", { name: "The homes" });
  await expect(homes.getByRole("button", { name: "4127 Larkmoor Ave NE: like" })).toHaveAttribute("aria-pressed", "true");
  // Nothing else until every home is rated: no next step, no card of options.
  await expect(end.getByRole("link", { name: "See more homes like these" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "What's next" })).toHaveCount(0);
  await expect(end.getByRole("button", { name: /^Message/ })).toHaveCount(0);
  // Passing on the other one from here: that's all, and the one way on for
  // someone signed in is more homes like these, at Home.
  await homes.getByRole("button", { name: "96 Fernhollow Ln: pass" }).click();
  await expect(homes.getByRole("button", { name: "96 Fernhollow Ln: pass" })).toHaveAttribute("aria-pressed", "true");
  await expect(end.getByRole("heading", { name: "That's all" })).toBeVisible();
  await expect(end.getByText("Lena Marsh sees your likes and comments.")).toBeVisible();
  const more = end.getByRole("link", { name: "See more homes like these" });
  await expect(more).toHaveAttribute("href", "/");
  expect((await more.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await expect(end.getByRole("button", { name: "Sign up to save your picks" })).toHaveCount(0);
  // Ask for more is in Contact: a text to the agent, about the home they liked.
  await header.getByRole("button", { name: "Contact" }).click();
  await expect(contact).toBeVisible();
  await expect(contact.getByRole("link", { name: "Ask Lena for more like these" })).toHaveAttribute(
    "href",
    `sms:2065550177?&body=${encodeURIComponent("Hi Lena, could you send me more homes like 4127 Larkmoor Ave NE?")}`,
  );
  await page.keyboard.press("Escape");
  await expect(contact).toBeHidden();
  // Back to the home they liked, in one tap.
  await homes.getByRole("button", { name: "See 4127 Larkmoor Ave NE" }).click();
  await expect(larkmoor).toBeInViewport({ ratio: 0.9 });
  await expect(larkmoor).toBeFocused();

  // Straight to a home from a notification about it, past the welcome screen.
  await page.goto(`${urls.Jamie}?home=SAMPLE-1004`);
  await expect(homeIn(page, "96 Fernhollow Ln")).toBeInViewport({ ratio: 0.9 });
  await expect(welcome).not.toBeInViewport();
  // A home that isn't on the link opens it as usual, on the welcome screen.
  await page.goto(`${urls.Jamie}?home=SAMPLE-1008`);
  await expect(welcome).toBeInViewport();

  // Signed out on Jamie's link (which shows Jamie's ratings, all in), the one
  // way on is signing up, and it says why; Home is for the signed in.
  const stranger = await (await browser.newContext()).newPage();
  await saveContact(agent, { phone: "", email: "lena@marsh.example" });
  await stranger.goto(urls.Jamie);
  await toEnd(stranger, "That's all");
  const theirEnd = stranger.getByRole("region", { name: "The end" });
  await expect(theirEnd.getByText("Save what you liked and get more homes like them. Free, no password.")).toBeVisible();
  const signUp = theirEnd.getByRole("button", { name: "Sign up to save your picks" });
  await expect(signUp).toBeVisible();
  expect((await signUp.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await expect(theirEnd.getByRole("link", { name: "See more homes like these" })).toHaveCount(0);
  await expect(theirEnd.getByRole("link", { name: "Home" })).toHaveCount(0);
  await expect(stranger.getByRole("region", { name: "What's next" })).toHaveCount(0);
  await expect(stranger.getByRole("button", { name: /Leave this link/ })).toHaveCount(0);
  await expect(stranger.getByRole("button", { name: "Invite someone" })).toHaveCount(0);
  // The button opens the sign-up, right here.
  await signUp.click();
  const join = stranger.getByRole("dialog", { name: /Sign up/ });
  await expect(join).toBeVisible();
  await stranger.keyboard.press("Escape");
  await expect(join).toBeHidden();
  // Ask for more, in Contact: no phone now, so an email, the same words.
  await stranger.getByRole("banner").getByRole("button", { name: "Contact" }).click();
  await expect(stranger.getByRole("dialog", { name: "Contact Lena Marsh" }).getByRole("link", { name: "Ask Lena for more like these" })).toHaveAttribute(
    "href",
    /^mailto:lena@marsh\.example\?subject=/,
  );
});

// Signed up on their own link, they stay signed in: back on the link later,
// in a browser that only has what the first one saved (its cookies, the way
// a phone keeps them), they're still themselves, their like is still theirs,
// and a tap on the heart does what it does, with no sign-up asked again. Nor
// does the sign-in page ask "What brings you to Porchcard?": a link sign-up
// has said. (This pins the local sign-in only, the dev cookie: with Supabase
// the cookies are its session, and their lasting is a Supabase setting, in
// the README's checklist.)
test("back on the link in a fresh browser, they're still signed in", async ({ browser }) => {
  test.setTimeout(90_000);
  const stamp = Date.now();
  const agent = await signInAgent(browser, `lena-fresh.${stamp}@example.com`, "Lena Marsh");
  const { urls } = await createShare(agent, ["4127 Larkmoor", "96 Fernhollow"], ["Jamie"]);

  // Jamie signs up on her link, liking the first home.
  const first = await browser.newContext();
  const page = await first.newPage();
  await page.goto(urls.Jamie);
  await toFirstHome(page);
  await heartOf(homeIn(page, "4127 Larkmoor Ave NE")).click();
  await joinAs(page, "Jamie", `jamie-fresh.${stamp}@example.com`);
  await expect(heartOf(homeIn(page, "4127 Larkmoor Ave NE"))).toHaveAttribute("aria-pressed", "true");

  // The same link, with only what that browser saved: signed in still.
  const storageState = await first.storageState();
  const later = await (await browser.newContext({ storageState })).newPage();
  await later.goto(urls.Jamie);
  const header = later.getByRole("banner");
  await expect(header.getByRole("button", { name: "Account menu" })).toBeVisible();
  await toFirstHome(later);
  const larkmoor = homeIn(later, "4127 Larkmoor Ave NE");
  await expect(heartOf(larkmoor)).toHaveAttribute("aria-pressed", "true");
  // The heart is hers to change: no sign-up in the way.
  await heartOf(larkmoor).click();
  await expect(later.getByRole("dialog", { name: "Sign up to like and comment" })).toHaveCount(0);
  await expect(heartOf(larkmoor)).toHaveAttribute("aria-pressed", "false");

  // Signing in from the link said what brings her here: the sign-in page
  // sends her on (Home), not to /welcome to be asked.
  await later.goto("/login");
  await later.waitForURL((url) => url.pathname === "/");
  await expect(later.getByRole("group", { name: "What brings you to Porchcard?" })).toHaveCount(0);

  // (The control: a browser with nothing saved is signed out on the same link.)
  const stranger = await (await browser.newContext()).newPage();
  await stranger.goto(urls.Jamie);
  await expect(stranger.getByRole("banner")).toBeVisible();
  await expect(stranger.getByRole("banner").getByRole("button", { name: "Account menu" })).toHaveCount(0);
  await stranger.context().close();
  await later.context().close();
  await first.close();
  await agent.context().close();
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
  const leave = contact.getByRole("button", { name: "Leave this link" });
  await leave.click();
  const confirm = jamie.getByRole("dialog", { name: "Leave this link?" });
  await expect(confirm).toBeVisible();
  await expect(confirm).toHaveAccessibleDescription("Lena will stop seeing your likes and comments.");
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
  await homeIn(agent, "96 Fernhollow Ln").getByRole("button", { name: "Send 96 Fernhollow Ln", exact: true }).click();
  const sheet = agent.getByRole("dialog", { name: "Sent. Who's it for?" });
  // (The link is made as the sheet opens; on a busy machine that takes a moment.)
  await expect(sheet).toBeVisible({ timeout: 15_000 });
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
  await expect(name).toHaveAccessibleDescription("Not Toby? Type your name.");
});

// What a client says on their agent's link is theirs to see anywhere, "You
// said", and nobody else's: not the next person to sign in on the same
// browser, either. (A place that joined before sign-up was asked for still
// carries that browser's own token once an account has it; lib/feed.ts
// counts such a place as its account's only, which this can't set up from
// the outside. It holds the rule for places made today.)
test("privacy: what a client said on a link never shows to the next person signed in on the same browser", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const SECRET = "We can stretch a little, between us.";
  const stamp = Date.now();
  const agent = await signInAgent(browser, `lena-samebrowser.${stamp}@example.com`, "Lena Marsh");
  const { urls } = await createShare(agent, ["4127 Larkmoor"], ["Ana"]);

  // Ana signs up on the link, likes the home and says something about it.
  const page = await (await browser.newContext()).newPage();
  await page.goto(urls.Ana);
  await toFirstHome(page);
  const larkmoor = homeIn(page, "4127 Larkmoor Ave NE");
  await heartOf(larkmoor).click();
  await joinAs(page, "Ana");
  await expect(heartOf(larkmoor)).toHaveAttribute("aria-pressed", "true");
  const chat = await openComments(page, larkmoor);
  // (Kept to Lena: what's public by default isn't the point here.)
  await chat.getByRole("button", { name: "Keep it to Lena Marsh" }).click();
  await chat.getByLabel("Add a comment").fill(SECRET);
  await chat.getByRole("button", { name: "Post", exact: true }).click();
  await expect(chat.getByLabel("Add a comment")).toHaveValue("");
  await expect(chat.getByText(SECRET)).toBeVisible();

  // Her own words are hers on the home's public page too.
  const paths = ["/homes/SAMPLE-1001", "/reel?home=SAMPLE-1001"];
  await expect(async () => {
    expect(await (await page.request.get(paths[0])).text()).toContain(SECRET);
  }).toPass({ timeout: 20_000 });

  // She signs out; Ben signs in to his own account on the same browser.
  await page.goto("/");
  const header = page.getByRole("banner");
  await header.getByRole("button", { name: "Account menu" }).click();
  await header.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/login");
  await page.getByRole("button", { name: "Testing? Sign in with the test password" }).click();
  const form = page.getByRole("form", { name: "Test sign-in" });
  await form.getByLabel("Email").fill(`ben-samebrowser.${stamp}@example.com`);
  await form.getByLabel("Test password").fill("e2e-test-password");
  await form.getByRole("button", { name: "Sign in" }).click();
  // (New here, so asked his first name: skipped.)
  await pastNameStep(page);
  await page.waitForURL((url) => url.pathname === "/");

  // None of what Ana said reaches him, on the home or full screen.
  for (const path of paths) {
    const html = await (await page.request.get(path)).text();
    expect(html).toContain("4127 Larkmoor");
    expect(html).not.toContain(SECRET);
  }
  await page.context().close();
  await agent.context().close();
});
