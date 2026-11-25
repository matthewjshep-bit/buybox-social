import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { commentIn, createShare, heartOf, homeIn, joinAs, linkPorchcard, openComments, pick, saveDetails, signedIn, signInAgent, toFirstHome } from "./helpers";

// The link anyone can join, when no one was named. The box for sending
// homes asks who it's for, so this is the one-tap Send on the home itself
// (which makes the link first and asks who it's for after): skipped past,
// straight to the link's own page, where the link is read.
async function packageLink(agent: Page, key: string, address: string) {
  await agent.goto(`/homes/${key}`);
  await homeIn(agent, address).getByRole("button", { name: `Send ${address}`, exact: true }).click();
  // (On a computer the link is copied; the sheet asks who it's for. On a
  // busy machine the link takes a moment to be made.)
  const sheet = agent.getByRole("dialog", { name: /^(Sent\. )?Who's it for\?$|^Send this home$/ });
  await expect(sheet).toBeVisible({ timeout: 15_000 });
  // (The sheet's body loads a beat after it opens.) The slower way, when the
  // one tap couldn't copy the link: made here.
  const create = sheet.getByRole("button", { name: "Create link" });
  const details = sheet.getByRole("link", { name: "Link details", disabled: false });
  await expect(create.or(details)).toBeVisible();
  if (await create.isVisible()) await create.click();
  await details.click();
  await agent.waitForURL(/\/dashboard\/shares\/[\w-]+(\?tab=.*)?$/);
  const dashboardUrl = agent.url().split("?")[0];
  return { url: await agent.getByLabel("Your link is ready").inputValue(), dashboardUrl };
}

async function saveContact(agent: Page, { phone, email }: { phone?: string; email?: string }) {
  await agent.goto("/dashboard/profile");
  if (phone !== undefined) await agent.getByLabel("Phone for clients (optional)").fill(phone);
  if (email !== undefined) await agent.getByLabel("Email for clients (optional)").fill(email);
  await saveDetails(agent);
}

const emailsTo = (address: string) =>
  readFileSync("test-results-server.log", "utf8")
    .split("\n")
    .filter((line) => line.includes(`[email] to=${address} `));

test("one home: the link opens on a word from the agent, then the home, in the agent's space, with a way to text, call or email them", async ({
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

  // A word from the agent first, as on any link: the greeting, with Owen's
  // name (the page's one heading). No photo hangs below it.
  const welcome = page.getByRole("region", { name: "Welcome" });
  await expect(welcome).toBeInViewport();
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(welcome.getByRole("heading", { level: 1 })).toHaveText("Owen, I picked this home for you");
  // (Only the agent's own face is drawn from data; the one photo is the home's.)
  await expect(welcome.locator('img:not([src^="data:"])')).toHaveCount(1);
  // Then the home, one tap (or a swipe) away, with its own description.
  await welcome.getByRole("button", { name: "See the home" }).click();
  const home = homeIn(page, "4127 Larkmoor Ave NE");
  await expect(home).toBeInViewport({ ratio: 0.9 });
  await expect(home).toContainText("A warm Ravenna-area Craftsman");
  await expect(home).not.toContainText("This one has the yard");
  // The agent's header comes first, as it reads and as Tab goes, though it floats over the home.
  expect(
    await page.evaluate(() => {
      const [header, article] = [document.querySelector("header"), document.querySelector("article")];
      return Boolean(header && article && header.compareDocumentPosition(article) & Node.DOCUMENT_POSITION_FOLLOWING);
    }),
  ).toBe(true);
  // Owen is the only one on it, so what he says is between him and the agent.
  const chat = await openComments(page, home);
  await expect(chat.getByText("Shown to Jordan Rivera and on your profile.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(chat).toBeHidden();

  // The agent's header, not the site's.
  const header = page.getByRole("banner");
  await expect(header.getByText("Jordan Rivera", { exact: true })).toBeVisible();
  await expect(header.getByText("Harbor & Pine Realty", { exact: true })).toBeVisible();
  await expect(header.getByRole("link", { name: "Porchcard" })).toHaveAttribute("href", "/");
  for (const name of ["Map", "Sign in", "Sign up"]) {
    await expect(page.getByRole("link", { name, exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole("link", { name: /^Notifications/ })).toHaveCount(0);

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
  await expect(contact).toContainText("Just for you, Owen.");
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

  // The end of the one home: nothing rated yet, so it asks, and asks nothing else.
  await page.keyboard.press("Escape");
  const end = page.getByRole("region", { name: "The end" });
  await expect(end.getByRole("heading", { name: "What did you think?" })).toBeAttached();
  await expect(end.getByText("Tap the heart or the X on each home.")).toBeAttached();
  await expect(end.getByRole("list", { name: "The homes" }).getByRole("button", { name: "4127 Larkmoor Ave NE: like" })).toBeAttached();
  await expect(page.getByRole("region", { name: "What's next" })).toHaveCount(0);
  await expect(end.getByRole("button", { name: /^(Message|Sign up)/ })).toHaveCount(0);
  await expect(end.getByRole("link", { name: "See more homes like these" })).toHaveCount(0);
  // Nothing on it to pass the link on with, or to leave it by: those live elsewhere.
  await expect(page.getByRole("button", { name: "Invite someone" })).toHaveCount(0);
  await expect(end.getByRole("button", { name: /Leave this link/ })).toHaveCount(0);
  // Asking for more like these is one of Contact's ways: a text, written for them.
  await page.getByRole("button", { name: "Contact" }).click();
  await expect(contact.getByRole("link", { name: "Ask Jordan for more like these" })).toHaveAttribute(
    "href",
    `sms:2065550142?&body=${encodeURIComponent("Hi Jordan, could you send me more homes like the ones on my link?")}`,
  );
  await page.keyboard.press("Escape");
  await expect(contact).toBeHidden();

  // On a laptop the home reads as on a phone, in one column down the middle
  // (the head, the photo and the words under it all centred, nothing beside
  // the photo); the agent's header is the site's width, like the site's own;
  // and Contact rises from the foot of the screen, centred, as More does.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await toFirstHome(page);
  await expect(home).toBeInViewport({ ratio: 0.9 });
  await expect(home.locator("[data-split]")).toHaveCount(0);
  // Above the facts, who it's from: the one thing to say about why it's here.
  const why = home.locator("[data-home-head]").getByRole("region", { name: "Why it's here" });
  await expect(why).toHaveText("From Jordan Rivera");
  await expect(why.getByRole("button")).toHaveCount(0);
  const [head, photo, words, frame] = await Promise.all(
    [home.locator("[data-home-head]"), home.getByRole("group", { name: /^Photos of/ }).getByRole("img").first(), home.locator("[data-words]"), home].map(
      async (el) => (await el.boundingBox())!,
    ),
  );
  const middle = frame.x + frame.width / 2;
  // The head and the words are the 44rem column; the photo keeps its own
  // shape inside it (its box sizes to the picture), centred and no wider.
  for (const box of [head, words]) {
    expect(Math.abs(box.width - 44 * 16)).toBeLessThan(2);
    expect(Math.abs(box.x + box.width / 2 - middle)).toBeLessThan(2);
  }
  expect(photo.width).toBeLessThanOrEqual(44 * 16 + 1);
  expect(Math.abs(photo.x + photo.width / 2 - middle)).toBeLessThan(2);
  expect(head.y + head.height).toBeLessThanOrEqual(photo.y + 1);
  expect(words.y).toBeGreaterThanOrEqual(photo.y + photo.height - 1);
  const logo = (await header.getByRole("link", { name: "Porchcard" }).boundingBox())!;
  const contactButton = (await header.getByRole("button", { name: "Contact" }).boundingBox())!;
  // (The site's header: 72rem wide at most, centred, with 1.5rem to spare at each side.)
  const gutter = (1440 - 72 * 16) / 2 + 24;
  expect(Math.round(logo.x)).toBe(gutter);
  expect(Math.round(contactButton.x + contactButton.width)).toBe(1440 - gutter);
  await header.getByRole("button", { name: "Contact" }).click();
  await expect(contact).toBeVisible();
  // (Once it has slid up.)
  await expect.poll(async () => Math.round((await contact.boundingBox())!.y + (await contact.boundingBox())!.height)).toBe(900);
  const sheet = (await contact.boundingBox())!;
  expect(Math.abs(sheet.x + sheet.width / 2 - 720)).toBeLessThan(2);
  expect(sheet.width).toBeLessThanOrEqual(42 * 16);

  expect(pageErrors).toEqual([]);
});

test("ask to see it: a first name, then the ask under the home and an email to the agent at once, once a day", async ({
  browser,
}) => {
  test.setTimeout(60_000);
  const agent = await signInAgent(browser, "ask-agent@example.com", "Priya Shah");
  const { url } = await packageLink(agent, "SAMPLE-1003", "812 N Corbel St");

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

  // Someone else asks to see it, from Contact. Their name first.
  const eli = await (await browser.newContext()).newPage();
  await eli.goto(url);
  await toFirstHome(eli);
  await expect(homeIn(eli, "812 N Corbel St")).toBeInViewport({ ratio: 0.9 });
  await eli.getByRole("button", { name: "Contact" }).click();
  const contact = eli.getByRole("dialog", { name: "Contact Priya Shah" });
  await expect(contact).toContainText("Anyone with this link can join.");
  // No phone or email set: still a way to reach them.
  await expect(contact.getByRole("link")).toHaveCount(0);
  await contact.getByRole("button", { name: "Ask to see it" }).click();
  await joinAs(eli, "Eli");
  await expect(contact.getByRole("status")).toHaveText("Sent.");
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
  await expect(contact.getByRole("status")).toHaveText("Already asked.");
  await eli.keyboard.press("Escape");

  // Everyone on the link sees the ask, once, from Eli.
  await dana.reload();
  const thread = await openComments(dana, homeIn(dana, "812 N Corbel St"));
  await expect(commentIn(thread, "Eli", "Can we see it in person?")).toHaveCount(1);
  await dana.waitForTimeout(1000);
  expect(emailsTo("ask-agent@example.com")).toHaveLength(3);
});

test("the agent's own Preview is their first pass: what they like and say there is theirs, never Dana's", async ({
  browser,
  request,
}) => {
  test.setTimeout(90_000);
  const agent = await signInAgent(browser, "own-preview@example.com", "Priya Shah");
  const { url, dashboardUrl } = await createShare(agent, ["1204 Quillan"], ["Dana"]);
  // Asked for before it's sent, and only asked.
  await expect(agent.locator("[data-your-take]")).toHaveText("Add your feedback");

  // Preview, on Dana's page, opens her link in a new tab, still signed in.
  const [preview] = await Promise.all([
    agent.context().waitForEvent("page"),
    agent.getByRole("link", { name: "Preview Dana's link", exact: true }).click(),
  ]);
  await toFirstHome(preview);
  const home = homeIn(preview, "1204 Quillan St SE");
  await expect(home).toBeInViewport({ ratio: 0.9 });
  const banner = preview.getByRole("banner");
  await expect(banner).toContainText("your feedback for Dana");
  // Nothing to contact: Done, back to Dana's page.
  await expect(banner.getByRole("button", { name: "Contact" })).toHaveCount(0);
  await expect(banner.getByRole("link", { name: "Done" })).toHaveAttribute("href", new URL(dashboardUrl).pathname);

  // [P] The heart on the home is Dana's to give.
  await heartOf(home).click();
  await expect(home.getByRole("alert")).toHaveText(
    "The heart is for your client. Tap anything in a photo to leave a note.",
  );
  // A like in a photo, and a note: the agent's own. (A dislike is there too.)
  const card = await pick(home, "the red front door");
  await expect(card.getByRole("button", { name: /^Dislike the red front door/ })).toBeVisible();
  const door = card.getByRole("button", { name: /^Like the red front door(,|$)/ });
  await door.click();
  await expect(door).toHaveAttribute("aria-pressed", "true");
  await preview.keyboard.press("Escape");
  const chat = await openComments(preview, home);
  await chat.getByLabel("Add a note").fill("Testing my link before I send it");
  await chat.getByRole("button", { name: "Post", exact: true }).click();
  await expect(commentIn(chat, "Priya Shah", "Testing my link before I send it")).toBeVisible();
  await preview.keyboard.press("Escape");
  await expect(chat).toBeHidden();

  await preview.reload();
  const again = homeIn(preview, "1204 Quillan St SE");
  await expect(heartOf(again)).toHaveAttribute("aria-pressed", "false");
  const doorAgain = (await pick(again, "the red front door")).getByRole("button", {
    name: /^Like the red front door(,|$)/,
  });
  await expect(doorAgain).toHaveAttribute("aria-pressed", "true");

  // Dana's page: not opened, nothing from Dana, and no email about any of it;
  // the agent's take is on it.
  await agent.goto(dashboardUrl);
  await expect(agent.getByText("Dana hasn't opened it yet")).toBeVisible();
  await expect(agent.getByText(/Dana liked/)).toHaveCount(0);
  await expect(agent.getByText("1 note and 1 like", { exact: true })).toBeVisible();
  await preview.waitForTimeout(1000);
  expect(emailsTo("own-preview@example.com")).toEqual([]);

  // Dana reads it as Priya's: her note, and her like on the door, which is no
  // like of Dana's and isn't counted among the link's.
  const dana = await (await browser.newContext()).newPage();
  await dana.goto(url);
  const hers = homeIn(dana, "1204 Quillan St SE");
  // Not signed up yet: picking the door asks her to first, then its card opens.
  await hers.scrollIntoViewIfNeeded();
  await expect(hers).toBeInViewport({ ratio: 0.9 });
  await hers.getByRole("button", { name: "Select the red front door" }).press("Enter");
  await expect(hers.locator("[data-spot-card]")).toHaveCount(0);
  await joinAs(dana, "Dana");
  const doorCard = hers.getByRole("group", { name: /^red front door$/i });
  await expect(doorCard).toBeVisible();
  const take = doorCard.locator("[data-agent-take]");
  await expect(take).toContainText("Priya, your agent");
  await expect(take).toContainText("Likes this");
  await expect(doorCard.getByRole("button", { name: /^Like the red front door/ })).toHaveAccessibleName(
    "Like the red front door",
  );
  await dana.keyboard.press("Escape");
  const thread = await openComments(dana, hers);
  await expect(commentIn(thread, "Priya Shah", "Testing my link before I send it")).toBeVisible();
  // [P] And only on the link: never on the home's public page.
  const listingKey = await hers.getAttribute("data-home");
  if (listingKey) expect(await (await request.get(`/homes/${listingKey}`)).text()).not.toContain("Testing my link");
});

test("several homes open on a word from the agent over the first one's photo, with a button down to it", async ({
  browser,
  request,
}) => {
  const agent = await signInAgent(browser, "intro-agent@example.com", "Jordan Rivera");
  const { urls } = await createShare(agent, ["10421 Halvard", "4127 Larkmoor", "1880 Tamsen"], ["Nina", "Ben"]);
  // The link preview's picture is described as the link's title is, for all three.
  expect(await (await request.get(urls.Nina)).text()).toContain(
    '<meta property="og:image:alt" content="3 homes picked for you by Jordan Rivera"/>',
  );

  const nina = await (await browser.newContext()).newPage();
  await nina.goto(urls.Nina);
  const welcome = nina.getByRole("region", { name: "Welcome" });
  await expect(welcome.getByRole("heading", { level: 1 })).toHaveText("Nina, I picked these 3 homes for you");
  // The first home's photo behind it, blurred; nothing hanging off the foot.
  await expect(welcome.locator('img:not([src^="data:"])')).toHaveCount(1);
  await expect(welcome.locator('img[src*="kirkland"]')).toHaveCount(1);
  // Her own link: just for her.
  await expect(welcome).toContainText("Just for you, Nina.");
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

  await contact.getByRole("button", { name: "See the 3 homes" }).click();
  await expect(contact).toBeHidden();
  await expect(first).toBeInViewport({ ratio: 0.9 });
  await expect(first).toBeFocused();

  // A tap on the bobbing arrow at the foot goes there too.
  await nina.goto(urls.Nina);
  await expect(welcome).toBeInViewport();
  await welcome.locator("button[aria-hidden]").click();
  await expect(first).toBeInViewport({ ratio: 0.9 });
});

test("a link whose homes were all taken off says so, with a way to reach the agent", async ({ browser }) => {
  const agent = await signInAgent(browser, "empty-agent@example.com", "Jordan Rivera");
  const { url, dashboardUrl } = await createShare(agent, ["1880 Tamsen"], ["Ruth"]);
  await agent.goto(`${dashboardUrl}?tab=homes`);
  await agent.getByRole("button", { name: /^Remove 1880 Tamsen/ }).click();
  await expect(agent.getByRole("region", { name: "Removed from their link" })).toBeVisible();

  const page = await (await browser.newContext()).newPage();
  await page.goto(url);
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toHaveText("No homes here right now");
  await expect(heading).toBeVisible();

  // Nowhere to go back to.
  await expect(page.getByRole("button", { name: "Back to the top" })).toHaveCount(0);
  await page.getByRole("button", { name: "Contact Jordan" }).click();
  await expect(page.getByRole("dialog", { name: "Contact Jordan Rivera" })).toContainText(
    "Just for you, Ruth.",
  );
});

test("the agent's Porchcard for the link says who on it hasn't weighed in yet; the people on it have no Porchcard", async ({
  browser,
}) => {
  test.setTimeout(60_000);
  const agent = await signInAgent(browser, "notyet-agent@example.com", "Jordan Rivera");
  const { urls, dashboardUrl } = await createShare(agent, ["812 N Corbel"], ["Owen", "Pat"]);
  const noFeedback = (page: Page) => expect(page.getByRole("button", { name: /Feedback/ })).toHaveCount(0);

  const owen = await signedIn(browser);
  await owen.goto(urls.Owen);
  const home = homeIn(owen, "812 N Corbel St");
  const liked = owen.waitForResponse(
    (res) => res.request().method() === "POST" && Boolean(res.request().headers()["next-action"]),
  );
  await heartOf(home).click();
  await expect(heartOf(home)).toHaveAttribute("aria-pressed", "true");
  await liked;
  // Under the photo on his link: the X, the heart, Comments and More (a link
  // made for him has nothing to pass on), and the comment bar alone at the
  // foot; the Porchcard is the agent's.
  const actions = home.locator("[data-actions]");
  const onLink = ["Pass on this home", /^Like 812 N Corbel St, 1 like$/, /^Comments/, "More options"];
  await expect(actions.getByRole("button")).toHaveCount(onLink.length);
  for (const [i, name] of onLink.entries()) await expect(actions.getByRole("button").nth(i)).toHaveAccessibleName(name);
  await expect(home.locator("[data-bar-row]").getByRole("button")).toHaveCount(1);
  await expect(home.locator("[data-bar-row]").getByRole("button")).toHaveAccessibleName(/what you think…$/);
  await noFeedback(owen);
  // Two people on it: never "only you".
  const chat = await openComments(owen, home);
  await expect(chat.getByText("Shown to everyone on this link and on your profile.")).toBeVisible();
  await expect(chat.getByText("What people think")).toHaveCount(0);
  await owen.keyboard.press("Escape");

  // Pat, who hasn't said what he thinks, has none either.
  const pat = await (await browser.newContext()).newPage();
  await pat.goto(urls.Pat);
  await expect(homeIn(pat, "812 N Corbel St")).toBeVisible();
  await noFeedback(pat);

  // The agent's, on the link's own page: Owen's take, and Pat still to come.
  const card = await linkPorchcard(agent, dashboardUrl, "812 N Corbel St");
  await expect(card).toContainText("Owen liked it");
  await expect(card.getByText("Not yet: Pat", { exact: true })).toBeVisible();
  await expect(card).toContainText("Only people on this link see this");
});

test("one person on two devices is one person: on the agent's Porchcard once, and not still to come", async ({ browser }) => {
  test.setTimeout(90_000);
  const agent = await signInAgent(browser, "twice-agent@example.com", "Jordan Rivera");
  const { url, dashboardUrl } = await packageLink(agent, "SAMPLE-1003", "812 N Corbel St");
  const ADDRESS = "812 N Corbel St";

  // Says who they are with a pass (a pass stays on the link), and unless
  // `keep`, takes it back.
  const joinWithPass = async (name: string, keep: boolean) => {
    const page = await (await browser.newContext()).newPage();
    await page.goto(url);
    await toFirstHome(page);
    const home = homeIn(page, ADDRESS);
    await expect(home).toBeInViewport({ ratio: 0.9 });
    const pass = home.getByRole("button", { name: "Pass on this home" });
    await pass.click();
    await joinAs(page, name);
    await expect(pass).toHaveAttribute("aria-pressed", "true");
    if (!keep) {
      await pass.click();
      await expect(pass).toHaveAttribute("aria-pressed", "false");
    }
    return page;
  };
  // Owen passes on his phone, then joins on his laptop too; Pat joins and
  // hasn't said what he thinks.
  const phone = await joinWithPass("Owen", true);
  const laptop = await joinWithPass("Owen", false);
  const pat = await joinWithPass("Pat", false);

  // None of them has a Porchcard on the link: it's the agent's.
  for (const page of [phone, laptop, pat]) {
    await page.reload();
    await expect(homeIn(page, ADDRESS)).toBeVisible();
    await expect(page.getByRole("button", { name: /Feedback/ })).toHaveCount(0);
  }
  // On the agent's, for the link: Owen's pass, once, and only Pat still to
  // come (no second Owen, from the laptop, who hasn't weighed in).
  const card = await linkPorchcard(agent, dashboardUrl, ADDRESS);
  await expect(card).toContainText("Owen passed");
  await expect(card.getByText(/^Not yet/)).toHaveText("Not yet: Pat");
});

test("'only you' is said only when nobody else can read it: not once the package link is out", async ({ browser }) => {
  test.setTimeout(60_000);
  const agent = await signInAgent(browser, "out-agent@example.com", "Jordan Rivera");
  const { url } = await packageLink(agent, "SAMPLE-1001", "4127 Larkmoor Ave NE");

  // Someone opens the package's own link, and never says who they are.
  const holder = await (await browser.newContext()).newPage();
  await holder.goto(url);
  await toFirstHome(holder);
  await expect(homeIn(holder, "4127 Larkmoor Ave NE")).toBeInViewport({ ratio: 0.9 });

  // Then the agent adds Owen, with a link of his own.
  await agent.getByRole("combobox", { name: "Add a person" }).fill("Owen");
  await agent.getByRole("button", { name: "Add", exact: true }).click();
  const owenUrl = await agent.getByLabel("Owen's link").inputValue();
  const owen = await (await browser.newContext()).newPage();
  await owen.goto(owenUrl);
  await toFirstHome(owen);
  const home = homeIn(owen, "4127 Larkmoor Ave NE");
  await expect(home).toBeInViewport({ ratio: 0.9 });
  // Whoever holds the package's link reads what he says there too.
  const chat = await openComments(owen, home);
  await expect(chat.getByText("Shown to everyone on this link and on your profile.")).toBeVisible();
  await expect(chat.getByText(/Shown to Jordan Rivera/)).toHaveCount(0);
  await owen.keyboard.press("Escape");
  await expect(chat).toBeHidden();
  // (The Porchcard, which said so too, is the agent's now: not on the link.)
  await expect(owen.getByRole("button", { name: /Feedback/ })).toHaveCount(0);
  await expect(owen.getByText(/only you and/i)).toHaveCount(0);
  expect(await (await owen.request.get(owenUrl)).text()).not.toContain("Shown to Jordan Rivera and");
});

test("a link that isn't there says so, with a way home", async ({ page }) => {
  const res = await page.goto(`/s/${"x".repeat(32)}`);
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This link isn't available");
  await expect(page.getByRole("link", { name: "Go to Porchcard" })).toHaveAttribute("href", "/");
});
