"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Title, type Profile } from "@/lib/api";
import { useProfile } from "@/lib/store";
import { ErrorBox, TitleCard } from "./catalog";
type Result = Title & { reasons: string[]; score: number };
type Results = {
  items: Result[];
  total: number;
  page: number;
  semanticAvailable: boolean;
  mode: string;
  filters: { genre: string; language: string; maxMinutes: number };
};
export function IntelligentSearch() {
  const selected = useProfile((s) => s.selected);
  const profiles = useQuery({
    queryKey: ["profiles"],
    queryFn: () => api<Profile[]>("/profiles"),
    retry: false,
  });
  const profile =
    profiles.data?.find((p) => p.id === selected) ?? profiles.data?.[0];
  const history = useMutation({
    mutationFn: (query: string) =>
      api(`/discovery/history/${profile!.id}`, {
        method: "POST",
        body: JSON.stringify({ query }),
      }),
  });

  const [draft, setDraft] = useState(""),
    [q, setQ] = useState(""),
    [minutes, setMinutes] = useState("0"),
    [language, setLanguage] = useState(""),
    [page, setPage] = useState(0);
  const results = useQuery({
    queryKey: ["discovery", q, minutes, language, page],
    queryFn: () =>
      api<Results>(
        `/discovery/search?${new URLSearchParams({ q, maxMinutes: minutes, language, page: String(page) })}`,
      ),
  });
  return (
    <div className="member-page">
      <span className="eyebrow">DISCOVER BY FEELING</span>
      <h1>A story for your state of mind.</h1>
      <p className="muted">
        Describe a theme, mood or moment. We search the real VYBE catalog and
        explain the matches.
      </p>
      <form
        className="discovery-form"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(draft);
          setPage(0);
          if (profile && draft.trim()) history.mutate(draft.trim());
        }}
      >
        <label className="wide">
          Describe the story
          <input
            maxLength={300}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="A science fiction story about friendship under 30 minutes"
          />
        </label>
        <label>
          Maximum duration
          <select
            value={minutes}
            onChange={(e) => {
              setMinutes(e.target.value);
              setPage(0);
            }}
          >
            <option value="0">Any length</option>
            <option value="15">15 minutes</option>
            <option value="30">30 minutes</option>
            <option value="60">60 minutes</option>
            <option value="120">2 hours</option>
          </select>
        </label>
        <label>
          Language
          <select
            value={language}
            onChange={(e) => {
              setLanguage(e.target.value);
              setPage(0);
            }}
          >
            <option value="">Any language</option>
            {[
              "English",
              "Spanish",
              "French",
              "German",
              "Japanese",
              "No dialogue",
            ].map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <button className="button primary">Find my story</button>
      </form>
      {results.isPending ? (
        <p role="status">Finding connections…</p>
      ) : results.error ? (
        <ErrorBox error={results.error} />
      ) : (
        <>
          <p className="muted" role="status">
            {results.data.mode} · {results.data.total} matches
            {results.data.filters.genre
              ? ` · ${results.data.filters.genre}`
              : ""}
            {results.data.filters.maxMinutes
              ? ` · Up to ${results.data.filters.maxMinutes} minutes`
              : ""}
          </p>
          {!results.data.items.length ? (
            <div className="empty-state">
              <h2>No matching stories yet.</h2>
              <p>Try a broader description or remove a filter.</p>
            </div>
          ) : (
            <div className="discovery-grid">
              {results.data.items.map((t) => (
                <article key={t.id}>
                  <TitleCard title={t} />
                  <ul className="reasons">
                    {t.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          )}
          <div className="hero-actions">
            <button
              className="button outline"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <button
              className="button outline"
              disabled={(page + 1) * 12 >= results.data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
      {history.error && (
        <p className="muted">
          Your search could not be saved for recommendations.
        </p>
      )}
      <Link className="back-link" href="/search">
        Prefer a simple title search? Browse the catalog →
      </Link>
    </div>
  );
}
export function Recommendations() {
  const selected = useProfile((s) => s.selected),
    client = useQueryClient(),
    [resetOpen, setResetOpen] = useState(false);
  const profiles = useQuery({
    queryKey: ["profiles"],
    queryFn: () => api<Profile[]>("/profiles"),
    retry: false,
  });
  const profile =
    profiles.data?.find((p) => p.id === selected) ?? profiles.data?.[0];
  const results = useQuery({
    queryKey: ["recommendations", profile?.id],
    queryFn: () =>
      api<{ items: Result[] }>(`/profiles/${profile!.id}/recommendations`),
    enabled: !!profile,
  });
  const preferences = useQuery({
    queryKey: ["preferences", profile?.id],
    queryFn: () =>
      api<{ id: number; name: string; weight: number }[]>(
        `/profiles/${profile!.id}/preferences`,
      ),
    enabled: !!profile,
  });
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ["recommendations"] });
    void client.invalidateQueries({ queryKey: ["preferences"] });
  };
  const hide = useMutation({
    mutationFn: (id: string) =>
      api(`/profiles/${profile!.id}/recommendations/${id}`, {
        method: "PUT",
        body: JSON.stringify({ hidden: true }),
      }),
    onSuccess: invalidate,
  });
  const change = useMutation({
    mutationFn: ({ genreId, weight }: { genreId: number; weight: number }) =>
      api(`/profiles/${profile!.id}/preferences`, {
        method: "PUT",
        body: JSON.stringify({ genreId, weight }),
      }),
    onSuccess: invalidate,
  });
  const reset = useMutation({
    mutationFn: () =>
      api(`/profiles/${profile!.id}/recommendations/reset`, { method: "POST" }),
    onSuccess: () => {
      setResetOpen(false);
      invalidate();
    },
  });
  return (
    <div className="member-page">
      <span className="eyebrow">A LITTLE MORE YOU</span>
      <h1>Good stories. Better connections.</h1>
      <p className="muted">
        Recommendations reflect this profile’s ratings, saved titles, completed
        viewing, searches and genre preferences. Every choice is yours to
        change.
      </p>
      {profiles.error ? (
        <>
          <p>Sign in to discover your recommendations.</p>
          <Link className="button primary" href="/login">
            Sign in
          </Link>
        </>
      ) : results.error ? (
        <ErrorBox error={results.error} />
      ) : results.isPending ? (
        <p role="status">Finding your stories…</p>
      ) : (
        <>
          <div className="discovery-grid">
            {results.data.items.map((t) => (
              <article key={t.id}>
                <TitleCard title={t} />
                <ul className="reasons">
                  {t.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
                <button
                  className="button outline small"
                  disabled={hide.isPending}
                  onClick={() => hide.mutate(t.id)}
                >
                  Hide this recommendation
                </button>
              </article>
            ))}
          </div>
          {!results.data.items.length && (
            <p>
              Nothing new matches right now. Adjust your preferences or reset
              recommendations to explore again.
            </p>
          )}
          <section className="preferences-panel">
            <h2>Tune your taste.</h2>
            <div className="preference-grid">
              {preferences.data?.map((g) => (
                <label key={g.id}>
                  {g.name}
                  <select
                    value={g.weight}
                    disabled={change.isPending}
                    onChange={(e) =>
                      change.mutate({
                        genreId: g.id,
                        weight: Number(e.target.value),
                      })
                    }
                  >
                    <option value={-3}>Much less</option>
                    <option value={-1}>Less</option>
                    <option value={0}>Open to it</option>
                    <option value={1}>More</option>
                    <option value={3}>Love it</option>
                  </select>
                </label>
              ))}
            </div>
            {resetOpen ? (
              <div className="error-box">
                <p>
                  Start recommendations fresh? Earlier ratings, saves and
                  viewing will stop influencing recommendations. Your library
                  and viewing history stay intact.
                </p>
                <button
                  className="button outline"
                  onClick={() => setResetOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="button primary"
                  disabled={reset.isPending}
                  onClick={() => reset.mutate()}
                >
                  Start fresh
                </button>
              </div>
            ) : (
              <button
                className="button outline"
                onClick={() => setResetOpen(true)}
              >
                Reset recommendation signals
              </button>
            )}
          </section>
        </>
      )}
      {[hide.error, change.error, reset.error, preferences.error]
        .filter(Boolean)
        .map((e, i) => (
          <ErrorBox key={i} error={e!} />
        ))}
    </div>
  );
}
export function RatingControl({
  profile,
  content,
}: {
  profile: string;
  content: string;
}) {
  const client = useQueryClient();
  const current = useQuery({
    queryKey: ["rating", profile, content],
    queryFn: () =>
      api<{ score: number }>(`/profiles/${profile}/ratings/${content}`),
  });
  const rate = useMutation({
    mutationFn: (score: number) =>
      api(`/profiles/${profile}/ratings/${content}`, {
        method: "PUT",
        body: JSON.stringify({ score }),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["rating", profile, content] });
      void client.invalidateQueries({ queryKey: ["recommendations"] });
    },
  });
  return (
    <div className="rating-control">
      <p>Your rating</p>
      <div className="hero-actions">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            className={`button ${current.data?.score === n ? "primary" : "outline"}`}
            aria-label={`Rate ${n} out of 5`}
            aria-pressed={current.data?.score === n}
            disabled={rate.isPending}
            onClick={() => rate.mutate(n)}
          >
            {n} ★
          </button>
        ))}
      </div>
      {rate.error && <ErrorBox error={rate.error} />}
    </div>
  );
}
