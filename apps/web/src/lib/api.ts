export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
let csrfToken: string | undefined;
export async function api<T>(
  path: string,
  options: RequestInit = {},
  csrfRetried = false,
): Promise<T> {
  const method = options.method ?? "GET";
  if (method !== "GET" && !csrfToken) {
    const response = await fetch("/api/auth/csrf", {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok)
      throw new ApiError(
        response.status,
        "Could not establish a secure connection. Try again.",
      );
    csrfToken = ((await response.json()) as { token: string }).token;
  }
  const res = await fetch(`/api${path}`, {
    ...options,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(csrfToken ? { "X-XSRF-TOKEN": csrfToken } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    if (res.status === 403) csrfToken = undefined;
    const problem = (await res.json().catch(() => ({
      detail: "The service is unavailable. Please try again.",
    }))) as { detail?: string; code?: string };
    // CSRF rejection occurs before the handler, so a single retry cannot duplicate a write.
    if (
      res.status === 403 &&
      problem.code === "csrf_invalid" &&
      method !== "GET" &&
      !csrfRetried
    ) {
      return api<T>(path, options, true);
    }
    throw new ApiError(
      res.status,
      problem.detail ?? "The request could not be completed.",
    );
  }
  if (path === "/auth/logout" || path === "/auth/login") csrfToken = undefined;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
export type Title = {
  id: string;
  slug: string;
  title: string;
  kind: "MOVIE" | "SERIES";
  synopsis: string;
  releaseYear: number;
  durationMinutes: number | null;
  language: string;
  rating: string;
  artwork: string;
  accent: string;
  featured?: boolean;
  playableAssetId?: string | null;
  genres: string;
  attribution?: string;
  sourceUrl?: string;
  credits?: { name: string; job: string }[];
  episodes?: {
    id: string;
    playableAssetId?: string | null;
    season: number;
    number: number;
    title: string;
    synopsis: string;
    durationMinutes: number;
  }[];
};
export type Catalog = {
  items: Title[];
  total: number;
  page: number;
  pageSize: number;
};
export type Profile = { id: string; name: string; color: string };
export type Account = { email: string; roles: string[] };
