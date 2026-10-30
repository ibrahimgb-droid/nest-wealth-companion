import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Globe2, Languages, ShieldCheck } from "lucide-react";
import heroImg from "@/assets/hero-pattern.jpg";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Thara — Wealth, the Gulf way" },
      {
        name: "description",
        content: "One ledger for AED, SAR and KWD with Shariah tracking, remittances and national pension estimates.",
      },
      { property: "og:title", content: "Thara — Wealth, the Gulf way" },
      {
        property: "og:description",
        content: "One ledger for AED, SAR and KWD with Shariah tracking, remittances and national pension estimates.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { t, locale, setLocale } = useI18n();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);

  const features = [
    { icon: Globe2, label: t("landing.f1") },
    { icon: ShieldCheck, label: t("landing.f2") },
    { icon: Languages, label: t("landing.f3") },
  ];

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col overflow-hidden bg-background">
      <img
        src={heroImg}
        alt=""
        width={1024}
        height={1536}
        className="absolute inset-0 h-full w-full object-cover opacity-70"
      />
      <div className="absolute inset-0 bg-gradient-fade" />

      <div className="relative flex items-center justify-between px-6 pt-6">
        <span className="font-display text-2xl font-medium text-gold-gradient">{t("app.name")}</span>
        <button
          type="button"
          onClick={() => setLocale(locale === "en" ? "ar" : "en")}
          className="rounded-full border border-border bg-surface/70 px-3 py-1.5 text-xs font-semibold backdrop-blur"
        >
          {locale === "en" ? "العربية" : "English"}
        </button>
      </div>

      <div className="relative mt-auto px-6 pb-10">
        <h1 className="font-display text-5xl leading-[1.05] font-medium tracking-tight">{t("landing.headline")}</h1>
        <p className="mt-4 text-base text-muted-foreground">{t("landing.sub")}</p>

        <ul className="mt-6 space-y-2.5">
          {features.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-3 text-sm font-medium">
              <span className="inline-flex size-8 items-center justify-center rounded-full bg-gold-soft text-gold">
                <Icon className="size-4" />
              </span>
              {label}
            </li>
          ))}
        </ul>

        <div className="mt-8 space-y-3">
          {signedIn ? (
            <Link
              to="/dashboard"
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-gold py-4 font-bold text-gold-foreground shadow-gold"
            >
              {t("landing.open")} <ArrowRight className="size-4 rtl:rotate-180" />
            </Link>
          ) : (
            <>
              <Link
                to="/auth"
                search={{ mode: "signup" }}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-gold py-4 font-bold text-gold-foreground shadow-gold"
              >
                {t("landing.cta")} <ArrowRight className="size-4 rtl:rotate-180" />
              </Link>
              <Link
                to="/auth"
                search={{ mode: "signin" }}
                className="flex w-full items-center justify-center rounded-2xl border border-border bg-surface/70 py-4 font-semibold backdrop-blur"
              >
                {t("landing.signIn")}
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
