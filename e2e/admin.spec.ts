import { expect, test, type Browser, type Page } from "@playwright/test";
import { homeIn, openComments, signUpBuyer } from "./helpers";

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

// Every link, button and field on the page that's smaller than a fingertip,
// counting the touch area a small one gets around it (44px either way).
const tooSmall = (page: Page) =>
  page.getByRole("main").evaluate((main) =>
    [...main.querySelectorAll("a, button, select, input:not([type=hidden]), summary")].flatMap((el) => {
      const box = el.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) return [];
      const around = getComputedStyle(el, "::after");
      const padded = around.position === "absolute" && around.content !== "none";
      const height = Math.max(box.height, padded ? parseFloat(around.height) : 0);
      const width = Math.max(box.width, padded ? parseFloat(around.width) : 0);
      return height < 43.5 || width < 43.5 ? [`${el.textContent?.trim() || el.outerHTML.slice(0, 60)}: ${width}x${height}`] : [];
    }),
  );

test("on a phone, everything in the admin takes a fingertip, and likes are hearts, never green", async ({ browser }) => {
  // (The default device: a phone.)
  const admin = await signIn(browser, OWNER, {});
  for (const path of ["/admin", "/admin/people", "/admin/homes", "/admin/homes/SAMPLE-1006", "/admin/comments", "/admin/team"]) {
    await admin.goto(path);
    await expect(admin.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await tooSmall(admin), path).toEqual([]);
    await expect(admin.locator(".lucide-thumbs-up")).toHaveCount(0);
  }
  // The way back from a home or a person, most of all.
  await admin.goto("/admin/people?q=casey");
  await admin.getByRole("link", { name: /Casey Buyer/ }).click();
  await expect(admin.getByRole("heading", { level: 1 })).toHaveText("Casey Buyer");
  expect(await tooSmall(admin)).toEqual([]);
  const back = admin.getByRole("main").getByRole("link", { name: "People", exact: true });
  expect((await back.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  // An agent is marked in ink, as everywhere else; green is for what's for sale.
  await expect(admin.getByText("Agent", { exact: true }).first()).toHaveClass(/bg-ink/);
  await admin.goto("/admin/people?status=agent");
  await expect(admin.getByRole("main").locator("[class*='emerald']")).toHaveCount(0);
});
