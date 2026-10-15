"use client";
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Title } from "@/lib/api";
import { ErrorBox, TitleCard } from "./catalog";
type Collection = {
  id: string;
  name: string;
  description: string;
  titles: string[];
};
export function Collections({ admin = false }: { admin?: boolean }) {
  const client = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null),
    [edit, setEdit] = useState<Collection | null>(null),
    [confirm, setConfirm] = useState(false);
  const query = useQuery({
    queryKey: ["collections", admin],
    queryFn: () =>
      api<Collection[]>(admin ? "/admin/collections" : "/catalog/collections"),
  });
  const titles = useQuery({
    queryKey: ["collection-titles", selected],
    queryFn: () => api<Title[]>(`/catalog/collections/${selected}`),
    enabled: !!selected && !admin,
  });
  const catalog = useQuery({
    queryKey: ["admin-catalog"],
    queryFn: () => api<{ id: string; title: string }[]>("/admin/content"),
    enabled: admin,
  });
  const refresh = () => {
    setEdit(null);
    setConfirm(false);
    void client.invalidateQueries({ queryKey: ["collections"] });
  };
  const save = useMutation({
    mutationFn: () =>
      api(edit!.id ? `/admin/collections/${edit!.id}` : "/admin/collections", {
        method: edit!.id ? "PUT" : "POST",
        body: JSON.stringify(edit),
      }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: () =>
      api(`/admin/collections/${edit!.id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  return (
    <div className="member-page">
      <span className="eyebrow">CURATED CONNECTIONS</span>
      <h1>
        {admin
          ? "Shape the collection."
          : "Different stories. A common thread."}
      </h1>
      {admin && (
        <>
          <Link className="back-link" href="/admin">
            ← Manage catalog
          </Link>
          <button
            className="button primary"
            onClick={() => {
              setConfirm(false);
              setEdit({ id: "", name: "", description: "", titles: [] });
            }}
          >
            New collection
          </button>
        </>
      )}
      {query.data?.map((c) => (
        <article className="episode" key={c.id}>
          <h2>{c.name}</h2>
          <p>{c.description}</p>
          <button
            className="button outline"
            onClick={() => {
              setSelected(c.id);
              if (admin) {
                setConfirm(false);
                setEdit(c);
              }
            }}
          >
            {admin ? "Edit collection" : "Explore collection"}
          </button>
        </article>
      ))}
      {!admin && titles.data && (
        <div className="card-grid">
          {titles.data.map((t) => (
            <TitleCard key={t.id} title={t} />
          ))}
        </div>
      )}
      {admin && edit && (
        <form
          className="preferences-panel"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <label>
            Collection name
            <input
              required
              maxLength={100}
              value={edit.name}
              onChange={(e) => setEdit({ ...edit, name: e.target.value })}
            />
          </label>
          <label>
            Description
            <textarea
              required
              maxLength={1000}
              value={edit.description}
              onChange={(e) =>
                setEdit({ ...edit, description: e.target.value })
              }
            />
          </label>
          <h3>Titles · in selection order</h3>
          <div className="genre-options">
            {catalog.data?.map((t) => (
              <label key={t.id}>
                <input
                  type="checkbox"
                  checked={edit.titles.includes(t.id)}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      titles: e.target.checked
                        ? [...edit.titles, t.id]
                        : edit.titles.filter((id) => id !== t.id),
                    })
                  }
                />
                {t.title}
              </label>
            ))}
          </div>
          <button className="button primary" disabled={save.isPending}>
            Save collection
          </button>
          <button
            type="button"
            className="button outline"
            onClick={() => setEdit(null)}
          >
            Cancel
          </button>
          {edit.id &&
            (confirm ? (
              <>
                <p>Delete this collection? Its films stay in the catalog.</p>
                <button
                  type="button"
                  className="button outline"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate()}
                >
                  Confirm delete collection
                </button>
              </>
            ) : (
              <button
                type="button"
                className="button outline"
                onClick={() => setConfirm(true)}
              >
                Delete collection
              </button>
            ))}
        </form>
      )}
      {[query.error, titles.error, catalog.error, save.error, remove.error]
        .filter(Boolean)
        .map((e, i) => (
          <ErrorBox key={i} error={e!} />
        ))}
    </div>
  );
}
