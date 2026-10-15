"use client";
import { RatingControl } from "./discovery";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, Plus, Check, Bookmark } from "lucide-react";
import { api, type Title, type Profile, type Account } from "@/lib/api";
import { useProfile } from "@/lib/store";
import { ErrorBox } from "./catalog";
export function TitleDetail({ slug }: { slug: string }) {
  const client = useQueryClient();
  const [feedback, setFeedback] = useState("");
  const { selected } = useProfile();
  const query = useQuery({
    queryKey: ["title", slug],
    queryFn: () => api<Title>(`/catalog/${slug}`),
  });
  const account = useQuery({
    queryKey: ["account"],
    queryFn: () => api<Account>("/auth/me"),
  });
  const profiles = useQuery({
    queryKey: ["profiles"],
    queryFn: () => api<Profile[]>("/profiles"),
    enabled: !!account.data,
  });
  const profile =
    profiles.data?.find((p) => p.id === selected) ?? profiles.data?.[0];
  const library = useQuery({
    queryKey: ["library", profile?.id],
    queryFn: () => api<Title[]>(`/profiles/${profile?.id}/library`),
    enabled: !!profile,
  });
  const saved = library.data?.some((t) => t.id === query.data?.id);
  const save = useMutation({
    mutationFn: () =>
      api(`/profiles/${profile?.id}/library/${query.data?.id}`, {
        method: saved ? "DELETE" : "PUT",
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["library"] });
      setFeedback(
        saved ? "Removed from your library." : "Added to your library.",
      );
    },
  });
  if (query.isPending)
    return (
      <div className="detail-loading skeleton" aria-label="Loading title" />
    );
  if (query.error)
    return (
      <div className="page-pad">
        <ErrorBox error={query.error} />
      </div>
    );
  const t = query.data;
  return (
    <div className="detail-page">
      <Link className="back-link" href="/explore">
        <ArrowLeft size={16} />
        Back to discovery
      </Link>
      <section className="detail-hero">
        <Image
          src={t.artwork}
          alt={`Original illustrated artwork for ${t.title}`}
          fill
          priority
          sizes="100vw"
        />
        <div className="hero-overlay" />
        <div className="detail-copy">
          <span className="eyebrow">
            {t.kind === "MOVIE"
              ? "A FILM WORTH FINDING"
              : "A SERIES WORTH FINDING"}
          </span>
          <h1>{t.title}</h1>
          <div className="hero-meta">
            <span>{t.releaseYear}</span>
            <span>{t.durationMinutes} min</span>
            <span>{t.rating}</span>
            <span>{t.language}</span>
          </div>
          <p>{t.synopsis}</p>
          <div className="genre-list">
            {t.genres
              .split(", ")
              .filter(Boolean)
              .map((g) => (
                <span className="chip" key={g}>
                  {g}
                </span>
              ))}
          </div>
          <div className="hero-actions">
            {t.playableAssetId && (
              <Link
                className="button primary"
                href={account.data ? `/watch/${t.playableAssetId}` : "/login"}
              >
                Watch now
              </Link>
            )}
            {t.playableAssetId && account.data && (
              <Link
                className="button outline"
                href={`/parties?asset=${t.playableAssetId}`}
              >
                Watch together
              </Link>
            )}
            {account.data ? (
              <button
                className="button primary"
                disabled={
                  !profile ||
                  save.isPending ||
                  library.isPending ||
                  !!library.error
                }
                onClick={() => save.mutate()}
              >
                {saved ? <Check size={17} /> : <Plus size={17} />}{" "}
                {saved ? "In your library" : "Save to my library"}
              </button>
            ) : (
              <Link className="button primary" href="/login">
                <Bookmark size={17} />
                Sign in to save
              </Link>
            )}
            <a
              className="button outline"
              href={t.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Visit the film project <ArrowUpRight size={16} />
            </a>
          </div>
          <p className="status-message" role="status">
            {feedback}
          </p>
          {save.error && <ErrorBox error={save.error} />}
          <p className="availability">
            {t.playableAssetId
              ? "Ready to stream on VYBE."
              : "Catalog preview · Video is not available on VYBE yet."}
          </p>
        </div>
      </section>
      {profile && (
        <section className="page-pad">
          <RatingControl profile={profile.id} content={t.id} />
        </section>
      )}
      <section className="detail-info">
        <div>
          <span className="eyebrow">BEHIND THE STORY</span>
          <h2>Made by independent minds.</h2>
          {t.credits?.map((c) => (
            <p key={c.name + c.job}>
              <strong>{c.name}</strong>
              <span className="muted"> · {c.job}</span>
            </p>
          ))}
        </div>
        <div>
          <span className="eyebrow">OPEN CINEMA, PROPERLY CREDITED</span>
          <p>{t.attribution}</p>
          <p className="muted">
            Cover artwork is an original VYBE editorial illustration, not an
            official film poster. Durations are rounded to minutes.
          </p>
        </div>
      </section>
      {t.kind === "SERIES" && (
        <section className="page-pad">
          <h2>Episodes</h2>
          {t.episodes?.length ? (
            t.episodes.map((e) => (
              <article className="episode" key={`${e.season}-${e.number}`}>
                <h3>
                  S{e.season} · E{e.number} — {e.title}
                </h3>
                <p>{e.synopsis}</p>
                <span>{e.durationMinutes} min</span>
                {e.playableAssetId && (
                  <Link
                    className="button primary"
                    href={`/watch/${e.playableAssetId}`}
                  >
                    Watch episode
                  </Link>
                )}
              </article>
            ))
          ) : (
            <p className="muted">No episodes have been added yet.</p>
          )}
        </section>
      )}
    </div>
  );
}
