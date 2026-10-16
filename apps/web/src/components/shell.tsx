"use client";
import { useEffect } from "react";
import { useProfile } from "@/lib/store";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  ArrowUpRight,
  CircleUserRound,
  Bookmark,
  Compass,
  Film,
} from "lucide-react";
import { api, type Account } from "@/lib/api";
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  useEffect(() => {
    void useProfile.persist.rehydrate();
  }, []);
  const { data: account } = useQuery({
    queryKey: ["account"],
    queryFn: () => api<Account>("/auth/me"),
    retry: false,
  });
  const cinematic = [
    "/",
    "/login",
    "/register",
    "/forgot",
    "/reset",
    "/verify",
    "/resend",
  ].includes(path);
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className={`header ${cinematic ? "cinema-header" : ""}`}>
        <Link href="/" className="brand" aria-label="VYBE home">
          v<span>y</span>be<span className="brand-dot">.</span>
        </Link>
        {!cinematic && (
          <nav aria-label="Main navigation">
            <Link
              className={path === "/" || path === "/explore" ? "active" : ""}
              href="/explore"
            >
              <Compass size={15} />
              Discover
            </Link>
            <Link
              className={path === "/explore/movies" ? "active" : ""}
              href="/explore/movies"
            >
              <Film size={15} />
              Films
            </Link>
            <Link
              className={path === "/library" ? "active" : ""}
              href="/library"
            >
              <Bookmark size={15} />
              My library
            </Link>
          </nav>
        )}
        <div className="header-actions">
          {!cinematic && (
            <Link
              className="icon-button"
              href="/discover"
              aria-label="Search catalog"
            >
              <Search size={20} />
            </Link>
          )}
          {account ? (
            <Link
              href="/profiles"
              className="avatar"
              aria-label="Manage profiles"
            >
              <CircleUserRound size={24} />
            </Link>
          ) : (
            <Link className="button small outline" href="/login">
              Sign in <ArrowUpRight size={14} />
            </Link>
          )}
        </div>
      </header>
      <main id="main">{children}</main>
      <footer>
        <Link href="/" className="brand">
          vybe<span className="brand-dot">.</span>
        </Link>
        <span>Discover better. Watch together.</span>
        <div>
          <Link href="/collections">Collections</Link>
          <Link href="/about">About & credits</Link>
          {account && (
            <>
              <Link href="/parties">Watch together</Link>
              <Link href="/for-you">For you</Link>
              <Link href="/continue">Continue watching</Link>
              <Link href="/history">History</Link>
              <Link href="/analytics">Viewing activity</Link>
              <Link href="/account">Account</Link>
            </>
          )}
          {account?.roles.some(
            (r) => r === "ROLE_ADMIN" || r === "ROLE_CONTENT_MANAGER",
          ) && <Link href="/admin">Manage catalog</Link>}
        </div>
        <small>Made for the love of film.</small>
      </footer>
    </>
  );
}
