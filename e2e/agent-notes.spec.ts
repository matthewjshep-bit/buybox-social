import { expect, test, type Page } from "@playwright/test";
import { toFirstHome, commentIn, createShare, heartOf, homeIn, joinAs, openComments, pick, signInAgent } from "./helpers";

// The tour stays out of the way of scripted browsers unless they ask for it.
const withTour = async (page: Page) => {
  await page.context().addInitScript(() => localStorage.setItem("buybox:tour:test", "1"));
};

test("an agent's take before they send: a note, a like on the front door, a dislike on the fence, which their client reads as theirs, first", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const agent = await signInAgent(browser, "take@example.com", "Nell Ortiz");
  const { url, dashboardUrl } = await createShare(agent, ["1204 Quillan"], ["Wren"]);

  // Asked for on the link's page, before it's sent.
  const ask = agent.locator("[data-your-take]");
  // (One button, and no more words than its name.)
  await expect(ask).toHaveText("Add your feedback");
  await ask.getByRole("link", { name: "Add your feedback" }).click();
  await agent.waitForURL("**/s/*");
  await toFirstHome(agent);
  const home = homeIn(agent, "1204 Quillan St SE");
  await expect(home).toBeInViewport({ ratio: 0.9 });
  await expect(agent.getByRole("banner")).toContainText("your feedback for Wren");

  // A note, in the comments. (The price and the facts are just words: what
  // the agent thinks of them goes in a note.)
  await expect(home.locator('[data-fact="Price"]').getByRole("button")).toHaveCount(0);
  const sheet = await openComments(agent, home);
  await expect(sheet.getByText("Everyone on this link sees your feedback.")).toBeVisible();
  await sheet.getByLabel("Add a note").fill("Priced under the last two sales on this street.");
  await sheet.getByRole("button", { name: "Post", exact: true }).click();
  await expect(commentIn(sheet, "Nell Ortiz", "Priced under the last two sales on this street.")).toBeVisible();
  await agent.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  // The front door, in the photo: a like. (A dislike is there too, as for anyone.)
  const door = await pick(home, "the red front door");
  await expect(door.getByRole("button", { name: /^Dislike the red front door/ })).toBeVisible();
  const like = door.getByRole("button", { name: /^Like the red front door(,|$)/ });
  await like.click();
  await expect(like).toHaveAttribute("aria-pressed", "true");
  await agent.keyboard.press("Escape");

  // And what isn't right, with a dislike: the fence.
  const fence = await pick(home, "the picket fence");
  const dislike = fence.getByRole("button", { name: /^Dislike the picket fence/ });
  await dislike.click();
  await expect(dislike).toHaveAttribute("aria-pressed", "true");
  await expect(dislike).toHaveAccessibleName("Dislike the picket fence, 1 dislike");

  // Done: back to the link's page, which says the take is on it.
  await agent.keyboard.press("Escape");
  await agent.getByRole("banner").getByRole("link", { name: "Done" }).click();
  await agent.waitForURL(dashboardUrl);
  await expect(agent.getByText("1 note, 1 like and 1 dislike", { exact: true })).toBeVisible();
  await expect(agent.locator("[data-your-take]")).toHaveCount(0);
  // In the thread, the note wears the agent's own photo, as on the link.
  await agent.goto(`${dashboardUrl}?tab=homes`);
  const note = agent
    .getByRole("region", { name: "1204 Quillan St SE" })
    .getByRole("list", { name: "Comments" })
    .getByRole("listitem")
    .filter({ hasText: "Priced under the last two sales on this street." });
  await expect(note.locator('img[src^="/people/"]')).toBeVisible();

  // Wren opens it: under the photo, the latest comments lead with the agent's
  // note, under their name with the Agent badge (nothing rotates on the photo
  // any more), and their like and dislike are on the door's and the fence's
  // cards, as theirs.
  const wren = await (await browser.newContext()).newPage();
  const errors: string[] = [];
  wren.on("pageerror", (error) => errors.push(error.message));
  await wren.goto(url);
  await toFirstHome(wren);
  const hers = homeIn(wren, "1204 Quillan St SE");
  const latest = hers.getByRole("group", { name: "Latest comments" });
  await expect(latest).toBeVisible();
  const lead = latest.getByRole("button").first();
  await expect(lead).toContainText("Nell Ortiz");
  await expect(lead).toContainText("Agent");
  await expect(lead).toContainText("Priced under the last two sales");
  await expect(hers.getByRole("group", { name: "Recent activity" })).toHaveCount(0);
  // (A card on the photo is for someone signed up: that comes first.)
  await hers.getByRole("button", { name: "Select the red front door" }).press("Enter");
  await joinAs(wren, "Wren");
  const herDoor = hers.getByRole("group", { name: /^red front door$/i });
  await expect(herDoor).toBeVisible();
  const take = herDoor.locator("[data-agent-take]");
  await expect(take).toContainText("Nell, your agent");
  await expect(take).toContainText("Likes this");
  // [P] The agent's like is theirs, not one of the link's own: no count on
  // the door, none on the home, and Wren's own heart is still hers to give.
  await expect(herDoor.getByRole("button", { name: /^Like the red front door/ })).toHaveAccessibleName("Like the red front door");
  await expect(herDoor.getByRole("button", { name: /^Like the red front door/ })).toHaveAttribute("aria-pressed", "false");
  await wren.keyboard.press("Escape");
  // The fence: the agent doesn't like it, said as theirs, and Wren's own
  // dislike is still hers to give.
  const herFence = await pick(hers, "the picket fence");
  await expect(herFence.locator("[data-agent-take]")).toContainText("Doesn't like this");
  await expect(herFence.getByRole("button", { name: /^Dislike the picket fence/ })).toHaveAccessibleName("Dislike the picket fence");
  await expect(herFence.getByRole("button", { name: /^Dislike the picket fence/ })).toHaveAttribute("aria-pressed", "false");
  await wren.keyboard.press("Escape");
  await expect(heartOf(hers)).toHaveAttribute("aria-pressed", "false");
  await expect(heartOf(hers)).toHaveAccessibleName(/^Like 1204 Quillan St SE$/);

  // Wren asks something on the link, and the agent answers her there.
  const ASKED = "Is the roof on this one new?";
  const ANSWER = "Replaced two summers ago, with the permit on file.";
  // (Signed up a moment ago, and the link's one person now, so what she says
  // goes through at once.)
  const chat = await openComments(wren, hers);
  // (A question for Nell: kept to her, not said in public as it starts.)
  await chat.getByRole("button", { name: "Keep it to Nell Ortiz" }).click();
  await chat.getByLabel("Add a comment").fill(ASKED);
  await chat.getByRole("button", { name: "Post", exact: true }).click();
  await expect(commentIn(chat, "Wren", ASKED)).toBeVisible();
  // (Once it's saved, the agent has it.)
  const panel = agent.getByRole("region", { name: "1204 Quillan St SE" });
  await expect(async () => {
    await agent.goto(`${dashboardUrl}?tab=homes`);
    await expect(panel.getByText(ASKED)).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
  await panel.getByLabel("Reply to your client").fill(ANSWER);
  await panel.getByRole("button", { name: "Reply" }).click();
  await expect(panel.getByText(ANSWER)).toBeVisible();

  // The agent's page, to anyone: the home is there for what they marked and
  // noted on their link, and the "Why it's here" band over the photo's top
  // corner says so under their name, with their note when it's opened. The
  // home has two places that name anyone now, that band and the latest
  // comments under the photo; nothing rotates, so one look at each is all
  // they say. Never what they didn't like, what their client said, or their
  // answer.
  await agent.goto("/people/me");
  await agent.waitForURL(/\/people\/[0-9a-f-]{36}$/);
  const address = `/reel?from=${new URL(agent.url()).pathname.split("/").pop()}&home=SAMPLE-1009`;
  const guest = await (await browser.newContext()).newPage();
  await guest.goto(address);
  const theirs = homeIn(guest, "1204 Quillan St SE");
  await expect(theirs).toBeInViewport({ ratio: 0.9 });
  const why = theirs.getByRole("region", { name: "Why it's here" });
  const comments = theirs.getByRole("group", { name: "Latest comments" });
  await expect(why).toContainText("Nell liked the red front door");
  await expect(comments).toBeVisible();
  await why.getByRole("button", { expanded: false }).click();
  await expect(why).toContainText("Priced under the last two sales");
  await expect(why.getByRole("button", { name: "Liked the red front door: show it" })).toBeVisible();
  for (const said of [(await why.textContent()) ?? "", (await comments.textContent()) ?? ""]) {
    expect(said).not.toMatch(/picket fence|A buyer|Wren|roof|Replaced|privately/);
  }
  const html = await (await guest.request.get(address)).text();
  for (const never of [ASKED, ANSWER]) expect(html).not.toContain(never);
  expect(errors).toEqual([]);
});

test("the first time, a quick tour shows what to tap, step by step, and then gets out of the way for good", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const agent = await signInAgent(browser, "tour@example.com", "Ivo Marsh");
  const { url } = await createShare(agent, ["10421 Halvard", "4127 Larkmoor"], ["Rue"]);

  const page = await (await browser.newContext()).newPage();
  await withTour(page);
  await page.goto(url);
  // Nothing over the agent's welcome: it starts on the first home.
  await page.waitForTimeout(1500);
  await expect(page.locator("[data-tour-open]")).toHaveCount(0);
  await page.getByRole("button", { name: "See the 2 homes" }).click();
  const first = homeIn(page, "10421 Halvard Way NE");
  await expect(first).toBeInViewport({ ratio: 0.9 });

  const steps = page.locator("[data-tour-open]");
  await expect(steps).toBeVisible();
  // (The price and the details are just words: the tour starts on the photo.)
  await expect(steps).toContainText("Tap anything in a photo");
  await expect(steps).toContainText("Like it, or say something.");
  await expect(steps).not.toContainText("Tap any detail");
  await expect(steps.getByLabel("Step 1 of 2")).toBeVisible();
  await expect(steps.getByRole("button", { name: "Next", exact: true })).toBeFocused();
  // A tap anywhere is the next step too.
  await page.mouse.click(20, 200);
  await expect(steps).toContainText("Love the home?");
  await expect(steps).toContainText("Tap the heart.");
  await steps.getByRole("button", { name: "Got it" }).click();
  await expect(steps).toHaveCount(0);
  // Then the nudges, as before.
  await expect(first.getByText("Swipe for more photos")).toBeVisible({ timeout: 5000 });

  // Once, on this device.
  await page.reload();
  await page.getByRole("button", { name: "See the 2 homes" }).click();
  await expect(homeIn(page, "10421 Halvard Way NE")).toBeInViewport({ ratio: 0.9 });
  await page.waitForTimeout(2000);
  await expect(page.locator("[data-tour-open]")).toHaveCount(0);

  // Browse homes, signed out: the same, on the first home (which is where it
  // opens: no form comes first), and Skip ends it.
  const guest = await (await browser.newContext()).newPage();
  await withTour(guest);
  await guest.goto("/reel");
  await expect(guest.getByRole("article").first()).toBeInViewport({ ratio: 0.9 });
  const intro = guest.locator("[data-tour-open]");
  await expect(intro).toContainText("Tap anything in a photo");
  await intro.getByRole("button", { name: "Skip" }).click();
  await expect(intro).toHaveCount(0);
  await guest.reload();
  await expect(guest.getByRole("article").first()).toBeInViewport({ ratio: 0.9 });
  await guest.waitForTimeout(2000);
  await expect(guest.locator("[data-tour-open]")).toHaveCount(0);

  // The agent's own link: how to add their feedback, ending on Done.
  await withTour(agent);
  await agent.goto(url);
  await agent.getByRole("button", { name: "See the 2 homes" }).click();
  const theirs = agent.locator("[data-tour-open]");
  await expect(theirs).toContainText("Add your feedback");
  await expect(theirs).toContainText("Tap anything in a photo.");
  await theirs.getByRole("button", { name: "Next", exact: true }).click();
  await expect(theirs).toContainText("Rue sees your feedback");
  await agent.keyboard.press("Escape");
  await expect(theirs).toHaveCount(0);
});
