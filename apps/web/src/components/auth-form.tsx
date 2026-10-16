"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { CinemaBackdrop } from "./cinema-backdrop";
import { api } from "@/lib/api";
const schema = z.object({
  email: z.email("Enter a valid email.").max(254),
  password: z.string().min(12, "Use at least 12 characters.").max(64),
  name: z.string().trim().min(1, "Enter your name.").max(40),
});
type Fields = { email: string; password: string; name: string };
type Mode = "login" | "register" | "forgot" | "reset" | "verify" | "resend";
export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const client = useQueryClient();
  const [showPassword, setShowPassword] = useState(false);
  const [oauthError, setOauthError] = useState("");
  const { data: providers } = useQuery({
    queryKey: ["auth-providers"],
    queryFn: () => api<{ google: boolean }>("/auth/providers"),
    staleTime: 60000,
    retry: false,
  });
  const [token, setToken] = useState("");
  useEffect(() => {
    const error = new URLSearchParams(window.location.search).get("oauth");
    if (error)
      setOauthError(
        error === "existing-account"
          ? "This email already has a VYBE account. Sign in with your password."
          : "Google sign-in could not be completed. Please try again or use your email.",
      );
    setToken(
      new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "",
    );
  }, []);
  const rules = z
    .object({ email: z.string(), password: z.string(), name: z.string() })
    .superRefine((data, ctx) => {
      const fields: (keyof Fields)[] =
        mode === "register"
          ? ["email", "password", "name"]
          : mode === "login"
            ? ["email", "password"]
            : mode === "forgot" || mode === "resend"
              ? ["email"]
              : mode === "reset"
                ? ["password"]
                : [];
      for (const field of fields) {
        const rule =
          field === "password" && mode === "login"
            ? z.string().min(1, "Enter your password.").max(64)
            : schema.shape[field];
        const result = rule.safeParse(data[field]);
        if (!result.success)
          ctx.addIssue({
            code: "custom",
            path: [field],
            message: result.error.issues[0].message,
          });
      }
    });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Fields>({
    resolver: zodResolver(rules),
    defaultValues: { email: "", password: "", name: "" },
  });
  const mutation = useMutation({
    mutationFn: (body: Partial<Fields>) =>
      api<{ message?: string }>(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify({
          ...body,
          ...(mode === "verify" || mode === "reset" ? { token } : {}),
        }),
      }),
    onSuccess: () => {
      if (mode === "login") {
        client.clear();
        router.push("/profiles");
      }
      if (mode === "reset" || mode === "verify")
        window.history.replaceState(null, "", window.location.pathname);
    },
  });
  const heading = {
    login: "Welcome back.",
    register: "Your next chapter starts here.",
    forgot: "Let’s get you back in.",
    reset: "A fresh start.",
    verify: "Make it official.",
    resend: "A new invitation.",
  }[mode];
  const subtitle = {
    login: "Your stories are waiting for you.",
    register: "A home for your curiosity. Create your VYBE account.",
    forgot: "We’ll email you a secure password reset link.",
    reset: "Choose a new password for your account.",
    verify: "Confirm your email to start building your library.",
    resend: "Request a fresh verification link for your account.",
  }[mode];
  return (
    <div className="auth-layout cinema-auth">
      <CinemaBackdrop />
      <aside className="auth-story">
        <span className="cinema-kicker">YOUR SEAT IS WAITING</span>
        <h2>
          A great story.
          <br />
          An even better
          <br />
          <em>feeling.</em>
        </h2>
        <p>Discover better. Watch together.</p>
      </aside>
      <section className="auth-form">
        <span className="eyebrow">WELCOME TO VYBE</span>
        <h1>{heading}</h1>
        <p>{subtitle}</p>
        {oauthError && (
          <p className="field-error" role="alert">
            {oauthError}
          </p>
        )}
        {["login", "register"].includes(mode) && providers?.google && (
          <>
            <a
              className="google-signin"
              href="/api/oauth2/authorization/google"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                width="20"
                height="20"
              >
                <path
                  fill="#4285F4"
                  d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4a4.6 4.6 0 0 1-2 3v2.5h3.3c1.9-1.8 2.9-4.3 2.9-7.4Z"
                />
                <path
                  fill="#34A853"
                  d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.5c-.9.6-2 1-3.4 1-2.6 0-4.9-1.8-5.7-4.2H2.9v2.6A10 10 0 0 0 12 22Z"
                />
                <path
                  fill="#FBBC05"
                  d="M6.3 13.9a6 6 0 0 1 0-3.8V7.5H2.9a10 10 0 0 0 0 9l3.4-2.6Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A9.6 9.6 0 0 0 12 2a10 10 0 0 0-9.1 5.5l3.4 2.6C7.1 7.7 9.4 5.9 12 5.9Z"
                />
              </svg>
              Continue with Google
            </a>
            <div className="auth-divider">
              <span>or use your email</span>
            </div>
          </>
        )}
        {mutation.isSuccess && mode !== "login" ? (
          <div className="success" role="status">
            <CheckCircle2 />
            <p>{mutation.data.message}</p>
            {(mode === "verify" || mode === "reset") && (
              <Link className="button primary" href="/login">
                Sign in <ArrowRight size={16} />
              </Link>
            )}
          </div>
        ) : (
          <form
            onSubmit={handleSubmit((body) => mutation.mutate(body))}
            noValidate
          >
            {mode === "register" && (
              <label>
                Your name
                <input autoComplete="nickname" {...register("name")} />
                {errors.name && (
                  <span className="field-error">{errors.name.message}</span>
                )}
              </label>
            )}
            {["login", "register", "forgot", "resend"].includes(mode) && (
              <label>
                Email address
                <input
                  type="email"
                  autoComplete="email"
                  {...register("email")}
                />
                {errors.email && (
                  <span className="field-error">{errors.email.message}</span>
                )}
              </label>
            )}
            {["login", "register", "reset"].includes(mode) && (
              <label>
                Password
                <input
                  type={showPassword ? "text" : "password"}
                  aria-label="Password"
                  aria-describedby={
                    mode !== "login" ? "password-hint" : undefined
                  }
                  aria-invalid={!!errors.password}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  {...register("password")}
                />
                {errors.password && (
                  <span className="field-error">{errors.password.message}</span>
                )}
                {mode !== "login" && (
                  <small id="password-hint">
                    At least 12 characters. Make it yours.
                  </small>
                )}
              </label>
            )}
            {["login", "register", "reset"].includes(mode) && (
              <button
                className="password-toggle"
                type="button"
                aria-pressed={showPassword}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? "Hide password" : "Show password"}
              </button>
            )}
            {mode === "login" && (
              <Link className="form-link" href="/forgot">
                Forgot your password?
              </Link>
            )}
            {mutation.error && (
              <p className="field-error" role="alert">
                {mutation.error.message}
              </p>
            )}
            {(mode === "verify" || mode === "reset") && !token && (
              <p className="field-error">
                Open the link from your email to continue.
              </p>
            )}
            <button
              className="button primary"
              disabled={
                mutation.isPending ||
                ((mode === "verify" || mode === "reset") && !token)
              }
            >
              {mutation.isPending
                ? "Just a moment…"
                : {
                    login: "Sign in",
                    register: "Create account",
                    forgot: "Send reset link",
                    reset: "Save new password",
                    verify: "Verify email",
                    resend: "Resend verification",
                  }[mode]}
              <ArrowRight size={17} />
            </button>
          </form>
        )}
        {mode === "login" ? (
          <p className="auth-switch">
            <Link href="/resend">Resend verification email</Link>
            <br />
            <br />
            New around here? <Link href="/register">Join VYBE</Link>
          </p>
        ) : (
          <p className="auth-switch">
            Already have an account? <Link href="/login">Sign in</Link>
          </p>
        )}
      </section>
    </div>
  );
}
