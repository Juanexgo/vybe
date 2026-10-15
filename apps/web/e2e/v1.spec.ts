import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
function fixture() {
  return JSON.parse(readFileSync(process.env.MEDIA_FIXTURE!, "utf8"));
}
async function login(page: Page) {
  const f = fixture();
  await page.goto("/login");
  await page.getByLabel("Email address").fill(f.email);
  await page.getByLabel("Password", { exact: true }).fill(f.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Who’s discovering?" }),
  ).toBeVisible();
}
test.beforeEach(() =>
  test.skip(
    !process.env.MEDIA_FIXTURE,
    "Requires a real media fixture account.",
  ),
);
test("collaborative watchlist persists additions and allows a guest to edit without owner controls", async ({
  browser,
}) => {
  test.setTimeout(60000);
  const a = await browser.newContext(),
    b = await browser.newContext(),
    owner = await a.newPage(),
    guest = await b.newPage();
  try {
    await login(owner);
    await login(guest);
    const all = await guest.request.get("/api/profiles");
    if (
      !(await all.json()).some(
        (p: { name: string }) => p.name === "Party guest",
      )
    ) {
      const token = (await (await guest.request.get("/api/auth/csrf")).json())
        .token;
      const response = await guest.request.post("/api/profiles", {
        headers: { "X-XSRF-TOKEN": token },
        data: { name: "Party guest", color: "#aa77dd" },
      });
      expect(response.ok()).toBeTruthy();
      await guest.reload();
    }
    await guest
      .getByRole("button", { name: "Party guest", exact: false })
      .first()
      .click();
    await owner.goto("/lists");
    const name = `Together ${Date.now()}`;
    await owner.getByLabel("New watchlist name").fill(name);
    await owner
      .getByRole("button", { name: "Create watchlist", exact: true })
      .click();
    await expect(
      owner.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    await owner.getByLabel("Find a title to add").fill("Sintel");
    await owner.getByRole("button", { name: "+ Sintel", exact: true }).click();
    await expect(
      owner.getByRole("button", { name: "Remove Sintel" }),
    ).toBeVisible();
    await owner
      .getByRole("button", { name: "Create collaborator invitation" })
      .click();
    const invite = await owner
      .getByLabel("Copy invitation link · valid for seven days")
      .inputValue();
    await guest.goto(invite);
    await expect(
      guest.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    await expect(
      guest.getByRole("button", { name: "Create collaborator invitation" }),
    ).toHaveCount(0);
    await guest.getByRole("button", { name: "Remove Sintel" }).click();
    await expect(
      guest.getByText("This list is ready for its first story.", {
        exact: false,
      }),
    ).toBeVisible();
    await owner.reload();
    await expect(
      owner.getByText("This list is ready for its first story.", {
        exact: false,
      }),
    ).toBeVisible();
    await owner
      .getByRole("button", { name: "Delete watchlist", exact: true })
      .click();
    await owner.getByRole("button", { name: "Confirm delete list" }).click();
    await expect(
      owner.getByRole("heading", { name: "Make room for your favorites." }),
    ).toBeVisible();
  } finally {
    await a.close();
    await b.close();
  }
});
test("personal analytics, recommendation preferences and real admin metrics render", async ({
  page,
}) => {
  await login(page);
  await page.goto("/analytics");
  await expect(
    page.getByText("Playback sessions", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Estimated minutes watched", { exact: true }),
  ).toBeVisible();
  await page.goto("/for-you");
  await expect(
    page.getByRole("heading", { name: "Tune your taste." }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "Science fiction", exact: true }).selectOption("3");
  await expect(page.getByRole("combobox", {name:"Science fiction",exact:true})).toBeEnabled();
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Science fiction", exact: true })).toHaveValue(
    "3",
  );
  await page.goto("/admin/analytics");
  await expect(
    page.getByText("Registered accounts", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Failed jobs", { exact: true })).toBeVisible();
  await page.goto("/admin/users");
  await expect(
    page.getByRole("heading", { name: fixture().email, exact: true }),
  ).toBeVisible();
});
test("curated collections can be published and discovered", async ({
  page,
}) => {
  await login(page);
  await page.goto("/admin/collections");
  await page.getByRole("button", { name: "New collection" }).click();
  const name = `Discovery ${Date.now()}`;
  await page.getByLabel("Collection name").fill(name);
  await page
    .getByLabel("Description", { exact: true })
    .fill("A real editorial collection for our next screening.");
  await page.getByLabel("Sintel", { exact: true }).check();
  await page
    .getByRole("button", { name: "Save collection", exact: true })
    .click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await page.goto("/collections");
  const entry = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  await entry.getByRole("button", { name: "Explore collection" }).click();
  await expect(
    page.getByRole("link", { name: /Sintel/ }).first(),
  ).toBeVisible();
  await page.goto("/admin/collections");
  await page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name, exact: true }) })
    .getByRole("button", { name: "Edit collection" })
    .click();
  await page
    .getByRole("button", { name: "Delete collection", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm delete collection" }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toHaveCount(0);
});
