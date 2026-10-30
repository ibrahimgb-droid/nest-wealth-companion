import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Building2, Landmark, Plus, ReceiptText, ScanLine, Send, Sparkles } from "lucide-react";
import heroImg from "@/assets/hero-pattern.jpg";
import { AppShell, Card, SectionTitle } from "@/components/app-shell";
import { AccountBalance, AccountIcon, AccountSheet } from "@/components/accounts";
import { PageLoader } from "@/components/page-loader";
import { QuickAddSheet } from "@/components/quick-add-sheet";
import { ReceiptSheet } from "@/components/receipt-sheet";
import { Segmented } from "@/components/segmented";
import { TransactionRow } from "@/components/transaction-row";
import { ensureFinanceData, useFinance, useUpdateProfile, type Account } from "@/lib/data";
import { convert, formatMoney } from "@/lib/currency";
import {
  COUNTRY_CURRENCY,
  PENSION_FUND,
  daysLeftInMonth,
  pensionEstimate,
  safeToSpend,
  spendByCategory,
  type PensionCountry,
} from "@/lib/finance";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/dashboard")({
  validateSearch: (s: Record<string, unknown>): { scan?: boolean | undefined } => ({
    scan: s["scan"] === true || s["scan"] === "true" ? true : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Dashboard — Thara" },
      { name: "description", content: "Your net worth by currency, safe-to-spend and remittance or pension overview." },
      { property: "og:title", content: "Dashboard — Thara" },
      { property: "og:description", content: "Your net worth by currency, safe-to-spend and remittance or pension overview." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => ensureFinanceData(context.queryClient),
  pendingComponent: PageLoader,
  component: Dashboard,
});

const REGIONS = ["AE", "SA", "KW"] as const;

function Dashboard() {
  const { t, locale } = useI18n();
  const { profile, accounts, transactions, budgets } = useFinance();
  const updateProfile = useUpdateProfile();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [accountSheet, setAccountSheet] = useState<{ open: boolean; account: Account | null }>({ open: false, account: null });
  const base = profile.base_currency;

  // Arriving from onboarding with "Scan my first receipt" opens the scanner straight away.
  useEffect(() => {
    if (!search.scan) return;
    setReceiptOpen(true);
    void navigate({ to: "/dashboard", search: {}, replace: true });
  }, [search.scan, navigate]);
  const isExpat = profile.user_type === "expat";

  const hour = new Date().getHours();
  const greeting = hour < 12 ? t("greeting.morning") : hour < 17 ? t("greeting.afternoon") : t("greeting.evening");

  const data = useMemo(() => {
    const regions = REGIONS.map((r) => {
      const accs = accounts.filter((a) => a.country === r);
      return { region: r, currency: COUNTRY_CURRENCY[r], total: accs.reduce((s, a) => s + Number(a.balance), 0), count: accs.length };
    }).filter((r) => r.count > 0);
    const netWorth = accounts.reduce((s, a) => s + convert(Number(a.balance), a.currency, base), 0);
    const byCat = spendByCategory(transactions, base);
    const daysLeft = daysLeftInMonth();
    const safe = safeToSpend({ monthlyIncome: Number(profile.monthly_income), spentByCategory: byCat, budgets, daysLeft });

    const remits = transactions.filter((tx) => tx.category === "remittance" && tx.direction === "debit");
    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const remitMonth = byCat["remittance"] ?? 0;
    const remit3 = remits
      .filter((r) => new Date(r.occurred_at) >= threeMonthsAgo)
      .reduce((s, r) => s + convert(Number(r.amount), r.currency, base), 0);

    const homeWealth = convert(Number(profile.home_wealth_value ?? 0), profile.home_currency ?? "USD", base);
    const pc = (profile.pension_country ?? "AE") as PensionCountry;
    const years = profile.pension_years ?? 0;
    const pension = pensionEstimate(pc, Number(profile.pension_salary ?? 0), years);
    const projYears = Math.max(25, years);
    const pensionProj = pensionEstimate(pc, Number(profile.pension_salary ?? 0), projYears);
    const realEstate = Number(profile.real_estate_value ?? 0);

    return { regions, netWorth, safe, daysLeft, remits, remitMonth, remit3, homeWealth, pc, years, pension, projYears, pensionProj, realEstate };
  }, [accounts, transactions, budgets, profile, base]);

  const income = Number(profile.monthly_income) || 1;
  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / income) * 100))}%`;

  return (
    <AppShell eyebrow={greeting} title={profile.display_name ?? t("app.name")}>
      <div className="mb-5 flex justify-center">
        <Segmented
          className="w-full"
          value={profile.user_type as "expat" | "national"}
          onChange={(v) => updateProfile.mutate({ user_type: v })}
          options={[
            { value: "expat", label: t("mode.expat") },
            { value: "national", label: t("mode.national") },
          ]}
        />
      </div>

      {/* Net worth */}
      <section className="relative overflow-hidden rounded-[2rem] bg-gradient-hero p-6 shadow-emerald">
        <img src={heroImg} alt="" width={1024} height={1536} className="absolute inset-0 h-full w-full object-cover opacity-20 mix-blend-luminosity" />
        <div className="relative">
          <p className="text-xs font-semibold tracking-widest text-gold uppercase">{t("dash.netWorth")}</p>
          <p className="mt-2 font-display text-[2.4rem] leading-none font-medium tracking-tight whitespace-nowrap">
            {formatMoney(data.netWorth, base, locale)}
          </p>
          <p className="mt-2 text-xs text-foreground/60">{t("dash.netWorthHint", { currency: base })}</p>

          <ul className="mt-6 space-y-2.5">
            {data.regions.map((r) => (
              <li key={r.region} className="flex items-center justify-between rounded-2xl bg-background/30 px-4 py-3 backdrop-blur">
                <span className="flex min-w-0 items-center gap-2.5 text-sm font-medium">
                  <span className="rounded-md bg-gold-soft px-1.5 py-0.5 text-[10px] font-bold text-gold">{r.region}</span>
                  <span className="truncate">{t(`dash.region.${r.region}`)}</span>
                </span>
                <span className="shrink-0 whitespace-nowrap ps-2 font-bold tabular-nums">{formatMoney(r.total, r.currency, locale)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Quick actions */}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setReceiptOpen(true)}
          className="flex flex-col items-start gap-3 rounded-3xl bg-gradient-gold p-4 text-start text-gold-foreground shadow-gold active:scale-[0.98]"
        >
          <ScanLine className="size-6" />
          <span>
            <span className="block font-bold">{t("dash.scanTitle")}</span>
            <span className="block text-xs opacity-75">{t("dash.scanHint")}</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setQuickOpen(true)}
          className="flex flex-col items-start gap-3 rounded-3xl border border-gold/30 bg-card p-4 text-start shadow-card active:scale-[0.98]"
        >
          <ReceiptText className="size-6 text-gold" />
          <span>
            <span className="block font-bold">{t("tx.addCash")}</span>
            <span className="block text-xs text-muted-foreground">{t("dash.addHint")}</span>
          </span>
        </button>
      </div>

      {/* Accounts */}
      <Card className="mt-5">
        <SectionTitle
          action={
            <button
              type="button"
              onClick={() => setAccountSheet({ open: true, account: null })}
              className="inline-flex items-center gap-1 text-xs font-semibold text-gold"
            >
              <Plus className="size-3.5" /> {t("acct.add")}
            </button>
          }
        >
          {t("acct.title")}
        </SectionTitle>
        {accounts.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">{t("acct.empty")}</p>
        ) : (
          <ul className="-mx-1 divide-y divide-border">
            {accounts.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => setAccountSheet({ open: true, account: a })}
                  className="flex w-full items-center gap-3 px-1 py-3 text-start"
                >
                  <AccountIcon type={a.account_type} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{a.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[a.institution, a.currency].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <AccountBalance account={a} className="text-sm" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Safe to spend */}
      <Card className="mt-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
              <Sparkles className="size-4 text-gold" /> {t("dash.safeToSpend")}
            </p>
            <p className="mt-1 font-display text-[2rem] leading-tight font-medium tracking-tight whitespace-nowrap text-primary">
              {formatMoney(data.safe.amount, base, locale)}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-gold-soft px-3 py-1 text-xs font-bold whitespace-nowrap text-gold">
            {t("common.perDay", { amount: formatMoney(data.safe.perDay, base, locale, { compact: true }) })}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{t("dash.daysLeft", { days: data.daysLeft })}</p>

        <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-secondary-foreground/40" style={{ width: pct(data.safe.spent) }} />
          <div className="h-full bg-gold" style={{ width: pct(data.safe.reserved) }} />
          <div className="h-full bg-primary" style={{ width: pct(data.safe.amount) }} />
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div>
            <dt className="text-muted-foreground">{t("dash.income")}</dt>
            <dd className="font-bold tabular-nums">{formatMoney(Number(profile.monthly_income), base, locale, { compact: true })}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-muted-foreground">
              <span className="size-2 rounded-full bg-secondary-foreground/40" /> {t("dash.spent")}
            </dt>
            <dd className="font-bold tabular-nums">{formatMoney(data.safe.spent, base, locale, { compact: true })}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-muted-foreground">
              <span className="size-2 rounded-full bg-gold" /> {t("dash.reserved")}
            </dt>
            <dd className="font-bold tabular-nums">{formatMoney(data.safe.reserved, base, locale, { compact: true })}</dd>
          </div>
        </dl>
      </Card>

      {/* Mode-specific */}
      {isExpat ? (
        <div className="mt-5 grid gap-5">
          <Card>
            <SectionTitle>
              <span className="flex items-center gap-2">
                <Send className="size-4 text-gold" /> {t("dash.remittances")}
              </span>
            </SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-surface p-3">
                <p className="text-xs text-muted-foreground">{t("dash.sentThisMonth")}</p>
                <p className="mt-1 text-lg font-bold tabular-nums">{formatMoney(data.remitMonth, base, locale)}</p>
              </div>
              <div className="rounded-2xl bg-surface p-3">
                <p className="text-xs text-muted-foreground">{t("dash.last3Months")}</p>
                <p className="mt-1 text-lg font-bold tabular-nums">{formatMoney(data.remit3, base, locale)}</p>
              </div>
            </div>
            <ul className="mt-3 divide-y divide-border">
              {data.remits.slice(0, 3).map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="truncate">{r.merchant_name}</span>
                  <span className="shrink-0 font-semibold tabular-nums">{formatMoney(Number(r.amount), r.currency, locale)}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <SectionTitle>
              <span className="flex items-center gap-2">
                <Building2 className="size-4 text-gold" /> {t("dash.homeWealth")}
              </span>
            </SectionTitle>
            <p className="text-xs text-muted-foreground">{t("dash.homeWealthHint", { country: profile.home_country ?? "—" })}</p>
            <div className="mt-2 flex items-end justify-between gap-3">
              <p className="font-display text-3xl font-medium">
                {formatMoney(Number(profile.home_wealth_value ?? 0), profile.home_currency ?? "USD", locale, { compact: true })}
              </p>
              <p className="pb-1 text-sm text-muted-foreground">≈ {formatMoney(data.homeWealth, base, locale, { compact: true })}</p>
            </div>
            <div className="mt-4 flex items-center justify-between rounded-2xl bg-gold-soft px-4 py-3">
              <span className="text-sm font-medium">{t("dash.globalNetWorth")}</span>
              <span className="font-bold text-gold tabular-nums">{formatMoney(data.netWorth + data.homeWealth, base, locale)}</span>
            </div>
          </Card>
        </div>
      ) : (
        <div className="mt-5 grid gap-5">
          <Card>
            <SectionTitle>
              <span className="flex items-center gap-2">
                <Landmark className="size-4 text-gold" /> {t("dash.pension")} · {PENSION_FUND[data.pc]}
              </span>
            </SectionTitle>
            <p className="text-xs text-muted-foreground">{t("dash.yearsService", { years: data.years })}</p>
            <p className="mt-2 font-display text-3xl font-medium">
              {data.pension.eligible
                ? formatMoney(data.pension.monthly, COUNTRY_CURRENCY[data.pc], locale)
                : t("dash.notEligible")}
            </p>
            <div className="mt-4 rounded-2xl bg-surface p-3">
              <p className="text-xs text-muted-foreground">{t("dash.projected", { years: data.projYears })}</p>
              <div className="mt-1 flex items-baseline justify-between">
                <p className="text-lg font-bold text-primary tabular-nums">
                  {formatMoney(data.pensionProj.monthly, COUNTRY_CURRENCY[data.pc], locale)}
                </p>
                <span className="text-xs font-bold text-gold">{data.pensionProj.pct}%</span>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">{t("dash.indicative")}</p>
          </Card>

          <Card>
            <SectionTitle>
              <span className="flex items-center gap-2">
                <Building2 className="size-4 text-gold" /> {t("dash.realEstate")}
              </span>
            </SectionTitle>
            <p className="text-sm">{profile.real_estate_label ?? "—"}</p>
            <p className="mt-1 font-display text-3xl font-medium">{formatMoney(data.realEstate, base, locale)}</p>
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-gradient-gold"
                style={{ width: `${(data.realEstate / Math.max(1, data.realEstate + data.netWorth)) * 100}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("dash.shareOfNetWorth", {
                pct: Math.round((data.realEstate / Math.max(1, data.realEstate + data.netWorth)) * 100),
              })}
            </p>
          </Card>
        </div>
      )}

      {/* Recent */}
      <div className="mt-6">
        <SectionTitle
          action={
            <Link to="/transactions" className="text-xs font-semibold text-gold">
              {t("common.viewAll")}
            </Link>
          }
        >
          {t("dash.recent")}
        </SectionTitle>
        {transactions.length === 0 ? (
          <button
            type="button"
            onClick={() => setReceiptOpen(true)}
            className="flex w-full flex-col items-center gap-2 rounded-3xl border border-dashed border-gold/40 px-6 py-8 text-center text-sm text-muted-foreground"
          >
            <ScanLine className="size-6 text-gold" />
            {t("dash.noActivity")}
          </button>
        ) : (
          <ul className="divide-y divide-border">
            {transactions.slice(0, 5).map((tx) => (
              <TransactionRow key={tx.id} tx={tx} account={accounts.find((a) => a.id === tx.account_id)} />
            ))}
          </ul>
        )}
      </div>

      <ReceiptSheet open={receiptOpen} onOpenChange={setReceiptOpen} />
      <QuickAddSheet open={quickOpen} onOpenChange={setQuickOpen} />
      <AccountSheet
        open={accountSheet.open}
        onOpenChange={(open) => setAccountSheet((s) => ({ ...s, open }))}
        account={accountSheet.account}
        defaultCurrency={base}
      />
    </AppShell>
  );
}
