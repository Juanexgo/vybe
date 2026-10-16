import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
test("quick search supports keyboard, results, dismissal, and mobile navigation", async ({
  page,
}) => {
  await page.goto("/explore");
  await page
    .getByRole("button", { name: "Search catalog", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Quick search titles" }),
  ).toBeFocused();
  await page
    .getByRole("textbox", { name: "Quick search titles" })
    .fill("Sintel");
  await dialog.getByRole("link", { name: /Sintel/ }).click();
  await expect(page).toHaveURL(/\/title\/sintel$/);
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("navigation", { name: "Mobile navigation" }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("link", { name: "For you", exact: true })
    .click();
  await expect(page).toHaveURL(/\/for-you$/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("profile menu switches profiles, exposes real destinations, works on mobile and signs out", async ({
  page,
}) => {
  test.skip(!process.env.MEDIA_FIXTURE, "Requires a verified test account.");
  const f = JSON.parse(readFileSync(process.env.MEDIA_FIXTURE!, "utf8"));
  await page.goto("/login");
  await page.getByLabel("Email address").fill(f.email);
  await page.getByLabel("Password", { exact: true }).fill(f.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Who’s discovering?" }),
  ).toBeVisible();
  const profiles = await (await page.request.get("/api/profiles")).json();
  expect(profiles.length).toBeGreaterThan(1);
  const trigger = page.getByRole("button", { name: /Open profile menu/ });
  await trigger.click();
  const picker = page.getByRole("region", { name: "Switch profile" });
  await expect(picker).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  await page.getByRole("heading", { name: "Who’s discovering?" }).click();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  await picker
    .getByRole("button", { name: profiles[1].name, exact: true })
    .click();
  await expect(page).toHaveURL(/\/explore$/);
  await expect(
    page.getByRole("heading", {
      name: `${profiles[1].name}, make tonight yours.`,
    }),
  ).toBeVisible();
  await trigger.click();
  for (const label of [
    "Manage profiles",
    "Continue watching",
    "Shared watchlists",
    "Watch together",
    "Account & security",
    "Help & getting started",
  ])
    await expect(
      page
        .locator(".profile-dropdown")
        .getByRole("link", { name: label, exact: true }),
    ).toBeVisible();
  await page
    .locator(".profile-dropdown")
    .getByRole("link", { name: "Account & security", exact: true })
    .click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(
    page.getByRole("heading", { name: "Your account.", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await trigger.click();
  const bounds = await page.locator(".profile-dropdown").boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await page
    .getByRole("button", { name: "Sign out of VYBE", exact: true })
    .click();
  await expect(
    page
      .getByRole("banner")
      .getByRole("link", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => (await page.request.get("/api/auth/me")).status())
    .toBe(401);
  await page.goto("/library");
  await expect(
    page.getByRole("heading", { name: "A space for your stories." }),
  ).toBeVisible();
});
