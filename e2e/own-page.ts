// Taking things back from your own page, for specs that must leave nothing
// behind even when they stop halfway.
import { expect, type Page } from "@playwright/test";

// Everything you did on one home, taken back from your own page one row at a
// time: likes, passes, spots and comments. Stops when there's nothing left,
// or only comments someone else has answered.
export async function takeBackAll(page: Page, address: string) {
  const escaped = address.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const options = page.getByRole("button", { name: new RegExp(`^Options for ${escaped}`) });
  const sheet = page.getByRole("dialog", { name: /^Options for / });
  for (let i = 0; i < 20; i++) {
    await page.goto("/people/me");
    await page.waitForURL(/\/people\/[0-9a-f-]{36}$/);
    let took = false;
    for (let j = 0; !took && j < (await options.count()); j++) {
      await options.nth(j).click();
      const row = sheet.locator('ul button:not([aria-disabled="true"])').first();
      if ((await row.count()) > 0) {
        const name = await row.getAttribute("aria-label");
        await row.click();
        if (name === "Delete my comment") await sheet.getByRole("button", { name: "Delete comment" }).click();
        took = true;
      } else {
        await page.keyboard.press("Escape");
      }
      await expect(sheet).toBeHidden();
    }
    if (!took) return;
  }
}
