"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, X, ArrowUpRight, Sparkles, Film } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api, type Catalog } from "@/lib/api";
export function QuickSearch() {
  const dialog = useRef<HTMLDialogElement>(null),
    input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState(""),
    [query, setQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQuery(draft.trim()), 250);
    return () => clearTimeout(timer);
  }, [draft]);
  useEffect(() => {
    if (!open) return;
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = previous;
    };
  }, [open]);
  const results = useQuery({
    queryKey: ["quick-search", query],
    queryFn: ({ signal }) =>
      api<Catalog>(`/catalog?q=${encodeURIComponent(query)}`, { signal }),
    enabled: open && query.length > 0,
  });
  const close = () => {
    dialog.current?.close();
    setOpen(false);
  };
  const show = () => {
    dialog.current?.showModal();
    setOpen(true);
    input.current?.focus();
  };
  useEffect(() => {
    const keyboard = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        dialog.current?.showModal();
        setOpen(true);
        input.current?.focus();
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => document.removeEventListener("keydown", keyboard);
  }, []);
  return (
    <>
      <button
        className="search-trigger"
        type="button"
        aria-label="Search catalog"
        onClick={show}
      >
        <Search size={21} />
        <span>Search</span>
        <kbd>⌘ K</kbd>
      </button>
      <dialog
        ref={dialog}
        className="quick-search-dialog"
        aria-labelledby="quick-search-title"
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === dialog.current) close();
        }}
      >
        <div className="quick-search-content">
          <div className="quick-search-heading">
            <div>
              <span className="eyebrow">A STORY IS ONE SEARCH AWAY</span>
              <h2 id="quick-search-title">What are you in the mood for?</h2>
            </div>
            <button
              className="close-search"
              aria-label="Close search"
              onClick={close}
            >
              <X size={21} />
            </button>
          </div>
          <label className="quick-search-field">
            <Search size={22} />
            <input
              ref={input}
              autoComplete="off"
              maxLength={150}
              aria-label="Quick search titles"
              value={draft}
              placeholder="Search films, series, or a title…"
              onChange={(e) => setDraft(e.target.value)}
            />
            {draft && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setDraft("");
                  input.current?.focus();
                }}
              >
                <X size={17} />
              </button>
            )}
          </label>
          {!query ? (
            <div className="search-start">
              <Film size={28} />
              <h3>Know the title? Start typing.</h3>
              <p>Not sure what to watch? Describe a feeling in mood search.</p>
            </div>
          ) : draft.trim() !== query || results.isPending ? (
            <p className="search-status" role="status">
              Finding stories…
            </p>
          ) : results.error ? (
            <div className="search-status" role="alert">
              <p>{results.error.message}</p>
              <button
                className="button outline"
                onClick={() => void results.refetch()}
              >
                Try again
              </button>
            </div>
          ) : results.data?.items.length ? (
            <div className="quick-search-results" aria-label="Search results">
              {results.data.items.slice(0, 6).map((title) => (
                <Link
                  href={`/title/${title.slug}`}
                  key={title.id}
                  onClick={close}
                >
                  <img src={title.artwork} alt="" />
                  <div>
                    <strong>{title.title}</strong>
                    <span>
                      {title.releaseYear} ·{" "}
                      {title.kind === "SERIES"
                        ? "Series"
                        : `${title.durationMinutes ?? "—"} min`}{" "}
                      · {title.genres}
                    </span>
                  </div>
                  <ArrowUpRight size={18} />
                </Link>
              ))}
            </div>
          ) : (
            <div className="search-start" role="status">
              <h3>No titles found.</h3>
              <p>Try another title, or describe what you want to watch.</p>
            </div>
          )}
          <Link className="mood-search-link" href="/discover" onClick={close}>
            <Sparkles size={19} />
            <span>
              <strong>Search by feeling</strong>
              <small>Themes, moods, language, and time you have.</small>
            </span>
            <ArrowUpRight size={18} />
          </Link>
        </div>
      </dialog>
    </>
  );
}
