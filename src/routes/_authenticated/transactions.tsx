import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { arSA, enUS } from "date-fns/locale";
import { ReceiptText, ScanLine, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageLoader } from "@/components/page-loader";
import { QuickAddSheet } from "@/components/quick-add-sheet";
import { ReceiptSheet } from "@/components/receipt-sheet";
import { TransactionRow } from "@/components/transaction-row";
import { ensureFinanceData, useFinance, type Transaction } from "@/lib/data";
import { GCC_CURRENCIES } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/transactions")({
  head: () => ({
    meta: [
      { title: "Ledger — Thara" },
      { name: "description", content: "Clean, Shariah-tagged transaction history across your AED, SAR and KWD accounts." },
      { property: "og:title", content: "Ledger — Thara" },
      { property: "og:description", content: "Clean, Shariah-tagged transaction history across your AED, SAR and KWD accounts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => ensureFinanceData(context.queryClient),
  pendingComponent: PageLoader,
  component: Transactions,
});

type Filter = "all" | "halal" | "nonHalal" | (typeof GCC_CURRENCIES)[number];

function Transactions() {
  const { t, locale } = useI18n();
  const { transactions, accounts } = useFinance();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [quickOpen, setQuickOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = transactions.filter((tx) => {
      if (filter === "halal" && !tx.shariah_compliant) return false;
      if (filter === "nonHalal" && tx.shariah_compliant) return false;
      if ((GCC_CURRENCIES as readonly string[]).includes(filter) && tx.currency !== filter) return false;
      if (needle && !`${tx.merchant_name} ${tx.merchant_raw ?? ""}`.toLowerCase().includes(needle)) return false;
      return true;
    });
    const map = new Map<string, Transaction[]>();
    for (const tx of list) {
      const key = format(new Date(tx.occurred_at), "yyyy-MM-dd");
      map.set(key, [...(map.get(key) ?? []), tx]);
    }
    return [...map.entries()];
  }, [transactions, q, filter]);

  const dayLabel = (iso: string) => {
    const d = new Date(iso);
    if (isToday(d)) return t("tx.today");
    if (isYesterday(d)) return t("tx.yesterday");
    return format(d, "EEEE, d MMM", { locale: locale === "ar" ? arSA : enUS });
  };

  const filters: { value: Filter; label: string }[] = [
    { value: "all", label: t("tx.filter.all") },
    { value: "halal", label: t("tx.filter.halal") },
    { value: "nonHalal", label: t("tx.filter.nonHalal") },
    ...GCC_CURRENCIES.map((c) => ({ value: c as Filter, label: c })),
  ];

  return (
    <AppShell title={t("tx.title")} fab={false}>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setQuickOpen(true)}
          className="flex flex-col items-start gap-3 rounded-3xl bg-gradient-gold p-4 text-start text-gold-foreground shadow-gold active:scale-[0.98]"
        >
          <ReceiptText className="size-6" />
          <span>
            <span className="block font-bold">{t("tx.addCash")}</span>
            <span className="block text-xs opacity-75">{t("tx.addCashHint")}</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setReceiptOpen(true)}
          className="flex flex-col items-start gap-3 rounded-3xl border border-gold/30 bg-card p-4 text-start shadow-card active:scale-[0.98]"
        >
          <ScanLine className="size-6 text-gold" />
          <span>
            <span className="block font-bold">{t("tx.receipt")}</span>
            <span className="block text-xs text-muted-foreground">{t("tx.receiptHint")}</span>
          </span>
        </button>
      </div>

      <label className="mt-5 flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3">
        <Search className="size-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("tx.search")}
          className="w-full bg-transparent text-sm outline-none"
        />
      </label>

      <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5">
        {filters.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
              filter === f.value ? "border-gold bg-gold-soft text-gold" : "border-border text-muted-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-5">
        {groups.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">{t("tx.empty")}</p>}
        {groups.map(([day, txs]) => (
          <section key={day}>
            <h2 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{dayLabel(txs[0]?.occurred_at ?? day)}</h2>
            <ul className="divide-y divide-border">
              {txs.map((tx) => (
                <TransactionRow key={tx.id} tx={tx} account={accounts.find((a) => a.id === tx.account_id)} />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <QuickAddSheet open={quickOpen} onOpenChange={setQuickOpen} />
      <ReceiptSheet open={receiptOpen} onOpenChange={setReceiptOpen} />
    </AppShell>
  );
}
