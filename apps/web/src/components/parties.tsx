"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { api, type Profile } from "@/lib/api";
import { useProfile } from "@/lib/store";
import { ErrorBox } from "./catalog";
const Player = dynamic(() => import("./player").then((m) => m.Player), {
  ssr: false,
});
type Room = {
  id: string;
  name: string;
  assetId: string;
  ownerProfile: string;
  position: number;
  playing: boolean;
  version: number;
  serverTime: number;
  expiresAt: string;
  members: (Profile & { online: boolean })[];
};
type Message = {
  id: string;
  profileId: string;
  name: string;
  text: string;
  kind: string;
};
function useActiveProfile() {
  const selected = useProfile((s) => s.selected);
  const query = useQuery({
    queryKey: ["profiles"],
    queryFn: () => api<Profile[]>("/profiles"),
    retry: false,
  });
  return {
    profile: query.data?.find((p) => p.id === selected) ?? query.data?.[0],
    error: query.error,
  };
}
export function PartyLobby({ asset }: { asset?: string }) {
  const { profile, error } = useActiveProfile(),
    router = useRouter();
  const [name, setName] = useState("Our screening room");
  const rooms = useQuery({
    queryKey: ["parties", profile?.id],
    queryFn: () =>
      api<{ id: string; name: string; expiresAt: string }[]>(
        `/parties?profile=${profile!.id}`,
      ),
    enabled: !!profile,
  });
  const create = useMutation({
    mutationFn: () =>
      api<{ id: string; invite: string }>("/parties", {
        method: "POST",
        body: JSON.stringify({ profile: profile!.id, asset, name }),
      }),
    onSuccess: (r) => router.push(`/party/${r.id}#${r.invite}`),
  });
  return (
    <div className="member-page">
      <span className="eyebrow">GOOD STORIES, SHARED</span>
      <h1>Your people. One screening.</h1>
      <p className="muted">
        A private room for up to 16 profiles. The host controls playback;
        everyone can chat, react and help choose the next film. Rooms last four
        hours.
      </p>
      {error ? (
        <>
          <ErrorBox error={error} />
          <Link href="/login" className="button primary">
            Sign in
          </Link>
        </>
      ) : (
        <>
          {asset ? (
            <form
              className="discovery-form"
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate();
              }}
            >
              <label>
                Room name
                <input
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <button
                className="button primary"
                disabled={!profile || create.isPending}
              >
                Create screening room
              </button>
            </form>
          ) : (
            <Link className="button primary" href="/explore">
              Choose a playable title to start a room
            </Link>
          )}
          {rooms.data?.map((r) => (
            <article className="episode" key={r.id}>
              <h2>{r.name}</h2>
              <p className="muted">
                Expires {new Date(r.expiresAt).toLocaleTimeString()}
              </p>
              <Link className="button outline" href={`/party/${r.id}`}>
                Return to room
              </Link>
            </article>
          ))}
          {rooms.data?.length === 0 && (
            <p className="muted">You have no active rooms.</p>
          )}
          {(create.error || rooms.error) && (
            <ErrorBox error={(create.error || rooms.error)!} />
          )}
        </>
      )}
    </div>
  );
}
export function PartyRoom({ room }: { room: string }) {
  const { profile, error } = useActiveProfile();
  const [invite, setInvite] = useState(""),
    [ready, setReady] = useState(false),
    [failure, setFailure] = useState("");
  useEffect(() => {
    setInvite(location.hash.slice(1));
    setReady(true);
  }, []);
  const enter = useQuery({
    queryKey: ["party-entry", room, profile?.id, ready],
    enabled: !!profile && ready,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (invite)
        await api(`/parties/${room}/join`, {
          method: "POST",
          body: JSON.stringify({ profile: profile!.id, invite }),
        });
      const r = await api<Room>(`/parties/${room}?profile=${profile!.id}`);
      history.replaceState(null, "", location.pathname);
      return r;
    },
  });
  if (error)
    return (
      <div className="member-page">
        <p>Sign in, then open your invitation again to join.</p>
        <Link href="/login" className="button primary">
          Sign in
        </Link>
      </div>
    );
  if (enter.error)
    return (
      <div className="member-page">
        <ErrorBox error={enter.error} />
        <Link href="/parties">Back to rooms</Link>
      </div>
    );
  if (!profile || !enter.data)
    return (
      <div className="member-page" role="status">
        Opening the screening room…
      </div>
    );
  return (
    <ConnectedRoom
      key={`${room}-${profile.id}`}
      initial={enter.data}
      profile={profile}
      failure={failure}
      setFailure={setFailure}
    />
  );
}
function ConnectedRoom({
  initial,
  profile,
  failure,
  setFailure,
}: {
  initial: Room;
  profile: Profile;
  failure: string;
  setFailure: (s: string) => void;
}) {
  const [room, setRoom] = useState(initial),
    [messages, setMessages] = useState<Message[]>([]),
    [status, setStatus] = useState("Connecting"),
    [text, setText] = useState(""),
    [video, setVideo] = useState<HTMLVideoElement | null>(null),
    [needsPlay, setNeedsPlay] = useState(false),
    [inviteLink, setInviteLink] = useState(""),
    [confirmLeave, setConfirmLeave] = useState(false);
  const socket = useRef<WebSocket | null>(null),
    latest = useRef(initial),
    offset = useRef(0),
    suppressUntil = useRef(0),
    router = useRouter();
  const host = room.ownerProfile === profile.id;
  const bindVideo = useCallback(
    (v: HTMLVideoElement | null) => setVideo(v),
    [],
  );
  const send = useCallback(
    (payload: object) => {
      if (socket.current?.readyState !== WebSocket.OPEN) {
        setFailure("The room is reconnecting. Try again when it is live.");
        return false;
      }
      socket.current.send(JSON.stringify(payload));
      return true;
    },
    [setFailure],
  );
  useEffect(() => {
    let stopped = false,
      retry = 0,
      timer: ReturnType<typeof setTimeout>;
    let ping: ReturnType<typeof setInterval>;
    const connect = () => {
      if (stopped) return;
      const endpoint = process.env.NEXT_PUBLIC_PARTY_WS_URL ?? `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/party-socket`;
      const url = new URL(endpoint);url.searchParams.set("room",initial.id);url.searchParams.set("profile",profile.id);
      const ws = new WebSocket(url);
      socket.current = ws;
      ws.onopen = () => {
        retry = 0;
        setStatus("Live");
        setFailure("");
        const beat = () =>
          ws.readyState === WebSocket.OPEN &&
          ws.send(JSON.stringify({ type: "ping", clientTime: Date.now() }));
        beat();
        ping = setInterval(beat, 5000);
      };
      ws.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          const p = event.payload;
          if (event.type === "state") {
            const r = p as Room;
            if (
              r.version > latest.current.version ||
              (r.version === latest.current.version &&
                r.serverTime >= latest.current.serverTime)
            ) {
              latest.current = r;
              setRoom(r);
            }
          } else if (event.type === "messages") setMessages(p);
          else if (event.type === "pong")
            offset.current = p.serverTime - (p.clientTime + Date.now()) / 2;
          else if (event.type === "error") setFailure(p.message);
          else if (event.type === "closed") {
            stopped = true;
            setStatus("Closed");
            setFailure(p.reason);
            ws.close();
          } else if (event.type === "membership" && p.left === profile.id) {
            stopped = true;
            ws.close();
            router.push("/parties");
          }
        } catch {
          setFailure(
            "The room sent an unreadable update. Reconnect to refresh.",
          );
        }
      };
      ws.onerror = () => setStatus("Reconnecting");
      ws.onclose = (e) => {
        clearInterval(ping);
        if (stopped) return;
        if (e.code === 1008) {
          stopped = true;
          setStatus("Unavailable");
          setFailure(
            "The room or your session expired. Sign in again or request a new invitation.",
          );
          return;
        }
        setStatus("Reconnecting");
        timer = setTimeout(connect, Math.min(10000, 1000 * 2 ** retry++));
      };
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(ping);
      socket.current?.close();
      socket.current = null;
    };
  }, [initial.id, profile.id, router, setFailure]);
  useEffect(() => {
    if (!video) return;
    const apply = () => {
      const r = latest.current;
      if (!Number.isFinite(video.duration)) return;
      const target = Math.min(
        video.duration,
        r.position +
          (r.playing
            ? Math.max(0, Date.now() + offset.current - r.serverTime) / 1000
            : 0),
      );
      suppressUntil.current = Date.now() + 700;
      if (Math.abs(video.currentTime - target) > 0.8)
        video.currentTime = target;
      if (r.playing && video.paused)
        void video
          .play()
          .then(() => setNeedsPlay(false))
          .catch(() => setNeedsPlay(true));
      else if (!r.playing && !video.paused) video.pause();
    };
    const control = () => {
      if (host && Date.now() > suppressUntil.current)
        send({
          type: "sync",
          position: video.currentTime,
          playing: !video.paused && !video.ended,
        });
    };
    video.addEventListener("loadedmetadata", apply);
    for (const type of ["play", "pause", "seeked", "ended"])
      video.addEventListener(type, control);
    apply();
    const tick = setInterval(() => {
      if (host) {
        if (!video.paused && Date.now() > suppressUntil.current) control();
      } else apply();
    }, 5000);
    return () => {
      clearInterval(tick);
      video.removeEventListener("loadedmetadata", apply);
      for (const type of ["play", "pause", "seeked", "ended"])
        video.removeEventListener(type, control);
    };
  }, [video, host, send]);
  useEffect(() => {
    if (!video || !Number.isFinite(video.duration)) return;
    const r = room;
    const target = Math.min(
      video.duration,
      r.position +
        (r.playing
          ? Math.max(0, Date.now() + offset.current - r.serverTime) / 1000
          : 0),
    );
    suppressUntil.current = Date.now() + 700;
    if (Math.abs(video.currentTime - target) > 0.8) video.currentTime = target;
    if (r.playing && video.paused)
      void video
        .play()
        .then(() => setNeedsPlay(false))
        .catch(() => setNeedsPlay(true));
    else if (!r.playing) video.pause();
  }, [room, video]);
  const invitation = useMutation({
    mutationFn: () =>
      api<{ invite: string }>(
        `/parties/${room.id}/invite?profile=${profile.id}`,
        { method: "POST" },
      ),
    onSuccess: (r) =>
      setInviteLink(`${location.origin}/party/${room.id}#${r.invite}`),
  });
  const leave = useMutation({
    mutationFn: () =>
      api(`/parties/${room.id}/membership?profile=${profile.id}`, {
        method: "DELETE",
      }),
    onSuccess: () => router.push("/parties"),
  });
  return (
    <div className="party-page">
      <div className="party-heading">
        <div>
          <span className="eyebrow">WATCH TOGETHER</span>
          <h1>{room.name}</h1>
          <p role="status">
            {status} · {host ? "You’re the host" : "Playback follows the host"}{" "}
            · Expires {new Date(room.expiresAt).toLocaleTimeString()}
          </p>
        </div>
        <Link href="/parties" className="button outline">
          My rooms
        </Link>
      </div>
      {failure && (
        <p className="error-box" role="alert">
          {failure}
        </p>
      )}
      <div className="party-layout">
        <section>
          <Player key={room.assetId} asset={room.assetId} onVideo={bindVideo} />
          {needsPlay && (
            <button
              className="button primary"
              onClick={() =>
                void video
                  ?.play()
                  .then(() => setNeedsPlay(false))
                  .catch(() =>
                    setFailure("Playback could not start. Retry the player."),
                  )
              }
            >
              Enable playback on this device
            </button>
          )}
          {host && (
            <div className="preferences-panel">
              <button
                className="button outline"
                disabled={invitation.isPending}
                onClick={() => invitation.mutate()}
              >
                Create new invitation link
              </button>
              <p className="muted">
                A new link replaces the previous invitation. Existing members
                stay in the room.
              </p>
              {inviteLink && (
                <label>
                  Copy and share this private link
                  <input
                    readOnly
                    value={inviteLink}
                    onFocus={(e) => e.target.select()}
                  />
                </label>
              )}
              {invitation.error && <ErrorBox error={invitation.error} />}
            </div>
          )}
          <GroupMatch room={room.id} profile={profile.id} host={host} />
        </section>
        <aside className="party-chat">
          <h2>In the room</h2>
          <ul className="party-members">
            {room.members.map((m) => (
              <li key={m.id}>
                <span className={m.online ? "presence online" : "presence"} />
                {m.name}
                {m.id === room.ownerProfile ? " · Host" : ""}
                <small>{m.online ? "Online" : "Away"}</small>
              </li>
            ))}
          </ul>
          <h2>Conversation</h2>
          <div
            className="chat-log"
            role="log"
            aria-label="Room messages"
            aria-live="polite"
          >
            {messages.length === 0 ? (
              <p className="muted">Say hello to your screening companions.</p>
            ) : (
              messages.map((m) => (
                <p key={m.id}>
                  <strong>{m.name}</strong>
                  <span>{m.text}</span>
                </p>
              ))
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (
                text.trim() &&
                send({
                  type: "chat",
                  id: crypto.randomUUID(),
                  text: text.trim(),
                })
              )
                setText("");
            }}
          >
            <label>
              Message
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={500}
                required
                disabled={status !== "Live"}
              />
            </label>
            <button className="button primary" disabled={status !== "Live"}>
              Send message
            </button>
          </form>
          <div className="hero-actions">
            {["❤️", "😂", "👏", "😮", "🔥"].map((emoji) => (
              <button
                key={emoji}
                className="button outline small"
                aria-label={`React ${emoji}`}
                disabled={status !== "Live"}
                onClick={() =>
                  send({
                    type: "reaction",
                    id: crypto.randomUUID(),
                    text: emoji,
                  })
                }
              >
                {emoji}
              </button>
            ))}
          </div>
          {confirmLeave ? (
            <div>
              <p>{host ? "End this room for everyone?" : "Leave this room?"}</p>
              <button
                className="button outline"
                onClick={() => setConfirmLeave(false)}
              >
                Cancel
              </button>
              <button
                className="button primary"
                disabled={leave.isPending}
                onClick={() => leave.mutate()}
              >
                Confirm {host ? "end" : "leave"}
              </button>
            </div>
          ) : (
            <button
              className="button outline"
              onClick={() => setConfirmLeave(true)}
            >
              {host ? "End screening" : "Leave room"}
            </button>
          )}
          {leave.error && <ErrorBox error={leave.error} />}
        </aside>
      </div>
    </div>
  );
}
function GroupMatch({
  room,
  profile,
  host,
}: {
  room: string;
  profile: string;
  host: boolean;
}) {
  const client = useQueryClient();
  const genres = useQuery({
    queryKey: ["preferences", profile],
    queryFn: () =>
      api<{ id: number; name: string }[]>(`/profiles/${profile}/preferences`),
  });
  const prefs = useQuery({
    queryKey: ["party-preferences", room, profile],
    queryFn: () =>
      api<number[]>(`/parties/${room}/preferences?profile=${profile}`),
  });
  const matches = useQuery({
    queryKey: ["party-match", room, profile],
    queryFn: () =>
      api<{
        items: { id: string; title: string; assetId: string; score: number }[];
        explanation: string;
      }>(`/parties/${room}/match?profile=${profile}`),
    refetchInterval: 5000,
  });
  const refresh = () =>
    void client.invalidateQueries({ queryKey: ["party-match", room] });
  const preference = useMutation({
    mutationFn: (values: number[]) =>
      api(`/parties/${room}/preferences`, {
        method: "PUT",
        body: JSON.stringify({ profile, genres: values }),
      }),
    onSuccess: () => {
      void client.invalidateQueries({
        queryKey: ["party-preferences", room, profile],
      });
      refresh();
    },
  });
  const vote = useMutation({
    mutationFn: ({ content, value }: { content: string; value: number }) =>
      api(`/parties/${room}/votes/${content}`, {
        method: "PUT",
        body: JSON.stringify({ profile, vote: value }),
      }),
    onSuccess: refresh,
  });
  const select = useMutation({
    mutationFn: (asset: string) =>
      api(`/parties/${room}/selection`, {
        method: "POST",
        body: JSON.stringify({ profile, asset }),
      }),
    onSuccess: refresh,
  });
  return (
    <section className="preferences-panel">
      <span className="eyebrow">VYBE MATCH</span>
      <h2>Find your common ground.</h2>
      <p>
        Choose up to five genres. Vote on playable films; the host makes the
        final selection.
      </p>
      <div className="genre-options">
        {genres.data?.map((g) => (
          <label key={g.id}>
            <input
              type="checkbox"
              checked={prefs.data?.includes(g.id) ?? false}
              disabled={
                !prefs.data ||
                preference.isPending ||
                (!prefs.data.includes(g.id) && prefs.data.length >= 5)
              }
              onChange={(e) =>
                preference.mutate(
                  e.target.checked
                    ? [...prefs.data!, g.id]
                    : prefs.data!.filter((id) => id !== g.id),
                )
              }
            />
            {g.name}
          </label>
        ))}
      </div>
      <p className="muted">{matches.data?.explanation}</p>
      {matches.data?.items.map((c) => (
        <article className="episode" key={c.id}>
          <h3>{c.title}</h3>
          <div className="hero-actions">
            <button
              className="button outline small"
              disabled={vote.isPending}
              onClick={() => vote.mutate({ content: c.id, value: 1 })}
            >
              Vote yes
            </button>
            <button
              className="button outline small"
              disabled={vote.isPending}
              onClick={() => vote.mutate({ content: c.id, value: -1 })}
            >
              Vote no
            </button>
            <button
              className="button outline small"
              disabled={vote.isPending}
              onClick={() => vote.mutate({ content: c.id, value: 0 })}
            >
              Clear vote
            </button>
            {host && (
              <button
                className="button primary small"
                disabled={select.isPending}
                onClick={() => select.mutate(c.assetId)}
              >
                Watch this together
              </button>
            )}
          </div>
        </article>
      ))}
      {matches.data?.items.length === 0 && (
        <p>No playable films are available yet.</p>
      )}
      {[
        genres.error,
        prefs.error,
        matches.error,
        preference.error,
        vote.error,
        select.error,
      ]
        .filter(Boolean)
        .map((e, i) => (
          <ErrorBox key={i} error={e!} />
        ))}
    </section>
  );
}
