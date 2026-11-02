import { expect, test } from "@playwright/test";
import { createShare, signInAgent } from "./helpers";

const SECRET = "We could go 50k over asking.";
const SHARED = "That fenced yard is perfect for our dog.";

test("homepage lists homes, the pop-out is public, and private threads share only what buyers allow", async ({
  browser,
  page,
}) => {
  // A private client thread on one listing: a love, a private comment, and a
  // "Like" comment the client chooses to share anonymously.
  const agent = await signInAgent(browser, "pat@example.com", "Pat Agent");
  const { url } = await createShare(agent, ["2205 Brackenfield"]);
  const client = await (await browser.newContext()).newPage();
  await client.goto(url);
  await client.getByRole("button", { name: "Love" }).click();
  await client.getByRole("textbox", { name: "First name" }).fill("Riley");
  await client.getByRole("button", { name: "Continue" }).click();
  await expect(client.getByRole("button", { name: "Love" })).toHaveAttribute("aria-pressed", "true");
  await client.getByLabel("Add a comment").fill(SECRET);
  await expect(client.getByLabel(/share this anonymously/)).toHaveCount(0);
  await client.getByRole("button", { name: "Post comment" }).click();
  await expect(client.getByText(SECRET)).toBeVisible();

  await client.getByRole("button", { name: "Don't like", exact: true }).click();
  await expect(client.getByLabel(/share this anonymously/)).toHaveCount(0);
  await client.getByRole("button", { name: "Like", exact: true }).click();
  await client.getByLabel(/share this anonymously/).check();
  await client.getByLabel("Add a comment").fill(SHARED);
  await client.getByRole("button", { name: "Post comment" }).click();
  await expect(client.getByText("Shared anonymously on the public page")).toBeVisible();

  // A second person on the link passes. That shouldn't show anywhere public.
  const quinn = await (await browser.newContext()).newPage();
  await quinn.goto(url);
  await quinn.getByRole("button", { name: "Pass" }).click();
  await quinn.getByRole("textbox", { name: "First name" }).fill("Quinn");
  await quinn.getByRole("button", { name: "Continue" }).click();
  await expect(quinn.getByRole("button", { name: "Pass" })).toHaveAttribute("aria-pressed", "true");

  // The homepage shows the activity without showing the words.
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  const card = page.getByRole("link", { name: /2205 Brackenfield/ });
  await expect(card).toContainText("1 love");
  await expect(card).toContainText("2 comments");
  await expect(card).toContainText(/[1-9]\d* views?/);
  await expect(card).toContainText("Active just now");
  await expect(page.getByRole("link", { name: /812 N Corbel/ })).toContainText("Be the first to react");

  // Clicking opens the pop-out at the listing's own URL.
  await card.click();
  await expect(page).toHaveURL(/\/homes\/SAMPLE-1006$/);
  const dialog = page.getByRole("dialog", { name: "Home details" });
  await expect(dialog.getByText("Listing agent")).toBeVisible();
  await expect(dialog.getByText("Priya Natarajan")).toBeVisible();
  await expect(dialog.getByText(/Traditional brick-front home/)).toBeVisible();
  const activity = dialog.getByRole("list", { name: "Activity" });
  await expect(activity).toContainText("Active just now");
  await expect(activity).toContainText("1 love");
  await expect(activity).toContainText("Sent to 1 buyer by agents");
  await expect(activity).toContainText("2 comments in private chats");
  await expect(activity).toContainText(/[1-9]\d* views?/);
  await expect(dialog.getByText(SHARED)).toBeVisible();
  await expect(dialog.getByText(/A buyer, shared from a private chat/)).toBeVisible();
  await expect(page.getByText(SECRET)).toHaveCount(0);
  await expect(page.getByText(/Riley|Quinn/)).toHaveCount(0);
  await expect(dialog.getByText(/\bpass(ed|es)?\b/i)).toHaveCount(1); // just the Pass button

  // Any visitor can react and comment in public.
  await dialog.getByRole("button", { name: "Love" }).click();
  await page.getByRole("textbox", { name: "First name" }).fill("Morgan");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(dialog.getByRole("button", { name: "Love" })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "Like", exact: true }).click();
  await expect(dialog.getByLabel(/share this anonymously/)).toHaveCount(0);
  await dialog.getByLabel("Add a comment").fill("Love the quiet cul-de-sac.");
  await dialog.getByRole("button", { name: "Post comment" }).click();
  await expect(dialog.getByText("Love the quiet cul-de-sac.")).toBeVisible();

  // Escape closes it, back to the homepage with updated totals.
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/localhost:\d+\/$/);
  await expect(dialog).toHaveCount(0);
  await expect(card).toContainText("2 loves");
  await expect(card).toContainText("3 comments");

  // The same URL opened directly is a full page, and other visitors see public activity.
  const other = await (await browser.newContext()).newPage();
  await other.goto("/homes/SAMPLE-1006");
  await expect(other.getByRole("dialog")).toHaveCount(0);
  await expect(other.getByRole("link", { name: "All homes" })).toBeVisible();
  await expect(other.getByText("Love the quiet cul-de-sac.")).toBeVisible();
  await expect(other.getByText("Morgan: love it")).toBeVisible();
  await expect(other.getByText(SHARED)).toBeVisible();

  // Private words and names are not in the public HTML at all.
  for (const path of ["/", "/homes/SAMPLE-1006"]) {
    const html = await (await other.request.get(path)).text();
    expect(html).not.toContain(SECRET);
    expect(html).not.toContain("Riley");
    expect(html).not.toContain("Quinn");
  }

  // The client can take a shared comment back.
  await client.getByRole("button", { name: "Make private" }).click();
  await expect(client.getByText("Shared anonymously on the public page")).toHaveCount(0);
  await other.reload();
  await expect(other.getByText(SHARED)).toHaveCount(0);
  await expect(other.getByText("What buyers love")).toHaveCount(0);

  // Public comments don't leak into the private thread.
  await client.reload();
  await expect(client.getByText("Love the quiet cul-de-sac.")).toHaveCount(0);
  await expect(client.getByText("Morgan")).toHaveCount(0);

  expect((await other.request.get("/homes/NOT-A-LISTING")).status()).toBe(404);
  expect(pageErrors).toEqual([]);
});
