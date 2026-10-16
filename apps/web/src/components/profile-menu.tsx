"use client";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Layers3,
  ChevronDown,
  Check,
  UserRound,
  Settings2,
  LogOut,
  Bookmark,
  History,
  Play,
  Sparkles,
  Users,
  ListVideo,
  ChartNoAxesCombined,
  CircleHelp,
  ShieldCheck,
  Pencil,
} from "lucide-react";
import { api, ApiError, type Account, type Profile } from "@/lib/api";
import { useProfile } from "@/lib/store";
const destinations = [
  { href: "/collections", label: "Curated collections", icon: Layers3 },
  { href: "/continue", label: "Continue watching", icon: Play },
  { href: "/library", label: "My library", icon: Bookmark },
  { href: "/lists", label: "Shared watchlists", icon: ListVideo },
  { href: "/for-you", label: "For you & preferences", icon: Sparkles },
  { href: "/parties", label: "Watch together", icon: Users },
  { href: "/history", label: "Watch history", icon: History },
  { href: "/analytics", label: "Viewing activity", icon: ChartNoAxesCombined },
];
export function ProfileMenu({ account }: { account: Account }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const id = useId(),
    router = useRouter(),
    client = useQueryClient();
  const selected = useProfile((s) => s.selected),
    select = useProfile((s) => s.select);
  const profiles = useQuery({
    queryKey: ["profiles"],
    queryFn: () => api<Profile[]>("/profiles"),
  });
  const active =
    profiles.data?.find((p) => p.id === selected) ?? profiles.data?.[0];
  const close = () => setOpen(false);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", keyboard);
    };
  }, [open]);
  const logout = useMutation({
    mutationFn: async () => {
      try {
        await api("/auth/logout", { method: "POST" });
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 401)) throw error;
      }
    },
    onSuccess: async () => {
      await client.cancelQueries();
      select(null);
      client.clear();
      client.setQueryData(["account"], null);
      close();
      router.replace("/");
      router.refresh();
    },
  });
  return (
    <div
      className="profile-control"
      ref={root}
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget as Node)
        )
          close();
      }}
    >
      <button
        ref={trigger}
        className="profile-trigger"
        type="button"
        aria-label={`Open profile menu${active ? ` for ${active.name}` : ""}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <span
          aria-hidden="true" className="profile-avatar"
          style={{ backgroundColor: active?.color ?? "#c2f18c" }}
        >
          {active?.name.slice(0, 1).toUpperCase() ?? <UserRound size={20} />}
        </span>
        <ChevronDown size={15} className={open ? "rotated" : ""} />
      </button>
      {open && (
        <div
          className="profile-dropdown"
          id={id}
          aria-label="Profile and account options"
        >
          <div className="profile-menu-heading">
            <span className="eyebrow">YOUR VYBE</span>
            <strong>{active?.name ?? "Your account"}</strong>
            <span className="account-email" title={account.email}>
              {account.email}
            </span>
          </div>
          <section className="profile-picker" aria-label="Switch profile">
            <span className="menu-section-label">SWITCH PROFILE</span>
            {profiles.isPending && <p role="status">Loading profiles…</p>}
            {profiles.error && (
              <div role="alert">
                Couldn’t load profiles.{" "}
                <button onClick={() => void profiles.refetch()}>
                  Try again
                </button>
              </div>
            )}
            {profiles.data?.map((p) => (
              <button
                type="button"
                key={p.id}
                className="profile-option"
                aria-pressed={p.id === active?.id}
                onClick={() => {
                  select(p.id);
                  close();
                  router.push("/explore");
                }}
              >
                <span
                  aria-hidden="true" className="profile-avatar"
                  style={{ backgroundColor: p.color }}
                >
                  {p.name.slice(0, 1).toUpperCase()}
                </span>
                <span>{p.name}</span>
                {p.id === active?.id && <Check size={16} />}
              </button>
            ))}
            <Link
              className="profile-menu-link"
              href="/profiles"
              onClick={close}
            >
              <Pencil size={16} />
              Manage profiles
            </Link>
          </section>
          <nav className="profile-menu-links" aria-label="Your viewing space">
            {destinations.map(({ href, label, icon: Icon }) => (
              <Link
                className="profile-menu-link"
                key={href}
                href={href}
                onClick={close}
              >
                <Icon size={17} />
                {label}
              </Link>
            ))}
          </nav>
          <div className="profile-menu-settings">
            <Link className="profile-menu-link" href="/account" onClick={close}>
              <Settings2 size={17} />
              Account & security
            </Link>
            <Link className="profile-menu-link" href="/help" onClick={close}>
              <CircleHelp size={17} />
              Help & getting started
            </Link>
            {account.roles.some((r) =>
              ["ROLE_ADMIN", "ROLE_CONTENT_MANAGER"].includes(r),
            ) && (
              <Link className="profile-menu-link" href="/admin" onClick={close}>
                <ShieldCheck size={17} />
                Manage catalog
              </Link>
            )}
          </div>
          <button
            className="profile-logout"
            disabled={logout.isPending}
            onClick={() => logout.mutate()}
          >
            <LogOut size={17} />
            {logout.isPending ? "Signing out…" : "Sign out of VYBE"}
          </button>
          {logout.error && (
            <p className="field-error menu-error" role="alert">
              {logout.error.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
