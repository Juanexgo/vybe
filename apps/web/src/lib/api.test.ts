import { describe, it, expect, vi, afterEach } from "vitest";
import { api, ApiError } from "./api";
afterEach(() => vi.unstubAllGlobals());
describe("HTTP boundary", () => {
  it("refreshes an expired CSRF token once without retrying ordinary access denials", async () => {
    vi.resetModules();
    const { api: freshApi } = await import("./api");
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "old" })))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: "csrf_invalid" }), { status: 403 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "new" })))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetcher);
    await freshApi("/auth/login", { method: "POST", body: "{}" });
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(fetcher.mock.calls[3][1].headers["X-XSRF-TOKEN"]).toBe("new");
  });
  it("stops after a second CSRF rejection", async () => {
    vi.resetModules();
    const { api: freshApi } = await import("./api");
    const fetcher = vi
      .fn()
      .mockImplementation((url: string) =>
        Promise.resolve(
          url.endsWith("/csrf")
            ? new Response(JSON.stringify({ token: "token" }))
            : new Response(
                JSON.stringify({ code: "csrf_invalid", detail: "Expired" }),
                { status: 403 },
              ),
        ),
      );
    vi.stubGlobal("fetch", fetcher);
    await expect(
      freshApi("/auth/login", { method: "POST", body: "{}" }),
    ).rejects.toThrow("Expired");
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
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
