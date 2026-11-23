import { expect, test, type Locator, type Page } from "@playwright/test";
import { commentIn, createShare, heartOf, homeIn, joinAs, openComments, signInAgent, signUpBuyer } from "./helpers";

const saved = (page: Page) =>
  page.waitForResponse((res) => res.request().method() === "POST" && Boolean(res.request().headers()["next-action"]));

// A finger's swipe to the left across something: Chromium's own touch
// gesture, so the browser scrolls it just as it would under a thumb.
async function swipeLeft(target: Locator) {
  const page = target.page();
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.synthesizeScrollGesture", {
    x: Math.round(box.x + box.width * 0.8),
    y: Math.round(box.y + box.height / 2),
    xDistance: -Math.round(box.width * 0.6),
    yDistance: 0,
    gestureSourceType: "touch",
    speed: 1600,
  });
  await cdp.detach();
}

// Someone's own page, from wherever they are.
async function pageOf(page: Page) {
  await page.goto("/people/me");
  await page.waitForURL(/\/people\/[\w-]+$/);
  return new URL(page.url()).pathname;
}

test("following: from someone's page, what they like comes first in your feed, and both lists say who", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  // Ana likes a home.
  const ana = await signUpBuyer(browser, "ana.follows@example.com", "Ana Follows");
  const home = ana.getByRole("article").first();
  const address = (await home.getAttribute("aria-label"))!;
  await Promise.all([saved(ana), heartOf(home).click()]);
  await expect(heartOf(home)).toHaveAttribute("aria-pressed", "true");
  const anaPage = await pageOf(ana);
  await expect(ana.getByRole("link", { name: "0 followers" })).toBeVisible();
  // Nobody follows themselves.
  await expect(ana.getByRole("button", { name: /^Follow/ })).toHaveCount(0);

  // Bo follows her, from her page.
  const bo = await signUpBuyer(browser, "bo.follows@example.com", "Bo Follows");
  const boPage = await pageOf(bo);
  await bo.goto(anaPage);
  const follow = bo.getByRole("button", { name: "Follow Ana" });
  await expect(follow).toHaveAttribute("aria-pressed", "false");
  await Promise.all([saved(bo), follow.click()]);
  await expect(bo.getByRole("button", { name: "Following Ana" })).toHaveAttribute("aria-pressed", "true");
  await bo.reload();
  await expect(bo.getByRole("button", { name: "Following Ana" })).toHaveAttribute("aria-pressed", "true");
  await expect(bo.getByRole("link", { name: "1 follower" })).toBeVisible();

  // What she liked is in his feed (the one feed a buyer's home has), by her
  // name, to her page.
  await bo.goto("/");
  await expect(bo.getByRole("group", { name: "Show" })).toHaveCount(0);
  const card = bo.getByRole("link", { name: `${address}: Ana liked this home`, exact: true });
  await expect(card).toBeVisible();
  const item = bo.getByRole("listitem").filter({ has: card });
  await expect(item.getByRole("link", { name: "Ana", exact: true })).toHaveAttribute("href", anaPage);
  // Tapped, the feed's homes open in a pop-out over it, on that one. The
  // "Why it's here" band over the photo's top corner says it's her, and that
  // he follows her; its X closes it, back to the feed. (Tapped by its top
  // corner: the photos in the middle swipe, and open it themselves.)
  await card.click({ position: { x: 20, y: 20 } });
  await bo.waitForURL(/\/reel\?from=feed&home=/);
  const popout = bo.getByRole("dialog", { name: "Homes" });
  const opened = popout.getByRole("article", { name: address });
  await expect(opened).toBeInViewport({ ratio: 0.9 });
  await expect(opened.getByRole("region", { name: "Why it's here" })).toContainText("Ana, who you follow · liked this home");
  const key = new URL(bo.url()).searchParams.get("home")!;
  await popout.getByRole("button", { name: "Close", exact: true }).first().click();
  await expect(popout).toHaveCount(0);
  await bo.waitForURL((u) => u.pathname === "/");
  // A stranger likes the same home: in his feed's homes the band still names
  // only whom he follows, never the stranger, nor who else liked it; and the
  // comments under the photo count the likes without naming anyone.
  const cyrus = await signUpBuyer(browser, "cyrus.follows@example.com", "Cyrus Follows");
  await cyrus.goto(`/homes/${key}`);
  const theirs = heartOf(cyrus.getByRole("article", { name: address }));
  await Promise.all([saved(cyrus), theirs.click()]);
  await expect(theirs).toHaveAttribute("aria-pressed", "true");
  const still = await bo.context().newPage();
  await still.goto(`/reel?from=feed&home=${key}`);
  const stillHome = still.getByRole("article", { name: address });
  const band = stillHome.getByRole("region", { name: "Why it's here" });
  await expect(band).toContainText("Ana, who you follow · liked this home");
  await expect(band).not.toContainText(/Cyrus|A buyer|others liked/);
  const latest = stillHome.getByRole("group", { name: "Latest comments" });
  await expect(latest).toContainText(/\d+ likes/);
  await expect(latest).not.toContainText(/\bAna\b|\bCyrus\b|Liked by/);
  // (No rotating line of who did what on the photo any more.)
  await expect(stillHome.getByRole("group", { name: "Recent activity" })).toHaveCount(0);
  await still.close();
  await Promise.all([saved(cyrus), theirs.click()]);
  await expect(theirs).toHaveAttribute("aria-pressed", "false");
  await cyrus.context().close();
  // And on Browse homes, what she liked comes first.
  await bo.goto("/reel");
  await expect(bo.getByRole("article").first()).toHaveAttribute("aria-label", address);

  // Ana sees he follows her, and follows him back.
  await ana.goto(boPage);
  await expect(ana.getByText("Follows you")).toBeVisible();
  await Promise.all([saved(ana), ana.getByRole("button", { name: "Follow Bo" }).click()]);
  await expect(ana.getByRole("button", { name: "Following Bo" })).toBeVisible();

  // Her followers: Bo, to his page, and she follows him.
  await ana.goto(`${anaPage}/followers`);
  await expect(ana.getByRole("heading", { level: 1 })).toHaveText("Your followers");
  const followers = ana.getByRole("list", { name: "Your followers" });
  await expect(followers.getByRole("link", { name: "Bo" })).toHaveAttribute("href", boPage);
  await expect(followers.getByRole("button", { name: "Following Bo" })).toHaveAttribute("aria-pressed", "true");

  // Bo's: whom he follows, and he can stop right there.
  await bo.goto(`${boPage}/following`);
  await expect(bo.getByRole("heading", { level: 1 })).toHaveText("People you follow");
  const following = bo.getByRole("list", { name: "People you follow" });
  await Promise.all([saved(bo), following.getByRole("button", { name: "Following Ana" }).click()]);
  await expect(following.getByRole("button", { name: "Follow Ana" })).toHaveAttribute("aria-pressed", "false");
  await bo.reload();
  await expect(bo.getByText("You're not following anyone yet")).toBeVisible();
  await expect(bo.getByRole("navigation", { name: "Followers and following" })).toContainText("0 Following");
  // Nobody followed: the way to find people is right there. (Only on his own
  // list: Ana, looking at it, is offered nothing.)
  await expect(bo.getByRole("main").getByRole("link", { name: "Find people", exact: true })).toHaveAttribute(
    "href",
    "/search/people",
  );
  await ana.goto(`${boPage}/following`);
  await expect(ana.getByText("Bo isn't following anyone yet")).toBeVisible();
  await expect(ana.getByRole("main").getByRole("link", { name: "Find people" })).toHaveCount(0);

  // Signed out, Follow is the way to sign in, back to her page.
  const guest = await (await browser.newContext()).newPage();
  await guest.goto(anaPage);
  await expect(guest.getByRole("link", { name: "Follow Ana" })).toHaveAttribute(
    "href",
    `/login?next=${encodeURIComponent(anaPage)}`,
  );
});

