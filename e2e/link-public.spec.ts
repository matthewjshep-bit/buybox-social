// A client's comment on an agent's link is public by default, by first name
// (lib/link-public.ts): anyone can answer it and heart it on the home's own
// page, and the client hears about the answer. "Keep it to <agent>" keeps one
// on the link; so does anything said about a home they passed on.
import { expect, test } from "@playwright/test";
import { commentIn, createShare, expectPassed, heartOf, homeIn, openComments, pass, signInAgent, signUpBuyer, toFirstHome } from "./helpers";

const QUILLAN = "1204 Quillan St SE";
const SALTMARSH = "719 Saltmarsh Ln";
const PUBLIC_WORDS = "The light in that kitchen!";
const KEPT_WORDS = "Is there room in the budget for this one?";
const PASSED_WORDS = "The street felt too busy.";

test("a client's comment on a link can be answered and hearted by anyone; one kept to the agent, or on a home passed on, stays on the link", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const agent = await signInAgent(browser, `mo.agent.${Date.now()}@example.com`, "Mo Agent");
  const { url } = await createShare(agent, ["1204 Quillan", "719 Saltmarsh"], ["Rae"]);
  const rae = await signUpBuyer(browser, `rae.${Date.now()}@example.com`, "Rae");
  await rae.setViewportSize({ width: 390, height: 780 });
  await rae.goto(url);
  await toFirstHome(rae);

  // Passes on the first and says why: that stays on the link, with no way to make it public.
  const first = homeIn(rae, QUILLAN);
  await pass(rae, first);
  await expect(homeIn(rae, SALTMARSH)).toBeInViewport({ ratio: 0.9 });
  await expectPassed(rae, first);
  await rae.waitForLoadState("networkidle");
  await rae.goto(url);
  await toFirstHome(rae);
  const passed = await openComments(rae, homeIn(rae, QUILLAN));
  await expect(passed).toContainText("Only you and Mo Agent see this.");
  await expect(passed.getByRole("button", { name: "Make public" })).toHaveCount(0);
  await passed.getByRole("textbox").first().fill(PASSED_WORDS);
  await passed.getByRole("textbox").first().press("Enter");
  await expect(passed.getByRole("textbox").first()).toHaveValue("");
  await expect(passed.locator("li[data-comment]").filter({ hasText: PASSED_WORDS })).toBeVisible();
  await rae.keyboard.press("Escape");

  // Likes the second; says one thing in public, and keeps the next to the agent.
  const second = homeIn(rae, SALTMARSH);
  await second.scrollIntoViewIfNeeded();
  await heartOf(second).click();
  await expect(heartOf(second)).toHaveAttribute("aria-pressed", "true");
  const chat = await openComments(rae, second);
  await expect(chat).toContainText("Public, with your first name.");
  await chat.getByRole("textbox").first().fill(PUBLIC_WORDS);
  await chat.getByRole("textbox").first().press("Enter");
  await expect(chat.getByRole("textbox").first()).toHaveValue("");
  await expect(chat.locator("li[data-comment]").filter({ hasText: PUBLIC_WORDS })).toBeVisible();
  await chat.getByRole("button", { name: "Keep it to Mo Agent" }).click();
  await expect(chat).toContainText("Only you and Mo Agent see this.");
  await chat.getByRole("textbox").first().fill(KEPT_WORDS);
  await chat.getByRole("textbox").first().press("Enter");
  await expect(chat.getByRole("textbox").first()).toHaveValue("");
  const kept = chat.locator("li[data-comment]").filter({ hasText: KEPT_WORDS });
  await expect(kept.getByRole("button", { name: "Make public" })).toBeVisible();
  await expect(kept).not.toContainText("Public");
  await rae.keyboard.press("Escape");

  // Someone else, on the home's own page: Rae's public words, by name, and
  // nothing she kept to the agent or said about the home she passed on.
  const zed = await signUpBuyer(browser, `zed.${Date.now()}@example.com`, "Zed");
  await zed.goto("/homes/SAMPLE-1008");
  const thread = await openComments(zed, homeIn(zed, SALTMARSH));
  const raes = commentIn(thread, "Rae", PUBLIC_WORDS);
  await expect(raes).toBeVisible();
  await expect(thread).not.toContainText(KEPT_WORDS);
  await expect(thread).not.toContainText("A buyer");
  // Hearts it, and answers it.
  await raes.getByRole("button", { name: /^Like Rae's comment/ }).click();
  await expect(raes.getByRole("button", { name: /^Like Rae's comment/ })).toHaveAttribute("aria-pressed", "true");
  await raes.getByRole("button", { name: "Reply to Rae" }).click();
  await thread.getByLabel("Reply to Rae").fill("Agreed, that kitchen is something.");
  await thread.getByLabel("Reply to Rae").press("Enter");
  await expect(thread.getByText("Agreed, that kitchen is something.")).toBeVisible();
  const elsewhere = await (await zed.request.get("/homes/SAMPLE-1009")).text();
  expect(elsewhere).not.toContain(PASSED_WORDS);

  // Rae hears about it.
  await rae.goto("/activity");
  await expect(rae.getByRole("main")).toContainText(/Zed\s*replied to your comment on 719 Saltmarsh/);

  // "Make private" on the link takes it down from the home's page (the answer with it).
  await rae.goto(url);
  await toFirstHome(rae);
  const back = await openComments(rae, homeIn(rae, SALTMARSH));
  await back.locator("li[data-comment]").filter({ hasText: PUBLIC_WORDS }).getByRole("button", { name: "Make private" }).click();
  await expect(back.locator("li[data-comment]").filter({ hasText: PUBLIC_WORDS }).getByRole("button", { name: "Make public" })).toBeVisible();
  await expect(async () => {
    const html = await (await zed.request.get("/homes/SAMPLE-1008")).text();
    expect(html).not.toContain(PUBLIC_WORDS);
    expect(html).not.toContain("Agreed, that kitchen is something.");
  }).toPass({ timeout: 10_000 });
});
