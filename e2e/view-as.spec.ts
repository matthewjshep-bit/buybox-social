import { expect, test, type Browser } from "@playwright/test";
import { enterCode, signInAgent, signUpBuyer } from "./helpers";

const DESKTOP = { viewport: { width: 1280, height: 900 } };
const OWNER = "matt@shepflips.com";
const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==";

async function signIn(browser: Browser, email: string) {
  const page = await (await browser.newContext(DESKTOP)).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await enterCode(page);
  await page.waitForURL((url) => url.pathname === "/");
  return page;
}

test("an admin sees the site as one of its people, a bar saying so, until Stop; and nobody else can", async ({ browser }) => {
  test.setTimeout(90_000);
  await (await signInAgent(browser, "vera-viewed@example.com", "Vera Viewed")).context().close();

  const admin = await signIn(browser, OWNER);
  await admin.goto("/admin/people?q=vera-viewed");
  await admin.getByRole("link", { name: /Vera Viewed/ }).first().click();
  await admin.waitForURL(/\/admin\/people\/[\w-]+$/);
  const personPage = admin.url();

  // Her home page, as she sees it, and the bar along the foot.
  await admin.getByRole("button", { name: "View the site as Vera" }).click();
  await admin.waitForURL((url) => url.pathname === "/");
  const bar = admin.getByRole("region", { name: "Viewing as someone else" });
  await expect(bar).toContainText("Viewing as Vera Viewed (agent). Anything you do is done as them.");
  await expect(admin.getByRole("heading", { level: 1 })).toHaveText("Hi, Vera");
  // Her dashboard too.
  await admin.goto("/dashboard");
  await expect(admin.getByRole("heading", { level: 1 })).toHaveText("Clients");
  await expect(bar).toBeVisible();
  // The admin pages stay the admin's own meanwhile.
  await bar.getByRole("link", { name: "Admin" }).click();
  await admin.waitForURL(/\/admin$/);
  await expect(bar).toBeVisible();

  // Stop: back on her admin page, as themselves.
  await bar.getByRole("button", { name: "Stop" }).click();
  await admin.waitForURL(personPage);
  await expect(bar).toHaveCount(0);
  await admin.goto("/");
  await expect(admin.getByRole("heading", { level: 1 })).not.toHaveText("Hi, Vera");

  // Anyone else's cookie does nothing.
  const nosy = await signUpBuyer(browser, "nosy-viewer@example.com", "Nosy Viewer");
  await nosy.context().addCookies([{ name: "pc_view_as", value: personPage.split("/").pop()!, url: nosy.url() }]);
  await nosy.goto("/");
  await expect(nosy.getByRole("heading", { level: 1 })).toHaveText("Hi, Nosy");
  await expect(nosy.getByRole("region", { name: "Viewing as someone else" })).toHaveCount(0);
});

test("anyone can add a photo of themselves, shown in place of their initial, and take it off again", async ({ browser }) => {
  const page = await signUpBuyer(browser, "pat-photo@example.com", "Pat Photo");
  await page.goto("/people/me");
  await page.waitForURL(/\/people\/[\w-]+$/);
  const me = page.getByRole("banner").getByRole("button", { name: "Your profile" });
  const header = page.getByRole("region", { name: "Pat (you)" });
  await expect(me).toHaveText("P");
  await expect(header.locator("img[src*='/photo?v=']")).toHaveCount(0);

  await page.getByLabel("Add a photo").setInputFiles({
    name: "me.png",
    mimeType: "image/png",
    buffer: Buffer.from(PNG_1PX, "base64"),
  });
  const photo = header.locator("img[src*='/photo?v=']");
  await expect(photo).toBeVisible();
  await expect(me.locator("img")).toBeVisible();
  // Served as a small JPEG, by their page.
  const res = await page.request.get((await photo.getAttribute("src"))!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/jpeg");
  await expect(page.getByLabel("Change photo")).toBeAttached();

  // Taken off: their initial again.
  await page.getByRole("button", { name: "Remove photo" }).click();
  await expect(photo).toHaveCount(0);
  await expect(me).toHaveText("P");
  await expect(page.getByLabel("Add a photo")).toBeAttached();
});