test("the Following stream: one card per home however many people liked it, only likes and words, never a pass", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const TAMSEN = "1880 Tamsen Ridge Pl SE";
  const LAKEVIEW = "5902 Lakeview Terrace SE";
  // Cy likes a home; then Bo likes it too, and passes on another.
  const cy = await signUpBuyer(browser, "cy.stream@example.com", "Cy Stream");
  const cyPage = await pageOf(cy);
  await cy.goto("/homes/SAMPLE-1002");
  await Promise.all([saved(cy), heartOf(homeIn(cy, TAMSEN)).click()]);
  const bo = await signUpBuyer(browser, "bo.stream@example.com", "Bo Stream");
  const boPage = await pageOf(bo);
  await bo.goto("/homes/SAMPLE-1002");
  await Promise.all([saved(bo), heartOf(homeIn(bo, TAMSEN)).click()]);
  await bo.goto("/homes/SAMPLE-1013");
  await Promise.all([saved(bo), homeIn(bo, LAKEVIEW).getByRole("button", { name: "Pass on this home" }).click()]);

  // Dee follows them both.
  const dee = await signUpBuyer(browser, "dee.stream@example.com", "Dee Stream");
  for (const [path, name] of [
    [boPage, "Bo"],
    [cyPage, "Cy"],
  ]) {
    await dee.goto(path);
    await Promise.all([saved(dee), dee.getByRole("button", { name: `Follow ${name}` }).click()]);
    await expect(dee.getByRole("button", { name: `Following ${name}` })).toBeVisible();
  }

  // One card for the home they both liked, newest first, each name to their
  // page; nothing at all about the home Bo passed on.
  await dee.goto("/?lens=following");
  const stream = dee.getByRole("region", { name: "Your feed" });
  const card = stream.getByRole("link", { name: `${TAMSEN}: Bo and Cy liked this home`, exact: true });
  await expect(card).toBeVisible();
  await expect(stream.getByRole("link", { name: new RegExp(TAMSEN) })).toHaveCount(1);
  const item = stream
    .getByRole("listitem")
    .filter({ has: dee.getByRole("link", { name: `${TAMSEN}: Bo and Cy liked this home`, exact: true }) });
  await expect(item).toContainText("Bo and Cy liked this home");
  await expect(item.getByRole("link", { name: "Bo", exact: true })).toHaveAttribute("href", boPage);
  await expect(item.getByRole("link", { name: "Cy", exact: true })).toHaveAttribute("href", cyPage);
  // (Nothing of Bo's pass: the home may be in the feed for another reason,
  // never for him. The only pass a feed ever says is the viewer's own, on a
  // home their agent sent them, and Dee passed on nothing: e2e/rated-homes.spec.ts.)
  await expect(stream.getByRole("link", { name: new RegExp(`^${LAKEVIEW}: Bo`) })).toHaveCount(0);
  await expect(stream.getByText(/passed/i)).toHaveCount(0);
  // Where the feed ends, it says so.
  await expect(stream.getByRole("note")).toBeAttached();

  // Its heart likes it right there, and the page stays where it is.
  const heart = item.getByRole("button", { name: `Like ${TAMSEN}` });
  await expect(heart).toHaveAttribute("aria-pressed", "false");
  await Promise.all([saved(dee), heart.click()]);
  await expect(heart).toHaveAttribute("aria-pressed", "true");
  await dee.reload();
  await expect(heart).toHaveAttribute("aria-pressed", "true");

  // The card opens the stream's homes in the pop-out, on that one.
  await card.click({ position: { x: 20, y: 20 } });
  await dee.waitForURL(/\/reel\?from=feed&home=SAMPLE-1002/);
  await expect(dee.getByRole("dialog", { name: "Homes" }).getByRole("article", { name: TAMSEN })).toBeInViewport({
    ratio: 0.9,
  });
});

