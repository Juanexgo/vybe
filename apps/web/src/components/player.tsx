"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Hls from "hls.js";
import { useQuery } from "@tanstack/react-query";
import { api, type Profile } from "@/lib/api";
import { useProfile } from "@/lib/store";
import { ErrorBox } from "./catalog";
type Playback = {
  title: string;
  manifest: string;
  duration: number;
  position: number;
  subtitles: { id: string; language: string; label: string }[];
};
export function Player({
  asset,
  onVideo,
}: {
  asset: string;
  onVideo?: (video: HTMLVideoElement | null) => void;
}) {
  const selected = useProfile((s) => s.selected);
  const profiles = useQuery({
    queryKey: ["profiles"],
    queryFn: () => api<Profile[]>("/profiles"),
  });
  const profile =
    profiles.data?.find((p) => p.id === selected) ?? profiles.data?.[0];
  const info = useQuery({
    queryKey: ["playback", asset, profile?.id],
    queryFn: () => api<Playback>(`/playback/${asset}?profile=${profile!.id}`),
    enabled: !!profile,
    refetchOnWindowFocus: false,
  });
  if (profiles.error || info.error)
    return (
      <div className="member-page">
        <ErrorBox error={(profiles.error ?? info.error)!} />
        <Link className="button primary" href="/login">
          Sign in
        </Link>
      </div>
    );
  if (!info.data || !profile)
    return (
      <div className="member-page" role="status">
        Loading your screening…
      </div>
    );
  return (
    <Screen
      key={`${asset}-${profile.id}`}
      asset={asset}
      profile={profile.id}
      info={info.data}
      onVideo={onVideo}
    />
  );
}
function Screen({
  asset,
  profile,
  info,
  onVideo,
}: {
  asset: string;
  profile: string;
  info: Playback;
  onVideo?: (video: HTMLVideoElement | null) => void;
}) {
  const video = useRef<HTMLVideoElement>(null),
    hls = useRef<Hls | null>(null),
    session = useRef<string | null>(null),
    lastSaved = useRef(0),
    saving = useRef(false);
  const [audioTracks, setAudioTracks] = useState<
      { index: number; name: string }[]
    >([]),
    [audioTrack, setAudioTrack] = useState(0);
  const [qualities, setQualities] = useState<
      { index: number; height: number }[]
    >([]),
    [quality, setQuality] = useState(-1),
    [subtitle, setSubtitle] = useState(-1),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const v = video.current!;
    let disposed = false;
    session.current = null;
    setError("");
    setNotice("");
    setQualities([]);
    api<{ id: string }>(`/playback/${asset}/sessions`, {
      method: "POST",
      body: JSON.stringify({ profile }),
    })
      .then((s) => {
        if (!disposed) session.current = s.id;
      })
      .catch((e) => {
        if (!disposed) setError(e.message);
      });
    const resume = () => {
      if (info.position > 0 && info.position < info.duration * 0.95)
        v.currentTime = info.position;
    };
    v.addEventListener("loadedmetadata", resume, { once: true });
    if (Hls.isSupported()) {
      const h = new Hls({ enableWorker: false });
      hls.current = h;
      h.loadSource(info.manifest);
      h.attachMedia(v);
      h.on(Hls.Events.AUDIO_TRACKS_UPDATED, () =>
        setAudioTracks(
          h.audioTracks.map((t, index) => ({
            index,
            name: t.name || t.lang || `Track ${index + 1}`,
          })),
        ),
      );
      h.on(Hls.Events.MANIFEST_PARSED, () =>
        setQualities(h.levels.map((l, index) => ({ index, height: l.height }))),
      );
      h.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal)
          setError("Playback interrupted. Check your connection and retry.");
      });
    } else if (v.canPlayType("application/vnd.apple.mpegurl")) {
      v.src = info.manifest;
    } else
      setError(
        "This browser does not support HLS video. Try a recent Safari, Chrome or Firefox.",
      );
    return () => {
      disposed = true;
      v.removeEventListener("loadedmetadata", resume);
      hls.current?.destroy();
      hls.current = null;
    };
  }, [asset, profile, info, attempt]);
  useEffect(() => {
    onVideo?.(video.current);
    return () => onVideo?.(null);
  }, [onVideo]);
  async function save(ended = false) {
    const v = video.current;
    if (!v || !session.current || saving.current) return;
    saving.current = true;
    try {
      await api(`/playback/sessions/${session.current}`, {
        method: "PUT",
        body: JSON.stringify({
          position: v.currentTime,
          ended,
          paused: v.paused,
        }),
        keepalive: true,
      });
      lastSaved.current = Date.now();
      setNotice("Progress saved");
    } catch {
      setNotice(
        "Progress could not be saved. Playback can continue; it will retry.",
      );
    } finally {
      saving.current = false;
    }
  }
  useEffect(() => {
    const hide = () => {
      if (document.visibilityState === "hidden") void save();
    };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);
  return (
    <div className="player-page">
      <Link href="/explore" className="back-link">
        ← Back to discovery
      </Link>
      <span className="eyebrow">NOW SHOWING</span>
      <h1>{info.title}</h1>
      <div className="video-frame">
        <video
          ref={video}
          controls
          playsInline
          preload="metadata"
          aria-label={`${info.title} video player`}
          onTimeUpdate={() => {
            if (Date.now() - lastSaved.current > 10000) void save();
          }}
          onPause={() => void save()}
          onEnded={() => void save(true)}
          onError={() =>
            setError("The video could not be loaded. Retry playback.")
          }
        >
          {info.subtitles.map((s) => (
            <track
              key={s.id}
              kind="subtitles"
              srcLang={s.language}
              label={s.label}
              src={`/api/playback/${asset}/subtitles/${s.id}`}
            />
          ))}
        </video>
      </div>
      <div className="player-controls">
        <label>
          Quality
          <select
            value={quality}
            onChange={(e) => {
              const n = Number(e.target.value);
              setQuality(n);
              if (hls.current) hls.current.currentLevel = n;
            }}
          >
            <option value={-1}>Automatic</option>
            {qualities.map((q) => (
              <option value={q.index} key={q.index}>
                {q.height}p
              </option>
            ))}
          </select>
        </label>
        {info.subtitles.length > 0 && (
          <label>
            Subtitles
            <select
              value={subtitle}
              onChange={(e) => {
                const n = Number(e.target.value);
                setSubtitle(n);
                const tracks = video.current?.textTracks;
                if (tracks)
                  Array.from(tracks).forEach((t, i) => {
                    t.mode = i === n ? "showing" : "disabled";
                  });
              }}
            >
              <option value={-1}>Off</option>
              {info.subtitles.map((s, i) => (
                <option key={s.id} value={i}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {audioTracks.length > 1 && (
          <label>
            Audio
            <select
              value={audioTrack}
              onChange={(e) => {
                const n = Number(e.target.value);
                setAudioTrack(n);
                if (hls.current) hls.current.audioTrack = n;
              }}
            >
              {audioTracks.map((t) => (
                <option key={t.index} value={t.index}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <span role="status" className="muted">
          {notice}
        </span>
      </div>
      {error && (
        <div className="error-box" role="alert">
          <p>{error}</p>
          <button
            className="button primary"
            onClick={() => setAttempt((a) => a + 1)}
          >
            Retry playback
          </button>
        </div>
      )}
    </div>
  );
}
