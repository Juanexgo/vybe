import { describe, it, expect, vi, afterEach } from "vitest";
import { api, ApiError } from "./api";
afterEach(() => vi.unstubAllGlobals());
describe("HTTP boundary", () => {
  it("surfaces API problem details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Verify your email" }), {
          status: 403,
        }),
      ),
    );
    await expect(api("/auth/me")).rejects.toThrow("Verify your email");
  });
  it("sends a CSRF header and same-origin cookie credentials for mutations", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: "csrf-value" })),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetcher);
    await api("/profiles/test/library/title", { method: "PUT" });
    expect(fetcher.mock.calls[1][1]).toMatchObject({
      method: "PUT",
      credentials: "same-origin",
      headers: { "X-XSRF-TOKEN": "csrf-value" },
    });
  });
  it("handles an unavailable upstream without exposing response markup", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Bad gateway", { status: 502 })),
    );
    await expect(api("/catalog")).rejects.toBeInstanceOf(ApiError);
  });
});