test("in the feed, a day someone only commented leads with what they said, and the home's photos swipe right there", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const CORBEL = "812 N Corbel St";
  // Gus says something about a home, and nothing more.
  const gus = await signUpBuyer(browser, "gus.said@example.com", "Gus Said");
  const gusPage = await pageOf(gus);
  await gus.goto("/homes/SAMPLE-1003");
  const sheet = await openComments(gus, homeIn(gus, CORBEL));
  await sheet.getByLabel("Add a comment").fill("Is the porch covered?");
  await sheet.getByRole("button", { name: "Post", exact: true }).click();
  await expect(sheet).toContainText("Is the porch covered?");

  // Hal follows him.
  const hal = await signUpBuyer(browser, "hal.said@example.com", "Hal Said");
  await hal.goto(gusPage);
  await Promise.all([saved(hal), hal.getByRole("button", { name: "Follow Gus" }).click()]);
  await expect(hal.getByRole("button", { name: "Following Gus" })).toBeVisible();

  // One line at the top: who, what he said, when; not said again under the photo.
  await hal.goto("/");
  const item = hal
    .getByRole("listitem")
    .filter({ has: hal.getByRole("link", { name: `${CORBEL}: Gus commented on this home`, exact: true }) });
  await expect(item.locator("[data-card-line]")).toHaveText(/^Gus commented “Is the porch covered\?”\s·\s/);
  await expect(item.getByText("Is the porch covered?").filter({ visible: true })).toHaveCount(1);

  // Its photos swipe on the card, and the feed stays where it is.
  const photos = item.getByRole("group", { name: `Photos of ${CORBEL}` });
  await expect(photos.locator("[data-photo-count]")).toHaveText("1 of 3");
  await swipeLeft(photos);
  await expect(photos.locator("[data-photo-count]")).toHaveText("2 of 3");
  await expect(hal).toHaveURL(/\/$/);

  // A reply says whom it answered, in the feed as on his own page.
  const TAMSEN = "1880 Tamsen Ridge Pl SE";
  const ivy = await signUpBuyer(browser, "ivy.said@example.com", "Ivy Said");
  await ivy.goto("/homes/SAMPLE-1002");
  const ivyChat = await openComments(ivy, homeIn(ivy, TAMSEN));
  await ivyChat.getByLabel("Add a comment").fill("Love the yard.");
  await ivyChat.getByRole("button", { name: "Post", exact: true }).click();
  await expect(ivyChat).toContainText("Love the yard.");
  await gus.goto("/homes/SAMPLE-1002");
  const gusChat = await openComments(gus, homeIn(gus, TAMSEN));
  await commentIn(gusChat, "Ivy", "Love the yard.").getByRole("button", { name: "Reply to Ivy", exact: true }).click();
  await gusChat.getByLabel("Reply to Ivy").fill("Same here.");
  await gusChat.getByRole("button", { name: "Post", exact: true }).first().click();
  await expect(gusChat.getByRole("list", { name: "Replies to Ivy" }).getByText("Same here.")).toBeVisible();
  await gus.goto(gusPage);
  await expect(
    gus
      .getByRole("listitem")
      .filter({ has: gus.getByRole("link", { name: `${TAMSEN}: commented on this home`, exact: true }) })
      .locator("[data-card-line]"),
  ).toHaveText(/^You replied to Ivy “Same here\.”\s·\s/);
  await hal.goto("/");
  const reply = hal
    .getByRole("listitem")
    .filter({ has: hal.getByRole("link", { name: `${TAMSEN}: Gus commented on this home`, exact: true }) });
  await expect(reply.locator("[data-card-line]")).toHaveText(/^Gus replied to Ivy “Same here\.”\s·\s/);
  await expect(reply.locator("[data-card-line]").getByRole("link", { name: "Ivy", exact: true })).toHaveAttribute(
    "href",
    /^\/people\/[0-9a-f-]{36}$/,
  );
});

