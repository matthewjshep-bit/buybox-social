// Saving a home, to come back to: the Save button in the row under the photo
// (where an agent going through a client's homes has the Porchcard instead).
// What you saved is yours alone, under Saved on your own profile, and nobody
// else's page says anything of it.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { createShare, expectFeedback, heartOf, homeIn, openComments, openScorecard, pickHome, signedIn, signInAgent, signUpBuyer } from "./helpers";

const TAMSEN = "1880 Tamsen Ridge Pl SE";
const SALTMARSH = "719 Saltmarsh Ln";
const CORBEL = "812 N Corbel St";

// The one word on the first day's line that chooses what a profile shows.
const filterOf = (page: Page) => page.locator("main [data-feed-filter]");
const saveOf = (home: Locator, address: string) => home.getByRole("button", { name: `Save ${address}`, exact: true });
const savedOf = (home: Locator, address: string) => home.getByRole("button", { name: `Saved ${address}`, exact: true });
// No Porchcard: no Feedback in the home's More menu.
const noPorchcard = (page: Page, home: Locator) => expectFeedback(page, home, false);
// Saved on the server, not just shown.
const kept = (page: Page) =>
  page.waitForResponse((res) => res.request().method() === "POST" && Boolean(res.request().headers()["next-action"]));
// The row under the photo (the heart, Comments, Share, then Save at the
// far right), and the comment bar alone at the foot. Nothing sits on the photo.
const rowUnder = async (home: Locator, names: (string | RegExp)[], pill: string | RegExp) => {
  const actions = home.locator("[data-actions]");
  await expect(actions.getByRole("button")).toHaveCount(names.length);
  for (const [i, name] of names.entries()) await expect(actions.getByRole("button").nth(i)).toHaveAccessibleName(name);
  const bar = home.locator("[data-bar-row]");
  await expect(bar.getByRole("button")).toHaveCount(1);
  await expect(bar.getByRole("button")).toHaveAccessibleName(pill);
};
const ownPage = async (page: Page) => {
  await page.goto("/people/me");
  await page.waitForURL(/\/people\/[0-9a-f-]{36}$/);
  return new URL(page.url()).pathname;
};

