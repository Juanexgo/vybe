"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Profile, type Account } from "@/lib/api";
import { useProfile } from "@/lib/store";
import { ErrorBox } from "./catalog";
type Personal = {
  sessions: number;
  watchedSeconds: number;
  titles: number;
  completed: number;
  daily: { day: string; seconds: number; sessions: number }[];
  genres: { name: string; seconds: number }[];
};
type AdminStats = {
  users: number;
  activeUsers: number;
  sessions: number;
  sourceBytes: number;
  jobs: {
    total: number;
    ready: number;
    failed: number;
    averageSeconds: number | null;
  };
  popular: { title: string; sessions: number; seconds: number }[];
  errors: { id: string; title: string; error: string }[];
};
function Metric({ name, value }: { name: string; value: string | number }) {
  return (
    <article className="metric">
      <span>{name}</span>
      <strong>{value}</strong>
    </article>
  );
}
export function PersonalAnalytics() {
  const selected = useProfile((s) => s.selected);
  const profiles = useQuery({
    queryKey: ["profiles"],
    queryFn: () => api<Profile[]>("/profiles"),
    retry: false,
  });
  const p = profiles.data?.find((p) => p.id === selected) ?? profiles.data?.[0];
  const data = useQuery({
    queryKey: ["analytics", p?.id],
    queryFn: () => api<Personal>(`/profiles/${p!.id}/analytics`),
    enabled: !!p,
  });
  return (
    <div className="member-page">
      <span className="eyebrow">YOUR TIME WITH STORIES</span>
      <h1>A little perspective.</h1>
      <p className="muted">
        Viewing time is estimated from saved playback intervals, with jumps
        excluded. Collection started when analytics was enabled. Daily totals
        use UTC; a film may belong to several genres.
      </p>
      {profiles.error ? (
        <>
          <ErrorBox error={profiles.error} />
          <Link href="/login">Sign in</Link>
        </>
      ) : data.error ? (
        <ErrorBox error={data.error} />
      ) : data.isPending ? (
        <p role="status">Loading your viewing activity…</p>
      ) : (
        <>
          <div className="metrics">
            <Metric
              name="Estimated minutes watched"
              value={Math.floor(data.data.watchedSeconds / 60)}
            />
            <Metric name="Playback sessions" value={data.data.sessions} />
            <Metric name="Videos explored" value={data.data.titles} />
            <Metric name="Completed videos" value={data.data.completed} />
          </div>
          <section className="preferences-panel">
            <h2>Your last 30 days</h2>
            {data.data.daily.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Date (UTC)</th>
                    <th>Minutes</th>
                    <th>Sessions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.daily.map((d) => (
                    <tr key={d.day}>
                      <td>{d.day}</td>
                      <td>{(d.seconds / 60).toFixed(1)}</td>
                      <td>{d.sessions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>
                No viewing activity yet. Your next screening will appear here.
              </p>
            )}
          </section>
          <section className="preferences-panel">
            <h2>The genres you spend time with</h2>
            {data.data.genres.map((g) => (
              <p key={g.name}>
                {g.name} · {(g.seconds / 60).toFixed(1)} minutes
              </p>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
export function AdminAnalytics() {
  const stats = useQuery({
    queryKey: ["admin-analytics"],
    queryFn: () => api<AdminStats>("/admin/analytics"),
    refetchInterval: 30000,
    retry: false,
  });
  return (
    <div className="member-page">
      <span className="eyebrow">THE SCREENING ROOM, IN NUMBERS</span>
      <h1>Platform activity.</h1>
      <div className="hero-actions">
        <Link className="button outline" href="/admin">
          Manage content
        </Link>
        <Link className="button outline" href="/admin/users">
          Manage users
        </Link>
        <Link className="button outline" href="/admin/media">
          Media & jobs
        </Link>
      </div>
      {stats.error ? (
        <ErrorBox error={stats.error} />
      ) : stats.isPending ? (
        <p role="status">Reading platform metrics…</p>
      ) : (
        <>
          <div className="metrics">
            <Metric name="Registered accounts" value={stats.data.users} />
            <Metric
              name="Viewers active in 30 days"
              value={stats.data.activeUsers}
            />
            <Metric name="Playback sessions" value={stats.data.sessions} />
            <Metric
              name="Uploaded originals · MB"
              value={(stats.data.sourceBytes / 1048576).toFixed(1)}
            />
            <Metric
              name="Successful finished jobs"
              value={
                stats.data.jobs.ready + stats.data.jobs.failed
                  ? `${((100 * stats.data.jobs.ready) / (stats.data.jobs.ready + stats.data.jobs.failed)).toFixed(1)}%`
                  : "No finished jobs"
              }
            />
            <Metric
              name="Average processing time"
              value={
                stats.data.jobs.averageSeconds == null
                  ? "Not available"
                  : `${stats.data.jobs.averageSeconds.toFixed(1)} sec`
              }
            />
            <Metric name="Failed jobs" value={stats.data.jobs.failed} />
          </div>
          <p className="muted">
            Storage measures original uploads recorded in the database; encoded
            renditions and storage-provider overhead are additional. Activity
            reflects saved playback sessions.
          </p>
          <section className="preferences-panel">
            <h2>Most played titles</h2>
            {stats.data.popular.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Sessions</th>
                    <th>Estimated minutes</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.data.popular.map((t) => (
                    <tr key={t.title}>
                      <td>{t.title}</td>
                      <td>{t.sessions}</td>
                      <td>{(t.seconds / 60).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>No playback sessions yet.</p>
            )}
          </section>
          <section className="preferences-panel">
            <h2>Processing failures</h2>
            {stats.data.errors.length ? (
              stats.data.errors.map((e) => (
                <article className="error-box" key={e.id}>
                  <h3>{e.title}</h3>
                  <p>{e.error}</p>
                </article>
              ))
            ) : (
              <p>No failed jobs.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
type User = {
  id: string;
  email: string;
  roles: string;
  verified: boolean;
  disabled: boolean;
};
export function UserAdmin() {
  const [page, setPage] = useState(0);
  const users = useQuery({
    queryKey: ["admin-users", page],
    queryFn: () => api<User[]>(`/admin/users?page=${page}`),
    retry: false,
  });
  return (
    <div className="member-page">
      <span className="eyebrow">ACCOUNT ACCESS</span>
      <h1>People on VYBE.</h1>
      <Link className="back-link" href="/admin/analytics">
        ← Platform activity
      </Link>
      <p className="muted">
        Changing permissions signs the account out of its existing sessions. At
        least one enabled administrator must remain.
      </p>
      {users.error ? (
        <ErrorBox error={users.error} />
      ) : users.isPending ? (
        <p role="status">Loading accounts…</p>
      ) : (
        users.data.map((u) => (
          <UserRow key={`${u.id}-${u.roles}-${u.disabled}`} user={u} />
        ))
      )}
      <div className="hero-actions">
        <button
          className="button outline"
          disabled={page === 0}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </button>
        <button
          className="button outline"
          disabled={!users.data || users.data.length < 50}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
function UserRow({ user }: { user: User }) {
  const client = useQueryClient();
  const [role, setRole] = useState(
      user.roles.includes("ADMIN")
        ? "ADMIN"
        : user.roles.includes("CONTENT_MANAGER")
          ? "CONTENT_MANAGER"
          : "USER",
    ),
    [disabled, setDisabled] = useState(user.disabled),
    [confirm, setConfirm] = useState(false);
  const save = useMutation({
    mutationFn: () =>
      api(`/admin/users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({
          roles: role === "USER" ? ["USER"] : ["USER", role],
          disabled,
        }),
      }),
    onSuccess: () => {
      setConfirm(false);
      void client.invalidateQueries({ queryKey: ["admin-users"] });
      void client.invalidateQueries({ queryKey: ["account"] });
    },
  });
  return (
    <article className="episode">
      <h2>{user.email}</h2>
      <p>{user.verified ? "Verified" : "Awaiting email verification"}</p>
      <div className="discovery-form">
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option>USER</option>
            <option disabled={!user.verified}>CONTENT_MANAGER</option>
            <option disabled={!user.verified}>ADMIN</option>
          </select>
        </label>
        <label>
          Account access
          <select
            value={String(disabled)}
            onChange={(e) => setDisabled(e.target.value === "true")}
          >
            <option value="false">Enabled</option>
            <option value="true">Disabled</option>
          </select>
        </label>
        {confirm ? (
          <>
            <p>Apply these permissions and end existing sessions?</p>
            <button
              className="button outline"
              onClick={() => setConfirm(false)}
            >
              Cancel
            </button>
            <button
              className="button primary"
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              Confirm permissions
            </button>
          </>
        ) : (
          <button className="button outline" onClick={() => setConfirm(true)}>
            Review changes
          </button>
        )}
      </div>
      {save.error && <ErrorBox error={save.error} />}
    </article>
  );
}
export function ArtworkUpload({
  content,
  onSaved,
}: {
  content: string;
  onSaved: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const upload = useMutation({
    mutationFn: () => {
      const body = new FormData();
      body.set("file", file!);
      return api(`/admin/content/${content}/artwork`, { method: "POST", body });
    },
    onSuccess: () => {
      setFile(null);
      onSaved();
    },
  });
  return (
    <div className="preferences-panel">
      <h3>Replace artwork</h3>
      <label>
        JPEG or PNG · up to 5 MB
        <input
          type="file"
          accept="image/jpeg,image/png"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>
      <button
        type="button"
        className="button outline"
        disabled={!file || upload.isPending}
        onClick={() => upload.mutate()}
      >
        Upload artwork
      </button>
      {upload.isSuccess && <p role="status">Artwork saved.</p>}
      {upload.error && <ErrorBox error={upload.error} />}
    </div>
  );
}