test("an agent's clients are in neither list nor either number to anyone else; the agent and each client still see each other", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const tabs = (page: Page) => page.getByRole("navigation", { name: "Followers and following" });
  const profileCount = (page: Page, count: string) => page.getByRole("main").getByRole("link", { name: count, exact: true });
  // Someone signs up right on the link an agent sent them, to like a home:
  // from then on they and the agent follow each other.
  const joinOn = async (url: string, name: string, email: string) => {
    const page = await (await browser.newContext()).newPage();
    await page.addInitScript(() => localStorage.setItem("buybox:nudges", JSON.stringify({ photos: true, next: true })));
    await page.goto(url);
    const quillan = homeIn(page, "1204 Quillan St SE");
    await heartOf(quillan).click();
    await joinAs(page, name, email);
    await expect(heartOf(quillan)).toHaveAttribute("aria-pressed", "true");
    return page;
  };

  // Reed has two clients, each on a link of their own.
  const reed = await signInAgent(browser, "reed.lists@example.com", "Reed Lists");
  const forKit = await createShare(reed, ["1204 Quillan", "719 Saltmarsh"], ["Kit"]);
  const forLou = await createShare(reed, ["1204 Quillan", "719 Saltmarsh"], ["Lou"]);
  const kit = await joinOn(forKit.url, "Kit", "kit.lists@example.com");
  const lou = await joinOn(forLou.url, "Lou", "lou.lists@example.com");
  await lou.context().close();
  const reedPage = await pageOf(reed);
  const kitPage = await pageOf(kit);

  // Nell is nobody's client: she follows Reed from his page, in public.
  const nell = await signUpBuyer(browser, "nell.lists@example.com", "Nell Lists");
  await nell.goto(reedPage);
  await Promise.all([saved(nell), nell.getByRole("button", { name: "Follow Reed" }).click()]);
  await expect(nell.getByRole("button", { name: "Following Reed" })).toHaveAttribute("aria-pressed", "true");

  // To her, and to someone signed out, Reed has the one follower and follows
  // nobody: no client in either list, nor in the numbers, on his page or theirs.
  const guest = await (await browser.newContext()).newPage();
  for (const page of [nell, guest]) {
    await page.goto(reedPage);
    await expect(profileCount(page, "1 follower")).toBeVisible();
    await expect(profileCount(page, "0 following")).toBeVisible();
    await page.goto(`${reedPage}/followers`);
    const followers = page.getByRole("list", { name: "Reed's followers" });
    await expect(followers.getByRole("listitem")).toHaveCount(1);
    await expect(followers.getByRole("link", { name: "Nell", exact: true })).toBeVisible();
    await expect(page.getByRole("main")).not.toContainText(/Kit|Lou/);
    await expect(tabs(page)).toContainText("1 Follower");
    await expect(tabs(page)).toContainText("0 Following");
    await page.goto(`${reedPage}/following`);
    await expect(page.getByText("Reed isn't following anyone yet")).toBeVisible();
    await expect(page.getByRole("main")).not.toContainText(/Kit|Lou/);
    await expect(tabs(page)).toContainText("1 Follower");
    await expect(tabs(page)).toContainText("0 Following");
    // A client's own lists say nothing of their agent either.
    await page.goto(kitPage);
    await expect(profileCount(page, "0 followers")).toBeVisible();
    await expect(profileCount(page, "0 following")).toBeVisible();
    await page.goto(`${kitPage}/following`);
    await expect(page.getByText("Kit isn't following anyone yet")).toBeVisible();
    await expect(page.getByRole("main")).not.toContainText("Reed");
    await expect(tabs(page)).toContainText("0 Followers");
    await expect(tabs(page)).toContainText("0 Following");
    await page.goto(`${kitPage}/followers`);
    await expect(page.getByText("No one follows Kit yet")).toBeVisible();
    await expect(page.getByRole("main")).not.toContainText("Reed");
  }
  await guest.context().close();

  // Reed sees all of his own: both clients and Nell.
  await reed.goto(reedPage);
  await expect(profileCount(reed, "3 followers")).toBeVisible();
  await expect(profileCount(reed, "2 following")).toBeVisible();
  await reed.goto(`${reedPage}/followers`);
  const his = reed.getByRole("list", { name: "Your followers" });
  await expect(his.getByRole("listitem")).toHaveCount(3);
  await expect(his.getByRole("link", { name: "Kit", exact: true })).toHaveAttribute("href", kitPage);
  await expect(his.getByRole("link", { name: "Lou", exact: true })).toBeVisible();
  await expect(his.getByRole("link", { name: "Nell", exact: true })).toBeVisible();
  // A buyer is only ever their first name, with no "Agent" beside it.
  await expect(his).not.toContainText(/Nell Lists|Agent/);
  await expect(tabs(reed)).toContainText("3 Followers");
  await expect(tabs(reed)).toContainText("2 Following");
  await reed.goto(`${reedPage}/following`);
  const hisFollowing = reed.getByRole("list", { name: "People you follow" });
  await expect(hisFollowing.getByRole("listitem")).toHaveCount(2);
  await expect(hisFollowing.getByRole("link", { name: "Kit", exact: true })).toBeVisible();
  // And himself on Kit's, where he is one of the two.
  await reed.goto(kitPage);
  await expect(profileCount(reed, "1 follower")).toBeVisible();
  await expect(profileCount(reed, "1 following")).toBeVisible();
  await reed.goto(`${kitPage}/following`);
  await expect(reed.getByRole("list", { name: "People Kit follows" }).getByRole("link", { name: /^Reed\b/ })).toHaveAttribute(
    "href",
    reedPage,
  );

  // Kit sees all of her own, Reed in both.
  await kit.goto(kitPage);
  await expect(profileCount(kit, "1 follower")).toBeVisible();
  await expect(profileCount(kit, "1 following")).toBeVisible();
  await kit.goto(`${kitPage}/following`);
  await expect(kit.getByRole("list", { name: "People you follow" }).getByRole("link", { name: /^Reed\b/ })).toBeVisible();
  // An agent is listed as their page names them: their whole name, "Agent"
  // and their company, so they're told apart from a buyer called Reed.
  const agentRow = kit.getByRole("list", { name: "People you follow" }).getByRole("listitem");
  await expect(agentRow).toContainText("Reed Lists");
  await expect(agentRow).toContainText("Agent");
  await expect(agentRow).toContainText("Harbor & Pine Realty");
  await expect(agentRow.getByRole("button", { name: "Following Reed Lists" })).toHaveAttribute("aria-pressed", "true");
  await kit.goto(`${kitPage}/followers`);
  await expect(kit.getByRole("list", { name: "Your followers" }).getByRole("link", { name: /^Reed\b/ })).toBeVisible();
  // On Reed's she is there herself, with Nell; his other client is not.
  await kit.goto(reedPage);
  await expect(profileCount(kit, "2 followers")).toBeVisible();
  await expect(profileCount(kit, "1 following")).toBeVisible();
  await kit.goto(`${reedPage}/followers`);
  const reeds = kit.getByRole("list", { name: "Reed's followers" });
  await expect(reeds.getByRole("listitem")).toHaveCount(2);
  await expect(reeds.getByRole("link", { name: "Kit", exact: true })).toHaveAttribute("href", kitPage);
  await expect(reeds.getByRole("link", { name: "Nell", exact: true })).toBeVisible();
  await expect(kit.getByRole("main")).not.toContainText("Lou");
  await expect(tabs(kit)).toContainText("2 Followers");
  await expect(tabs(kit)).toContainText("1 Following");
  await kit.goto(`${reedPage}/following`);
  const reedFollows = kit.getByRole("list", { name: "People Reed follows" });
  await expect(reedFollows.getByRole("listitem")).toHaveCount(1);
  await expect(reedFollows.getByRole("link", { name: "Kit", exact: true })).toBeVisible();
});
