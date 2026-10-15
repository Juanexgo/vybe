"use client";
import { ArtworkUpload } from "./analytics";
import Link from "next/link";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Title } from "@/lib/api";
import { ErrorBox } from "./catalog";
import { Plus, Save } from "lucide-react";
type Row = {
  id: string;
  slug: string;
  title: string;
  kind: string;
  published: boolean;
};
type Input = {
  slug: string;
  title: string;
  kind: "MOVIE" | "SERIES";
  synopsis: string;
  releaseYear: number;
  durationMinutes: number;
  language: string;
  rating: string;
  artwork: string;
  accent: string;
  attribution: string;
  sourceUrl: string;
  genres: string[];
};
const blank: Input = {
  slug: "",
  title: "",
  kind: "MOVIE",
  synopsis: "",
  releaseYear: new Date().getFullYear(),
  durationMinutes: 10,
  language: "English",
  rating: "Unrated",
  artwork: "/art/spring.svg",
  accent: "#365643",
  attribution: "",
  sourceUrl: "https://",
  genres: [],
};
export function Admin() {
  const client = useQueryClient();
  const [input, setInput] = useState<Input | null>(null);
  const [id, setId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const catalog = useQuery({
    queryKey: ["admin-catalog"],
    queryFn: () => api<Row[]>("/admin/content"),
  });
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ["admin-catalog"] });
    void client.invalidateQueries({ queryKey: ["catalog"] });
    void client.invalidateQueries({ queryKey: ["title"] });
  };
  const visibility = useMutation({
    mutationFn: (r: Row) =>
      api(`/admin/content/${r.id}/visibility`, {
        method: "PATCH",
        body: JSON.stringify({ published: !r.published }),
      }),
    onSuccess: invalidate,
  });
  const load = useMutation({
    mutationFn: (id: string) => api<Input>(`/admin/content/${id}`),
    onSuccess: (data, selectedId) => {
      setInput(data);
      setId(selectedId);
      setMessage("");
    },
  });
  const save = useMutation({
    mutationFn: () =>
      api(id ? `/admin/content/${id}` : "/admin/content", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      setInput(null);
      setId(null);
      setMessage("Catalog metadata saved.");
      invalidate();
    },
  });
  function field<K extends keyof Input>(key: K, value: Input[K]) {
    setInput((current) => (current ? { ...current, [key]: value } : current));
  }
  if (catalog.isPending)
    return (
      <div className="page-pad" role="status">
        Loading catalog administration…
      </div>
    );
  if (catalog.error)
    return (
      <div className="page-pad">
        <ErrorBox error={catalog.error} />
        <p className="muted">
          Catalog management requires an administrator or content manager
          account.
        </p>
      </div>
    );
  return (
    <div className="member-page">
      <span className="eyebrow">VYBE STUDIO</span>
      <Link className="button outline" href="/admin/analytics">
        Platform analytics
      </Link>
      <h1>Stories, thoughtfully managed.</h1>
      <p className="muted">
        Edit metadata, control catalog visibility, and prepare films for
        playback.
      </p>
      <button
        className="button primary"
        onClick={() => {
          setInput({ ...blank });
          setId(null);
          setMessage("");
        }}
      >
        <Plus size={16} />
        Add a title
      </button>
      <Link className="button outline" href="/admin/collections">
        Curated collections
      </Link>
      <Link className="button outline" href="/admin/media">
        Media uploads and jobs
      </Link>
      <p role="status">{message}</p>
      {visibility.error && <ErrorBox error={visibility.error} />}{" "}
      {load.error && <ErrorBox error={load.error} />}
      <div className="admin-list">
        {catalog.data?.map((row) => (
          <div className="admin-row" key={row.id}>
            <div>
              <strong>{row.title}</strong>
              <small>
                {row.kind} · {row.published ? "Published" : "Draft"}
              </small>
            </div>
            <div className="hero-actions" style={{ margin: 0 }}>
              {row.kind === "SERIES" && (
                <Link
                  className="button outline"
                  href={`/admin/series/${row.id}`}
                >
                  Episodes
                </Link>
              )}
              <button
                className="button outline"
                disabled={load.isPending}
                onClick={() => load.mutate(row.id)}
              >
                Edit
              </button>
              <button
                className="button outline"
                disabled={visibility.isPending}
                onClick={() => visibility.mutate(row)}
              >
                {row.published ? "Unpublish" : "Publish"}
              </button>
            </div>
          </div>
        ))}
      </div>
      {id && (
        <ArtworkUpload
          content={id}
          onSaved={() => {
            load.mutate(id);
            invalidate();
          }}
        />
      )}
      {input && (
        <form
          className="admin-form"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <h2 className="wide">{id ? "Edit title" : "New draft"}</h2>
          <label>
            Title
            <input
              required
              maxLength={160}
              value={input.title}
              onChange={(e) => field("title", e.target.value)}
            />
          </label>
          <label>
            URL slug
            <input
              required
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              maxLength={120}
              value={input.slug}
              onChange={(e) => field("slug", e.target.value)}
            />
          </label>
          <label>
            Format
            <select
              disabled={!!id}
              value={input.kind}
              onChange={(e) =>
                field("kind", e.target.value as "MOVIE" | "SERIES")
              }
            >
              <option value="MOVIE">Film</option>
              <option value="SERIES">Series</option>
            </select>
          </label>
          <label>
            Year
            <input
              type="number"
              min={1888}
              max={2200}
              required
              value={input.releaseYear}
              onChange={(e) => field("releaseYear", Number(e.target.value))}
            />
          </label>
          <label className="wide">
            Synopsis
            <textarea
              required
              maxLength={3000}
              value={input.synopsis}
              onChange={(e) => field("synopsis", e.target.value)}
            />
          </label>
          <label>
            Duration (minutes)
            <input
              required
              type="number"
              min={1}
              max={2000}
              value={input.durationMinutes}
              onChange={(e) => field("durationMinutes", Number(e.target.value))}
            />
          </label>
          <label>
            Language
            <input
              required
              maxLength={40}
              value={input.language}
              onChange={(e) => field("language", e.target.value)}
            />
          </label>
          <label>
            Rating
            <input
              required
              maxLength={20}
              value={input.rating}
              onChange={(e) => field("rating", e.target.value)}
            />
          </label>
          <label>
            Genres (comma separated)
            <input
              value={input.genres.join(",")}
              onChange={(e) =>
                field(
                  "genres",
                  e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
            />
          </label>
          <label>
            Editorial cover
            <select
              value={input.artwork}
              onChange={(e) => field("artwork", e.target.value)}
            >
              {[
                "spring",
                "sintel",
                "tears-of-steel",
                "big-buck-bunny",
                "cosmos-laundromat",
                "elephants-dream",
              ].map((a) => (
                <option key={a} value={`/art/${a}.svg`}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label>
            Accent
            <input
              type="color"
              value={input.accent}
              onChange={(e) => field("accent", e.target.value)}
            />
          </label>
          <label className="wide">
            Attribution and license
            <input
              required
              maxLength={2000}
              value={input.attribution}
              onChange={(e) => field("attribution", e.target.value)}
            />
          </label>
          <label className="wide">
            Original project URL
            <input
              required
              type="url"
              maxLength={500}
              value={input.sourceUrl}
              onChange={(e) => field("sourceUrl", e.target.value)}
            />
          </label>
          {save.error && (
            <div className="wide">
              <ErrorBox error={save.error} />
            </div>
          )}
          <button className="button primary" disabled={save.isPending}>
            <Save size={16} />
            {save.isPending ? "Saving…" : "Save metadata"}
          </button>
          <button
            className="button outline"
            type="button"
            onClick={() => setInput(null)}
          >
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}
