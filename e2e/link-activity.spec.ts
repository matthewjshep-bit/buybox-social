// What someone likes and says about a home an agent sends them is public by
// default, under their first name: on the home's own page and on their
// profile (lib/link-public.ts). Their passes show on their profile only,
// never on the home. The comment box says so before they say anything, a tap
// from keeping that one on the link. The agent's side of the conversation
// never leaves it. One switch in Edit profile keeps it all private, and takes
// down what was public; switched back on, only what they do from then on is.
import { expect, test } from "@playwright/test";
import { createShare, heartOf, homeIn, openComments, signInAgent, signUpBuyer, toFirstHome } from "./helpers";

const QUILLAN = "1204 Quillan St SE";
const SALTMARSH = "719 Saltmarsh Ln";
const SALTMARSH_PAGE = "/homes/SAMPLE-1008";
const CORBEL = "812 N Corbel St";
const SAID = "The porch is the best part.";

test("likes and comments on an agent's link are public by name, passes only on the profile, until they switch that off", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const agent = await signInAgent(browser, `la.agent.${Date.now()}@example.com`, "Lana Agent");
  const { url } = await createShare(agent, ["1204 Quillan", "719 Saltmarsh", "812 N Corbel"], ["Pam"]);
  const pam = await signUpBuyer(browser, `pam.${Date.now()}@example.com`, "Pam");
  await pam.setViewportSize({ width: 390, height: 780 });
  await pam.goto(url);
  await toFirstHome(pam);

  // Passes on the first with the X (on to the second), likes the second, and says why.
  const first = homeIn(pam, QUILLAN);
  await first.getByRole("button", { name: "Pass on this home" }).click();
  const second = homeIn(pam, SALTMARSH);
  await expect(second).toBeInViewport({ ratio: 0.9 });
  await expect.poll(async () => Math.abs((await second.boundingBox())?.y ?? 99)).toBeLessThan(1);
  await heartOf(second).click();
  await expect(heartOf(second)).toHaveAttribute("aria-pressed", "true");
  const chat = await openComments(pam, second);
  // The box says where it goes, before anything is said, and how to keep it on the link.
  await expect(chat).toContainText("Public, with your first name.");
  await expect(chat.getByRole("button", { name: "Keep it to Lana Agent" })).toBeVisible();
  await chat.getByRole("textbox").first().fill(SAID);
  await chat.getByRole("textbox").first().press("Enter");
  await expect(chat.getByText(SAID)).toBeVisible();
  // Her comment says it's public, a tap from private.
  const mine = chat.locator("li[data-comment]").filter({ hasText: SAID });
  await expect(mine).toContainText("Public");
  await expect(mine.getByRole("button", { name: "Make private" })).toBeVisible();
  await pam.keyboard.press("Escape");

  // The agent answers on the link: that stays there.
  await agent.goto(url);
  await toFirstHome(agent).catch(() => {});
  const theirs = await openComments(agent, homeIn(agent, SALTMARSH));
  await theirs.getByRole("button", { name: /^Reply/ }).first().click();
  await theirs.getByRole("textbox").last().fill("Agreed. Want to see it Saturday?");
  await theirs.getByRole("textbox").last().press("Enter");
  await expect(theirs.getByText("Agreed. Want to see it Saturday?")).toBeVisible();

  // The home's own page, to anyone: Pam's words, by name. Never the agent's,
  // never the pass (on another home), never that it was sent.
  const anyone = await (await browser.newContext()).newPage();
  await expect(async () => {
    const html = await (await anyone.request.get(SALTMARSH_PAGE)).text();
    expect(html).toContain(SAID);
    expect(html).toContain("Pam");
    expect(html).not.toContain("Want to see it Saturday");
  }).toPass({ timeout: 10_000 });

  // Pam's profile, to anyone: the like, what she said, and (under Didn't like) the pass.
  await pam.setViewportSize({ width: 1280, height: 800 });
  await pam.goto("/people/me");
  await pam.waitForURL(/\/people\/[0-9a-f-]{36}$/);
  const profile = new URL(pam.url()).pathname;
  await anyone.goto(profile);
  const main = anyone.getByRole("main");
  await expect(main).toContainText(SALTMARSH);
  await expect(main).toContainText(SAID);
  await expect(main).toContainText(QUILLAN);
  await anyone.goto(`${profile}?show=passed`);
  await expect(main).toContainText(QUILLAN);
  await expect(main).not.toContainText(SALTMARSH);
  // Never the agent's words, who sent it, or the home she hasn't touched.
  for (const path of [profile, `${profile}?show=comments`, `${profile}?show=liked`]) {
    const html = await (await anyone.request.get(path)).text();
    expect(html).not.toContain("Want to see it Saturday");
    expect(html).not.toContain("Lana");
    expect(html).not.toContain(CORBEL);
  }

  // Switched off in Edit profile: none of it shows, to anyone, here or on the home.
  await pam.goto("/people/me/edit");
  const keep = pam.getByRole("switch", { name: "Share my likes and comments on homes I'm sent" });
  await expect(keep).toHaveAttribute("aria-checked", "true");
  await keep.click();
  await expect(keep).toHaveAttribute("aria-checked", "false");
  await expect(async () => {
    const html = await (await anyone.request.get(profile)).text();
    expect(html).not.toContain(SALTMARSH);
    expect(html).not.toContain(QUILLAN);
    expect(html).not.toContain(SAID);
    expect(await (await anyone.request.get(SALTMARSH_PAGE)).text()).not.toContain(SAID);
  }).toPass({ timeout: 10_000 });
  // The link then starts what she says on it between her and the agent.
  await pam.goto(url);
  await toFirstHome(pam);
  const again = await openComments(pam, homeIn(pam, SALTMARSH));
  await expect(again).toContainText("Only you and Lana Agent see this.");
  await expect(again.getByRole("button", { name: "Make public" }).first()).toBeVisible();
  // What she said is still there, for her and the agent.
  await expect(again.getByText(SAID)).toBeVisible();
  await pam.keyboard.press("Escape");

  // Switched back on: what she did before stays hers; what she does now shows.
  await pam.goto("/people/me/edit");
  await keep.click();
  await expect(keep).toHaveAttribute("aria-checked", "true");
  await expect(async () => {
    const html = await (await anyone.request.get(profile)).text();
    expect(html).not.toContain(SALTMARSH);
  }).toPass({ timeout: 10_000 });
  await pam.goto(url);
  await toFirstHome(pam);
  const third = homeIn(pam, CORBEL);
  await heartOf(third).click();
  await expect(heartOf(third)).toHaveAttribute("aria-pressed", "true");
  await expect(async () => {
    const html = await (await anyone.request.get(profile)).text();
    expect(html).toContain(CORBEL);
    expect(html).not.toContain(SALTMARSH);
  }).toPass({ timeout: 10_000 });
});
