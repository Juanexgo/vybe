"use client";
import Link from "next/link";
import { MemberHub } from "./member-hub";
import Image from "next/image";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  ArrowUpRight,
  Search,
  SlidersHorizontal,
  Sparkles,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { api, type Catalog, type Title } from "@/lib/api";
export function ErrorBox({
  error,
  retry,
}: {
  error: Error;
  retry?: () => void;
}) {
  return (
    <div role="alert" className="notice error">
      <strong>We couldn’t load this.</strong>
      <p>{error.message}</p>
      {retry && (
        <button className="button outline" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}
export function TitleCard({
  title,
  index = 0,
}: {
  title: Title;
  index?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.article
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.035, 0.25) }}
      className="title-card"
    >
      <Link href={`/title/${title.slug}`}>
        <div className="poster" style={{ background: title.accent }}>
          <Image
            src={title.artwork}
            alt={`Original illustrated artwork for ${title.title}`}
            fill
            sizes="(max-width: 600px) 45vw, (max-width: 1000px) 30vw, 20vw"
          />
          <div className="poster-shade" />
          <span className="poster-tag">
            {title.genres.split(", ")[0] || "Open cinema"}
          </span>
          <div className="poster-title">{title.title}</div>
          <span className="card-arrow">
            <ArrowUpRight size={21} />
          </span>
        </div>
        <div className="card-caption">
          <h3>{title.title}</h3>
          <span>
            {title.releaseYear}
            <i />{" "}
            {title.durationMinutes ? `${title.durationMinutes} min` : "Series"}
          </span>
        </div>
      </Link>
    </motion.article>
  );
}
export function CatalogView({
  initial,
  movies = false,
  search = false,
}: {
  initial?: Catalog;
  movies?: boolean;
  search?: boolean;
}) {
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState("");
  const [genre, setGenre] = useState("");
  const [kind, setKind] = useState(movies ? "MOVIE" : "");
  const [page, setPage] = useState(0);
  const params = new URLSearchParams({ q, genre, kind, page: String(page) });
  const query = useQuery({
    queryKey: ["catalog", q, genre, kind, page],
    queryFn: () => api<Catalog>(`/catalog?${params}`),
    initialData: !q && !genre && !kind && !page ? initial : undefined,
  });
  const genres = useQuery({
    queryKey: ["genres"],
    queryFn: () => api<string[]>("/catalog/genres"),
  });
  const featured =
    initial?.items.find((t) => t.featured) ??
    query.data?.items.find((t) => t.featured);
  return (
    <>
      <div className="page-intro">
        <div>
          <span className="eyebrow">
            <span className="live-dot" /> A LITTLE LESS SCROLLING. A LOT MORE
            FEELING.
          </span>
          <h1>
            {search ? (
              "Follow your curiosity."
            ) : movies ? (
              "Small films. Big feelings."
            ) : (
              <>
                Find your next <em>feeling.</em>
              </>
            )}
          </h1>
        </div>
        <p>
          Extraordinary stories.
          <br />A world beyond the ordinary.
        </p>
      </div>
      {!search && !movies && featured && (
        <section className="hero" aria-label="Featured film">
          <Image
            src={featured.artwork}
            alt="An original illustration of a sunlit mountain valley"
            fill
            priority
            sizes="100vw"
          />
          <div className="hero-overlay" />
          <div className="hero-copy">
            <span className="eyebrow">
              <Sparkles size={14} /> THE EDITOR’S PICK
            </span>
            <p className="hero-kicker">Some journeys bring you back to life.</p>
            <h2>{featured.title}</h2>
            <div className="hero-meta">
              <span>{featured.releaseYear}</span>
              <span>{featured.durationMinutes} min</span>
              <span>{featured.rating}</span>
              <span>{featured.genres}</span>
            </div>
            <p>{featured.synopsis}</p>
            <div className="hero-actions">
              <Link className="button primary" href={`/title/${featured.slug}`}>
                Explore the story <ArrowRight size={17} />
              </Link>
              <Link className="hero-secondary" href="/about">
                A different kind of cinema <ArrowUpRight size={15} />
              </Link>
            </div>
          </div>
          <div className="hero-side">
            <span>THE OPEN CINEMA COLLECTION</span>
            <span>
              01 /{" "}
              {String(initial?.total ?? query.data?.total ?? 0).padStart(
                2,
                "0",
              )}
            </span>
          </div>
        </section>
      )}
      {!search && !movies && <MemberHub />}
      <section className="catalog-section" aria-label="Browse catalog">
        <div className="section-heading">
          <div>
            <span className="eyebrow">GOOD STORIES STAY WITH YOU</span>
            <h2>
              {search
                ? "Search the collection"
                : "A little discovery goes a long way."}
            </h2>
          </div>
          <span className="count-label">
            {query.data?.total ?? "—"} titles to explore <ArrowDownIcon />
          </span>
        </div>
        <div className="catalog-toolbar">
          <div className="genre-list" role="group" aria-label="Filter by genre">
            {["", ...(genres.data ?? [])].map((g) => (
              <button
                key={g}
                className={genre === g ? "chip selected" : "chip"}
                onClick={() => {
                  setGenre(g);
                  setPage(0);
                }}
              >
                {g || "All stories"}
              </button>
            ))}
          </div>
          <div className="search-filter">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setQ(draft);
                setPage(0);
              }}
            >
              <Search size={16} />
              <input
                aria-label="Search titles"
                placeholder="Search a story…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={150}
              />
              <button type="submit" aria-label="Run search">
                <ArrowRight size={16} />
              </button>
            </form>
            <label className="type-select">
              <SlidersHorizontal size={16} />
              <select
                aria-label="Content type"
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value);
                  setPage(0);
                }}
              >
                <option value="">All formats</option>
                <option value="MOVIE">Films</option>
                <option value="SERIES">Series</option>
              </select>
            </label>
          </div>
        </div>
        {query.isPending ? (
          <div className="card-grid" aria-label="Loading catalog">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="skeleton" />
            ))}
          </div>
        ) : query.error ? (
          <ErrorBox error={query.error} retry={() => void query.refetch()} />
        ) : query.data?.items.length ? (
          <div className="card-grid">
            {query.data.items.map((title, index) => (
              <TitleCard key={title.id} title={title} index={index} />
            ))}
          </div>
        ) : (
          <div className="empty">
            <Search size={28} />
            <h3>No stories found</h3>
            <p>
              Try a different title or clear your filters. This collection is
              still growing.
            </p>
            <button
              className="button outline"
              onClick={() => {
                setGenre("");
                setKind("");
                setQ("");
                setDraft("");
              }}
            >
              Clear filters
            </button>
          </div>
        )}
        {query.data && query.data.total > 12 && (
          <div className="pagination">
            <button
              className="button outline"
              disabled={!page}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={16} />
              Previous
            </button>
            <span>Page {page + 1}</span>
            <button
              className="button outline"
              disabled={(page + 1) * 12 >= query.data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </section>
      {!search && (
        <section className="manifesto">
          <div className="orbital" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <span className="eyebrow">CURIOSITY LOOKS GOOD ON YOU</span>
            <h2>
              Less of the same.
              <br />
              <em>More of your kind of different.</em>
            </h2>
            <p>
              Independent voices. Unexpected worlds. Build a library of stories
              that mean something to you.
            </p>
            <Link href="/register" className="text-link">
              Make yourself at home <ArrowUpRight size={17} />
            </Link>
          </div>
          <span className="manifesto-note">
            YOUR NEXT FAVORITE
            <br />
            IS OUT THERE.
          </span>
        </section>
      )}
    </>
  );
}
function ArrowDownIcon() {
  return <span aria-hidden="true">↘</span>;
}
