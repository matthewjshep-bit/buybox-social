import { expect, test, type Browser, type Page } from "@playwright/test";
import { homeIn, missedTaps, openComments, signInAgent, signUpBuyer } from "./helpers";

// The phone settings carry over to new contexts, touch included; a desktop has none.
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false };
const BRACKENFIELD = "2205 Brackenfield Ct NW";

const OWNER = "matt@shepflips.com";

async function signIn(browser: Browser, email: string, device: Parameters<Browser["newContext"]>[0] = DESKTOP) {
  const page = await (await browser.newContext(device)).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  return page;
}

test("admins see every person, home and comment, and can follow up, fix and remove", async ({ browser }) => {
  // Someone signs up on the home page (locally, signed straight in, as a buyer).
  await signUpBuyer(browser, "jordan.lead@example.com", "Jordan Lead", "206-555-0142");

  // A buyer who says something that needs taking down.
  const buyer = await signUpBuyer(browser, "casey@example.com", "Casey Buyer");
  await buyer.goto("/homes/SAMPLE-1006");
  const sheet = await openComments(buyer, homeIn(buyer, BRACKENFIELD));
  await sheet.getByLabel("Add a comment").fill("Buy cheap watches at example.biz");
  await sheet.getByRole("button", { name: "Post", exact: true }).click();
  await expect(sheet.getByText("Buy cheap watches")).toBeVisible();

  // Not for everyone: signed out goes to sign in; anyone else finds nothing there.
  const anon = await (await browser.newContext()).newPage();
  await anon.goto("/admin");
  await expect(anon).toHaveURL(/\/login$/);
  expect((await buyer.goto("/admin/people"))!.status()).toBe(404);
  expect((await buyer.request.get("/admin/people/export")).status()).toBe(404);
  await expect(buyer.getByRole("link", { name: "Admin" })).toHaveCount(0);

  // The owner, from the header.
  const admin = await signIn(browser, OWNER);
  // Admin is under your initial, with everything else of yours.
  await admin.getByRole("button", { name: "Your profile" }).click();
  await admin.getByRole("link", { name: "Admin" }).click();
  await expect(admin.getByRole("heading", { level: 1 })).toHaveText("Overview");

  // New sign-ups to follow up, one tap from a call or a text.
  await expect(admin.getByRole("link", { name: "Call Jordan Lead" })).toHaveAttribute("href", "tel:2065550142");
  await expect(admin.getByRole("link", { name: "Text Jordan Lead" })).toHaveAttribute("href", "sms:2065550142");

  // People: by type, found by phone however it's typed, and opened.
  await admin.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "People" }).click();
  await admin.getByRole("navigation", { name: "Show" }).getByRole("link", { name: /^Leads/ }).click();
  // Signed in, so not a lead: a buyer.
  await expect(admin.getByRole("link", { name: /Jordan Lead/ })).toHaveCount(0);
  await admin.getByRole("navigation", { name: "Show" }).getByRole("link", { name: /^Buyers/ }).click();
  await expect(admin.getByRole("link", { name: /Jordan Lead/ })).toBeVisible();
  // Staff who just signed in aren't people to follow up with.
  await expect(admin.getByRole("link", { name: new RegExp(OWNER) })).toHaveCount(0);
  await admin.getByRole("searchbox").fill("(206) 5550142");
  await admin.getByRole("button", { name: "Search" }).click();
  await expect(admin.getByRole("link", { name: /Jordan Lead/ })).toBeVisible();

  // The list as a spreadsheet, as it's filtered.
  const csv = await (await admin.request.get("/admin/people/export?q=5550142")).text();
  expect(csv).toContain('"Jordan Lead","jordan.lead@example.com","206-555-0142","buyer"');
  expect(csv).not.toContain("casey@example.com");

  // Fix someone's details, and make them an agent.
  await admin.goto("/admin/people?q=casey");
  await admin.getByRole("link", { name: /Casey Buyer/ }).click();
  await expect(admin.getByRole("heading", { level: 1 })).toHaveText("Casey Buyer");
  await expect(admin.getByText("Buy cheap watches at example.biz")).toBeVisible();
  await admin.getByLabel("Phone").fill("(425) 555-0123");
  await admin.getByLabel("Account type").selectOption("agent");
  await admin.getByRole("button", { name: "Save changes" }).click();
  await expect(admin.getByRole("status")).toHaveText("Saved");
  await expect(admin.getByText("Agent", { exact: true }).first()).toBeVisible();
  await expect(admin.getByRole("link", { name: "Call Casey Buyer" })).toHaveAttribute("href", "tel:4255550123");

  // Homes: the most talked about first, and who said what about one.
  await admin.goto("/admin/homes");
  await admin.getByRole("link", { name: "Most talked about" }).click();
  await admin.getByRole("link", { name: new RegExp(BRACKENFIELD) }).click();
  await expect(admin.getByRole("heading", { level: 1 })).toHaveText(BRACKENFIELD);
  await expect(admin.getByText("Buy cheap watches at example.biz")).toBeVisible();

  // Comments: take one down, after a second tap, and it's gone from the site.
  await admin.goto("/admin/comments");
  const spam = admin.getByRole("listitem").filter({ hasText: "Buy cheap watches" });
  await spam.getByRole("button", { name: "Delete" }).click();
  await spam.getByRole("button", { name: "Delete comment and its replies" }).click();
  await expect(admin.getByText("Buy cheap watches")).toHaveCount(0);
  await buyer.goto("/homes/SAMPLE-1006");
  await expect(homeIn(buyer, BRACKENFIELD)).toBeVisible();
  await expect(buyer.getByText("Buy cheap watches")).toHaveCount(0);
});

