"use client";
import { EditProfile } from "./watchlists";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Bookmark, ArrowRight, LogOut } from "lucide-react";
import {
  api,
  ApiError,
  type Account,
  type Profile,
  type Title,
} from "@/lib/api";
import { useProfile } from "@/lib/store";
import { ErrorBox, TitleCard } from "./catalog";
export function MemberPage({
  mode,
}: {
  mode: "profiles" | "library" | "account";
}) {
  const router = useRouter();
  const client = useQueryClient();
  const { selected, select } = useProfile();
  const [name, setName] = useState("");
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
    enabled: mode === "library" && !!profile,
  });
  const create = useMutation({
    mutationFn: () =>
      api<Profile>("/profiles", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), color: "#b8e87c" }),
      }),
    onSuccess: (p) => {
      setName("");
      select(p.id);
      void client.invalidateQueries({ queryKey: ["profiles"] });
    },
  });
  const logout = useMutation({
    mutationFn: () => api("/auth/logout", { method: "POST" }),
    onSuccess: () => {
      select(null);
      client.clear();
      router.push("/");
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      api(`/profiles/${profile?.id}/library/${id}`, { method: "DELETE" }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["library"] }),
  });
  if (account.isPending)
    return (
      <div className="page-pad" role="status">
        Loading your space…
      </div>
    );
  if (account.error)
    return (
      <div className="empty">
        {account.error instanceof ApiError && account.error.status === 401 ? (
          <>
            <h1>A space for your stories.</h1>
            <p>Sign in to build your personal collection.</p>
            <Link className="button primary" href="/login">
              Sign in
              <ArrowRight size={16} />
            </Link>
          </>
        ) : (
          <ErrorBox error={account.error} />
        )}
      </div>
    );
  return (
    <div className="member-page">
      <span className="eyebrow">YOUR CORNER OF VYBE</span>
      <h1>
        {mode === "profiles"
          ? "Who’s discovering?"
          : mode === "library"
            ? "Keep the good ones close."
            : "Your account."}
      </h1>
      {mode !== "account" && profiles.error && (
        <ErrorBox error={profiles.error} />
      )}{" "}
      {mode === "profiles" ? (
        <>
          <p className="muted">
            Different tastes. A space for everyone. Up to five profiles.
          </p>
          <div className="profiles">
            {profiles.data?.map((p) => (
              <button
                className={`profile-card ${p.id === profile?.id ? "chosen" : ""}`}
                key={p.id}
                onClick={() => {
                  select(p.id);
                  router.push("/library");
                }}
              >
                <span style={{ background: p.color }}>
                  {p.name.slice(0, 1).toUpperCase()}
                </span>
                <strong>{p.name}</strong>
                {p.id === profile?.id && <small>Selected</small>}
              </button>
            ))}
          </div>
          {(profiles.data?.length ?? 5) < 5 && (
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate();
              }}
            >
              <label>
                New profile name
                <input
                  required
                  maxLength={40}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <button
                className="button outline"
                disabled={create.isPending || !name.trim()}
              >
                <Plus size={17} />
                Add profile
              </button>
            </form>
          )}
          {profiles.data?.map((p) => (
            <EditProfile key={p.id} profile={p} count={profiles.data.length} />
          ))}
          {create.error && <ErrorBox error={create.error} />}
        </>
      ) : mode === "library" ? (
        <>
          <Link className="button outline" href="/lists">
            Manage watchlists & collaborators
          </Link>
          <div className="library-heading">
            <p className="muted">A collection that’s unmistakably you.</p>
            <label>
              Viewing as{" "}
              <select
                aria-label="Active profile"
                value={profile?.id ?? ""}
                onChange={(e) => select(e.target.value)}
              >
                {profiles.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {library.isPending ? (
            <p role="status">Opening your library…</p>
          ) : library.error ? (
            <ErrorBox error={library.error} />
          ) : library.data?.length ? (
            <div className="card-grid">
              {library.data.map((t) => (
                <div key={t.id}>
                  <TitleCard title={t} />
                  <button
                    className="remove-button"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(t.id)}
                  >
                    Remove from library
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">
              <Bookmark />
              <h2>Your next favorite belongs here.</h2>
              <p>Save a film from its story page and find it here anytime.</p>
              <Link className="button primary" href="/explore">
                Find a story
                <ArrowRight size={17} />
              </Link>
            </div>
          )}
          {remove.error && <ErrorBox error={remove.error} />}
        </>
      ) : (
        <div className="account-dashboard">
          <div className="account-panel account-identity">
            <span className="eyebrow">ACCOUNT & SECURITY</span>
            <h2>A space that belongs to you.</h2>
            <label>Email address</label>
            <p>{account.data?.email}</p>
            <Link className="text-link" href="/forgot">
              Reset your password
              <ArrowRight size={16} />
            </Link>
            <Link className="text-link" href="/profiles">
              Manage viewing profiles
              <ArrowRight size={16} />
            </Link>
            <button
              className="button outline"
              disabled={logout.isPending}
              onClick={() => logout.mutate()}
            >
              <LogOut size={17} />
              Sign out
            </button>
            {logout.error && <ErrorBox error={logout.error} />}
          </div>
          <div className="account-destinations">
            <Link href="/for-you">
              <span className="eyebrow">YOUR TASTE</span>
              <h2>Fine-tune your discoveries.</h2>
              <p>
                Adjust your preferences and see why a story was recommended.
              </p>
              <span className="text-link">
                Recommendations & preferences <ArrowRight size={16} />
              </span>
            </Link>
            <Link href="/history">
              <span className="eyebrow">YOUR ACTIVITY</span>
              <h2>Every story, in your hands.</h2>
              <p>Review what you watched and manage saved playback history.</p>
              <span className="text-link">
                Watch history <ArrowRight size={16} />
              </span>
            </Link>
            <Link href="/lists">
              <span className="eyebrow">YOUR PEOPLE</span>
              <h2>A good list is worth sharing.</h2>
              <p>
                Manage watchlists and invite collaborators to help choose what
                is next.
              </p>
              <span className="text-link">
                Shared watchlists <ArrowRight size={16} />
              </span>
            </Link>
            <Link href="/help">
              <span className="eyebrow">NEED A HAND?</span>
              <h2>Get more out of VYBE.</h2>
              <p>
                A guide to profiles, discovery, playback, and watching together.
              </p>
              <span className="text-link">
                Help & getting started <ArrowRight size={16} />
              </span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
