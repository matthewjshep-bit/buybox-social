// The agent's clients, as the dashboard shows them: a request to see a home
// comes first (its own count, a badge on the card, and the card's headline),
// each card goes to the client's page and each of its homes to that home on
// it, and a link with nobody named on it yet is called by its first home.
import { expect, test } from "@playwright/test";
import { createShare, homeIn, joinAs, signInAgent, toFirstHome } from "./helpers";

const QUILLAN = "1204 Quillan St SE";

test("a request to see a home leads the dashboard until the agent answers it", async ({ browser }) => {
  test.setTimeout(120_000);
  const fern = await signInAgent(browser, "fern.clients@example.com", "Fern Clients");
  const { urls, dashboardUrl } = await createShare(fern, ["1204 Quillan", "719 Saltmarsh"], ["Jo"]);
  const sharePath = new URL(dashboardUrl).pathname;
  // And a link with nobody on it yet.
  await createShare(fern, ["96 Fernhollow"], []);
  const joEmail = `jo.clients.${Date.now()}@example.com`;

  // Jo asks to see the first home, from Contact: signing up as she does.
  const jo = await (await browser.newContext()).newPage();
  await jo.goto(urls.Jo);
  await toFirstHome(jo);
  await expect(homeIn(jo, QUILLAN)).toBeInViewport({ ratio: 0.9 });
  await jo.getByRole("button", { name: "Contact" }).click();
  const contact = jo.getByRole("dialog", { name: /^Contact / });
  await contact.getByRole("button", { name: "Ask to see it" }).click();
  await joinAs(jo, "Jo", joEmail);
  await expect(contact.getByRole("status")).toHaveText(/^Sent\./);

  // Fern's dashboard: one client wants a showing, and her card says so first.
  await fern.goto("/dashboard");
  await expect(fern.getByRole("heading", { level: 1 })).toHaveText("Your clients");
  await expect(fern.getByRole("link", { name: /Send homes/ })).toBeVisible();
  const counts = fern.getByRole("navigation", { name: "Show clients" });
  await expect(counts.getByRole("link")).toHaveText([
    /^\d+All clients$/,
    /^\d+New activity$/,
    /^\d+Wants a showing$/,
    /^\d+Not opened yet$/,
    /^\d+Liked a home$/,
    /^\d+Commented$/,
  ]);
  await expect(counts.getByRole("link", { name: /Wants a showing/ })).toContainText("1");
  await expect(counts.getByRole("link", { name: /Commented/ })).toContainText("1");
  const clients = fern.getByRole("region", { name: "Clients" });
  const card = clients.getByRole("link", { name: /^Jo\b/ });
  await expect(card).toContainText("Wants a showing");
  await expect(card).toContainText(`Jo asked to see ${QUILLAN}`);
  // [P] First names only: her email is nowhere on the page.
  expect(await fern.content()).not.toContain(joEmail);

  // The link with nobody on it is called by its home, never "Unnamed client".
  await expect(clients.getByRole("link", { name: /^Link for 96 Fernhollow Ln/ })).toBeVisible();
  await expect(fern.getByText("Unnamed client")).toHaveCount(0);

  // Only Jo wants a showing.
  await counts.getByRole("link", { name: /Wants a showing/ }).click();
  await expect(fern).toHaveURL(/\/dashboard\?show=asks$/);
  await expect(clients.getByRole("link")).toHaveCount(1);
  await expect(card).toBeVisible();
  // And only Jo has said anything.
  await counts.getByRole("link", { name: /Commented/ }).click();
  await expect(fern).toHaveURL(/\/dashboard\?show=commented$/);
  await expect(clients.getByRole("link")).toHaveCount(1);
  await expect(card).toBeVisible();

  // Each of her homes goes to that home on her page, and her ask to the ask.
  // (`has` looks inside each item, so the card is named from there.)
  const holder = clients.locator("li").filter({ has: fern.getByRole("link", { name: /^Jo\b/ }) });
  const thumbs = holder.locator('a[href*="#home-"]');
  await expect(thumbs).toHaveCount(2);
  await expect(thumbs.first()).toHaveAttribute("href", new RegExp(`^${sharePath}\\?tab=homes#home-[\\w%-]+$`));
  await expect(holder.locator('a[href*="#comment-"]')).toHaveAttribute(
    "href",
    new RegExp(`^${sharePath}\\?tab=homes#comment-[0-9a-f-]{36}$`),
  );
  await thumbs.first().click();
  await expect(fern).toHaveURL(new RegExp(`${sharePath}\\?tab=homes#home-`));

  // Fern answers in that home's thread: nobody is waiting any more.
  const panel = fern.getByRole("region", { name: QUILLAN });
  await panel.getByLabel("Reply to your client").fill("Saturday at 10 works.");
  await panel.getByRole("button", { name: "Reply" }).click();
  await expect(panel.getByText("Saturday at 10 works.")).toBeVisible();
  await fern.goto("/dashboard?show=asks");
  await expect(counts.getByRole("link", { name: /Wants a showing/ })).toContainText("0");
  await expect(clients).toContainText("Nobody is waiting on a showing.");
  await fern.goto("/dashboard");
  await expect(card).not.toContainText("Wants a showing");
});
