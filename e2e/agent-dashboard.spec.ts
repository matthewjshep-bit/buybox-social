import { expect, test } from "@playwright/test";
import { createShare, homeIn, signInAgent } from "./helpers";

test("an agent's phone and email for clients: checked, kept as digits, and never the login email", async ({
  browser,
}) => {
  test.setTimeout(60_000);
  const agent = await signInAgent(browser, "casey-contact@example.com", "Casey Agent");
  await agent.goto("/dashboard/profile");
  // (Next's route announcer is an alert too.)
  const alert = agent.locator("form").getByRole("alert");
  const phone = agent.getByLabel("Phone for clients (optional)");
  const email = agent.getByLabel("Email for clients (optional)");
  // Nothing shows on links until they type it: never their login email.
  await expect(phone).toHaveValue("");
  await expect(email).toHaveValue("");

  // A number without its area code says so, under the field, and saves nothing.
  await phone.fill("555-0142");
  await agent.getByRole("button", { name: "Save" }).click();
  await expect(alert).toHaveText("Please enter a phone number with the area code, or leave it empty.");
  await expect(phone).toHaveAttribute("aria-invalid", "true");
  await expect(phone).toHaveValue("555-0142");
  await expect(agent).toHaveURL(/\/dashboard\/profile$/);

  // So does an address that can't be one, even with a good phone beside it.
  await phone.fill("(206) 555-0142");
  await email.fill("casey@nowhere");
  await agent.getByRole("button", { name: "Save" }).click();
  await expect(alert).toHaveText("Please enter a valid email address, or leave it empty.");
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toHaveValue("casey@nowhere");
  await agent.reload();
  await expect(phone).toHaveValue("");
  await expect(email).toHaveValue("");

  // Both good: saved, and shown back as a phone number.
  await phone.fill("(206) 555-0142");
  await email.fill("Casey@Harborpine.example");
  await agent.getByRole("button", { name: "Save" }).click();
  await agent.waitForURL(/\/dashboard$/);
  await agent.goto("/dashboard/profile");
  await expect(phone).toHaveValue("(206) 555-0142");
  await expect(email).toHaveValue("casey@harborpine.example");

  // Kept as digits: that's all the link's call button is made of.
  const { url } = await createShare(agent, ["96 Fernhollow"], ["Robin"]);
  const client = await (await browser.newContext()).newPage();
  await client.goto(url);
  await expect(homeIn(client, "96 Fernhollow Ln")).toBeInViewport({ ratio: 0.9 });
  await client.getByRole("button", { name: "Contact" }).click();
  const contact = client.getByRole("dialog", { name: "Contact Casey Agent" });
  await expect(contact.getByRole("link", { name: "Call Casey" })).toHaveAttribute("href", "tel:2065550142");
  await expect(contact.getByRole("link", { name: "Email Casey" })).toHaveAttribute(
    "href",
    /^mailto:casey@harborpine\.example\?subject=/,
  );

  // Cleared, they're gone from the link.
  await agent.goto("/dashboard/profile");
  await phone.fill("");
  await email.fill("");
  await agent.getByRole("button", { name: "Save" }).click();
  await agent.waitForURL(/\/dashboard$/);
  await client.reload();
  await client.getByRole("button", { name: "Contact" }).click();
  await expect(contact).toBeVisible();
  await expect(contact.getByRole("link")).toHaveCount(0);
  await expect(contact.getByRole("button", { name: "Ask to see it" })).toBeVisible();
});

test("a home that's no longer for sale can't go on a new link", async ({ browser }) => {
  const agent = await signInAgent(browser, "gone-agent@example.com", "Gale Agent");
  await agent.goto("/dashboard/new");
  await agent.getByRole("button", { name: /812 N Corbel/ }).click();
  await agent.getByLabel("Person 1's first name").fill("Zuri");
  // The home goes off the market between picking it and creating the link: the
  // server is asked for a home that isn't for sale.
  await agent.route("**/dashboard/new", async (route) => {
    const body = route.request().postData();
    if (route.request().method() !== "POST" || !body?.includes("SAMPLE-1003")) return route.continue();
    await route.continue({ postData: body.replace("SAMPLE-1003", "SAMPLE-SOLD") });
  });
  await agent.getByRole("button", { name: /Create link/ }).click();
  await expect(agent.getByText("One of those homes is no longer available.")).toHaveAttribute("role", "alert");
  await expect(agent).toHaveURL(/\/dashboard\/new$/);
  await agent.unroute("**/dashboard/new");

  // No link was made.
  await agent.goto("/dashboard");
  await expect(agent.getByRole("link", { name: /Zuri/ })).toHaveCount(0);
});
