import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, Plus, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { AccountBalance, AccountForm, AccountIcon, accountSubtitle } from "@/components/accounts";
import { PageLoader } from "@/components/page-loader";
import { Segmented } from "@/components/segmented";
import { ensureOnboardingData, useFinance, useUpdateProfile } from "@/lib/data";
import { GCC_CURRENCIES } from "@/lib/currency";
import { CURRENCY_COUNTRY } from "@/lib/finance";
import { useI18n, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Set up your accounts — Thara" },
      { name: "description", content: "Tell Thara about your income and add the cash, bank and credit accounts you spend from." },
      { property: "og:title", content: "Set up your accounts — Thara" },
      { property: "og:description", content: "Tell Thara about your income and add the cash, bank and credit accounts you spend from." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => ensureOnboardingData(context.queryClient),
  pendingComponent: PageLoader,
  component: Onboarding,
});

const STEPS = 4;
const input = "w-full rounded-2xl border border-border bg-surface px-4 py-3.5 text-base outline-none focus:border-gold";

function Onboarding() {
  const { t, locale, setLocale } = useI18n();
  const { profile, accounts } = useFinance();
  const update = useUpdateProfile();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [name, setName] = useState(profile.display_name ?? "");
  const [userType, setUserType] = useState<"expat" | "national">(profile.user_type === "national" ? "national" : "expat");
  const [base, setBase] = useState(profile.base_currency);
  const [income, setIncome] = useState(Number(profile.monthly_income) ? String(profile.monthly_income) : "");
  const [showForm, setShowForm] = useState(accounts.length === 0);

  async function next() {
    try {
      if (step === 0) await update.mutateAsync({ display_name: name.trim() || null, locale });
      if (step === 1)
        await update.mutateAsync({
          user_type: userType,
          base_currency: base,
          pension_country: CURRENCY_COUNTRY[base as keyof typeof CURRENCY_COUNTRY] ?? "AE",
        });
      if (step === 2) await update.mutateAsync({ monthly_income: Number(income.replace(/[^\d.]/g, "")) || 0 });
      if (step === 3) {
        if (accounts.length === 0) {
          toast.error(t("onb.needAccount"));
          return;
        }
        await update.mutateAsync({ onboarded_at: new Date().toISOString() });
        setDone(true);
        return;
      }
      setStep((s) => s + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  }

  if (done) {
    return (
      <Shell>
        <div className="flex flex-1 flex-col justify-center">
          <span className="inline-flex size-14 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Check className="size-7" />
          </span>
          <h1 className="mt-6 font-display text-4xl font-medium tracking-tight">{t("onb.doneTitle")}</h1>
          <p className="mt-3 text-muted-foreground">{t("onb.doneSub")}</p>
        </div>
        <div className="space-y-3">
          <Link
            to="/dashboard"
            search={{ scan: true }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-gold py-4 font-bold text-gold-foreground shadow-gold"
          >
            <ScanLine className="size-5" /> {t("onb.scanFirst")}
          </Link>
          <Link to="/dashboard" className="flex w-full items-center justify-center rounded-2xl border border-border py-4 font-semibold">
            {t("onb.goHome")}
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex items-center gap-3">
        {step > 0 ? (
          <button
            type="button"
            aria-label={t("onb.back")}
            onClick={() => setStep((s) => s - 1)}
            className="inline-flex size-10 items-center justify-center rounded-full border border-border bg-surface"
          >
            <ArrowLeft className="size-4 rtl:rotate-180" />
          </button>
        ) : (
          <span className="font-display text-2xl font-medium text-gold-gradient">{t("app.name")}</span>
        )}
        <div className="flex flex-1 gap-1.5" aria-label={t("onb.step", { n: step + 1, total: STEPS })}>
          {Array.from({ length: STEPS }, (_, i) => (
            <span key={i} className={cn("h-1.5 flex-1 rounded-full", i <= step ? "bg-gold" : "bg-muted")} />
          ))}
        </div>
      </div>
      <p className="mt-6 text-xs font-semibold tracking-widest text-gold uppercase">{t("onb.step", { n: step + 1, total: STEPS })}</p>

      <div className="mt-2 flex-1">
        {step === 0 && (
          <>
            <h1 className="font-display text-4xl font-medium tracking-tight">{t("onb.welcomeTitle")}</h1>
            <p className="mt-3 text-muted-foreground">{t("onb.welcomeSub")}</p>
            <label className="mt-8 block">
              <span className="mb-2 block text-sm font-semibold">{t("onb.nameLabel")}</span>
              <input
                className={input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("onb.namePlaceholder")}
                autoComplete="given-name"
              />
            </label>
            <div className="mt-6">
              <span className="mb-2 block text-sm font-semibold">{t("onb.language")}</span>
              <Segmented
                className="w-full"
                value={locale}
                onChange={(l: Locale) => setLocale(l)}
                options={[
                  { value: "en", label: "English" },
                  { value: "ar", label: "العربية" },
                ]}
              />
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h1 className="font-display text-4xl font-medium tracking-tight">{t("onb.aboutTitle")}</h1>
            <p className="mt-3 text-muted-foreground">{t("onb.aboutSub")}</p>
            <div role="radiogroup" className="mt-8 grid gap-3">
              {(["expat", "national"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={userType === v}
                  onClick={() => setUserType(v)}
                  className={cn(
                    "flex items-center justify-between rounded-3xl border p-5 text-start transition-colors",
                    userType === v ? "border-gold bg-gold-soft" : "border-border bg-surface",
                  )}
                >
                  <span>
                    <span className="block text-lg font-bold">{t(`mode.${v}`)}</span>
                    <span className="block text-sm text-muted-foreground">{t(v === "expat" ? "onb.expatHint" : "onb.nationalHint")}</span>
                  </span>
                  {userType === v && <Check className="size-5 text-gold" />}
                </button>
              ))}
            </div>
            <div className="mt-6">
              <span className="mb-2 block text-sm font-semibold">{t("onb.baseCurrency")}</span>
              <Segmented className="w-full" value={base} onChange={setBase} options={GCC_CURRENCIES.map((c) => ({ value: c, label: c }))} />
              <p className="mt-2 text-xs text-muted-foreground">{t("onb.baseCurrencyHint")}</p>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="font-display text-4xl font-medium tracking-tight">{t("onb.incomeTitle")}</h1>
            <p className="mt-3 text-muted-foreground">{t("onb.incomeSub")}</p>
            <label className="mt-8 block">
              <span className="mb-2 block text-sm font-semibold">{t("onb.incomeLabel", { currency: base })}</span>
              <div className="flex items-baseline gap-3 border-b border-border pb-3">
                <span className="text-lg font-semibold text-gold">{base}</span>
                <input
                  inputMode="decimal"
                  placeholder="0"
                  value={income}
                  onChange={(e) => setIncome(e.target.value.replace(/[^\d.,]/g, ""))}
                  className="w-full bg-transparent font-display text-5xl font-medium tracking-tight outline-none placeholder:text-muted-foreground/40"
                />
              </div>
            </label>
          </>
        )}

        {step === 3 && (
          <>
            <h1 className="font-display text-4xl font-medium tracking-tight">{t("onb.accountsTitle")}</h1>
            <p className="mt-3 text-muted-foreground">{t("onb.accountsSub")}</p>
            {accounts.length > 0 && (
              <ul className="mt-6 divide-y divide-border rounded-3xl border border-border bg-card px-4">
                {accounts.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 py-3">
                    <AccountIcon type={a.account_type} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{a.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {accountSubtitle(a, t)}
                      </span>
                    </span>
                    <AccountBalance account={a} className="text-sm" />
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-5">
              {showForm ? (
                <div className="rounded-3xl border border-border bg-card p-4">
                  <AccountForm defaultCurrency={base} allowLoans={false} onSaved={() => setShowForm(false)} />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-gold/50 py-3.5 text-sm font-semibold text-gold"
                >
                  <Plus className="size-4" /> {t("onb.addAnother")}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={next}
        disabled={update.isPending || (step === 3 && accounts.length === 0)}
        className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-gold py-4 font-bold text-gold-foreground shadow-gold disabled:opacity-50"
      >
        {t("onb.next")} <ArrowRight className="size-4 rtl:rotate-180" />
      </button>
      {step === 3 && accounts.length === 0 && <p className="mt-2 text-center text-xs text-muted-foreground">{t("onb.needAccount")}</p>}
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background px-6 pt-6 pb-10">{children}</div>;
}
