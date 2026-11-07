import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { commentIn, createShare, heartOf, homeIn, joinAs, openComments, signInAgent } from "./helpers";

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
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Owen, I picked this home for you");
  // The greeting and the start of the note show over the home; the whole note is in Contact.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("banner").getByText("This one has the yard you mentioned.")).toBeVisible();

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

  // Someone opens it and likes the home: the agent hears about it, and the next batched email is 10 minutes off.
  const dana = await (await browser.newContext()).newPage();
  await dana.goto(url);
  const danaHome = homeIn(dana, "812 N Corbel St");
  await heartOf(danaHome).click();
  await joinAs(dana, "Dana");
  await expect(heartOf(danaHome)).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => emailsTo("ask-agent@example.com").length).toBe(1);

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
  // Straight away, though another email went out a moment ago.
  await expect.poll(() => emailsTo("ask-agent@example.com").length).toBe(2);
  expect(emailsTo("ask-agent@example.com")[1]).toContain("Eli asked to see 812 N Corbel St");

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
  expect(emailsTo("ask-agent@example.com")).toHaveLength(2);
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
  await page.getByRole("button", { name: "Contact Jordan" }).click();
  await expect(page.getByRole("dialog", { name: "Contact Jordan Rivera" })).toContainText(
    "This link is just for you, Ruth. Ask Jordan Rivera if someone else should see it.",
  );
});

test("a link that isn't there says so, with a way home", async ({ page }) => {
  const res = await page.goto(`/s/${"x".repeat(32)}`);
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This link isn't available");
  await expect(page.getByRole("link", { name: "Go to BuyBox Social" })).toHaveAttribute("href", "/");
});
