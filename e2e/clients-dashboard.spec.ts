// The agent's clients, as the Clients page shows them, plainly: whoever is
// waiting for an answer first, then whoever hasn't opened what was sent, then
// everyone else; one row each, with one sentence, one line of facts and one
// big button. Each client's own page has what they did (whatever is waiting
// first, with Reply right there), the way to send them more homes on the link
// they have, and their links. A link with nobody on it yet isn't a client:
// it's on the Links page, and the Clients page only says how many there are.
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { clientRow, createShare, homeIn, joinAs, pickHome, signInAgent, toFirstHome } from "./helpers";

const QUILLAN = "1204 Quillan St SE";

const emailsTo = (address: string) =>
  readFileSync("test-results-server.log", "utf8")
    .split("\n")
    .filter((line) => line.includes(`[email] to=${address} `));

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
  // opened yet, with his link to copy. Those two groups and no other: the
  // link with nobody on it isn't a client.
  await fern.goto("/dashboard");
  await expect(fern).toHaveTitle("Clients · Porchcard");
  await expect(fern.getByRole("heading", { level: 1 })).toHaveText("Clients");
  await expect(fern.getByRole("heading", { level: 2 })).toHaveText([
    /^Waiting for you\s*1$/,
    /^Haven't opened yet\s*1$/,
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
  await expect(clientRow(fern, "Max")).toContainText("Not opened yet · sent today");
  await expect(clientRow(fern, "Max").getByRole("button", { name: "Copy link for Max" })).toBeVisible();
  // What Jo did is new since Fern last looked: said on her row, as Home's dot
  // says it. Max has done nothing.
  await expect(row).toContainText("New since you last looked");
  await expect(clientRow(fern, "Max")).not.toContainText("New since you last looked");
  // [P] First names only: her email is nowhere on the page.
  expect(await fern.content()).not.toContain(joEmail);

  // The link with nobody on it is one line here, the way to the Links page,
  // where it's listed with its home: "No name yet", never "Unnamed client".
  await expect(fern.getByText("Unnamed client")).toHaveCount(0);
  await fern.getByRole("link", { name: "1 link with no name" }).click();
  await fern.waitForURL(/\/dashboard\/links$/);
  const unclaimed = fern
    .getByRole("list", { name: "Links" })
    .getByRole("listitem")
    .filter({ hasText: "96 Fernhollow Ln" });
  await expect(unclaimed.getByRole("link", { name: "No name yet" })).toBeVisible();
  await expect(unclaimed).toContainText("Not opened yet");
  await expect(fern.getByText("Unnamed client")).toHaveCount(0);
  await fern.goto("/dashboard");

  // Her own page: where things stand, the homes sent her, each link to its page.
  await row.getByRole("link", { name: "Jo", exact: true }).click();
  await fern.waitForURL(/\/dashboard\/clients\//);
  const joPage = new URL(fern.url()).pathname;
  await expect(fern).toHaveTitle("Jo · Porchcard");
  await expect(fern.getByRole("heading", { level: 1 })).toHaveText("Jo");
  // Her name is the way to her public page (and "View profile" under it says
  // so in words); few buttons, and while she's waiting Reply is the filled
  // one, going down the page to what she asked.
  await expect(fern.getByRole("heading", { level: 1 }).getByRole("link", { name: "Jo" })).toHaveAttribute(
    "href",
    /^\/people\/[\w-]+$/,
  );
  const top = fern.getByRole("region", { name: "Jo", exact: true });
  await expect(top).toContainText(`Wants to see ${QUILLAN}`);
  await expect(top.getByRole("link", { name: "Reply to Jo" })).toHaveAttribute("href", "#did");
  await expect(top.getByRole("link", { name: "Reply to Jo" })).toHaveClass(/bg-brand/);
  await expect(top.getByRole("link", { name: "Send more homes" })).not.toHaveClass(/bg-brand/);
  await expect(top.getByRole("button", { name: "Copy link for Jo" })).toBeVisible();
  // And her feedback as a whole, on her page under this: what she likes and doesn't.
  await expect(fern.getByRole("region", { name: "Jo's feedback" })).toBeVisible();
  // And her own profile, now she's signed up: a link to it, under her name.
  await expect(top.getByRole("link", { name: "View profile", exact: true })).toHaveAttribute("href", /^\/people\/[\w-]+$/);
  await expect(top.getByRole("link").or(top.getByRole("button"))).toHaveCount(5);

  // What she did, on this page: her asking to see the home first, said
  // across the top of its card, with a box to answer her right there.
  const did = fern.getByRole("region", { name: "What Jo did" });
  const first = did.getByRole("region", { name: "Waiting for you" }).getByRole("listitem").first();
  await expect(first).toContainText(`Wants to see ${QUILLAN}`);
  await expect(first).toContainText("Only you see this");
  await expect(first).toContainText("Can we see it in person?");
  await expect(first.getByRole("textbox", { name: "Reply to Jo" })).toHaveClass(/ring-amber/);
  // (One box for the one thing she asked.)
  await expect(did.getByRole("textbox", { name: "Reply to Jo" })).toHaveCount(1);

  const sent = fern.getByRole("region", { name: "Sent to Jo" });
  await expect(sent).toContainText(`${QUILLAN} and 1 more`);
  await expect(sent.getByRole("link", { name: /^Open the link for/ })).toHaveAttribute("href", sharePath);

  // "Send more homes" remembers her: it adds to the link she has, and then
  // it's that link again, ready to copy or send. She's on Porchcard, so she
  // hears about the new home from us too.
  await top.getByRole("link", { name: "Send more homes" }).click();
  await expect(fern.getByRole("heading", { name: "Add homes for Jo" })).toBeVisible();
  await expect(fern).toHaveTitle("Send homes · Porchcard");
  await pickHome(fern, "812 N Corbel");
  await fern.getByRole("button", { name: "Add 1 home to Jo's link" }).click();
  await fern.waitForURL(new RegExp(`^[^?#]*${sharePath}/sent$`));
  await expect(fern.getByRole("heading", { level: 1 })).toHaveText("Your link is ready");
  await expect(fern.getByRole("main")).toContainText("3 homes · for Jo");
  await expect(fern.getByLabel("Jo's link")).toHaveValue(urls.Jo);
  await expect.poll(() => emailsTo(joEmail).length).toBe(1);
  expect(emailsTo(joEmail)[0]).toContain('subject="Fern Clients sent you 1 more home on Porchcard"');
  // No second link was made: she still has the one, now with three homes.
  await fern.goto(joPage);
  await expect(sent.getByRole("listitem")).toHaveCount(1);
  await expect(sent).toContainText(`${QUILLAN} and 2 more`);
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

  // On her page, nothing waits any more: Reply is gone from the top, sending
  // more homes is the filled button, and her card has the answer under it.
  await fern.goto(joPage);
  await expect(top.getByRole("link", { name: "Reply to Jo" })).toHaveCount(0);
  await expect(top.getByRole("link", { name: "Send more homes" })).toHaveClass(/bg-brand/);
  await expect(did.getByRole("region", { name: "Waiting for you" })).toHaveCount(0);
  const card = did.getByRole("listitem").filter({ hasText: "Can we see it in person?" }).first();
  await expect(card).not.toContainText("Wants to see");
  await expect(card.getByRole("list", { name: "Your replies" })).toContainText("Saturday at 10 works.");
  await expect(card.getByRole("textbox", { name: "Reply to Jo" })).not.toHaveClass(/ring-amber/);
});
