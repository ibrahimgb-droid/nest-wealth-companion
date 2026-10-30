import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — Thara" },
      { name: "description", content: "Choose a new password for your Thara account." },
      { property: "og:title", content: "Reset password — Thara" },
      { property: "og:description", content: "Choose a new password for your Thara account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("auth.passwordUpdated"));
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6">
      <h1 className="font-display text-4xl font-medium">{t("auth.newPassword")}</h1>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("auth.newPassword")}
          autoComplete="new-password"
          className="w-full rounded-2xl border border-border bg-surface px-4 py-3.5 text-sm outline-none focus:border-gold"
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-2xl bg-gradient-gold py-4 font-bold text-gold-foreground shadow-gold disabled:opacity-60"
        >
          {t("auth.updatePassword")}
        </button>
      </form>
    </div>
  );
}