test("a buyer saves a home from the row under the photo, where an agent has the Porchcard; it's under Saved on their own profile, opens from there, and comes off again", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const sasha = await signUpBuyer(browser, "sasha.saves@example.com", "Sasha Saves");
  const pageErrors: string[] = [];
  sasha.on("pageerror", (error) => pageErrors.push(error.message));
  await sasha.goto("/reel?home=SAMPLE-1002");
  let home = homeIn(sasha, TAMSEN);
  await expect(home).toBeInViewport({ ratio: 0.9 });

  // Under the photo, one row: the heart, Comments, Share, then Save at the
  // far right; the comment bar alone at the foot. No Porchcard for a buyer.
  await rowUnder(home, [/^Like 1880 Tamsen Ridge Pl SE/, /^Comments/, `Share ${TAMSEN}`, `Save ${TAMSEN}`], "Add a comment…");
  await noPorchcard(sasha, home);
  await expect(saveOf(home, TAMSEN)).toHaveAttribute("aria-pressed", "false");
  await expect(saveOf(home, TAMSEN)).toHaveAttribute("title", "Save");

  // A tap saves it: the button says so at once, and still does on a fresh page.
  await Promise.all([kept(sasha), saveOf(home, TAMSEN).click()]);
  await expect(savedOf(home, TAMSEN)).toHaveAttribute("aria-pressed", "true");
  await expect(savedOf(home, TAMSEN)).toHaveAttribute("title", "Saved");
  await sasha.reload();
  await expect(savedOf(homeIn(sasha, TAMSEN), TAMSEN)).toHaveAttribute("aria-pressed", "true");
  // On the home's own page too, where there's no Porchcard either.
  await sasha.goto("/homes/SAMPLE-1002");
  await expect(savedOf(homeIn(sasha, TAMSEN), TAMSEN)).toHaveAttribute("aria-pressed", "true");
  await noPorchcard(sasha, homeIn(sasha, TAMSEN));
  // Saving isn't liking: the heart is as it was.
  await expect(heartOf(homeIn(sasha, TAMSEN))).toHaveAttribute("aria-pressed", "false");

  // Her profile: nothing liked or said yet, and Saved is the last choice on
  // the one word that chooses what it shows, marked as hers alone.
  const profile = await ownPage(sasha);
  await expect(sasha.getByText("Nothing here yet")).toBeVisible();
  await expect(sasha.getByRole("main")).not.toContainText(TAMSEN);
  await filterOf(sasha).locator("summary").click();
  await expect(filterOf(sasha).getByRole("link")).toHaveText(["All", "Liked", "Didn't like", "Comments", /^Saved/]);
  const choice = filterOf(sasha).getByRole("link", { name: /^Saved/ });
  await expect(choice).toContainText("Only you see this");
  await choice.click();
  await expect(sasha).toHaveURL(`${profile}?show=saved`);
  await expect(filterOf(sasha).locator("summary")).toHaveText("Show: Saved");
  const region = sasha.getByRole("region", { name: /^Saved/ });
  await expect(region.getByRole("heading", { level: 2 })).toContainText("Only you see this");
  const tiles = region.getByRole("list", { name: "Saved homes" }).getByRole("link");
  await expect(tiles).toHaveCount(1);
  await expect(tiles.first()).toHaveAttribute("href", "/reel?from=saved&home=SAMPLE-1002");
  await expect(tiles.first()).toContainText(`${TAMSEN}, `);
  await expect(tiles.first()).toContainText("$");
  // The same from "me", wherever she is.
  await sasha.goto("/people/me?show=saved");
  await expect(sasha).toHaveURL(`${profile}?show=saved`);

  // The tile opens her saved homes full screen, on that one.
  await tiles.first().click();
  await sasha.waitForURL(/\/reel\?from=saved&home=SAMPLE-1002/);
  await expect(homeIn(sasha, TAMSEN)).toBeInViewport({ ratio: 0.5 });
  // On a page of its own: whose homes these are, and back to where they're listed.
  await sasha.reload();
  home = homeIn(sasha, TAMSEN);
  await expect(home).toBeInViewport({ ratio: 0.9 });
  await expect(sasha.getByRole("link", { name: "Back to your saved homes" }).first()).toHaveAttribute(
    "href",
    `${profile}?show=saved`,
  );
  await expect(home.getByRole("region", { name: "Why it's here" })).toContainText("Saved · 1 of 1");
  await noPorchcard(sasha, home);

  // Tapped again, it's taken back, there and on her profile.
  await Promise.all([kept(sasha), savedOf(home, TAMSEN).click()]);
  await expect(saveOf(home, TAMSEN)).toHaveAttribute("aria-pressed", "false");
  await sasha.goto(`${profile}?show=saved`);
  await expect(sasha.getByText("Nothing saved yet")).toBeVisible();
  await expect(sasha.getByRole("list", { name: "Saved homes" })).toHaveCount(0);
  await expect(sasha.getByRole("main")).not.toContainText(TAMSEN);
  await sasha.goto("/homes/SAMPLE-1002");
  await expect(saveOf(homeIn(sasha, TAMSEN), TAMSEN)).toHaveAttribute("aria-pressed", "false");
  expect(pageErrors).toEqual([]);
});

