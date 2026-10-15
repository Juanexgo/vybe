"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ErrorBox } from "./catalog";
type Job = {
  id: string;
  assetId: string;
  title: string;
  status: string;
  attempts: number;
  error: string | null;
  bytes: number;
};
export function MediaAdmin() {
  const client = useQueryClient(),
    [file, setFile] = useState<File | null>(null),
    [content, setContent] = useState(""),
    [message, setMessage] = useState("");
  const [episode, setEpisode] = useState("");
  const episodes = useQuery({
    queryKey: ["admin-episodes", content],
    queryFn: () =>
      api<{ id: string; season: number; number: number; title: string }[]>(
        `/admin/content/${content}/episodes`,
      ),
    enabled: !!content,
  });
  const catalog = useQuery({
    queryKey: ["admin-catalog"],
    queryFn: () =>
      api<{ id: string; title: string; kind: string }[]>("/admin/content"),
  });
  const jobs = useQuery({
    queryKey: ["media-jobs"],
    queryFn: () => api<Job[]>("/admin/media/jobs"),
    refetchInterval: 5000,
  });
  const upload = useMutation({
    mutationFn: async () => {
      if (!file || !content) throw new Error("Choose a title and a video.");
      if (file.size > 250 * 1024 * 1024)
        throw new Error("The maximum video size is 250 MB.");
      const body = new FormData();
      body.append("file", file);
      if (episode) body.append("episode", episode);
      return api(`/admin/media/${content}`, { method: "POST", body });
    },
    onSuccess: () => {
      setMessage("Video received. The worker will validate and process it.");
      void client.invalidateQueries({ queryKey: ["media-jobs"] });
    },
  });
  const retry = useMutation({
    mutationFn: (id: string) =>
      api(`/admin/media/jobs/${id}/retry`, { method: "POST" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["media-jobs"] });
    },
  });
  if (catalog.error || jobs.error)
    return (
      <div className="member-page">
        <ErrorBox error={(catalog.error ?? jobs.error)!} />
      </div>
    );
  return (
    <div className="member-page">
      <Link className="back-link" href="/admin">
        ← Catalog management
      </Link>
      <span className="eyebrow">VYBE STUDIO</span>
      <h1>From source to screen.</h1>
      <p className="muted">
        Upload licensed MP4, MOV or WebM video, up to 250 MB. Playback becomes
        available after processing and publication.
      </p>
      <form
        className="media-upload"
        onSubmit={(e) => {
          e.preventDefault();
          setMessage("");
          upload.mutate();
        }}
      >
        <label>
          Title
          <select
            required
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setEpisode("");
            }}
          >
            <option value="">Choose a title</option>
            {catalog.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
        {catalog.data?.find((c) => c.id === content)?.kind === "SERIES" && (
          <label>
            Episode
            <select
              value={episode}
              required
              onChange={(e) => setEpisode(e.target.value)}
            >
              <option value="">Select an episode</option>
              {episodes.data?.map((e) => (
                <option value={e.id} key={e.id}>
                  S{e.season} E{e.number} · {e.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Video file
          <input
            type="file"
            required
            accept="video/mp4,video/webm,video/quicktime"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <button className="button primary" disabled={upload.isPending}>
          {upload.isPending ? "Uploading…" : "Upload and process"}
        </button>
      </form>
      <p role="status">{message}</p>
      {upload.error && <ErrorBox error={upload.error} />}{" "}
      {retry.error && <ErrorBox error={retry.error} />}
      <h2>Processing jobs</h2>
      {jobs.isPending ? (
        <p role="status">Loading jobs…</p>
      ) : !jobs.data?.length ? (
        <p className="muted">No videos have been uploaded yet.</p>
      ) : (
        <div className="admin-list">
          {jobs.data.map((j) => (
            <article className="media-job" key={j.id}>
              <div>
                <h3>{j.title}</h3>
                <p className="muted">
                  {j.status} · {(j.bytes / 1024 / 1024).toFixed(1)} MB · Attempt{" "}
                  {j.attempts}
                </p>
                {j.error && <p role="alert">{j.error}</p>}
              </div>
              {j.status === "FAILED" && (
                <button
                  className="button outline"
                  disabled={retry.isPending}
                  onClick={() => retry.mutate(j.id)}
                >
                  Retry processing
                </button>
              )}
              {j.status === "READY" && (
                <>
                  <Link className="button outline" href={`/watch/${j.assetId}`}>
                    Open player
                  </Link>
                  <SubtitleUpload asset={j.assetId} />
                </>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
function SubtitleUpload({ asset }: { asset: string }) {
  const [message, setMessage] = useState("");
  const upload = useMutation({
    mutationFn: (body: FormData) =>
      api(`/admin/media/${asset}/subtitles`, { method: "POST", body }),
    onSuccess: () => setMessage("Subtitle added."),
  });
  return (
    <form
      className="subtitle-upload"
      onSubmit={(e) => {
        e.preventDefault();
        upload.mutate(new FormData(e.currentTarget));
      }}
    >
      <label>
        Subtitle (WebVTT)
        <input type="file" name="file" required accept=".vtt,text/vtt" />
      </label>
      <label>
        Language code
        <input
          name="language"
          required
          placeholder="en"
          pattern="[a-zA-Z]{2,3}(-[a-zA-Z]{2})?"
        />
      </label>
      <label>
        Display label
        <input name="label" required maxLength={60} placeholder="English" />
      </label>
      <button className="button outline" disabled={upload.isPending}>
        Add subtitle
      </button>
      <span role="status">{message}</span>
      {upload.error && <ErrorBox error={upload.error} />}
    </form>
  );
}
