import { test, expect } from "@playwright/test";
test("browse, filter, open a title and navigate authentication", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Find your next feeling." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Science fiction", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Tears of Steel", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Sintel", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "All stories", exact: true }).click();
  await page.getByRole("link", { name: "Explore the story" }).click();
  await expect(
    page.getByRole("heading", { name: "Spring", exact: true, level: 1 }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Sign in to save" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
});
test("empty search is honest and clears filters", async ({ page }) => {
  await page.goto("/search");
  await page
    .getByRole("textbox", { name: "Search titles" })
    .fill("this-title-does-not-exist");
  await page.getByRole("button", { name: "Run search" }).click();
  await expect(
    page.getByRole("heading", { name: "No stories found" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(
    page.getByRole("heading", { name: "Sintel", exact: true }),
  ).toBeVisible();
});
test("registration validates password before submitting", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Your name").fill("Test");
  await page.getByLabel("Email address").fill("test@example.test");
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Use at least 12 characters.")).toBeVisible();
});
test("mobile catalog does not overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Explore the story" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
