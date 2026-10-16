import { test, expect } from "@playwright/test";
test("public welcome leads to registration and login keeps password private", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Find your film. Find your vybe." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Get started", exact: true }).click();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await page.goto("/login");
  const password = page.getByLabel("Password", { exact: true });
  await password.fill("not-a-real-password");
  await expect(password).toHaveAttribute("type", "password");
  await page
    .getByRole("button", { name: "Show password", exact: true })
    .click();
  await expect(password).toHaveAttribute("type", "text");
  await page
    .getByRole("button", { name: "Hide password", exact: true })
    .click();
  await expect(password).toHaveAttribute("type", "password");
  const providers = await (
    await page.request.get("/api/auth/providers")
  ).json();
  await expect(
    page.getByRole("link", { name: "Continue with Google" }),
  ).toHaveCount(providers.google ? 1 : 0);
});
test("public pages fit a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["/", "/login", "/register"]) {
    await page.goto(route);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});
