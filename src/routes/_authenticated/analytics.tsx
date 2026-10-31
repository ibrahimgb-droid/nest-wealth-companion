import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { format } from "date-fns";
import { arSA, enUS } from "date-fns/locale";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, XAxis } from "recharts";
import { ShieldCheck } from "lucide-react";
import { AppShell, Card, SectionTitle } from "@/components/app-shell";
import { PageLoader } from "@/components/page-loader";
import { ensureFinanceData, useFinance } from "@/lib/data";
import { convert, formatMoney } from "@/lib/currency";
import { isInMonth, isTransfer, spendByCategory } from "@/lib/finance";
import { useI18n, type MessageKey } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Insights — Thara" },
      { name: "description", content: "Spending by category, income trends, Shariah compliance and currency exposure." },
      { property: "og:title", content: "Insights — Thara" },
      { property: "og:description", content: "Spending by category, income trends, Shariah compliance and currency exposure." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => ensureFinanceData(context.queryClient),
  pendingComponent: PageLoader,
  component: Analytics,
});

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--muted-foreground)"];

function Analytics() {
  const { t, locale } = useI18n();
  const { profile, accounts, transactions } = useFinance();
  const base = profile.base_currency;
  const money = (n: number, compact = false) => formatMoney(n, base, locale, { compact });

  const d = useMemo(() => {
    const byCat = Object.entries(spendByCategory(transactions, base))
      .map(([category, value]) => ({ category, value }))
      .sort((a, b) => b.value - a.value);
    const top5 = byCat.slice(0, 5);
    const rest = byCat.slice(5).reduce((s, c) => s + c.value, 0);
    const pie = rest > 0 ? [...top5, { category: "other", value: rest }] : top5;
    const totalSpend = byCat.reduce((s, c) => s + c.value, 0);

    const now = new Date();
    const months = [2, 1, 0].map((m) => {
      const ref = new Date(now.getFullYear(), now.getMonth() - m, 15);
      let income = 0;
      let spend = 0;
      for (const tx of transactions) {
        if (!isInMonth(tx.occurred_at, ref) || isTransfer(tx)) continue;
        const v = convert(Number(tx.amount), tx.currency, base);
        if (tx.direction === "credit") income += v;
        else spend += v;
      }
      return { label: format(ref, "MMM", { locale: locale === "ar" ? arSA : enUS }), income, spend };
    });

    const monthTx = transactions.filter((tx) => tx.direction === "debit" && !isTransfer(tx) && isInMonth(tx.occurred_at));
    const compliant = monthTx.filter((tx) => tx.shariah_compliant).reduce((s, tx) => s + convert(Number(tx.amount), tx.currency, base), 0);
    const shariahPct = totalSpend > 0 ? Math.round((compliant / totalSpend) * 100) : 100;

    const exposureMap: Record<string, number> = {};
    for (const a of accounts) exposureMap[a.currency] = (exposureMap[a.currency] ?? 0) + convert(Number(a.balance), a.currency, base);
    const exposureTotal = Object.values(exposureMap).reduce((s, v) => s + Math.max(0, v), 0) || 1;
    const exposure = Object.entries(exposureMap)
      .map(([currency, value]) => ({ currency, value, pct: Math.max(0, value) / exposureTotal }))
      .sort((a, b) => b.value - a.value);

    const merchantMap = new Map<string, number>();
    for (const tx of monthTx) {
      const key = tx.merchant_name.split(" · ")[0] ?? tx.merchant_name;
      merchantMap.set(key, (merchantMap.get(key) ?? 0) + convert(Number(tx.amount), tx.currency, base));
    }
    const merchants = [...merchantMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    return { pie, totalSpend, months, shariahPct, exposure, merchants };
  }, [transactions, accounts, base, locale]);

  return (
    <AppShell title={t("analytics.title")} eyebrow={t("common.thisMonth")}>
      <Card>
        <SectionTitle>{t("analytics.byCategory")}</SectionTitle>
        <div className="relative h-52">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={d.pie} dataKey="value" nameKey="category" innerRadius="68%" outerRadius="100%" paddingAngle={2} stroke="none">
                {d.pie.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xs text-muted-foreground">{t("analytics.spending")}</span>
            <span className="font-display text-xl font-medium">{money(d.totalSpend, true)}</span>
          </div>
        </div>
        <ul className="mt-4 space-y-2">
          {d.pie.map((c, i) => (
            <li key={c.category} className="flex items-center gap-3 text-sm">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              <span className="flex-1">{t(`cat.${c.category}` as MessageKey)}</span>
              <span className="font-semibold tabular-nums">{money(c.value)}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="mt-5">
        <SectionTitle>{t("analytics.trend")}</SectionTitle>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={d.months} barGap={4}>
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
              <Bar dataKey="income" fill="var(--chart-1)" radius={[8, 8, 0, 0]} />
              <Bar dataKey="spend" fill="var(--chart-2)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-chart-1" /> {t("analytics.income")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-chart-2" /> {t("analytics.spending")}
          </span>
        </div>
      </Card>

      <Card className="mt-5">
        <SectionTitle>{t("analytics.shariah")}</SectionTitle>
        <div className="flex items-center gap-4">
          <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <ShieldCheck className="size-7" />
          </span>
          <div>
            <p className="font-display text-3xl font-medium text-primary">{d.shariahPct}%</p>
            <p className="text-xs text-muted-foreground">{t("analytics.shariahDesc")}</p>
          </div>
        </div>
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-warning/30">
          <div className="h-full rounded-full bg-primary" style={{ width: `${d.shariahPct}%` }} />
        </div>
      </Card>

      <Card className="mt-5">
        <SectionTitle>{t("analytics.exposure")}</SectionTitle>
        <ul className="space-y-3">
          {d.exposure.map((e) => (
            <li key={e.currency}>
              <div className="mb-1 flex justify-between text-sm">
                <span className="font-semibold">{e.currency}</span>
                <span className="tabular-nums text-muted-foreground">
                  {money(e.value, true)} · {Math.round(e.pct * 100)}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-gradient-gold" style={{ width: `${e.pct * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="mt-5">
        <SectionTitle>{t("analytics.topMerchants")}</SectionTitle>
        <ol className="space-y-2.5">
          {d.merchants.map(([name, value], i) => (
            <li key={name} className="flex items-center gap-3 text-sm">
              <span className="w-5 font-display text-gold">{i + 1}</span>
              <span className="flex-1 truncate">{name}</span>
              <span className="font-semibold tabular-nums">{money(value)}</span>
            </li>
          ))}
        </ol>
      </Card>
    </AppShell>
  );
}