test("what someone saved is theirs alone: nobody else gets the choice, the list, or a word of it", async ({ browser }) => {
  test.setTimeout(90_000);
  const owner = await signUpBuyer(browser, "zelda.private@example.com", "Zelda Private");
  // Something public on her page, so it has the word that chooses what to show.
  await owner.goto("/homes/SAMPLE-1003");
  const corbel = homeIn(owner, CORBEL);
  await Promise.all([kept(owner), heartOf(corbel).click()]);
  await expect(heartOf(corbel)).toHaveAttribute("aria-pressed", "true");
  // And a home she saves, and does nothing else with.
  await owner.goto("/homes/SAMPLE-1002");
  const tamsen = homeIn(owner, TAMSEN);
  await Promise.all([kept(owner), saveOf(tamsen, TAMSEN).click()]);
  await expect(savedOf(tamsen, TAMSEN)).toHaveAttribute("aria-pressed", "true");
  const profile = await ownPage(owner);
  await owner.goto(`${profile}?show=saved`);
  await expect(owner.getByRole("list", { name: "Saved homes" }).getByRole("link")).toHaveCount(1);

  const other = await signUpBuyer(browser, "nico.nosy@example.com", "Nico Nosy");
  const agent = await signInAgent(browser, "ada.nosy.agent@example.com", "Ada Nosy");
  const anon = await (await browser.newContext()).newPage();
  for (const viewer of [other, agent, anon]) {
    // Her page: what she liked, and no Saved among the choices.
    await viewer.goto(profile);
    await expect(viewer.getByRole("main")).toContainText(CORBEL);
    await filterOf(viewer).locator("summary").click();
    await expect(filterOf(viewer).getByRole("link").first()).toHaveText("All");
    await expect(filterOf(viewer).getByRole("link", { name: /Saved/ })).toHaveCount(0);
    await expect(filterOf(viewer)).not.toContainText(/Saved/i);
    // Asked for by its address, it's just her page: no list, no empty list, no home.
    await viewer.goto(`${profile}?show=saved`);
    await expect(viewer.getByRole("heading", { level: 1 })).toHaveText("Zelda");
    await expect(viewer.getByRole("main")).toContainText(CORBEL);
    await expect(viewer.getByRole("region", { name: /^Saved/ })).toHaveCount(0);
    await expect(viewer.getByRole("list", { name: "Saved homes" })).toHaveCount(0);
    await expect(viewer.getByText("Nothing saved yet")).toHaveCount(0);
    await expect(viewer.getByRole("main")).not.toContainText(TAMSEN);
    await expect(filterOf(viewer).locator("summary")).toHaveText("Show: All");
    // Not in the page as it's sent, either way it's asked for.
    for (const address of [profile, `${profile}?show=saved`, `${profile}?tab=activity&show=saved`]) {
      const html = await (await viewer.request.get(address)).text();
      expect(html).toContain(CORBEL);
      expect(html).not.toContain(TAMSEN);
      expect(html).not.toContain("SAMPLE-1002");
      // (No list of saved homes in it. The words alone are in a signed-in
      // viewer's own menu now: the way to their own saved homes.)
      expect(html).not.toContain('aria-label="Saved homes"');
      expect(html).not.toContain("saved-title");
      expect(html).not.toContain("Nothing saved yet");
    }
    // "Saved", full screen, is only ever the viewer's own: none of hers.
    const reel = await (await viewer.request.get("/reel?from=saved")).text();
    expect(reel).not.toContain(TAMSEN);
  }
  // The home's own page says nothing of who saved it.
  await other.goto("/homes/SAMPLE-1002");
  await expect(saveOf(homeIn(other, TAMSEN), TAMSEN)).toHaveAttribute("aria-pressed", "false");
  await expect(homeIn(other, TAMSEN)).not.toContainText("Zelda");
  const said = await openComments(other, homeIn(other, TAMSEN));
  await expect(said).not.toContainText(/Zelda|saved/i);
  await other.keyboard.press("Escape");

  // Signed out, Save asks them to sign up right there, on the home, and
  // saves it once they're in (nothing saved if they don't).
  await anon.goto("/homes/SAMPLE-1002");
  const home = homeIn(anon, TAMSEN);
  await expect(home).toBeInViewport({ ratio: 0.9 });
  await saveOf(home, TAMSEN).click();
  const join = anon.getByRole("dialog", { name: "Sign up to like and comment" });
  await expect(join).toBeVisible();
  expect(new URL(anon.url()).pathname).toBe("/homes/SAMPLE-1002");
  await join.getByRole("button", { name: "Not now" }).click();
  await expect(join).toBeHidden();
  await expect(saveOf(home, TAMSEN)).toHaveAttribute("aria-pressed", "false");
});

