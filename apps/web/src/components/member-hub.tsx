"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Play, Sparkles, Users, ListVideo } from "lucide-react";
import { api, type Account, type Profile } from "@/lib/api";
import { useProfile } from "@/lib/store";
type Resume = {
  assetId: string;
  title: string;
  episodeTitle: string | null;
  artwork: string;
  position: number;
  duration: number;
};
export function MemberHub() {
  const selected = useProfile((s) => s.selected);
  const account = useQuery({
    queryKey: ["account"],
    queryFn: () => api<Account>("/auth/me"),
    retry: false,
  });
  const profiles = useQuery({
    queryKey: ["profiles"],
    queryFn: () => api<Profile[]>("/profiles"),
    enabled: !!account.data,
  });
  const profile =
    profiles.data?.find((p) => p.id === selected) ?? profiles.data?.[0];
  const history = useQuery({
    queryKey: ["history", profile?.id, true],
    queryFn: () =>
      api<Resume[]>(`/playback/history?profile=${profile!.id}&unfinished=true`),
    enabled: !!account.data && !!profile,
  });
  if (!account.data) return null;
  return (
    <section className="member-hub" aria-label="Your viewing dashboard">
      <div className="hub-heading">
        <div>
          <span className="eyebrow">MADE FOR YOUR MOMENT</span>
          <h2>
            {profile
              ? `${profile.name}, make tonight yours.`
              : "Make tonight yours."}
          </h2>
        </div>
        <Link href="/for-you">
          Your recommendations <ArrowUpRight size={16} />
        </Link>
      </div>
      <div className="hub-shortcuts">
        <Link href="/discover">
          <Sparkles />
          <div>
            <strong>Find your mood</strong>
            <span>A feeling, a theme, or just 15 minutes.</span>
          </div>
          <ArrowUpRight size={17} />
        </Link>
        <Link href="/parties">
          <Users />
          <div>
            <strong>Make it a movie night</strong>
            <span>Watch in sync. Chat as it happens.</span>
          </div>
          <ArrowUpRight size={17} />
        </Link>
        <Link href="/lists">
          <ListVideo />
          <div>
            <strong>Build the list together</strong>
            <span>Invite someone to your next watchlist.</span>
          </div>
          <ArrowUpRight size={17} />
        </Link>
      </div>
      {history.isPending && profile && (
        <p className="muted" role="status">
          Finding where you left off…
        </p>
      )}
      {history.error && (
        <p role="alert" className="muted">
          Couldn’t load your progress.{" "}
          <button className="text-link" onClick={() => void history.refetch()}>
            Try again
          </button>
        </p>
      )}
      {!!history.data?.length && (
        <div className="resume-section">
          <div className="resume-heading">
            <h3>Continue watching</h3>
            <Link href="/continue">
              View all <ArrowUpRight size={15} />
            </Link>
          </div>
          <div className="resume-rail">
            {history.data.slice(0, 6).map((entry) => (
              <Link
                className="resume-card"
                href={`/watch/${entry.assetId}`}
                key={entry.assetId}
              >
                <div className="resume-art">
                  <img src={entry.artwork} alt="" />
                  <span>
                    <Play size={21} fill="currentColor" />
                  </span>
                  <progress
                    value={entry.position}
                    max={Math.max(entry.duration, 1)}
                    aria-label={`${entry.title} viewing progress`}
                  />
                </div>
                <strong>{entry.title}</strong>
                {entry.episodeTitle && <small>{entry.episodeTitle}</small>}
                <small>
                  {Math.max(
                    0,
                    Math.ceil((entry.duration - entry.position) / 60),
                  )}{" "}
                  min left
                </small>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
