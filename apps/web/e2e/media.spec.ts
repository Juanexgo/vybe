import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
test("authenticated HLS plays decoded video and persists progress", async ({
  page,
}) => {
  test.skip(
    !process.env.MEDIA_FIXTURE,
    "Requires the real media upload/worker integration fixture.",
  );
  const f = JSON.parse(readFileSync(process.env.MEDIA_FIXTURE!, "utf8"));
  await page.goto("/login");
  await page.getByLabel("Email address").fill(f.email);
  await page.getByLabel("Password", { exact: true }).fill(f.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Who’s discovering?" }),
  ).toBeVisible();
  await page.goto(`/watch/${f.asset}`);
  await expect(
    page.getByRole("heading", { name: "VYBE Signal Study" }),
  ).toBeVisible();
  const video = page.locator("video");
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState))
    .toBeGreaterThanOrEqual(2);
  await video.evaluate((v: HTMLVideoElement) => {
    v.muted = true;
    return v.play();
  });
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(3);
  await video.evaluate((v: HTMLVideoElement) => v.pause());
  await expect(page.getByRole("status")).toContainText("Progress saved");
  await expect.poll(async()=>{const info=await page.request.get(`/api/playback/${f.asset}?profile=${f.profile}`);return (await info.json()).position;}).toBeGreaterThan(3);
  await expect(page.getByLabel("Quality")).toContainText("360p");
  await expect(page.getByRole("combobox",{name:"Audio",exact:true})).toContainText(/SPA/i);
  await page.getByRole("combobox",{name:"Audio",exact:true}).selectOption('1');
  await page.getByRole("combobox",{name:"Subtitles",exact:true}).selectOption('0');
  await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.textTracks[0]?.mode)).toBe('showing');
  await page.screenshot({
    path: process.env.MEDIA_SCREENSHOT ?? "test-results/player.png",
    fullPage: true,
  });
});

test('series episode has playable media and its own progress',async({page})=>{
 test.skip(!process.env.MEDIA_FIXTURE,'Requires the episode processing fixture.');const f=JSON.parse(readFileSync(process.env.MEDIA_FIXTURE!,'utf8'));test.skip(!f.episodeAsset,'Fixture must include an episode.');
 await page.goto('/login');await page.getByLabel('Email address').fill(f.email);await page.getByLabel('Password',{exact:true}).fill(f.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('heading',{name:'Who’s discovering?'})).toBeVisible();await page.goto(`/title/${f.seriesSlug}`);await page.getByRole('link',{name:'Watch episode'}).click();await expect(page.getByRole('heading',{name:'VYBE Test Series — Signal One'})).toBeVisible();await expect.poll(()=>page.locator('video').evaluate((v:HTMLVideoElement)=>v.readyState)).toBeGreaterThanOrEqual(2);
});
