// Yes or no to a home in one tap: an X (pass, and on to the next home) and
// a heart (like) side by side in the row right under the photo, the first
// two things in it.
// They are the one heart and the one pass a home has, so they reach your own
// page and your agent. On an agent's link, the last screen is every home
// again, small, each with the same two buttons. And a mouse's wheel goes on a
// home at a time.
import { expect, test } from "@playwright/test";
import { clientRow, createShare, heartOf, joinAs, signInAgent, signUpBuyer, toFirstHome } from "./helpers";

const PHONE = { width: 390, height: 780 };

test("the X passes and goes on to the next home; the heart likes; both show on your own page", async ({ browser }) => {
  test.setTimeout(90_000);
  const page = await signUpBuyer(browser, `yes.no.${Date.now()}@example.com`, "Yara");
  await page.setViewportSize(PHONE);
  await page.goto("/browse");
  const homes = page.getByRole("article");
  const first = homes.nth(0);
  const second = homes.nth(1);
  await expect(first).toBeInViewport({ ratio: 0.9 });
  const firstAddress = (await first.getAttribute("aria-label"))!;
  const secondAddress = (await second.getAttribute("aria-label"))!;

  // Both in the row under the photo, a fingertip wide: the X first, at the
  // left, the heart right beside it, both level; neither on the photo.
  const pass = first.getByRole("button", { name: "Pass on this home" });
  const like = heartOf(first);
  const photo = (await first.locator("[data-photo-frame]").first().boundingBox())!;
  const row = first.locator("[data-actions]");
  await expect(row.getByRole("button").nth(0)).toHaveAccessibleName("Pass on this home");
  await expect(row.getByRole("button").nth(1)).toHaveAccessibleName(/^Like /);
  const [x, heart] = [(await pass.boundingBox())!, (await like.boundingBox())!];
  expect(x.width).toBeGreaterThanOrEqual(44);
  expect(x.height).toBeGreaterThanOrEqual(44);
  expect(heart.width).toBeGreaterThanOrEqual(44);
  expect(heart.height).toBeGreaterThanOrEqual(44);
  expect(x.x).toBeLessThan(40);
  expect(heart.x).toBeGreaterThan(x.x + x.width - 1);
  expect(heart.x).toBeLessThan(x.x + x.width + 16);
  expect(Math.abs(x.y - heart.y)).toBeLessThan(2);
  expect(x.y).toBeGreaterThanOrEqual(photo.y + photo.height - 1);
  expect(x.y - (photo.y + photo.height)).toBeLessThanOrEqual(12);

  // The X: passed, and on to the next home without another tap.
  await pass.click();
  await expect(second).toBeInViewport({ ratio: 0.9 });
  await expect.poll(async () => Math.abs((await second.boundingBox())?.y ?? 99)).toBeLessThan(1);

  // The heart on the second: liked. It's the only heart the home has, and it stays put.
  const likeSecond = heartOf(second);
  await likeSecond.click();
  await expect(likeSecond).toHaveAttribute("aria-pressed", "true");
  await expect(second.getByRole("button", { name: /^Like (?!the )/ })).toHaveCount(1);
  // (No "Not for me" under More any more: the X is how a home is passed on.)
  await second.getByRole("button", { name: "More options" }).click();
  const more = page.getByRole("dialog", { name: "More" });
  await expect(more).toBeVisible();
  await expect(more.getByRole("button", { name: "Not for me" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(more).toBeHidden();
  await expect(second).toBeInViewport({ ratio: 0.9 });

  // Back on the first, its X says it was passed on; tapped again, it's taken back, and stays.
  await first.scrollIntoViewIfNeeded();
  await expect(pass).toHaveAttribute("aria-pressed", "true");
  await pass.click();
  await expect(pass).toHaveAttribute("aria-pressed", "false");
  await expect(first).toBeInViewport({ ratio: 0.9 });
  await pass.click();
  await expect(second).toBeInViewport({ ratio: 0.9 });

  // On their own page: the like, and under "Didn't like", the pass.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/people/me");
  await page.waitForURL(/\/people\/[0-9a-f-]{36}$/);
  const profile = new URL(page.url()).pathname;
  await page.goto(`${profile}?show=liked`);
  await expect(page.getByRole("main")).toContainText(secondAddress);
  await expect(page.getByRole("main")).not.toContainText(firstAddress);
  await page.goto(`${profile}?show=passed`);
  await expect(page.getByRole("main")).toContainText(firstAddress);
  await expect(page.getByRole("main")).not.toContainText(secondAddress);
});

test("a turn of the mouse wheel goes on one home, and back", async ({ browser }) => {
  const page = await signUpBuyer(browser, `wheel.${Date.now()}@example.com`, "Wes");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/browse");
  const homes = page.getByRole("article");
  await expect(homes.nth(0)).toBeInViewport({ ratio: 0.9 });
  // Over the photo, three notches of an ordinary wheel: one home on, not three.
  await page.mouse.move(300, 400);
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, 100);
  await expect(homes.nth(1)).toBeInViewport({ ratio: 0.9 });
  await page.waitForTimeout(600);
  await expect(homes.nth(1)).toBeInViewport({ ratio: 0.9 });
  await page.mouse.wheel(0, -100);
  await expect(homes.nth(0)).toBeInViewport({ ratio: 0.9 });
});

test("on an agent's link the wheel leaves the welcome for the homes, and a client's X reaches the agent", async ({ browser }) => {
  test.setTimeout(90_000);
  const agent = await signInAgent(browser, `yn.agent.${Date.now()}@example.com`, "Nan Agent");
  const { url } = await createShare(agent, ["1204 Quillan", "719 Saltmarsh"], ["Quin"]);
  const quin = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await quin.goto(url);
  await expect(quin.getByRole("region", { name: "Welcome" })).toBeInViewport();
  // The wheel, over the welcome's words: down to the first home.
  await quin.mouse.move(300, 400);
  await quin.mouse.wheel(0, 100);
  const first = quin.getByRole("article").first();
  await expect(first).toBeInViewport({ ratio: 0.9 });
  await expect.poll(async () => Math.abs((await first.boundingBox())?.y ?? 99)).toBeLessThan(1);

  // Quin passes on it with the X: on to the second home.
  // (Asked who they are first, once; then it goes on by itself.)
  await first.getByRole("button", { name: "Pass on this home" }).click();
  await joinAs(quin, "Quin");
  await expect(quin.getByRole("article").nth(1)).toBeInViewport({ ratio: 0.9 });

  // The last screen asks about each home, small: the one passed on says so,
  // and the other can be liked right there.
  await quin.evaluate(() => {
    const reel = document.querySelector<HTMLElement>("[data-reel]")!;
    reel.scrollTo({ top: reel.scrollHeight });
  });
  await expect(quin.getByRole("heading", { name: "What did you think?" })).toBeInViewport();
  const grid = quin.getByRole("list", { name: "The homes" });
  await expect(grid.getByRole("listitem")).toHaveCount(2);
  await expect(grid.getByRole("button", { name: "1204 Quillan St SE: pass" })).toHaveAttribute("aria-pressed", "true");
  const yes = grid.getByRole("button", { name: "719 Saltmarsh Ln: like" });
  await expect(yes).toHaveAttribute("aria-pressed", "false");
  await yes.click();
  await expect(yes).toHaveAttribute("aria-pressed", "true");
  // Nothing left to ask: it says that's all, and (signed in) the one way on is more homes like these.
  await expect(quin.getByRole("heading", { name: "That's all" })).toBeVisible();
  const quinEnd = quin.getByRole("region", { name: "The end" });
  await expect(quinEnd.getByRole("link", { name: "See more homes like these" })).toHaveAttribute("href", "/");
  await expect(quinEnd.getByRole("button", { name: "Sign up to save your picks" })).toHaveCount(0);
  await expect(quin.getByRole("region", { name: "What's next" })).toHaveCount(0);
  // A home's photo there goes back to that home.
  await grid.getByRole("button", { name: "See 719 Saltmarsh Ln" }).click();
  await expect(quin.getByRole("article").nth(1)).toBeInViewport({ ratio: 0.9 });
  await expect(heartOf(quin.getByRole("article").nth(1))).toHaveAttribute("aria-pressed", "true");

  // The agent hears of it: Quin liked one and passed on one.
  await agent.goto("/dashboard");
  await clientRow(agent, "Quin").getByRole("link", { name: "Quin", exact: true }).click();
  await agent.waitForURL(/\/dashboard\/clients\//);
  await expect(agent.getByRole("main")).toContainText("Passed on 1");
  await expect(agent.getByRole("main")).toContainText(/Liked 1 of 2/);

  // The agent, looking at their own link, sees it as Quin does: the X and the
  // heart on each home, and on the last screen. They're Quin's to tap: the
  // agent's tap says so, and neither passes nor goes on.
  await agent.goto(url);
  await toFirstHome(agent).catch(() => {});
  const theirFirst = agent.getByRole("article").first();
  await expect(theirFirst).toBeInViewport({ ratio: 0.9 });
  const theirX = theirFirst.getByRole("button", { name: "Pass on this home" });
  await expect(theirX).toBeVisible();
  await expect(heartOf(theirFirst)).toBeVisible();
  await theirX.click();
  await expect(agent.getByRole("status").filter({ hasText: "That's for your client to tap." })).toBeVisible();
  await expect(theirX).toHaveAttribute("aria-pressed", "false");
  await expect(theirFirst).toBeInViewport({ ratio: 0.9 });
  await agent.evaluate(() => {
    const reel = document.querySelector<HTMLElement>("[data-reel]")!;
    reel.scrollTo({ top: reel.scrollHeight });
  });
  const theirs = agent.getByRole("list", { name: "The homes" });
  await expect(theirs.getByRole("listitem")).toHaveCount(2);
  await expect(theirs.getByRole("button", { name: /: (pass|like)$/ })).toHaveCount(4);
  await theirs.getByRole("button", { name: "719 Saltmarsh Ln: pass" }).click();
  await expect(agent.getByRole("status").filter({ hasText: "That's for your client to tap." })).toBeVisible();
  await expect(theirs.getByRole("button", { name: "719 Saltmarsh Ln: pass" })).toHaveAttribute("aria-pressed", "false");
  // Nothing on the last screen asks the agent to sign up or sends them anywhere.
  const agentEnd = agent.getByRole("region", { name: "The end" });
  await expect(agentEnd.getByRole("heading", { name: "That's all" })).toBeVisible();
  await expect(agentEnd.getByText("Here they can like or pass on each home.")).toBeVisible();
  await expect(agentEnd.getByRole("button", { name: "Sign up to save your picks" })).toHaveCount(0);
  await expect(agentEnd.getByRole("link", { name: "See more homes like these" })).toHaveCount(0);
});