test("the owner alone decides who else is an admin", async ({ browser }) => {
  const owner = await signIn(browser, OWNER);
  await owner.goto("/admin");
  await owner.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Admins" }).click();
  await expect(owner.getByRole("heading", { level: 1 })).toHaveText("Admins");
  await expect(owner.getByRole("listitem").filter({ hasText: OWNER })).toContainText("Owner");

  // Someone the owner adds can open the admin, but not this page.
  await owner.getByLabel("Their email").fill("Helper@Example.com");
  await owner.getByRole("button", { name: "Add admin" }).click();
  await expect(owner.getByRole("status")).toHaveText("helper@example.com is now an admin.");
  const helperRow = owner.getByRole("listitem").filter({ hasText: "helper@example.com" });
  await expect(helperRow).toContainText("Hasn't signed in yet");

  const helper = await signIn(browser, "helper@example.com");
  await helper.goto("/admin/people");
  await expect(helper.getByRole("heading", { level: 1 })).toHaveText("People");
  await expect(helper.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Admins" })).toHaveCount(0);
  expect((await helper.goto("/admin/team"))!.status()).toBe(404);

  // The owner can't be added twice, or taken off.
  await owner.reload();
  await owner.getByLabel("Their email").fill(OWNER);
  await owner.getByRole("button", { name: "Add admin" }).click();
  await expect(owner.getByRole("main").getByRole("alert")).toHaveText(
    "That's you: as the owner, you're always an admin.",
  );
  await expect(owner.getByRole("listitem").filter({ hasText: OWNER }).getByRole("button")).toHaveCount(0);

  // Removed, they're out.
  await helperRow.getByRole("button", { name: "Remove" }).click();
  await helperRow.getByRole("button", { name: /^Remove / }).click();
  await expect(owner.getByRole("listitem").filter({ hasText: "helper@example.com" })).toHaveCount(0);
  expect((await helper.goto("/admin/people"))!.status()).toBe(404);
});

// Every link, button and field on the page that a fingertip can miss: taps
// across a 44px box centred on it that land on something else. A link in a
// line of words keeps the line's height (WCAG's inline exception), so a bigger
// touch area never covers the words under it.
async function tooSmall(page: Page) {
  const misses: string[] = [];
  for (const control of await page.getByRole("main").locator("a, button, select, input:not([type=hidden]), summary").all()) {
    const { skip, label } = await control.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const inline = el.tagName === "A" && getComputedStyle(el).display === "inline";
      return {
        skip: inline || (box.width === 0 && box.height === 0),
        label: `${el.textContent?.trim() || el.outerHTML.slice(0, 60)} (${Math.round(box.width)}x${Math.round(box.height)})`,
      };
    });
    if (skip) continue;
    const missed = await missedTaps(control);
    if (missed.length > 0) misses.push(`${label}: ${missed.join(" ")}`);
  }
  return misses;
}

