// The homes an agent sent, once they've been rated: the card at the top of
// Home is only for homes still waiting, so when every one has a heart or an
// X it's gone, and they're under Rated homes (Liked, then Passed), a tap
// from the menu, each opening on its link to change your mind. A home the
// agent adds later brings the card back. A pro who is someone's client gets
// the same. And the home they just rated leads their feed, as their own card
// ("You passed on this home"), opening the feed's homes on it with the same
// words at the top.
import { expect, test, type Page } from "@playwright/test";
import { createShare, heartOf, homeIn, joinAs, passOn, pickHome, signInAgent } from "./helpers";

const QUILLAN = "1204 Quillan St SE";
const SALTMARSH = "719 Saltmarsh Ln";
const CORBEL = "812 N Corbel St";

// Saved on the server, not just shown.
const saved = (page: Page) =>
  page.waitForResponse((res) => res.request().method() === "POST" && Boolean(res.request().headers()["next-action"]));
// The card at the top of Home, by what it says: "1 new home for you".
const fromAgentCard = (page: Page) => page.getByRole("region", { name: /^\d+ new homes? for you$/ });
// The feed's cards, each one's link saying "address: why it's here".
const feedCards = (page: Page) => page.getByRole("region", { name: "Your feed" }).getByRole("link", { name: /^.+: / });

