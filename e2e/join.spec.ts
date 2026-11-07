import { expect, test } from "@playwright/test";
import { scrollToEnd } from "./helpers";

test("signed out, the home page says what this is, shows three homes, then asks you to sign up", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");

  // First: what this is, and a short form.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Every home for sale, one swipe at a time.");
  const intro = page.getByRole("form", { name: "Sign up" }).first();
  await expect(intro).toBeInViewport();
  await expect(intro.getByLabel("Name")).toBeVisible();
  await expect(intro.getByLabel("Phone")).toBeVisible();
  await expect(intro.getByLabel("Email")).toBeVisible();

  // Then homes: three of them.
  await page.getByRole("button", { name: /to see homes$/ }).click();
  await expect(page.getByRole("article").first()).toBeInViewport({ ratio: 0.9 });
  await expect(page.getByRole("article")).toHaveCount(3);

  // After the third, sign up to see more. No more homes load.
  await page.evaluate(() => {
    const reel = document.querySelector<HTMLElement>("[data-reel]")!;
    reel.scrollTo({ top: reel.scrollHeight });
  });
  await expect(page.getByRole("heading", { name: "There's plenty more to see" })).toBeInViewport();
  await page.waitForTimeout(1000);
  await expect(page.getByRole("article")).toHaveCount(3);

  // A mistake says which field, and keeps what was typed.
  const gate = page.getByRole("form", { name: "Sign up" }).last();
  await gate.getByLabel("Name").fill("Robin Buyer");
  await gate.getByLabel("Phone").fill("555-0100");
  await gate.getByLabel("Email").fill("robin@example.com");
  await gate.getByRole("button", { name: "Sign up free" }).click();
  await expect(gate.getByRole("alert")).toHaveText("Please add your phone number, with the area code.");
  await expect(gate.getByLabel("Phone")).toHaveAttribute("aria-invalid", "true");
  await expect(gate.getByLabel("Name")).toHaveValue("Robin Buyer");
  await expect(gate.getByLabel("Email")).toHaveValue("robin@example.com");

  // Locally no email goes out, so they're signed straight in: no more
  // questions, they're a buyer, by the name they gave.
  await gate.getByLabel("Phone").fill("(206) 555-0100");
  await gate.getByRole("button", { name: "Sign up free" }).click();
  await expect(page.getByRole("button", { name: "Your profile" })).toHaveText("R");
  await expect(page).toHaveURL(/localhost:\d+\/$/);

  // Signed in, it's the feed, for as long as you scroll.
  await expect(page.getByRole("form", { name: "Sign up" })).toHaveCount(0);
  await scrollToEnd(page);
  await expect(page.getByRole("article")).toHaveCount(13);

  expect(pageErrors).toEqual([]);
});