test("from the box on your own page, a home is saved with nothing said, and it's under Saved, not a post", async ({ browser }) => {
  test.setTimeout(60_000);
  const cora = await signUpBuyer(browser, "cora.composer@example.com", "Cora Composer");
  const profile = await ownPage(cora);
  // The one box for posting or sending homes, opened in place at the top of her page.
  await cora.getByRole("button", { name: /^Share homes/ }).click();
  const form = cora.locator("form[data-compose]");
  await expect(form.getByRole("heading", { level: 2, name: "Share homes" })).toBeVisible();
  await expect(form.getByRole("button", { name: "Who sees this: Public" })).toBeVisible();
  await pickHome(cora, SALTMARSH);
  // A home alone can go as a post; with nothing said, Save is there beside
  // it to keep the home for her alone instead.
  const save = form.getByRole("button", { name: "Save", exact: true });
  await expect(form.getByRole("button", { name: "Post", exact: true })).toBeEnabled();
  await expect(save).toBeEnabled();
  // Once she says something it's a post: Save goes, and comes back when the words do.
  const words = form.getByRole("textbox", { name: "Say something" });
  await words.fill("Hmm");
  await expect(save).toHaveCount(0);
  await words.selectText();
  await words.press("Backspace");
  await expect(words).toHaveValue("");
  await expect(save).toBeEnabled();
  await save.click();
  await expect(cora.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  await expect(form).toHaveCount(0);
  // Nothing posted: her page still has nothing on it for anyone.
  await expect(cora.getByRole("main")).not.toContainText("posted about this home");
  await expect(cora.locator("main li[data-post]")).toHaveCount(0);
  await expect(cora.getByText("Nothing here yet")).toBeVisible();

  // It's under Saved.
  await filterOf(cora).locator("summary").click();
  await filterOf(cora).getByRole("link", { name: /^Saved/ }).click();
  await expect(cora).toHaveURL(`${profile}?show=saved`);
  const tiles = cora.getByRole("list", { name: "Saved homes" }).getByRole("link");
  await expect(tiles).toHaveCount(1);
  await expect(tiles.first()).toHaveAttribute("href", "/reel?from=saved&home=SAMPLE-1008");
  await expect(tiles.first()).toContainText(SALTMARSH);
  // And on the home itself.
  await cora.goto("/homes/SAMPLE-1008");
  await expect(savedOf(homeIn(cora, SALTMARSH), SALTMARSH)).toHaveAttribute("aria-pressed", "true");
});

test("the Porchcard is an agent's, going through a link's homes or a client's: not on the link, and not when they just browse", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const agent = await signInAgent(browser, "vera.verdict@example.com", "Vera Verdict");
  const { url, dashboardUrl } = await createShare(agent, ["1880 Tamsen"], ["Jamie"]);

  // The link's homes, from the link's own page on the dashboard: the
  // Porchcard is in More ("Feedback"); the row under the photo is everyone's.
  await agent.goto(`${dashboardUrl}?tab=homes`);
  await agent.getByRole("region", { name: TAMSEN }).getByRole("link", { name: TAMSEN }).click();
  await agent.waitForURL(/\/reel\?from=share(:|%3A)[0-9a-f-]{36}&home=SAMPLE-1002/);
  let home = homeIn(agent, TAMSEN);
  await expect(home).toBeInViewport({ ratio: 0.9 });
  await rowUnder(home, [/^Like 1880 Tamsen Ridge Pl SE/, /^Comments/, `Share ${TAMSEN}`, `Save ${TAMSEN}`], /…$/);
  await expect(home.getByRole("button", { name: "Feedback", exact: true })).toHaveCount(0);
  let card = await openScorecard(agent, home);
  await expect(card.getByText(`${TAMSEN}, `)).toBeVisible();
  await agent.keyboard.press("Escape");
  await expect(card).toBeHidden();

  // The client, on the link: no Porchcard and nothing to save there; Share
  // (the home itself, never the link made for them).
  const jamie = await signedIn(browser);
  await jamie.goto(url);
  const onLink = homeIn(jamie, TAMSEN);
  await rowUnder(onLink, [/^Like 1880 Tamsen Ridge Pl SE/, /^Comments/, `Share ${TAMSEN}`], /^Add a comment…$/);
  await noPorchcard(jamie, onLink);
  await Promise.all([kept(jamie), heartOf(onLink).click()]);
  await expect(heartOf(onLink)).toHaveAttribute("aria-pressed", "true");
  // Nor the agent, looking at the link as the client sees it.
  await agent.goto(url);
  await expect(homeIn(agent, TAMSEN)).toBeVisible();
  await noPorchcard(agent, homeIn(agent, TAMSEN));
  await expect(agent.getByRole("button", { name: /^Saved? / })).toHaveCount(0);

  // That client's homes, from the home's card in their conversation (a tap
  // from their name in Messages): the Porchcard again.
  // (Once the client's like has been kept: the heart shows it before it is.)
  await agent.goto("/messages");
  await agent.getByRole("list", { name: "Conversations" }).getByRole("link", { name: /^Jamie\b/ }).click();
  await agent.waitForURL(/\/messages\//);
  await expect(agent.getByRole("heading", { level: 1, name: "Jamie" })).toBeVisible();
  // (The link's own page is a tap away, at the head of the conversation.)
  await expect(agent.getByRole("link", { name: "Link details" })).toHaveAttribute("href", new URL(dashboardUrl).pathname);
  const sentCard = agent.getByRole("list", { name: "Messages" }).locator('[id="home-SAMPLE-1002"]');
  await expect(async () => {
    await agent.reload();
    await expect(sentCard).toContainText("Jamie liked it", { timeout: 1500 });
  }).toPass({ timeout: 30_000 });
  const open = sentCard.getByRole("link", { name: new RegExp(TAMSEN) });
  await expect(open).toHaveAttribute("href", /^\/reel\?from=share(:|%3A)[0-9a-f-]{36}&home=SAMPLE-1002/);
  await open.click();
  await agent.waitForURL(/\/reel\?from=share(:|%3A)[0-9a-f-]{36}&home=SAMPLE-1002/);
  home = homeIn(agent, TAMSEN);
  await expect(home).toBeInViewport({ ratio: 0.9 });
  card = await openScorecard(agent, home);
  // (Jamie's like among them, however many others have liked it by now.)
  await expect(card.getByLabel(/^\d+ (person|people) liked it$/)).toBeVisible();

  // Just browsing, an agent is anyone: Save, and no Porchcard.
  await agent.goto("/reel?home=SAMPLE-1002");
  home = homeIn(agent, TAMSEN);
  await expect(home).toBeInViewport({ ratio: 0.9 });
  await noPorchcard(agent, home);
  await expect(saveOf(home, TAMSEN)).toHaveAttribute("aria-pressed", "false");
  await agent.goto("/homes/SAMPLE-1002");
  await expect(homeIn(agent, TAMSEN)).toBeInViewport({ ratio: 0.9 });
  await noPorchcard(agent, homeIn(agent, TAMSEN));
  await expect(saveOf(homeIn(agent, TAMSEN), TAMSEN)).toBeVisible();
});
