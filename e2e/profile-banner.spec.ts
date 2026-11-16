// The band across the top of your profile is yours to choose, from Edit
// profile: one of the drawn scenes, nothing at all, or an image of your own
// (an agent's branding). Everyone sees what you chose.
import { expect, test } from "@playwright/test";
import { signInAgent, signUpBuyer } from "./helpers";

// A tiny PNG, as someone's logo would arrive.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==",
  "base64",
);

test("a buyer picks a scene, then nothing, then their own image, and a visitor sees it", async ({ browser }) => {
  const page = await signUpBuyer(browser, "bree.banner@example.com", "Bree Banner");
  await page.goto("/people/me");
  await page.waitForURL(/\/people\/[\w-]+$/);
  const profile = new URL(page.url()).pathname;
  const header = page.getByRole("region", { name: "Bree (you)" });
  // To start with: a drawn scene, picked for her.
  await expect(header.locator("svg").first()).toBeVisible();

  await page.getByRole("link", { name: "Edit profile" }).click();
  await page.waitForURL(/\/people\/me\/edit$/);
  const banner = page.getByRole("region", { name: "Banner" });
  // Only what's on now and the way to change it, until she asks.
  await expect(banner.getByRole("button", { name: /^Scene \d$/ })).toHaveCount(0);
  await banner.getByRole("button", { name: "Change banner" }).click();
  // No colour of her own: the eight scenes and Blank, and no image yet.
  await expect(banner.getByRole("button", { name: /^Scene \d$/ })).toHaveCount(8);
  await expect(banner.getByRole("button", { name: /^Your color/ })).toHaveCount(0);
  await expect(banner.getByRole("button", { name: "Your image" })).toHaveCount(0);

  await banner.getByRole("button", { name: "Scene 3" }).click();
  await expect(banner.getByRole("status")).toHaveText("Saved");
  await expect(banner.getByRole("button", { name: "Scene 3" })).toHaveAttribute("aria-pressed", "true");

  // Nothing at all.
  await banner.getByRole("button", { name: "Blank" }).click();
  await expect(banner.getByRole("button", { name: "Blank" })).toHaveAttribute("aria-pressed", "true");
  await page.goto(profile);
  await expect(header.locator("[aria-hidden] svg[viewBox='0 0 600 160']")).toHaveCount(0);

  // Her own image.
  await page.goto("/people/me/edit");
  await banner.getByRole("button", { name: "Change banner" }).click();
  await banner.getByLabel("Use your own image").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
  await expect(banner.getByRole("button", { name: "Your image" })).toHaveAttribute("aria-pressed", "true");
  // It stays to choose again after another choice.
  await banner.getByRole("button", { name: "Scene 1" }).click();
  await expect(banner.getByRole("button", { name: "Scene 1" })).toHaveAttribute("aria-pressed", "true");
  await banner.getByRole("button", { name: "Your image" }).click();
  await expect(banner.getByRole("button", { name: "Your image" })).toHaveAttribute("aria-pressed", "true");

  // Anyone sees it, and it's served as a plain image.
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(profile);
  const shown = visitor.locator("img[src*='/banner?v=']").first();
  await expect(shown).toBeVisible();
  const image = await visitor.request.get((await shown.getAttribute("src"))!);
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toBe("image/jpeg");
});

test("an agent gets the scenes in their own color too, and their choice is on their home card", async ({ browser }) => {
  const agent = await signInAgent(browser, "abe.banner@example.com", "Abe Banner");
  await agent.goto("/people/me/edit");
  const banner = agent.getByRole("region", { name: "Banner" });
  await banner.getByRole("button", { name: "Change banner" }).click();
  await expect(banner.getByRole("button", { name: /^Your color, scene \d$/ })).toHaveCount(4);
  await banner.getByLabel("Use your own image").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
  await expect(banner.getByRole("button", { name: "Your image" })).toHaveAttribute("aria-pressed", "true");
  await agent.setViewportSize({ width: 1440, height: 900 });
  await agent.goto("/");
  await expect(agent.getByRole("complementary", { name: "Your profile" }).locator("img[src*='/banner?v=']")).toBeVisible();
});

test("their own image can be moved and resized in the band, and it opens again as it was left", async ({ browser }) => {
  const page = await signUpBuyer(browser, "mo.banner@example.com", "Mo Banner");
  await page.goto("/people/me");
  await page.waitForURL(/\/people\/[\w-]+$/);
  const profile = new URL(page.url()).pathname;
  await page.goto("/people/me/edit");
  const banner = page.getByRole("region", { name: "Banner" });
  await banner.getByRole("button", { name: "Change banner" }).click();
  await banner.getByLabel("Use your own image").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
  // It's on at once, and the way to move it opens by itself.
  await expect(banner.getByRole("button", { name: "Your image" })).toHaveAttribute("aria-pressed", "true");
  const frame = banner.getByRole("group", { name: /^Your banner image/ });
  await expect(frame).toBeVisible();
  const size = banner.getByRole("slider", { name: "Size" });
  await expect(size).toBeEnabled();
  // As small as it goes (the whole image, with room round it), and moved with the keys.
  const least = (await size.getAttribute("min"))!;
  await size.fill(least);
  await frame.focus();
  await page.keyboard.press("ArrowRight");
  await banner.getByRole("button", { name: "Save banner" }).click();
  await expect(banner.getByRole("status")).toHaveText("Saved");
  await expect(frame).toHaveCount(0);

  // Again later: where it was left.
  await page.reload();
  await banner.getByRole("button", { name: "Change banner" }).click();
  await banner.getByRole("button", { name: "Move or resize" }).click();
  await expect(size).toHaveValue(least);
  // Cancel leaves it be.
  await banner.getByRole("button", { name: "Cancel" }).click();
  await expect(frame).toHaveCount(0);

  // The image as it was added is theirs alone; what they framed is what everyone gets.
  const mine = await page.request.get(`${profile}/banner?source=1`);
  expect(mine.status()).toBe(200);
  const visitor = await (await browser.newContext()).newPage();
  expect((await visitor.request.get(`${profile}/banner?source=1`)).status()).toBe(404);
  await visitor.goto(profile);
  await expect(visitor.locator("img[src*='/banner?v=']").first()).toBeVisible();
});
