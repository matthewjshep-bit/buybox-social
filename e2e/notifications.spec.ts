// The bell, for everyone it concerns: a client hears that their agent sent
// them homes and answered them, the agent hears what their client did on
// their link, and anyone hears who started following them. Each line goes
// straight to the thing it's about, and nobody else ever sees it.
import { expect, test, type Page } from "@playwright/test";
import { createShare, homeIn, joinAs, openComments, openMore, signInAgent, signUpBuyer, toFirstHome } from "./helpers";

const QUILLAN = "1204 Quillan St SE";
const SALTMARSH = "719 Saltmarsh Ln";
const QUESTION = "Is the basement finished?";
const ANSWER = "Yes, finished in 2019. Want to see it Saturday?";

const saved = (page: Page) =>
  page.waitForResponse((res) => res.request().method() === "POST" && Boolean(res.request().headers()["next-action"]));

// Someone's own page, from wherever they are.
async function pageOf(page: Page) {
  await page.goto("/people/me");
  await page.waitForURL(/\/people\/[0-9a-f-]{36}$/);
  return new URL(page.url()).pathname;
}

// One line of someone's activity, by what it says.
const lineOf = (page: Page, text: string) => page.getByRole("main").getByRole("listitem").filter({ hasText: text });

test("a link's people and its agent hear about each other, and each line opens the thing it's about", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const fern = await signInAgent(browser, "fern.notify@example.com", "Fern Notify");
  const { urls, dashboardUrl } = await createShare(fern, ["1204 Quillan", "719 Saltmarsh"], ["Jo"]);
  const joLink = new URL(urls.Jo).pathname;
  const shareId = new URL(dashboardUrl).pathname.split("/").at(-1)!;
  const joEmail = `jo.notify.${Date.now()}@example.com`;

  // Jo opens her link and asks about the basement: her first word signs her up.
  const jo = await (await browser.newContext()).newPage();
  await jo.goto(urls.Jo);
  await toFirstHome(jo);
  const quillan = homeIn(jo, QUILLAN);
  const chat = await openComments(jo, quillan);
  await chat.getByLabel("Add a comment").fill(QUESTION);
  await chat.getByRole("button", { name: "Post", exact: true }).click();
  await joinAs(jo, "Jo", joEmail);
  await expect(chat.getByText(QUESTION)).toBeVisible();
  await jo.keyboard.press("Escape");
  // And she passes on the other one, which is for Fern's dashboard, never her bell.
  const more = await openMore(jo, homeIn(jo, SALTMARSH));
  await more.getByRole("button", { name: "Not for me" }).click();
  await expect(more.getByRole("button", { name: "Not for me" })).toHaveAttribute("aria-pressed", "true");
  await jo.keyboard.press("Escape");

  // Jo's bell: the link Fern sent her, from Fern (her photo, her name to her
  // page), only hers to see, and it opens her own link.
  await jo.goto("/activity");
  const sent = lineOf(jo, "Fern sent you 2 homes");
  await expect(sent).toBeVisible();
  await expect(sent).toContainText("Your agent");
  await expect(sent).toContainText("Only you see this");
  await expect(sent.getByRole("link", { name: /^Fern sent you 2 homes/ })).toHaveAttribute("href", joLink);
  await expect(sent.getByRole("link", { name: "Fern", exact: true })).toHaveAttribute("href", /^\/people\/[0-9a-f-]{36}$/);
  await expect(sent.locator("img[src*='/photo?v=']")).toBeVisible();
  // Nothing about what she did herself.
  await expect(jo.getByText(/Jo commented|Your client/)).toHaveCount(0);

  // Fern's bell has news, and the line is Jo's question, by first name, with
  // a way straight to it on her page about the link.
  await expect(async () => {
    await fern.goto("/dashboard");
    await expect(fern.getByRole("link", { name: /^Activity, [1-9]\d* new$/ })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await fern.goto("/activity");
  const asked = lineOf(fern, `Jo commented on ${QUILLAN}`);
  await expect(asked).toBeVisible();
  await expect(asked).toContainText(QUESTION);
  await expect(asked).toContainText("Your client");
  await expect(asked).toContainText("Only you see this");
  // [P] Her pass stays on the dashboard, and her email is never on the page.
  await expect(fern.getByRole("main")).not.toContainText(SALTMARSH);
  await expect(fern.getByRole("main")).not.toContainText(/passed/);
  expect(await fern.content()).not.toContain(joEmail);
  const open = asked.getByRole("link", { name: new RegExp(`^Jo commented on ${QUILLAN}`) });
  await expect(open).toHaveAttribute("href", new RegExp(`^/dashboard/shares/${shareId}\\?tab=homes#comment-[0-9a-f-]{36}$`));

  // It opens there, and Fern answers right under it.
  await open.click();
  await expect(fern).toHaveURL(new RegExp(`/dashboard/shares/${shareId}\\?tab=homes#comment-[0-9a-f-]{36}$`));
  const panel = fern.getByRole("region", { name: QUILLAN });
  await expect(panel.getByText(QUESTION)).toBeVisible();
  await panel.getByLabel("Reply to your client").fill(ANSWER);
  await panel.getByRole("button", { name: "Reply" }).click();
  await expect(panel.getByText(ANSWER)).toBeVisible();

  // Jo hears it, and the line opens her link on that home, at Fern's answer.
  await expect(async () => {
    await jo.goto("/activity");
    await expect(lineOf(jo, `Fern replied on ${QUILLAN}`)).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  const replied = lineOf(jo, `Fern replied on ${QUILLAN}`);
  await expect(replied).toContainText(ANSWER);
  await expect(replied).toContainText("Your agent");
  const reply = replied.getByRole("link", { name: new RegExp(`^Fern replied on ${QUILLAN}`) });
  await expect(reply).toHaveAttribute("href", new RegExp(`^${joLink}\\?home=[\\w-]+&comment=[0-9a-f-]{36}$`));
  await reply.click();
  await expect(jo).toHaveURL(new RegExp(`${joLink}\\?home=[\\w-]+&comment=[0-9a-f-]{36}$`));
  await expect(jo.getByRole("dialog", { name: "Comments" }).getByText(ANSWER)).toBeVisible();

  // [P] Nobody else hears any of it: not someone off the link, and not Fern
  // about her own words.
  const kai = await signUpBuyer(browser, "kai.notify@example.com", "Kai Notify");
  await kai.goto("/activity");
  await expect(kai.getByText("Nothing yet")).toBeVisible();
  await fern.goto("/activity");
  await expect(fern.getByText(/Fern replied|sent you/)).toHaveCount(0);
});

test("a new follower is news to the one they follow, who can follow them back right there", async ({ browser }) => {
  test.setTimeout(90_000);
  const ana = await signUpBuyer(browser, "ana.notify@example.com", "Ana Notify");
  const anaPage = await pageOf(ana);
  const bo = await signUpBuyer(browser, "bo.notify@example.com", "Bo Notify");
  const boPage = await pageOf(bo);

  await bo.goto(anaPage);
  await Promise.all([saved(bo), bo.getByRole("button", { name: "Follow Ana" }).click()]);
  await expect(bo.getByRole("button", { name: "Following Ana" })).toHaveAttribute("aria-pressed", "true");

  // Ana's bell says so, and the line opens his page.
  await expect(async () => {
    await ana.goto("/");
    await expect(ana.getByRole("link", { name: "Activity, 1 new" })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await ana.goto("/activity");
  const line = lineOf(ana, "Bo started following you");
  await expect(line).toBeVisible();
  await expect(line.getByRole("link", { name: /^Bo started following you/ })).toHaveAttribute("href", boPage);
  await expect(line.getByRole("link", { name: "Bo", exact: true })).toHaveAttribute("href", boPage);
  // Public, so nothing here is only hers.
  await expect(line).not.toContainText("Only you see this");

  // Follow back, without leaving the page; tapped again, it's undone.
  const back = line.getByRole("button", { name: "Follow back Bo" });
  await expect(back).toHaveAttribute("aria-pressed", "false");
  await Promise.all([saved(ana), back.click()]);
  const following = line.getByRole("button", { name: "Following Bo" });
  await expect(following).toHaveAttribute("aria-pressed", "true");
  await expect(ana).toHaveURL(/\/activity$/);
  await bo.goto(anaPage);
  await expect(bo.getByText("Follows you")).toBeVisible();
  // Once they follow each other, the line has nothing to ask.
  await ana.reload();
  await expect(lineOf(ana, "Bo started following you")).toBeVisible();
  await expect(ana.getByRole("button", { name: /Follow back/ })).toHaveCount(0);

  // [P] Only Ana hears that Bo follows her; Bo hears that she followed him back.
  await bo.goto("/activity");
  await expect(lineOf(bo, "Ana started following you")).toBeVisible();
  await expect(bo.getByText("Bo started following you")).toHaveCount(0);
  await expect(bo.getByRole("button", { name: /Follow back/ })).toHaveCount(0);

  // Leave nothing behind for later specs: each stops following the other.
  for (const [page, other, name] of [
    [ana, boPage, "Bo"],
    [bo, anaPage, "Ana"],
  ] as const) {
    await page.goto(other);
    await Promise.all([saved(page), page.getByRole("button", { name: `Following ${name}` }).click()]);
    await expect(page.getByRole("button", { name: `Follow ${name}` })).toHaveAttribute("aria-pressed", "false");
  }
});
