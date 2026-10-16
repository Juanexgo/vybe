"use client";
import { ProfileMenu } from "./profile-menu";
import { QuickSearch } from "./quick-search";
import { useEffect } from "react";
import { useProfile } from "@/lib/store";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Sparkles,
  Users,
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
          <nav className="primary-navigation" aria-label="Main navigation">
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
            {account && (
              <>
                <Link
                  className={path === "/for-you" ? "active" : ""}
                  href="/for-you"
                >
                  <Sparkles size={15} />
                  For you
                </Link>
                <Link
                  className={path === "/parties" ? "active" : ""}
                  href="/parties"
                >
                  <Users size={15} />
                  Watch together
                </Link>
              </>
            )}
          </nav>
        )}
        <div className="header-actions">
          {!cinematic && <QuickSearch key={`search-${path}`} />}
          {account ? (
            <ProfileMenu key={`profile-${path}`} account={account} />
          ) : (
            <Link className="button small outline" href="/login">
              Sign in <ArrowUpRight size={14} />
            </Link>
          )}
        </div>
      </header>
      <main id="main">{children}</main>
      {!cinematic && (
        <nav className="mobile-dock" aria-label="Mobile navigation">
          {[
            { href: "/explore", label: "Discover", icon: Compass },
            { href: "/library", label: "My library", icon: Bookmark },
            { href: "/for-you", label: "For you", icon: Sparkles },
            { href: "/parties", label: "Together", icon: Users },
          ].map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={path === href ? "page" : undefined}
            >
              <Icon size={20} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      )}
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
