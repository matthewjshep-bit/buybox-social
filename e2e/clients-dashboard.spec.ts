// The agent's clients, as the Clients page shows them, plainly: whoever is
// waiting for an answer first, then whoever hasn't opened what was sent, then
// everyone else; one row each, with one sentence, one line of facts and one
// big button. Each client's own page has their links. A link with nobody on
// it yet is listed apart, called by its first home.
import { expect, test } from "@playwright/test";
import { clientRow, createShare, homeIn, joinAs, signInAgent, toFirstHome } from "./helpers";

const QUILLAN = "1204 Quillan St SE";

test("whoever wants a showing leads the Clients page, with Reply, until the agent answers", async ({ browser }) => {
  test.setTimeout(120_000);
  const fern = await signInAgent(browser, "fern.clients@example.com", "Fern Clients");
  const { urls, dashboardUrl } = await createShare(fern, ["1204 Quillan", "719 Saltmarsh"], ["Jo"]);
  const sharePath = new URL(dashboardUrl).pathname;
  // Someone else who hasn't opened theirs, and a link with nobody on it yet.
  await createShare(fern, ["10421 Halvard"], ["Max"]);
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

  // Fern's Clients: Jo first, waiting for her, with Reply; Max next, not
  // opened yet, with his link to copy; the link with nobody on it last.
  await fern.goto("/dashboard");
  await expect(fern.getByRole("heading", { level: 1 })).toHaveText("Clients");
  await expect(fern.getByRole("heading", { level: 2 })).toHaveText([
    /^Waiting for you\s*1$/,
    /^Haven't opened yet\s*1$/,
    "Links without a name",
  ]);
  const waiting = fern.getByRole("region", { name: /^Waiting for you/ });
  const row = clientRow(fern, "Jo");
  await expect(waiting).toContainText("Jo");
  await expect(row).toContainText(`Wants to see ${QUILLAN}`);
  await expect(row).toContainText("2 homes sent · Last active today");
  await expect(row.getByRole("link", { name: "Reply to Jo" })).toHaveAttribute(
    "href",
    new RegExp(`^${sharePath}\\?tab=homes#home-[\\w%-]+$`),
  );
  await expect(clientRow(fern, "Max")).toContainText("Hasn't opened your link yet");
  await expect(clientRow(fern, "Max").getByRole("button", { name: "Copy link for Max" })).toBeVisible();
  // [P] First names only: her email is nowhere on the page.
  expect(await fern.content()).not.toContain(joEmail);

  // The link with nobody on it is listed apart, called by its home, never "Unnamed client".
  const unclaimed = fern.getByRole("region", { name: "Links without a name" });
  await expect(unclaimed).toContainText("96 Fernhollow Ln");
  await expect(unclaimed).toContainText("Not opened yet");
  await expect(fern.getByText("Unnamed client")).toHaveCount(0);

  // Her own page: where things stand, the homes sent her, each link to its page.
  await row.getByRole("link", { name: "Jo", exact: true }).click();
  await fern.waitForURL(/\/dashboard\/clients\//);
  await expect(fern.getByRole("heading", { level: 1 })).toHaveText("Jo");
  await expect(fern.getByRole("link", { name: "Reply to Jo" })).toBeVisible();
  const sent = fern.getByRole("region", { name: "Homes you've sent Jo" });
  await expect(sent).toContainText(`${QUILLAN} and 1 more`);
  await expect(sent.getByRole("link", { name: /^Open the link for/ })).toHaveAttribute("href", sharePath);
  await fern.getByRole("link", { name: "All clients" }).click();
  await fern.waitForURL(/\/dashboard$/);

  // Fern answers in that home's thread: nobody is waiting any more.
  await fern.goto(`${sharePath}?tab=homes`);
  const panel = fern.getByRole("region", { name: QUILLAN });
  await panel.getByLabel("Reply to your client").fill("Saturday at 10 works.");
  await panel.getByRole("button", { name: "Reply" }).click();
  await expect(panel.getByText("Saturday at 10 works.")).toBeVisible();
  await fern.goto("/dashboard");
  await expect(waiting).toHaveCount(0);
  await expect(row).not.toContainText("Wants to see");
  await expect(row.getByRole("link", { name: "Open Jo" })).toBeVisible();
});
