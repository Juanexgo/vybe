"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ErrorBox } from "./catalog";
type Episode = {
  id?: string;
  season: number;
  number: number;
  title: string;
  synopsis: string;
  durationMinutes: number;
};
const blank: Episode = {
  season: 1,
  number: 1,
  title: "",
  synopsis: "",
  durationMinutes: 20,
};
export function EpisodeEditor({ content }: { content: string }) {
  const [value, setValue] = useState<Episode>(blank),
    client = useQueryClient();
  const list = useQuery({
    queryKey: ["admin-episodes", content],
    queryFn: () => api<Episode[]>(`/admin/content/${content}/episodes`),
  });
  const save = useMutation({
    mutationFn: () =>
      api(
        `/admin/content/${content}/episodes${value.id ? `/${value.id}` : ""}`,
        { method: value.id ? "PUT" : "POST", body: JSON.stringify(value) },
      ),
    onSuccess: () => {
      setValue(blank);
      void client.invalidateQueries({ queryKey: ["admin-episodes", content] });
    },
  });
  return (
    <div className="member-page">
      <Link className="back-link" href="/admin">
        ← Catalog management
      </Link>
      <h1>Build the next chapter.</h1>
      <p className="muted">
        Create episodes before uploading series video. Episode numbers stay
        fixed when editing.
      </p>
      {list.error ? (
        <ErrorBox error={list.error} />
      ) : (
        <div className="admin-list">
          {list.data?.map((e) => (
            <div className="admin-row" key={e.id}>
              <span>
                S{e.season} · E{e.number} — {e.title}
              </span>
              <button className="button outline" onClick={() => setValue(e)}>
                Edit episode
              </button>
            </div>
          ))}
        </div>
      )}
      <form
        className="admin-form"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <h2 className="wide">{value.id ? "Edit episode" : "New episode"}</h2>
        {(["season", "number", "durationMinutes"] as const).map((k) => (
          <label key={k}>
            {k === "durationMinutes" ? "Duration (minutes)" : k}
            <input
              required
              type="number"
              min={1}
              max={k === "number" ? 10000 : k === "season" ? 1000 : 2000}
              disabled={!!value.id && k !== "durationMinutes"}
              value={value[k]}
              onChange={(e) =>
                setValue({ ...value, [k]: Number(e.target.value) })
              }
            />
          </label>
        ))}
        <label>
          Title
          <input
            required
            maxLength={160}
            value={value.title}
            onChange={(e) => setValue({ ...value, title: e.target.value })}
          />
        </label>
        <label className="wide">
          Synopsis
          <textarea
            required
            maxLength={3000}
            value={value.synopsis}
            onChange={(e) => setValue({ ...value, synopsis: e.target.value })}
          />
        </label>
        <button disabled={save.isPending} className="button primary">
          Save episode
        </button>
        <button
          type="button"
          className="button outline"
          onClick={() => setValue(blank)}
        >
          Reset form
        </button>
        {save.error && <ErrorBox error={save.error} />}
      </form>
      <Link className="button outline" href="/admin/media">
        Upload episode media
      </Link>
    </div>
  );
}
