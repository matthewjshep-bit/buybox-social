// What someone does on homes an agent sends them shows on their own profile:
// their likes, their passes, and what they say about a home. The link says so
// before they do anything. The agent's side of the conversation never does.
// One switch in Edit profile keeps it all private; switched back on, only
// what they do from then shows.
import { expect, test } from "@playwright/test";
import { createShare, heartOf, homeIn, openComments, signInAgent, signUpBuyer, toFirstHome } from "./helpers";

const QUILLAN = "1204 Quillan St SE";
const SALTMARSH = "719 Saltmarsh Ln";
const CORBEL = "812 N Corbel St";
const SAID = "The porch is the best part.";

test("likes, passes and comments on an agent's link show on the person's own profile, until they switch that off", async ({
  browser,
}) => {
  test.setTimeout(120_000);
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
  // The link says where it goes, before anything is said.
  await expect(chat).toContainText("Shown to Lana Agent and on your profile.");
  await chat.getByRole("textbox").first().fill(SAID);
  await chat.getByRole("textbox").first().press("Enter");
  await expect(chat.getByText(SAID)).toBeVisible();
  await pam.keyboard.press("Escape");

  // The agent answers on the link: that stays there.
  await agent.goto(url);
  await toFirstHome(agent).catch(() => {});
  const theirs = await openComments(agent, homeIn(agent, SALTMARSH));
  await theirs.getByRole("button", { name: /^Reply/ }).first().click();
  await theirs.getByRole("textbox").last().fill("Agreed. Want to see it Saturday?");
  await theirs.getByRole("textbox").last().press("Enter");
  await expect(theirs.getByText("Agreed. Want to see it Saturday?")).toBeVisible();

  // Pam's profile, to anyone: the like, what she said, and (under Didn't like) the pass.
  await pam.setViewportSize({ width: 1280, height: 800 });
  await pam.goto("/people/me");
  await pam.waitForURL(/\/people\/[0-9a-f-]{36}$/);
  const profile = new URL(pam.url()).pathname;
  const anyone = await (await browser.newContext()).newPage();
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

  // Switched off in Edit profile: none of it shows, to anyone.
  await pam.goto("/people/me/edit");
  const keep = pam.getByRole("switch", { name: "Show what I do on homes I'm sent" });
  await expect(keep).toHaveAttribute("aria-checked", "true");
  await keep.click();
  await expect(keep).toHaveAttribute("aria-checked", "false");
  await expect(async () => {
    const html = await (await anyone.request.get(profile)).text();
    expect(html).not.toContain(SALTMARSH);
    expect(html).not.toContain(QUILLAN);
    expect(html).not.toContain(SAID);
  }).toPass({ timeout: 10_000 });
  // The link then says it's between her and the agent.
  await pam.goto(url);
  await toFirstHome(pam);
  const again = await openComments(pam, homeIn(pam, QUILLAN));
  await expect(again).toContainText("Only you and Lana Agent see this.");
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
