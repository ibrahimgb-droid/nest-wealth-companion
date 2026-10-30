import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import "@lovable.dev/cloud-auth-js/styles.css";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useI18n } from "@/lib/i18n";
import { Segmented } from "@/components/segmented";

type Mode = "signin" | "signup";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { mode?: Mode } => ({
    mode: s.mode === "signup" ? "signup" : s.mode === "signin" ? "signin" : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in — Thara" },
      { name: "description", content: "Sign in or create your Thara account to manage your GCC finances." },
      { property: "og:title", content: "Sign in — Thara" },
      { property: "og:description", content: "Sign in or create your Thara account to manage your GCC finances." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

const field =
  "w-full rounded-2xl border border-border bg-surface px-4 py-3.5 text-sm outline-none transition-colors focus:border-gold";

function AuthPage() {
  const { t } = useI18n();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>(search.mode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) navigate({ to: "/dashboard", replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin, data: { full_name: name } },
        });
        if (error) throw error;
        if (!data.session) setNotice(t("auth.checkEmail"));
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function forgot() {
    if (!email) {
      toast.error(t("auth.email"));
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else setNotice(t("auth.resetSent"));
  }

  async function oauth(provider: "google" | "lovable") {
    const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin });
    if (result.error) {
      toast.error(result.error instanceof Error ? result.error.message : "Sign-in failed");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-6 pt-8 pb-10">
      <Link to="/" className="font-display text-2xl font-medium text-gold-gradient">
        {t("app.name")}
      </Link>

      <h1 className="mt-10 font-display text-4xl font-medium tracking-tight">
        {mode === "signin" ? t("auth.welcome") : t("auth.create")}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("auth.demoNote")}</p>

      <Segmented
        className="mt-6 w-full"
        value={mode}
        onChange={(m) => {
          setMode(m);
          setNotice(null);
        }}
        options={[
          { value: "signin", label: t("auth.signIn") },
          { value: "signup", label: t("auth.signUp") },
        ]}
      />

      <form onSubmit={submit} className="mt-6 space-y-3">
        {mode === "signup" && (
          <input className={field} placeholder={t("auth.name")} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        )}
        <input
          className={field}
          type="email"
          required
          placeholder={t("auth.email")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <input
          className={field}
          type="password"
          required
          minLength={6}
          placeholder={t("auth.password")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
        />
        {mode === "signin" && (
          <button type="button" onClick={forgot} className="text-xs font-semibold text-gold">
            {t("auth.forgot")}
          </button>
        )}
        {notice && <p className="rounded-2xl bg-primary/10 px-4 py-3 text-sm text-primary">{notice}</p>}
        <button
          type="submit"
          disabled={busy}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-gold py-4 font-bold text-gold-foreground shadow-gold disabled:opacity-60"
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          {mode === "signin" ? t("auth.signIn") : t("auth.signUp")}
        </button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {t("auth.or")}
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => oauth("google")}
          className="flex w-full items-center justify-center gap-3 rounded-2xl border border-border bg-surface py-3.5 text-sm font-semibold"
        >
          <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
            <path fill="currentColor" d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.66 4.1-5.35 4.1-3.22 0-5.85-2.67-5.85-5.95S8.78 6.28 12 6.28c1.83 0 3.06.78 3.76 1.45l2.57-2.47C16.68 3.72 14.55 2.8 12 2.8 6.92 2.8 2.8 6.92 2.8 12s4.12 9.2 9.2 9.2c5.31 0 8.83-3.73 8.83-8.98 0-.6-.07-1.06-.15-1.52Z" />
          </svg>
          {t("auth.google")}
        </button>
        <button type="button" className="lovable-auth-button w-full" onClick={() => oauth("lovable")}>
          Continue with Lovable
        </button>
      </div>
    </div>
  );
}
