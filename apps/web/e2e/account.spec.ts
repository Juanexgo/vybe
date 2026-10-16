import { test, expect } from "@playwright/test";
test("verified account saves a title, switches profiles, and signs out", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const email = `e2e-${Date.now()}@vybe.test`;
  await page.goto("/register");
  await page.getByLabel("Your name").fill("Cinema explorer");
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("an-original-password-47");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("status")).toContainText("Check your email");
  const mailbox = process.env.MAILPIT_URL ?? "http://127.0.0.1:8025";
  let messageId = "";
  await expect
    .poll(
      async () => {
        const inbox = await request.get(`${mailbox}/api/v1/messages`);
        const data = (await inbox.json()) as {
          messages: { ID: string; To: { Address: string }[] }[];
        };
        messageId =
          data.messages.find((m) => m.To.some((to) => to.Address === email))
            ?.ID ?? "";
        return messageId;
      },
      { timeout: 25_000 },
    )
    .not.toBe("");
  const message = (await (
    await request.get(`${mailbox}/api/v1/message/${messageId}`)
  ).json()) as { Text: string };
  const token = message.Text.match(/#token=([\w-]+)/)?.[1];
  expect(token).toBeTruthy();
  await page.goto(`/verify#token=${token}`);
  await page.getByRole("button", { name: "Verify email" }).click();
  await expect(page.getByRole("status")).toContainText("Email verified");
  await page.getByRole("link", { name: "Sign in", exact: true }).last().click();
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("an-original-password-47");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Who’s discovering?" }),
  ).toBeVisible();
  await page.goto("/");
  await expect(page).toHaveURL(/\/explore$/);
  await expect(
    page.getByRole("heading", { name: "Find your next feeling." }),
  ).toBeVisible();
  await page.goto("/title/spring");
  await page.getByRole("button", { name: "Save to my library" }).click();
  await expect(
    page.getByRole("button", { name: "In your library" }),
  ).toBeVisible();
  await page.goto("/library");
  await expect(
    page.getByRole("heading", { name: "Spring", exact: true }),
  ).toBeVisible();
  await page.goto("/profiles");
  await page.getByLabel("New profile name").fill("Another perspective");
  await page.getByRole("button", { name: "Add profile" }).click();
  await expect(
    page
      .locator("button.profile-card")
      .filter({ hasText: "Another perspective" }),
  ).toBeVisible();
  await page
    .locator("button.profile-card")
    .filter({ hasText: "Another perspective" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your next favorite belongs here." }),
  ).toBeVisible();
  await page.goto("/account");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page
      .getByRole("banner")
      .getByRole("link", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await page.goto("/library");
  await expect(
    page.getByRole("heading", { name: "A space for your stories." }),
  ).toBeVisible();
});
