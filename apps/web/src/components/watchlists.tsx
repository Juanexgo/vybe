"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Profile, type Title } from "@/lib/api";
import { useProfile } from "@/lib/store";
import { ErrorBox, TitleCard } from "./catalog";
type List = { id: string; name: string; owner: string; size: number };
type Detail = List & {
  items: Title[];
  members: { id: string; name: string }[];
};
export function Watchlists({ list }: { list?: string }) {
  const selected = useProfile((s) => s.selected),
    client = useQueryClient(),
    router = useRouter();
  const [name, setName] = useState(""),
    [invite, setInvite] = useState(""),
    [ready, setReady] = useState(false),
    [link, setLink] = useState(""),
    [confirm, setConfirm] = useState(false),
    [search, setSearch] = useState("");
  useEffect(() => {
    setInvite(location.hash.slice(1));
    setReady(true);
  }, []);
  const profiles = useQuery({
    queryKey: ["profiles"],
    queryFn: () => api<Profile[]>("/profiles"),
    retry: false,
  });
  const p = profiles.data?.find((p) => p.id === selected) ?? profiles.data?.[0];
  const lists = useQuery({
    queryKey: ["watchlists", p?.id],
    queryFn: () => api<List[]>(`/watchlists?profile=${p!.id}`),
    enabled: !!p,
  });
  const detail = useQuery({
    queryKey: ["watchlist", list, p?.id, ready],
    enabled: !!p && !!list && ready,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (invite) {
        await api(`/watchlists/${list}/join`, {
          method: "POST",
          body: JSON.stringify({ profile: p!.id, invite }),
        });
        history.replaceState(null, "", location.pathname);
        setInvite("");
      }
      return api<Detail>(`/watchlists/${list}?profile=${p!.id}`);
    },
  });
  const catalog = useQuery({
    queryKey: ["watchlist-search", search],
    queryFn: () =>
      api<{ items: Title[] }>(`/catalog?q=${encodeURIComponent(search)}`),
    enabled: !!list && !!detail.data && search.length > 1,
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["watchlists"] });
    void client.invalidateQueries({ queryKey: ["watchlist", list] });
    void client.invalidateQueries({ queryKey: ["library"] });
  };
  const create = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/watchlists", {
        method: "POST",
        body: JSON.stringify({ profile: p!.id, name }),
      }),
    onSuccess: (r) => {
      setName("");
      refresh();
      router.push(`/lists/${r.id}`);
    },
  });
  const rename = useMutation({
    mutationFn: () =>
      api(`/watchlists/${list}`, {
        method: "PUT",
        body: JSON.stringify({ profile: p!.id, name }),
      }),
    onSuccess: () => {
      setName("");
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: () =>
      api(`/watchlists/${list}?profile=${p!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      refresh();
      router.push("/lists");
    },
  });
  const item = useMutation({
    mutationFn: ({ id, add }: { id: string; add: boolean }) =>
      api(`/watchlists/${list}/items/${id}?profile=${p!.id}`, {
        method: add ? "PUT" : "DELETE",
      }),
    onSuccess: refresh,
  });
  const invitation = useMutation({
    mutationFn: () =>
      api<{ invite: string }>(`/watchlists/${list}/invite?profile=${p!.id}`, {
        method: "POST",
      }),
    onSuccess: (r) => setLink(`${location.origin}/lists/${list}#${r.invite}`),
  });
  const member = useMutation({
    mutationFn: (id: string) =>
      api(`/watchlists/${list}/members/${id}?profile=${p!.id}`, {
        method: "DELETE",
      }),
    onSuccess: (_, id) => {
      refresh();
      if (id === p!.id) router.push("/lists");
    },
  });
  const owner = detail.data?.owner === p?.id,
    personal = detail.data?.name === "My list";
  return (
    <div className="member-page">
      <span className="eyebrow">STORIES TO COME BACK TO</span>
      <h1>
        {list
          ? (detail.data?.name ?? "Your watchlist")
          : "Make room for your favorites."}
      </h1>
      <Link className="back-link" href={list ? "/lists" : "/library"}>
        {list ? "← All watchlists" : "← My library"}
      </Link>
      {profiles.error ? (
        <>
          <ErrorBox error={profiles.error} />
          <Link href="/login" className="button primary">
            Sign in, then reopen your invitation
          </Link>
        </>
      ) : !p ? (
        <p role="status">Loading your profile…</p>
      ) : !list ? (
        <>
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <label>
              New watchlist name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={80}
              />
            </label>
            <button
              className="button primary"
              disabled={create.isPending || !name.trim()}
            >
              Create watchlist
            </button>
          </form>
          {lists.data?.map((l) => (
            <article className="episode" key={l.id}>
              <h2>
                <Link href={`/lists/${l.id}`}>{l.name}</Link>
              </h2>
              <p className="muted">
                {l.size} titles ·{" "}
                {l.owner === p.id ? "Your list" : "Shared with you"}
              </p>
            </article>
          ))}
        </>
      ) : detail.data ? (
        <>
          <p className="muted">
            Everyone invited can add and remove titles. Only the owner can
            manage invitations and collaborators.
          </p>
          <div className="hero-actions">
            {detail.data.members.map((m) => (
              <span className="chip" key={m.id}>
                {m.name}
                {owner && m.id !== p.id && (
                  <button
                    aria-label={`Remove ${m.name}`}
                    disabled={member.isPending}
                    onClick={() => member.mutate(m.id)}
                  >
                    {" "}
                    ×
                  </button>
                )}
              </span>
            ))}
            {!owner && (
              <button
                className="button outline"
                disabled={member.isPending}
                onClick={() => member.mutate(p.id)}
              >
                Leave shared list
              </button>
            )}
          </div>
          {owner && !personal && (
            <section className="preferences-panel">
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  rename.mutate();
                }}
              >
                <label>
                  Rename watchlist
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={80}
                  />
                </label>
                <button
                  className="button outline"
                  disabled={rename.isPending || !name.trim()}
                >
                  Save name
                </button>
              </form>
              <button
                className="button outline"
                disabled={invitation.isPending}
                onClick={() => invitation.mutate()}
              >
                Create collaborator invitation
              </button>
              {link && (
                <label>
                  Copy invitation link · valid for seven days
                  <input
                    readOnly
                    value={link}
                    onFocus={(e) => e.target.select()}
                  />
                </label>
              )}
              <p className="muted">New invitations replace older links.</p>
              {confirm ? (
                <>
                  <p>Delete this list for every collaborator?</p>
                  <button
                    className="button outline"
                    onClick={() => setConfirm(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="button primary"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate()}
                  >
                    Confirm delete list
                  </button>
                </>
              ) : (
                <button
                  className="button outline"
                  onClick={() => setConfirm(true)}
                >
                  Delete watchlist
                </button>
              )}
            </section>
          )}
          <label>
            Find a title to add
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              maxLength={200}
            />
          </label>
          {search.length > 1 && (
            <div className="genre-options">
              {catalog.data?.items.map((t) => (
                <button
                  className="button outline small"
                  key={t.id}
                  disabled={
                    item.isPending ||
                    detail.data.items.some((i) => i.id === t.id)
                  }
                  onClick={() => item.mutate({ id: t.id, add: true })}
                >
                  + {t.title}
                </button>
              ))}
            </div>
          )}
          <div className="card-grid">
            {detail.data.items.map((t) => (
              <article key={t.id}>
                <TitleCard title={t} />
                <button
                  className="button outline small"
                  disabled={item.isPending}
                  onClick={() => item.mutate({ id: t.id, add: false })}
                >
                  Remove {t.title}
                </button>
              </article>
            ))}
          </div>
          {detail.data.items.length === 0 && (
            <p className="muted">
              This list is ready for its first story. Search above to add one.
            </p>
          )}
        </>
      ) : detail.isPending ? (
        <p role="status">Opening watchlist…</p>
      ) : null}
      {[
        lists.error,
        detail.error,
        create.error,
        rename.error,
        remove.error,
        item.error,
        invitation.error,
        member.error,
        catalog.error,
      ]
        .filter(Boolean)
        .map((e, i) => (
          <ErrorBox key={i} error={e!} />
        ))}
    </div>
  );
}
export function EditProfile({
  profile,
  count,
}: {
  profile: Profile;
  count: number;
}) {
  const client = useQueryClient(),
    select = useProfile((s) => s.select);
  const [open, setOpen] = useState(false),
    [name, setName] = useState(profile.name),
    [color, setColor] = useState(profile.color),
    [confirm, setConfirm] = useState(false);
  const save = useMutation({
    mutationFn: () =>
      api(`/profiles/${profile.id}`, {
        method: "PUT",
        body: JSON.stringify({ name, color }),
      }),
    onSuccess: () => {
      setOpen(false);
      void client.invalidateQueries({ queryKey: ["profiles"] });
    },
  });
  const remove = useMutation({
    mutationFn: () => api(`/profiles/${profile.id}`, { method: "DELETE" }),
    onSuccess: () => {
      select(null);
      client.removeQueries({ queryKey: ["profiles"] });
      void client.invalidateQueries();
    },
  });
  return (
    <div className="episode">
      <button className="button outline small" onClick={() => setOpen(!open)}>
        Edit {profile.name}
      </button>
      {open && (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <label>
            Profile name
            <input
              required
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Profile color
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </label>
          <button className="button primary" disabled={save.isPending}>
            Save profile
          </button>
          {count > 1 &&
            (confirm ? (
              <>
                <p>
                  Delete this profile, its history and owned lists permanently?
                </p>
                <button
                  type="button"
                  className="button outline"
                  onClick={() => setConfirm(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="button outline"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate()}
                >
                  Confirm delete profile
                </button>
              </>
            ) : (
              <button
                type="button"
                className="button outline"
                onClick={() => setConfirm(true)}
              >
                Delete profile
              </button>
            ))}
        </form>
      )}
      {(save.error || remove.error) && (
        <ErrorBox error={(save.error || remove.error)!} />
      )}
    </div>
  );
}
