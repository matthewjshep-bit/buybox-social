import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { commentIn, createShare, heartOf, homeIn, joinAs, openComments, openMore, openScorecard, signInAgent } from "./helpers";

// The link anyone can join, when no one was named.
async function packageLink(agent: Page, addresses: string[]) {
  const { dashboardUrl } = await createShare(agent, addresses, []);
  return { url: await agent.getByLabel("Your link is ready").inputValue(), dashboardUrl };
}

async function saveContact(agent: Page, { phone, email }: { phone?: string; email?: string }) {
  await agent.goto("/dashboard/profile");
  if (phone !== undefined) await agent.getByLabel("Phone for clients (optional)").fill(phone);
  if (email !== undefined) await agent.getByLabel("Email for clients (optional)").fill(email);
  await agent.getByRole("button", { name: "Save" }).click();
  await agent.waitForURL(/\/dashboard$/);
}

const emailsTo = (address: string) =>
  readFileSync("test-results-server.log", "utf8")
    .split("\n")
    .filter((line) => line.includes(`[email] to=${address} `));

test("one home: the link opens on it, in the agent's space, with a way to text, call or email them", async ({
  browser,
  request,
}) => {
  test.setTimeout(60_000);
  const agent = await signInAgent(browser, "jordan-link@example.com", "Jordan Rivera");
  await saveContact(agent, { phone: "(206) 555-0142" });
  const { url } = await createShare(agent, ["4127 Larkmoor"], ["Owen"]);
  const other = await createShare(agent, ["1880 Tamsen"], ["Pat"]);

  const page = await (await browser.newContext()).newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(url);

  // The home itself, straight away: no welcome screen, no keypress.
  const home = homeIn(page, "4127 Larkmoor Ave NE");
  await expect(home).toBeInViewport({ ratio: 0.9 });
  await expect(page.getByRole("region", { name: "Welcome" })).toHaveCount(0);
  // The agent's greeting and note are the home's caption, under its photo,
  // ahead of the description: the page's one heading.
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(home.getByRole("heading", { level: 1 })).toHaveText("Owen, I picked this home for you");
  await expect(home.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(home.getByText(/^This one has the yard/)).toBeVisible();
  // The note whole, then the home's own description, one tap on "more" away.
  await home.getByRole("button", { name: "more", exact: true }).click();
  const about = page.getByRole("dialog", { name: "Scorecard" });
  await expect(about.getByText("This one has the yard you mentioned.")).toBeVisible();
  await expect(about).toContainText("A warm Ravenna-area Craftsman");
  await page.keyboard.press("Escape");
  await expect(about).toBeHidden();
  // The agent's header comes first, as it reads and as Tab goes, though it floats over the home.
  expect(
    await page.evaluate(() => {
      const [header, article] = [document.querySelector("header"), document.querySelector("article")];
      return Boolean(header && article && header.compareDocumentPosition(article) & Node.DOCUMENT_POSITION_FOLLOWING);
    }),
  ).toBe(true);
  // Owen is the only one on it, so what he says is between him and the agent.
  const chat = await openComments(page, home);
  await expect(chat.getByText("Only you and Jordan Rivera see this.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(chat).toBeHidden();

  // The agent's header, not the site's.
  const header = page.getByRole("banner");
  await expect(header.getByText("Jordan Rivera", { exact: true })).toBeVisible();
  await expect(header.getByText("Harbor & Pine Realty", { exact: true })).toBeVisible();
  await expect(header.getByRole("link", { name: "BuyBox Social" })).toHaveAttribute("href", "/");
  for (const name of ["Map", "Sign in", "Sign up"]) {
    await expect(page.getByRole("link", { name, exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole("link", { name: /^Activity/ })).toHaveCount(0);

  // Contact: text and call from the phone they chose to show, as digits.
  await header.getByRole("button", { name: "Contact" }).click();
  const contact = page.getByRole("dialog", { name: "Contact Jordan Rivera" });
  await expect(contact).toBeVisible();
  await expect(contact.getByRole("link", { name: "Text Jordan" })).toHaveAttribute(
    "href",
    /^sms:2065550142\?&body=About%204127%20Larkmoor%20Ave%20NE/,
  );
  await expect(contact.getByRole("link", { name: "Call Jordan" })).toHaveAttribute("href", "tel:2065550142");
  // No email set: no way to email, anywhere.
  await expect(contact.getByRole("link", { name: "Email Jordan" })).toHaveCount(0);
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
  await expect(contact).toContainText("This link is just for you, Owen.");
  await page.keyboard.press("Escape");
  await expect(contact).toBeHidden();

  // [P] The page carries this link's home only, and never the agent's login email.
  let html = await (await request.get(url)).text();
  expect(html).toContain("4127 Larkmoor Ave NE");
  expect(html).not.toContain("1880 Tamsen");
  expect(html).not.toContain(other.url.split("/s/")[1]);
  expect(html).not.toContain("jordan-link@example.com");
  expect(html).not.toContain("mailto:");

  // With an email for clients, Email uses that one, and still never the login email.
  await saveContact(agent, { email: "jordan@harborpine.example" });
  await page.reload();
  await page.getByRole("button", { name: "Contact" }).click();
  await expect(contact.getByRole("link", { name: "Email Jordan" })).toHaveAttribute(
    "href",
    "mailto:jordan@harborpine.example?subject=About%204127%20Larkmoor%20Ave%20NE",
  );
  html = await (await request.get(url)).text();
  expect(html).not.toContain("jordan-link@example.com");

  // The end of the one home.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "That's the home Jordan Rivera picked" })).toBeAttached();
  await expect(page.getByText("Jordan Rivera sees what you liked and said.")).toBeAttached();
  // A personal link isn't one to pass on.
  await expect(page.getByRole("button", { name: "Invite someone" })).toHaveCount(0);

  expect(pageErrors).toEqual([]);
});

test("ask to see it: a first name, then the ask under the home and an email to the agent at once, once a day", async ({
  browser,
}) => {
  test.setTimeout(60_000);
  const agent = await signInAgent(browser, "ask-agent@example.com", "Priya Shah");
  const { url } = await packageLink(agent, ["812 N Corbel"]);

  // Someone opens it and likes the home: the agent hears about both, the
  // open never holding back the like, and the next batched email is 10 minutes off.
  const dana = await (await browser.newContext()).newPage();
  await dana.goto(url);
  const danaHome = homeIn(dana, "812 N Corbel St");
  await heartOf(danaHome).click();
  await joinAs(dana, "Dana");
  await expect(heartOf(danaHome)).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => emailsTo("ask-agent@example.com").length).toBe(2);
  expect(emailsTo("ask-agent@example.com").filter((email) => email.includes("was opened"))).toHaveLength(1);
  expect(emailsTo("ask-agent@example.com").filter((email) => email.includes("Dana liked"))).toHaveLength(1);

  // Someone else asks to see it, from Contact. Their first name first.
  const eli = await (await browser.newContext()).newPage();
  await eli.goto(url);
  await expect(homeIn(eli, "812 N Corbel St")).toBeInViewport({ ratio: 0.9 });
  await eli.getByRole("button", { name: "Contact" }).click();
  const contact = eli.getByRole("dialog", { name: "Contact Priya Shah" });
  await expect(contact).toContainText("Anyone with this link can see and join this conversation.");
  // No phone or email set: still a way to reach them.
  await expect(contact.getByRole("link")).toHaveCount(0);
  await contact.getByRole("button", { name: "Ask to see it" }).click();
  await joinAs(eli, "Eli");
  await expect(contact.getByRole("status")).toHaveText("Sent. Priya will get back to you.");
  // Said where the tap was, with the cursor still there.
  await expect(contact.getByRole("status")).toBeInViewport();
  const done = contact.getByRole("button", { name: "Asked to see it" });
  await expect(done).toBeFocused();
  await expect(done).toHaveAttribute("aria-disabled", "true");
  // Straight away, though another email went out a moment ago (and Eli
  // opening it, so soon after Dana, sent none).
  await expect.poll(() => emailsTo("ask-agent@example.com").length).toBe(3);
  expect(emailsTo("ask-agent@example.com")[2]).toContain("Eli asked to see 812 N Corbel St");

  // Asking again the same day asks nothing new.
  await eli.keyboard.press("Escape");
  await expect(contact).toBeHidden();
  await eli.getByRole("banner").getByRole("button", { name: "Contact" }).click();
  await contact.getByRole("button", { name: "Ask to see it" }).click();
  await expect(contact.getByRole("status")).toHaveText("Already asked. Priya will be in touch.");
  await eli.keyboard.press("Escape");

  // Everyone on the link sees the ask, once, from Eli.
  await dana.reload();
  const thread = await openComments(dana, homeIn(dana, "812 N Corbel St"));
  await expect(commentIn(thread, "Eli", "Can we see it in person?")).toHaveCount(1);
  await dana.waitForTimeout(1000);
  expect(emailsTo("ask-agent@example.com")).toHaveLength(3);
});

test("several homes open on a word from the agent over the first one's photo, with a button down to it", async ({
  browser,
}) => {
  const agent = await signInAgent(browser, "intro-agent@example.com", "Jordan Rivera");
  const { urls } = await createShare(agent, ["10421 Halvard", "4127 Larkmoor", "1880 Tamsen"], ["Nina", "Ben"]);

  const nina = await (await browser.newContext()).newPage();
  await nina.goto(urls.Nina);
  const welcome = nina.getByRole("region", { name: "Welcome" });
  await expect(welcome.getByRole("heading", { level: 1 })).toHaveText("Nina, I picked these 3 homes for you");
  // The first home's photo behind it, and peeking up from below.
  await expect(welcome.locator('img[src*="kirkland"]')).toHaveCount(2);
  // Her own link: just for her.
  await expect(welcome).toContainText("This link is just for you, Nina. Ask Jordan Rivera if someone else should see these.");
  await expect(welcome).not.toContainText("Anyone with this link");

  await welcome.getByRole("button", { name: "See the 3 homes" }).click();
  const first = homeIn(nina, "10421 Halvard Way NE");
  await expect(first).toBeInViewport({ ratio: 0.9 });
  await expect(first).toBeFocused();

  // Contact before any home is on screen: no home to ask about yet, so the way to them.
  await nina.goto(urls.Nina);
  await expect(welcome).toBeInViewport();
  await nina.getByRole("banner").getByRole("button", { name: "Contact" }).click();
  const contact = nina.getByRole("dialog", { name: "Contact Jordan Rivera" });
  await expect(contact.getByRole("button", { name: "Ask to see it" })).toHaveCount(0);
  await expect(contact).toContainText("Add a comment under any home. Jordan sees every one.");
  await contact.getByRole("button", { name: "See the 3 homes" }).click();
  await expect(contact).toBeHidden();
  await expect(first).toBeInViewport({ ratio: 0.9 });
  await expect(first).toBeFocused();

  // A tap on the home peeking up from the bottom goes there too.
  await nina.goto(urls.Nina);
  await expect(welcome).toBeInViewport();
  await welcome.locator("button[aria-hidden]").click();
  await expect(first).toBeInViewport({ ratio: 0.9 });
});

test("a link whose homes were all taken off says so, with a way to reach the agent", async ({ browser }) => {
  const agent = await signInAgent(browser, "empty-agent@example.com", "Jordan Rivera");
  const { url } = await createShare(agent, ["1880 Tamsen"], ["Ruth"]);
  await agent.getByRole("button", { name: /^Remove 1880 Tamsen/ }).click();
  await expect(agent.getByRole("region", { name: "Removed from their link" })).toBeVisible();

  const page = await (await browser.newContext()).newPage();
  await page.goto(url);
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toHaveText("There are no homes on this link right now");
  await expect(heading).toBeVisible();
  await expect(page.getByText("Ask Jordan Rivera to send you more.")).toBeVisible();
  // Nowhere to go back to.
  await expect(page.getByRole("button", { name: "Back to the top" })).toHaveCount(0);
  await page.getByRole("button", { name: "Contact Jordan" }).click();
  await expect(page.getByRole("dialog", { name: "Contact Jordan Rivera" })).toContainText(
    "This link is just for you, Ruth. Ask Jordan Rivera if someone else should see it.",
  );
});

test("the Scorecard says who on the link hasn't weighed in yet, never you", async ({ browser }) => {
  test.setTimeout(60_000);
  const agent = await signInAgent(browser, "notyet-agent@example.com", "Jordan Rivera");
  const { urls } = await createShare(agent, ["812 N Corbel"], ["Owen", "Pat"]);

  const owen = await (await browser.newContext()).newPage();
  await owen.goto(urls.Owen);
  const home = homeIn(owen, "812 N Corbel St");
  await heartOf(home).click();
  await expect(heartOf(home)).toHaveAttribute("aria-pressed", "true");
  let card = await openScorecard(owen, home);
  await expect(card).toContainText("You liked it");
  await expect(card.getByText("Not yet: Pat", { exact: true })).toBeVisible();
  // Two people on it: never "only you".
  await expect(card.getByText("From the people on this link · only they and Jordan Rivera see this")).toBeVisible();

  // Pat sees Owen's take, and isn't told he hasn't given his own.
  const pat = await (await browser.newContext()).newPage();
  await pat.goto(urls.Pat);
  card = await openScorecard(pat, homeIn(pat, "812 N Corbel St"));
  await expect(card).toContainText("Owen liked it");
  await expect(card.getByText(/^Not yet/)).toHaveCount(0);
});

test("one person on two devices is one person, and never 'not yet' to themselves", async ({ browser }) => {
  test.setTimeout(90_000);
  const agent = await signInAgent(browser, "twice-agent@example.com", "Jordan Rivera");
  const { url } = await packageLink(agent, ["812 N Corbel"]);
  const ADDRESS = "812 N Corbel St";

  // Says who they are with a pass (a pass stays on the link), and unless
  // `keep`, takes it back.
  const joinWithPass = async (name: string, keep: boolean) => {
    const page = await (await browser.newContext()).newPage();
    await page.goto(url);
    const home = homeIn(page, ADDRESS);
    await expect(home).toBeInViewport({ ratio: 0.9 });
    const more = await openMore(page, home);
    const pass = more.getByRole("button", { name: "Not for me" });
    await pass.click();
    await joinAs(page, name);
    await expect(pass).toHaveAttribute("aria-pressed", "true");
    if (!keep) {
      await pass.click();
      await expect(pass).toHaveAttribute("aria-pressed", "false");
    }
    await page.keyboard.press("Escape");
    await expect(more).toBeHidden();
    return page;
  };
  // Owen passes on his phone, then joins on his laptop too; Pat joins and
  // hasn't said what he thinks.
  const phone = await joinWithPass("Owen", true);
  const laptop = await joinWithPass("Owen", false);
  const pat = await joinWithPass("Pat", false);

  for (const page of [phone, laptop]) {
    await page.reload();
    const card = await openScorecard(page, homeIn(page, ADDRESS));
    await expect(card.getByText(/^Not yet/)).toHaveText("Not yet: Pat");
    if (page === phone) await expect(card).toContainText("You passed");
  }
  // Pat sees Owen's pass, and no Owen still to come.
  await pat.reload();
  const card = await openScorecard(pat, homeIn(pat, ADDRESS));
  await expect(card).toContainText("Owen passed");
  await expect(card.getByText(/^Not yet/)).toHaveCount(0);
});

test("'only you' is said only when nobody else can read it: not once the package link is out", async ({ browser }) => {
  test.setTimeout(60_000);
  const agent = await signInAgent(browser, "out-agent@example.com", "Jordan Rivera");
  const { url } = await packageLink(agent, ["4127 Larkmoor"]);

  // Someone opens the package's own link, and never says who they are.
  const holder = await (await browser.newContext()).newPage();
  await holder.goto(url);
  await expect(homeIn(holder, "4127 Larkmoor Ave NE")).toBeInViewport({ ratio: 0.9 });

  // Then the agent adds Owen, with a link of his own.
  await agent.getByPlaceholder("Their first name").fill("Owen");
  await agent.getByRole("button", { name: "Add a person" }).click();
  const owenUrl = await agent.getByLabel("Owen's link").inputValue();
  const owen = await (await browser.newContext()).newPage();
  await owen.goto(owenUrl);
  const home = homeIn(owen, "4127 Larkmoor Ave NE");
  await expect(home).toBeInViewport({ ratio: 0.9 });
  // Whoever holds the package's link reads what he says there too.
  const chat = await openComments(owen, home);
  await expect(chat.getByText("Only Jordan Rivera and people on this link see this.")).toBeVisible();
  await expect(chat.getByText(/Only you and/)).toHaveCount(0);
  await owen.keyboard.press("Escape");
  await expect(chat).toBeHidden();
  const card = await openScorecard(owen, home);
  await expect(card).toBeVisible();
  await expect(card.getByText(/only you and/i)).toHaveCount(0);
  expect(await (await owen.request.get(owenUrl)).text()).not.toContain("Only you and");
});

test("a link that isn't there says so, with a way home", async ({ page }) => {
  const res = await page.goto(`/s/${"x".repeat(32)}`);
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This link isn't available");
  await expect(page.getByRole("link", { name: "Go to BuyBox Social" })).toHaveAttribute("href", "/");
});