async function openRated(page: Page) {
  const banner = page.getByRole("banner");
  const rated = banner.getByRole("link", { name: "Rated homes", exact: true });
  // (A tap before the page has woken up opens nothing: tapped again.)
  await expect(async () => {
    if (!(await rated.isVisible())) await banner.getByRole("button", { name: "Account menu" }).click();
    await expect(rated).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await expect(rated).toHaveAttribute("href", "/people/me/rated");
  expect((await rated.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await rated.click();
  await page.waitForURL((url) => url.pathname === "/people/me/rated");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Rated homes");
}

test("after rating every home on her link the card is gone from Home and they're under Rated, Liked and Passed; a new home brings the card back", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const agent = await signInAgent(browser, "rhea-rated@example.com", "Rhea Rated");
  const { url, dashboardUrl } = await createShare(agent, ["1204 Quillan", "719 Saltmarsh"], ["Ivy"]);
  const linkPath = new URL(url).pathname;

  // Ivy likes one home, signing up as she does.
  const ivy = await (await browser.newContext()).newPage();
  await ivy.addInitScript(() => localStorage.setItem("buybox:nudges", JSON.stringify({ photos: true, next: true })));
  await ivy.goto(url);
  await heartOf(homeIn(ivy, QUILLAN)).click();
  await joinAs(ivy, "Ivy", "ivy.rated@example.com");
  await expect(heartOf(homeIn(ivy, QUILLAN))).toHaveAttribute("aria-pressed", "true");

  // One still waiting: the card's there. Under it, her feed leads with the
  // home she just liked, as her own.
  await ivy.goto("/");
  await expect(fromAgentCard(ivy)).toHaveAccessibleName("1 new home for you");
  await expect(fromAgentCard(ivy)).toContainText("1 of 2 rated");
  await expect(feedCards(ivy).first()).toHaveAccessibleName(`${QUILLAN}: You liked this home`);

  // She passes on the other.
  await ivy.goto(url);
  await Promise.all([saved(ivy), passOn(ivy, homeIn(ivy, SALTMARSH))]);
  await ivy.keyboard.press("Escape");

  // All rated: nothing from Rhea at the top of Home any more. Her feed leads
  // with the home she just passed on, once (never again as popular or near
  // her), and says so in her own words; its heart is off.
  await ivy.goto("/");
  await expect(ivy.getByRole("region", { name: "Your feed" })).toBeVisible();
  await expect(fromAgentCard(ivy)).toHaveCount(0);
  await expect(ivy.getByRole("link", { name: /^See them/ })).toHaveCount(0);
  await expect(ivy.getByRole("main")).not.toContainText("2 of 2 rated");
  const stream = ivy.getByRole("region", { name: "Your feed" });
  const lead = feedCards(ivy).first();
  await expect(lead).toHaveAccessibleName(`${SALTMARSH}: You passed on this home`);
  await expect(stream.getByRole("link", { name: new RegExp(`^${SALTMARSH}: `) })).toHaveCount(1);
  await expect(stream.getByRole("button", { name: `Like ${SALTMARSH}` })).toHaveAttribute("aria-pressed", "false");
  // Nobody else's pass is ever in a feed: the only "passed" here is hers.
  await expect(stream.getByText(/passed/i)).toHaveCount(1);
  await expect(stream.getByText(/passed/i)).toContainText("You passed on this home");
  // Its card opens the feed's homes on it, and the words at the top are the same.
  // (By its top corner: the photos in the middle swipe, and open it themselves.)
  const key = new URL((await lead.getAttribute("href"))!, "http://x").searchParams.get("home")!;
  expect(key).toMatch(/^SAMPLE-\d+$/);
  await lead.click({ position: { x: 20, y: 20 } });
  await ivy.waitForURL(new RegExp(`/reel\\?from=feed&home=${key}`));
  const opened = homeIn(ivy, SALTMARSH);
  await expect(opened).toBeInViewport({ ratio: 0.5 });
  await expect(opened.getByRole("region", { name: "Why it's here" })).toContainText("You passed on this home");
  await ivy.goto("/");

  // They're under Rated homes, from the menu: the one she liked, and the one she passed on.
  await openRated(ivy);
  const liked = ivy.getByRole("region", { name: "Liked · 1" });
  const passed = ivy.getByRole("region", { name: "Passed · 1" });
  await expect(liked).toContainText(QUILLAN);
  await expect(liked).toContainText("From Rhea");
  await expect(liked).not.toContainText(SALTMARSH);
  await expect(passed).toContainText(SALTMARSH);
  await expect(passed).not.toContainText(QUILLAN);
  // Liked comes first.
  await expect(ivy.getByRole("main").getByRole("heading", { level: 2 })).toHaveText(["Liked · 1", "Passed · 1"]);
  // Each opens on her link, on that home, where she can change her mind.
  const row = liked.getByRole("link", { name: new RegExp(QUILLAN) });
  await expect(row).toHaveAttribute("href", new RegExp(`^${linkPath}\\?home=SAMPLE-\\d+$`));
  expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await row.click();
  await ivy.waitForURL((u) => u.pathname === linkPath && u.searchParams.has("home"));
  await expect(homeIn(ivy, QUILLAN)).toBeInViewport({ ratio: 0.5 });

  // On a wider screen, it's down the left of Home too, beside her agent's link.
  await ivy.setViewportSize({ width: 1280, height: 900 });
  await ivy.goto("/");
  const places = ivy.getByRole("navigation", { name: "Your places" });
  await expect(places.getByRole("link", { name: "Homes from Rhea" })).toHaveAttribute("href", linkPath);
  await expect(places.getByRole("link", { name: "Rated homes" })).toHaveAttribute("href", "/people/me/rated");
  await ivy.setViewportSize({ width: 412, height: 839 });

  // Rhea adds a home to the same link: one waiting again, so the card's back.
  await agent.goto(dashboardUrl);
  await agent.getByRole("link", { name: "Send more homes" }).click();
  await pickHome(agent, "812 N Corbel");
  await agent.getByRole("button", { name: "Add 1 home to Ivy's link" }).click();
  await agent.waitForURL(/\/dashboard\/shares\/[\w-]+\/sent$/);
  await ivy.goto("/");
  await expect(fromAgentCard(ivy)).toHaveAccessibleName("1 new home for you");
  await expect(fromAgentCard(ivy)).toContainText("From Rhea Rated");
  await expect(fromAgentCard(ivy)).toContainText("2 of 3 rated");
  // The count is whole on a phone: the cities give way, not it.
  const count = fromAgentCard(ivy).getByText("2 of 3 rated", { exact: true });
  await expect(count).toBeVisible();
  expect(await count.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  // See them opens on the new one, not back at the two she's rated.
  const seeThem = fromAgentCard(ivy).getByRole("link", { name: /^See them/ });
  await expect(seeThem).toHaveAttribute("href", new RegExp(`^${linkPath}\\?home=SAMPLE-\\d+$`));
  await seeThem.click();
  await ivy.waitForURL((u) => u.pathname === linkPath && u.searchParams.has("home"));
  await expect(homeIn(ivy, CORBEL)).toBeInViewport({ ratio: 0.5 });
  // The two she rated are still under Rated; the new one isn't, yet.
  await openRated(ivy);
  await expect(ivy.getByRole("main")).toContainText(QUILLAN);
  await expect(ivy.getByRole("main")).toContainText(SALTMARSH);
  await expect(ivy.getByRole("main")).not.toContainText(CORBEL);
});

test("a pro who is someone's client: the card goes once they've rated, and Rated homes is in their menu", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const agent = await signInAgent(browser, "rhea-sends-pro@example.com", "Rhea Sends");
  const { url } = await createShare(agent, ["1204 Quillan"], ["Pax"]);
  const pax = await signInAgent(browser, "pax-pro-client@example.com", "Pax Pro");
  // Nothing rated yet: no Rated homes for her.
  await pax.getByRole("banner").getByRole("button", { name: "Account menu" }).click();
  await expect(pax.getByRole("banner").getByRole("link", { name: "Rated homes" })).toHaveCount(0);
  await pax.keyboard.press("Escape");

  await pax.goto(url);
  const home = homeIn(pax, QUILLAN);
  await Promise.all([saved(pax), heartOf(home).click()]);
  await expect(heartOf(home)).toHaveAttribute("aria-pressed", "true");

  // (Her joining the link, then the heart, are saved one after the other:
  // looked for from another tab, so leaving the link doesn't cut them off,
  // until both are in, and her Home's places have Rated homes.)
  const tab = await pax.context().newPage();
  await expect(async () => {
    await tab.goto("/");
    // (On a phone the places down the side are out of sight, but there.)
    await expect(tab.locator('main a[href="/people/me/rated"]').first()).toBeAttached({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await tab.close();

  // Her one home rated: her Home has no card for it, her feed leads with
  // it as hers, and it's under Rated.
  await pax.goto("/");
  await expect(pax.getByRole("region", { name: "Your feed" })).toBeVisible();
  await expect(fromAgentCard(pax)).toHaveCount(0);
  await expect(feedCards(pax).first()).toHaveAccessibleName(`${QUILLAN}: You liked this home`);
  await openRated(pax);
  await expect(pax.getByRole("region", { name: "Liked · 1" })).toContainText(QUILLAN);
  await expect(pax.getByRole("region", { name: /^Passed/ })).toHaveCount(0);
});
