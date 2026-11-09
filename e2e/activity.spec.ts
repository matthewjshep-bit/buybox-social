// The bell's page: people and homes. The same thing on one comment on one day
// is one line ("Jules, Ivy and 2 others liked your comment…"), and days fall
// under Today, This week and Earlier. This spec runs first, so everything it
// makes is deleted again at the end, from each person's own page: no later
// spec sees a comment, a reply or a like from here, even if it stops halfway.
import { expect, test, type Page } from "@playwright/test";
import {
  ACTIVITY_SECTIONS,
  activitySection,
  describeActivity,
  groupActivity,
  quoteOf,
  sectionId,
  whoText,
  type ActivityItem,
} from "../lib/activity";
import { homeIn, openComments, settle, signUpBuyer } from "./helpers";
import { takeBackAll } from "./own-page";

const LAKEVIEW = "5902 Lakeview Terrace SE";
const WORDS = "That courtyard would be my office.";
const REPLY = "Same, with a coffee in hand.";

// Set while Lakeview has something from here on it.
let made = false;

// Stopped halfway: Grace's reply goes first (it keeps Ana's comment), then
// Ana's comment, and its likes with it.
test.afterEach(async ({ browser }) => {
  if (!made) return;
  await takeBackAll(await signUpBuyer(browser, "grace.activity@example.com", "Grace Hill"), LAKEVIEW);
  await takeBackAll(await signUpBuyer(browser, "ana.activity@example.com", "Ana Reyes"), LAKEVIEW);
  made = false;
});