test("on a phone, everything in the admin takes a fingertip and fits the screen, and likes are hearts, never green", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  // Its own people: a sign-up to follow up, who says something, and an agent.
  const fern = await signUpBuyer(browser, "fern.fingertip@example.com", "Fern Fingertip", "206-555-0177");
  await fern.goto("/homes/SAMPLE-1006");
  const sheet = await openComments(fern, homeIn(fern, BRACKENFIELD));
  await sheet.getByLabel("Add a comment").fill("Does the yard get afternoon sun?");
  await sheet.getByRole("button", { name: "Post", exact: true }).click();
  await expect(sheet.getByText("Does the yard get afternoon sun?")).toBeVisible();
  await signInAgent(browser, "fay.fingertip@example.com", "Fay Fingertip");

  // (A phone at its narrowest: 360 wide.)
  const admin = await signIn(browser, OWNER, { viewport: { width: 360, height: 640 } });
  for (const path of ["/admin", "/admin/people", "/admin/homes", "/admin/homes/SAMPLE-1006", "/admin/comments", "/admin/team"]) {
    await admin.goto(path);
    await expect(admin.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await tooSmall(admin), path).toEqual([]);
    expect(await admin.evaluate(() => document.documentElement.scrollWidth), `${path} scrolls sideways`).toBeLessThanOrEqual(360);
    await expect(admin.locator(".lucide-thumbs-up")).toHaveCount(0);
  }
  // Who to get back to stays readable: the name and number keep their room,
  // and Call, Text and Email go under them.
  await admin.goto("/admin");
  const lead = admin.getByRole("listitem").filter({ has: admin.getByRole("link", { name: "Call Fern Fingertip" }) });
  await expect(lead.getByText("206-555-0177", { exact: false })).toBeVisible();
  const name = (await lead.getByRole("link", { name: "Fern Fingertip", exact: true }).boundingBox())!;
  const call = (await lead.getByRole("link", { name: "Call Fern Fingertip" }).boundingBox())!;
  expect(call.y).toBeGreaterThan(name.y + name.height);
  expect((await lead.getByText(/206-555-0177/).boundingBox())!.width).toBeGreaterThan(150);

  // The way back from a person, most of all.
  for (const [query, who] of [
    ["fern.fingertip", "Fern Fingertip"],
    ["fay.fingertip", "Fay Fingertip"],
  ]) {
    await admin.goto(`/admin/people?q=${query}`);
    await admin.getByRole("main").getByRole("link", { name: new RegExp(who) }).click();
    await expect(admin.getByRole("heading", { level: 1 })).toHaveText(who);
    expect(await tooSmall(admin), who).toEqual([]);
    expect(await admin.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    const back = admin.getByRole("main").getByRole("link", { name: "People", exact: true });
    expect((await back.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  // An agent is marked in ink, as everywhere else; green is for what's for sale.
  await expect(admin.getByText("Agent", { exact: true }).first()).toHaveClass(/bg-ink/);
  await admin.goto("/admin/people?status=agent");
  await expect(admin.getByRole("main").locator("[class*='emerald']")).toHaveCount(0);

  // Asked to delete, then Cancel: the keyboard is back on Delete, not at the top.
  await admin.goto("/admin/comments");
  const said = admin.getByRole("listitem").filter({ hasText: "Does the yard get afternoon sun?" });
  await said.getByRole("button", { name: "Delete", exact: true }).press("Enter");
  await expect(said.getByRole("button", { name: "Delete comment and its replies" })).toBeFocused();
  await said.getByRole("button", { name: "Cancel" }).press("Enter");
  await expect(said.getByRole("button", { name: "Delete", exact: true })).toBeFocused();
  // Then it goes, so the home is as the other tests expect it.
  await said.getByRole("button", { name: "Delete", exact: true }).click();
  await said.getByRole("button", { name: "Delete comment and its replies" }).click();
  await expect(admin.getByText("Does the yard get afternoon sun?")).toHaveCount(0);
});
