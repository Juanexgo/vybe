"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2 } from "lucide-react";
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
  const [token, setToken] = useState("");
  useEffect(() => {
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
    <div className="auth-layout">
      <aside className="auth-art">
        <div className="auth-quote">
          <span className="eyebrow">
            STORIES ARE BETTER WHEN THEY FIND YOU.
          </span>
          <h2>
            There’s a whole
            <br />
            world of <em>different.</em>
          </h2>
          <span>Let it in.</span>
        </div>
      </aside>
      <section className="auth-form">
        <span className="eyebrow">WELCOME TO VYBE</span>
        <h1>{heading}</h1>
        <p>{subtitle}</p>
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
                  type="password"
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