// Deletes your one comment on Lakeview from your own page, after the second tap.
async function deleteMine(page: Page) {
  await page.goto("/people/me");
  await page.waitForURL(/\/people\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: `Options for ${LAKEVIEW}` }).click();
  const sheet = page.getByRole("dialog", { name: `Options for ${LAKEVIEW}` });
  await sheet.getByRole("button", { name: "Delete my comment", exact: true }).click();
  await sheet.getByRole("button", { name: "Delete comment" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Comment deleted" })).toBeVisible();
  await expect(sheet).toBeHidden();
}

test("activity shows people and homes, with repeats on one comment on one line", async ({ browser }) => {
  test.setTimeout(180_000);
  const ana = await signUpBuyer(browser, "ana.activity@example.com", "Ana Reyes");
  const pageErrors: string[] = [];
  ana.on("pageerror", (error) => pageErrors.push(error.message));

  // Nothing yet: what will show up here, and a way on.
  await ana.goto("/activity");
  await expect(ana.getByRole("heading", { level: 1 })).toHaveText("Activity");
  await expect(ana.getByText("Nothing yet")).toBeVisible();
  await expect(ana.getByText("When people reply to you or like your comments, it shows up here.")).toBeVisible();
  await expect(ana.getByRole("link", { name: "See homes" })).toHaveAttribute("href", "/");
  await expect(ana.getByText("React to today's picks")).toHaveCount(0);

  await ana.goto("/homes/SAMPLE-1013");
  const thread = await openComments(ana, homeIn(ana, LAKEVIEW));
  made = true;
  await thread.getByLabel("Add a comment").fill(WORDS);
  await thread.getByRole("button", { name: "Post", exact: true }).click();
  await expect(thread.getByText(WORDS)).toBeVisible();

  // Four people like it, one after another; the first also answers it.
  const people: Page[] = [];
  for (const [email, name] of [
    ["grace.activity@example.com", "Grace Hill"],
    ["hannah.activity@example.com", "Hannah Ito"],
    ["ivy.activity@example.com", "Ivy Lund"],
    ["jules.activity@example.com", "Jules Park"],
  ]) {
    const page = await signUpBuyer(browser, email, name);
    await page.goto("/homes/SAMPLE-1013");
    const chat = await openComments(page, homeIn(page, LAKEVIEW));
    await chat.getByRole("button", { name: "Like Ana's comment" }).click();
    await expect(chat.getByRole("button", { name: /^Like Ana's comment, \d likes?$/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Saved before the next one, so they're in this order.
    await expect(async () => {
      await page.goto("/homes/SAMPLE-1013");
      const kept = await openComments(page, homeIn(page, LAKEVIEW));
      await expect(kept.getByRole("button", { name: /^Like Ana's comment, \d likes?$/ })).toHaveAttribute(
        "aria-pressed",
        "true",
        { timeout: 1000 },
      );
    }).toPass({ timeout: 20_000 });
    people.push(page);
  }
  const [grace, hannah] = people;
  await grace.goto("/homes/SAMPLE-1013");
  const chat = await openComments(grace, homeIn(grace, LAKEVIEW));
  await chat.getByRole("button", { name: "Reply to Ana", exact: true }).click();
  await chat.getByLabel("Reply to Ana").fill(REPLY);
  await chat.getByRole("button", { name: "Post", exact: true }).first().click();
  await expect(chat.getByRole("list", { name: "Replies to Ana" }).getByText(REPLY)).toBeVisible();

  // Two lines, not five: the bell counts them as the page shows them.
  await expect(async () => {
    await ana.goto("/");
    await expect(ana.getByRole("link", { name: "Activity, 2 new" })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await ana.getByRole("link", { name: "Activity, 2 new" }).click();
  await expect(ana.getByRole("heading", { level: 1 })).toHaveText("Activity");
  await expect(ana.getByRole("heading", { level: 2 })).toHaveText(["Today"]);
  const today = ana.getByRole("region", { name: "Today" });
  const rows = today.getByRole("listitem");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText(`Grace replied to your comment on ${LAKEVIEW}`);
  await expect(rows.nth(0)).toContainText(REPLY);
  await expect(rows.nth(1)).toContainText(`Jules, Ivy and 2 others liked your comment on ${LAKEVIEW}`);
  await expect(rows.nth(1)).toContainText(WORDS);
  await expect(ana.getByText("(new)")).toHaveCount(2);
  // Each line has the person, a rose heart for a like (no thumbs), and the home's photo; it opens the home.
  await expect(rows.nth(1).locator("svg.lucide-heart")).toHaveCount(1);
  await expect(ana.locator("main svg.lucide-thumbs-up")).toHaveCount(0);
  for (const row of [rows.nth(0), rows.nth(1)]) {
    await expect(row.locator("img")).toHaveCount(1);
    await expect(row.getByRole("link")).toHaveAttribute("href", "/homes/SAMPLE-1013?photo=0");
  }
  expect(pageErrors).toEqual([]);

  // Someone it's all about the other way round has nothing here.
  await hannah.goto("/activity");
  await expect(hannah.getByText("Nothing yet")).toBeVisible();

  // Ana's comment has an answer, so it can't go from her page yet.
  await ana.goto("/people/me");
  await ana.waitForURL(/\/people\/[0-9a-f-]{36}$/);
  await ana.getByRole("button", { name: `Options for ${LAKEVIEW}` }).click();
  const sheet = ana.getByRole("dialog", { name: `Options for ${LAKEVIEW}` });
  const locked = sheet.getByRole("button", { name: "Delete my comment", exact: true });
  await expect(locked).toHaveAttribute("aria-disabled", "true");
  await expect(locked).toHaveAccessibleDescription(/courtyard would be my office.*Comments with replies can't be deleted here/);
  // Tapping it does nothing (once the sheet has come to rest, so the tap lands).
  await settle(sheet);
  await locked.click({ force: true });
  await expect(sheet.getByRole("button", { name: "Delete comment" })).toHaveCount(0);
  await ana.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  // Once Grace takes her reply back, Ana can delete it, and everything from here is gone.
  await deleteMine(grace);
  await deleteMine(ana);
  await expect(ana.getByText("Your page fills up as you go")).toBeVisible();
  await ana.goto("/activity");
  await expect(ana.getByText("Nothing yet")).toBeVisible();
  await ana.goto("/homes/SAMPLE-1013");
  const after = await openComments(ana, homeIn(ana, LAKEVIEW));
  await expect(after.getByText(WORDS)).toHaveCount(0);
  await expect(after.getByText(REPLY)).toHaveCount(0);
  made = false;
});

// The grouping and the sections, without a server.
test("repeats group by comment and Seattle day, under Today, This week and Earlier", () => {
  // Noon in Seattle on November 6.
  const NOW = Date.parse("2026-11-06T20:00:00Z");
  const ADDRESS = "4127 Larkmoor Ave NE";
  const item = (
    id: string,
    kind: ActivityItem["kind"],
    who: string,
    about: string,
    at: string,
    unread = false,
  ): ActivityItem => ({
    id,
    kind,
    who,
    whoId: who.toLowerCase(),
    body: `About ${about}`,
    about,
    listingKey: "SAMPLE-1001",
    address: ADDRESS,
    photo: null,
    at,
    unread,
  });
  const rows = groupActivity([
    item("l1", "comment_like", "Grace", "c1", "2026-11-06T16:00:00Z"),
    item("l2", "comment_like", "Hannah", "c1", "2026-11-06T17:00:00Z", true),
    item("l3", "comment_like", "Ivy", "c1", "2026-11-06T18:00:00Z"),
    item("l4", "comment_like", "Jules", "c1", "2026-11-06T19:00:00Z"),
    // The same comment, but 9pm the evening before in Seattle.
    item("l5", "comment_like", "Kai", "c1", "2026-11-06T05:00:00Z"),
    // Two replies from one person are one name.
    item("r1", "reply", "Grace", "c1", "2026-11-06T18:30:00Z"),
    item("r2", "reply", "Grace", "c1", "2026-11-06T18:45:00Z"),
    // New comments on a home you liked group by the home.
    item("n1", "comment", "Lee", "SAMPLE-1001", "2026-11-03T18:00:00Z"),
    item("n2", "comment", "Mo", "SAMPLE-1001", "2026-11-03T19:00:00Z"),
    item("o1", "comment_like", "Nia", "c2", "2026-10-20T18:00:00Z"),
  ]);
  expect(rows.map((row) => [`${whoText(row.people)} ${describeActivity(row)}`, activitySection(row.at, NOW), row.unread])).toEqual([
    [`Jules, Ivy and 2 others liked your comment on ${ADDRESS}`, "Today", true],
    [`Grace replied to your comment on ${ADDRESS}`, "Today", false],
    [`Kai liked your comment on ${ADDRESS}`, "This week", false],
    [`Mo and Lee commented on ${ADDRESS}, a home you liked`, "This week", false],
    [`Nia liked your comment on ${ADDRESS}`, "Earlier", false],
  ]);
  // Timed by the newest in each.
  expect(rows.map((row) => row.at)).toEqual([
    "2026-11-06T19:00:00Z",
    "2026-11-06T18:45:00Z",
    "2026-11-06T05:00:00Z",
    "2026-11-03T19:00:00Z",
    "2026-10-20T18:00:00Z",
  ]);

  const names = (n: number) => whoText(["Grace", "Hannah", "Ivy", "Jules", "Kai"].slice(0, n).map((name) => ({ name })));
  expect([1, 2, 3, 4, 5].map(names)).toEqual([
    "Grace",
    "Grace and Hannah",
    "Grace, Hannah and Ivy",
    "Grace, Hannah and 2 others",
    "Grace, Hannah and 3 others",
  ]);
  // Several people's words say whose they are; a like is of your own.
  expect(rows.map(quoteOf)).toEqual([
    "“About c1”",
    "“About c1”",
    "“About c1”",
    "Mo: “About SAMPLE-1001”",
    "“About c2”",
  ]);
  // Each section is named by its heading, so its id has no spaces.
  expect(ACTIVITY_SECTIONS.map(sectionId)).toEqual(["activity-today", "activity-this-week", "activity-earlier"]);
  // Six days back is still this week; seven is earlier.
  expect(activitySection("2026-10-31T19:00:00Z", NOW)).toBe("This week");
  expect(activitySection("2026-10-30T19:00:00Z", NOW)).toBe("Earlier");
  // Just after midnight in Seattle is today; just before is yesterday, this week.
  expect(activitySection("2026-11-06T08:30:00Z", NOW)).toBe("Today");
  expect(activitySection("2026-11-06T07:30:00Z", NOW)).toBe("This week");
});
