import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
test("two browser sessions share playback, chat, host permissions and reconnection", async ({
  browser,
}) => {
  test.setTimeout(100000);
  test.skip(
    !process.env.MEDIA_FIXTURE,
    "Requires a real processed media fixture.",
  );
  const f = JSON.parse(readFileSync(process.env.MEDIA_FIXTURE!, "utf8"));
  const hostContext = await browser.newContext(),
    guestContext = await browser.newContext();
  const host = await hostContext.newPage(),
    guest = await guestContext.newPage();
  const login = async (p: Page) => {
    await p.goto("/login");
    await p.getByLabel("Email address").fill(f.email);
    await p.getByLabel("Password", { exact: true }).fill(f.password);
    await p.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      p.getByRole("heading", { name: "Who’s discovering?" }),
    ).toBeVisible();
  };
  try {
    await login(host);
    await login(guest);
    const csrf = await guest.request.get("/api/auth/csrf");
    const token = (await csrf.json()).token;
    const profiles = await guest.request.get("/api/profiles");
    let guestProfile = (await profiles.json()).find(
      (p: { name: string }) => p.name === "Party guest",
    );
    if (!guestProfile) {
      const made = await guest.request.post("/api/profiles", {
        headers: { "X-XSRF-TOKEN": token },
        data: { name: "Party guest", color: "#aa77dd" },
      });
      expect(made.ok()).toBeTruthy();
      guestProfile = await made.json();
    }
    await guest.goto("/profiles");
    await guest
      .getByRole("button", { name: "Party guest", exact: false })
      .first()
      .click();
    await host.goto(`/parties?asset=${f.asset}`);
    await host.getByLabel("Room name").fill("A shared test screening");
    await host
      .getByRole("button", { name: "Create screening room", exact: true })
      .click();
    await expect(host.getByText("Live · You’re the host")).toBeVisible();
    await host
      .getByRole("button", { name: "Create new invitation link" })
      .click();
    const link = await host
      .getByLabel("Copy and share this private link")
      .inputValue();
    await guest.goto(link);
    await expect(
      guest.getByText("Live · Playback follows the host"),
    ).toBeVisible();
    await host
      .getByLabel("Message", { exact: true })
      .fill("Hello from the host");
    await host.getByRole("button", { name: "Send message" }).click();
    await expect(guest.getByRole("log")).toContainText("Hello from the host");
    await guest.getByRole("button", { name: "React 👏" }).click();
    await expect(host.getByRole("log")).toContainText("👏");
    const hv = host.locator("video"),
      gv = guest.locator("video");
    await expect
      .poll(() => hv.evaluate((v: HTMLVideoElement) => v.readyState))
      .toBeGreaterThanOrEqual(2);
    await expect
      .poll(() => gv.evaluate((v: HTMLVideoElement) => v.readyState))
      .toBeGreaterThanOrEqual(2);
    await host.waitForTimeout(900);
    await hv.evaluate((v: HTMLVideoElement) => {
      v.pause();
      v.currentTime = 2;
    });
    await expect
      .poll(() => gv.evaluate((v: HTMLVideoElement) => v.currentTime))
      .toBeGreaterThan(1.4);
    const roomId = new URL(host.url()).pathname.split("/").pop();
    const denied = await guest.request.post(
      `/api/parties/${roomId}/selection`,
      {
        headers: { "X-XSRF-TOKEN": token },
        data: { profile: guestProfile.id, asset: f.asset },
      },
    );
    expect(denied.status()).toBe(403);
    await guest.reload();
    await expect(
      guest.getByText("Live · Playback follows the host"),
    ).toBeVisible();
    await expect(guest.getByRole("log")).toContainText("Hello from the host");
    await host
      .getByRole("button", { name: "End screening", exact: true })
      .click();
    await host.getByRole("button", { name: "Confirm end" }).click();
    await expect(
      guest.getByText("The host ended the room.", { exact: true }),
    ).toBeVisible();
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
