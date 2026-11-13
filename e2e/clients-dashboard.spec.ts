// The agent's clients, as the Clients page shows them: people, each once,
// with the one thing to know about them (a request to see a home first of
// all), their numbers, and the links they're on under them; a link with
// nobody on it yet is listed apart, called by its first home.
import { expect, test } from "@playwright/test";
import { clientRow, createShare, homeIn, joinAs, signInAgent, toFirstHome } from "./helpers";

const QUILLAN = "1204 Quillan St SE";

test("a request to see a home leads the Clients page until the agent answers it", async ({ browser }) => {
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

  // Fern's Clients: one person, who wants a showing, and her row says so first.
  await fern.goto("/dashboard");
  await expect(fern.getByRole("heading", { level: 1 })).toHaveText("Clients");
  await expect(fern.getByRole("main")).toContainText("1 person · 1 link with no one on it yet");
  await expect(fern.getByRole("link", { name: /Send homes/ })).toBeVisible();
  const filters = fern.getByRole("navigation", { name: "Show clients" });
  await expect(filters.getByRole("link", { name: /^All/ })).toContainText("1");
  await expect(filters.getByRole("link", { name: /Wants a showing/ })).toContainText("1");
  // (A filter with nobody in it isn't there.)
  await expect(filters.getByRole("link", { name: /Not opened/ })).toHaveCount(0);
  const row = clientRow(fern, "Jo");
  await expect(row).toContainText(`Wants to see ${QUILLAN}`);
  await expect(row).toContainText(/2\s*homes sent/);
  // Under her, the link she's on, to its page.
  await expect(row.getByRole("link", { name: new RegExp(`^${QUILLAN} \\+1 more`) })).toHaveAttribute("href", sharePath);
  // [P] First names only: her email is nowhere on the page.
  expect(await fern.content()).not.toContain(joEmail);

  // The link with nobody on it is listed apart, called by its home, never "Unnamed client".
  const unclaimed = fern.getByRole("region", { name: "Links with no one on them yet" });
  await expect(unclaimed.getByRole("link", { name: /^Link for 96 Fernhollow Ln/ })).toBeVisible();
  await expect(fern.getByText("Unnamed client")).toHaveCount(0);

  // Only Jo wants a showing.
  await filters.getByRole("link", { name: /Wants a showing/ }).click();
  await expect(fern).toHaveURL(/\/dashboard\?show=asks$/);
  await expect(fern.getByRole("region", { name: "Clients" }).getByRole("heading")).toHaveCount(1);
  await expect(row).toBeVisible();

  // Fern answers in that home's thread: nobody is waiting any more.
  await fern.goto(`${sharePath}?tab=homes`);
  const panel = fern.getByRole("region", { name: QUILLAN });
  await panel.getByLabel("Reply to your client").fill("Saturday at 10 works.");
  await panel.getByRole("button", { name: "Reply" }).click();
  await expect(panel.getByText("Saturday at 10 works.")).toBeVisible();
  await fern.goto("/dashboard?show=asks");
  await expect(filters.getByRole("link", { name: /Wants a showing/ })).toContainText("0");
  await expect(fern.getByRole("region", { name: "Clients" })).toContainText("Nobody is waiting on a showing.");
  await fern.goto("/dashboard");
  await expect(row).not.toContainText("Wants to see");
});
