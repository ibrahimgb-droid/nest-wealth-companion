import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { AppShell, Card, SectionTitle } from "@/components/app-shell";
import { PageLoader } from "@/components/page-loader";
import { Segmented } from "@/components/segmented";
import { supabase } from "@/integrations/supabase/client";
import { ensureFinanceData, useFinance, useUpdateProfile } from "@/lib/data";
import { GCC_CURRENCIES, HOME_CURRENCIES } from "@/lib/currency";
import { PENSION_FUND, type PensionCountry } from "@/lib/finance";
import { useI18n, type Locale } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Thara" },
      { name: "description", content: "Manage your profile, base currency, language and Expat or National details." },
      { property: "og:title", content: "Settings — Thara" },
      { property: "og:description", content: "Manage your profile, base currency, language and Expat or National details." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => ensureFinanceData(context.queryClient),
  pendingComponent: PageLoader,
  component: Settings,
});

const input = "w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-gold";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Settings() {
  const { t, locale, setLocale } = useI18n();
  const { profile } = useFinance();
  const update = useUpdateProfile();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    display_name: profile.display_name ?? "",
    user_type: profile.user_type as "expat" | "national",
    base_currency: profile.base_currency,
    monthly_income: String(profile.monthly_income ?? ""),
    home_country: profile.home_country ?? "",
    home_currency: profile.home_currency ?? "INR",
    home_wealth_value: String(profile.home_wealth_value ?? ""),
    pension_country: (profile.pension_country ?? "AE") as PensionCountry,
    pension_salary: String(profile.pension_salary ?? ""),
    pension_years: String(profile.pension_years ?? ""),
    real_estate_label: profile.real_estate_label ?? "",
    real_estate_value: String(profile.real_estate_value ?? ""),
  });
  const [lang, setLang] = useState<Locale>(locale);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const num = (s: string) => Number(s.replace(/[^\d.]/g, "")) || 0;

  async function save() {
    await update.mutateAsync({
      display_name: form.display_name.trim() || null,
      user_type: form.user_type,
      base_currency: form.base_currency,
      monthly_income: num(form.monthly_income),
      home_country: form.home_country,
      home_currency: form.home_currency,
      home_wealth_value: num(form.home_wealth_value),
      pension_country: form.pension_country,
      pension_salary: num(form.pension_salary),
      pension_years: Math.round(num(form.pension_years)),
      real_estate_label: form.real_estate_label,
      real_estate_value: num(form.real_estate_value),
      locale: lang,
    });
    setLocale(lang);
    toast.success(t("settings.saved"));
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <AppShell title={t("settings.title")} fab={false}>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Card className="space-y-4">
          <Field label={t("settings.name")}>
            <input className={input} value={form.display_name} onChange={(e) => set("display_name", e.target.value)} />
          </Field>
          <Field label={t("settings.userType")}>
            <Segmented
              className="w-full"
              value={form.user_type}
              onChange={(v) => set("user_type", v)}
              options={[
                { value: "expat", label: t("mode.expat") },
                { value: "national", label: t("mode.national") },
              ]}
            />
          </Field>
          <Field label={t("settings.baseCurrency")}>
            <Segmented
              className="w-full"
              value={form.base_currency}
              onChange={(v) => set("base_currency", v)}
              options={GCC_CURRENCIES.map((c) => ({ value: c, label: c }))}
            />
          </Field>
          <Field label={t("settings.language")}>
            <Segmented
              className="w-full"
              value={lang}
              onChange={setLang}
              options={[
                { value: "en", label: "English" },
                { value: "ar", label: "العربية" },
              ]}
            />
          </Field>
          <Field label={`${t("settings.income")} (${form.base_currency})`}>
            <input className={input} inputMode="decimal" value={form.monthly_income} onChange={(e) => set("monthly_income", e.target.value)} />
          </Field>
        </Card>

        {form.user_type === "expat" ? (
          <Card className="space-y-4">
            <SectionTitle>{t("settings.expat")}</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("settings.homeCountry")}>
                <input className={input} value={form.home_country} onChange={(e) => set("home_country", e.target.value)} />
              </Field>
              <Field label={t("settings.homeCurrency")}>
                <select className={input} value={form.home_currency} onChange={(e) => set("home_currency", e.target.value)}>
                  {HOME_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label={`${t("settings.homeWealth")} (${form.home_currency})`}>
              <input className={input} inputMode="decimal" value={form.home_wealth_value} onChange={(e) => set("home_wealth_value", e.target.value)} />
            </Field>
          </Card>
        ) : (
          <Card className="space-y-4">
            <SectionTitle>{t("settings.national")}</SectionTitle>
            <Field label={t("settings.pensionCountry")}>
              <Segmented
                className="w-full"
                value={form.pension_country}
                onChange={(v) => set("pension_country", v)}
                options={(["AE", "SA", "KW"] as const).map((c) => ({ value: c, label: PENSION_FUND[c] }))}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("settings.pensionSalary")}>
                <input className={input} inputMode="decimal" value={form.pension_salary} onChange={(e) => set("pension_salary", e.target.value)} />
              </Field>
              <Field label={t("settings.pensionYears")}>
                <input className={input} inputMode="numeric" value={form.pension_years} onChange={(e) => set("pension_years", e.target.value)} />
              </Field>
            </div>
            <Field label={t("settings.realEstateLabel")}>
              <input className={input} value={form.real_estate_label} onChange={(e) => set("real_estate_label", e.target.value)} />
            </Field>
            <Field label={`${t("settings.realEstateValue")} (${form.base_currency})`}>
              <input className={input} inputMode="decimal" value={form.real_estate_value} onChange={(e) => set("real_estate_value", e.target.value)} />
            </Field>
          </Card>
        )}

        <button
          type="submit"
          disabled={update.isPending}
          className="w-full rounded-2xl bg-gradient-gold py-4 font-bold text-gold-foreground shadow-gold disabled:opacity-60"
        >
          {t("common.save")}
        </button>
      </form>

      <button
        type="button"
        onClick={signOut}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-border py-3.5 text-sm font-semibold text-muted-foreground"
      >
        <LogOut className="size-4 rtl:rotate-180" /> {t("common.signOut")}
      </button>
    </AppShell>
  );
}
