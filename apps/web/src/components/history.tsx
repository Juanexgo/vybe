"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Profile } from "@/lib/api";
import { useProfile } from "@/lib/store";
import { ErrorBox } from "./catalog";
type Entry = {
  assetId: string;
  title: string;
  episodeTitle: string | null;
  artwork: string;
  position: number;
  duration: number;
  completed: boolean;
};
export function History({ unfinished = false }: { unfinished?: boolean }) {
  const selected = useProfile((s) => s.selected),
    client = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const profiles = useQuery({
    queryKey: ["profiles"],
    queryFn: () => api<Profile[]>("/profiles"),
    retry: false,
  });
  const profile =
    profiles.data?.find((p) => p.id === selected) ?? profiles.data?.[0];
  const history = useQuery({
    queryKey: ["history", profile?.id, unfinished],
    queryFn: () =>
      api<Entry[]>(
        `/playback/history?profile=${profile!.id}&unfinished=${unfinished}`,
      ),
    enabled: !!profile,
  });
  const clear = useMutation({
    mutationFn: () =>
      api(`/playback/history?profile=${profile!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      setConfirm(false);
      void client.invalidateQueries({ queryKey: ["history"] });
      void client.invalidateQueries({ queryKey: ["playback"] });
    },
  });
  return (
    <div className="member-page">
      <span className="eyebrow">YOUR SCREENING ROOM</span>
      <h1>
        {unfinished ? "Pick up the story." : "Stories you’ve spent time with."}
      </h1>
      <div className="hero-actions">
        <Link
          className="button outline"
          href={unfinished ? "/history" : "/continue"}
        >
          {unfinished ? "View watch history" : "Continue watching"}
        </Link>
      </div>
      {profiles.error ? (
        <>
          <p>Sign in to see your viewing history.</p>
          <Link href="/login" className="button primary">
            Sign in
          </Link>
        </>
      ) : history.error ? (
        <ErrorBox error={history.error} />
      ) : history.isPending ? (
        <p role="status">Loading your history…</p>
      ) : !history.data.length ? (
        <p className="muted">
          {unfinished
            ? "You’re all caught up. Find your next story in Discover."
            : "Your viewing history will appear after you play a video."}
        </p>
      ) : (
        <div className="history-grid">
          {history.data.map((e) => (
            <Link
              className="history-entry"
              key={e.assetId}
              href={`/watch/${e.assetId}`}
            >
              <img src={e.artwork} alt="" />
              <div>
                <h2>{e.title}</h2>
                {e.episodeTitle && <p>{e.episodeTitle}</p>}
                <progress
                  value={e.position}
                  max={e.duration}
                  aria-label={`${e.title} viewing progress`}
                />
                <p className="muted">
                  {e.completed
                    ? "Watched · Watch again"
                    : `${Math.floor(e.position / 60)} of ${Math.ceil(e.duration / 60)} minutes · Resume`}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
      {!unfinished && history.data?.length ? (
        confirm ? (
          <div className="error-box">
            <p>Clear this profile’s history and saved playback positions?</p>
            <button
              className="button outline"
              onClick={() => setConfirm(false)}
            >
              Cancel
            </button>
            <button
              className="button primary"
              disabled={clear.isPending}
              onClick={() => clear.mutate()}
            >
              Clear history
            </button>
          </div>
        ) : (
          <button className="button outline" onClick={() => setConfirm(true)}>
            Clear viewing history
          </button>
        )
      ) : null}
      {clear.error && <ErrorBox error={clear.error} />}
    </div>
  );
}
