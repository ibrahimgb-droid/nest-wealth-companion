import { useState } from "react";
import { toast } from "sonner";
import { Camera, Check, Loader2, ScanLine } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useAddTransactions, useFinance } from "@/lib/data";
import { formatMoney } from "@/lib/currency";
import { evaluateSpend } from "@/lib/spend-guard";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "./category-icon";
import { Segmented } from "./segmented";

type Item = { name: string; price: number; category: string };
const RECEIPTS: Record<"carrefour" | "costco", { merchant: string; raw: string; items: Item[] }> = {
  carrefour: {
    merchant: "Carrefour City Centre Deira",
    raw: "CARREFOUR CCD 0112 DXB AE",
    items: [
      { name: "Almarai Fresh Milk 2L", price: 12.5, category: "groceries" },
      { name: "Al Ain Water 12×1.5L", price: 15.75, category: "groceries" },
      { name: "Khalas Dates 1kg", price: 42.0, category: "groceries" },
      { name: "Basmati Rice 5kg", price: 54.0, category: "groceries" },
      { name: "Chicken Breast 1kg", price: 38.5, category: "groceries" },
      { name: "JBL Tune Buds", price: 299.0, category: "electronics" },
      { name: "Anker USB-C Cable 2m", price: 39.0, category: "electronics" },
    ],
  },
  costco: {
    merchant: "Costco Wholesale",
    raw: "COSTCO WHSE #1204 POS 88",
    items: [
      { name: "Kirkland Olive Oil 2L", price: 69.0, category: "groceries" },
      { name: "Rotisserie Chicken", price: 25.0, category: "groceries" },
      { name: "Kirkland Mixed Nuts 1.1kg", price: 89.0, category: "groceries" },
      { name: 'Samsung 55" Crystal UHD TV', price: 1899.0, category: "electronics" },
      { name: "Duracell AA ×40", price: 48.0, category: "electronics" },
    ],
  },
};

export function ReceiptSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t, locale } = useI18n();
  const { profile, accounts, budgets, transactions } = useFinance();
  const add = useAddTransactions();
  const [which, setWhich] = useState<"carrefour" | "costco">("carrefour");
  const [stage, setStage] = useState<"idle" | "scanning" | "done">("idle");

  const receipt = RECEIPTS[which];
  const groups = Object.entries(
    receipt.items.reduce<Record<string, Item[]>>((acc, i) => {
      (acc[i.category] ??= []).push(i);
      return acc;
    }, {}),
  );
  const total = receipt.items.reduce((s, i) => s + i.price, 0);
  const catLabel = (c: string) => t(`cat.${c}` as MessageKey);

  function snap() {
    setStage("scanning");
    window.setTimeout(() => setStage("done"), 1400);
  }

  async function confirm() {
    for (const [cat, items] of groups) {
      const sum = items.reduce((s, i) => s + i.price, 0);
      const check = evaluateSpend(profile, budgets, transactions, cat, sum, "AED");
      if (!check.allowed) {
        toast.error(t("quick.blocked", { amount: formatMoney(check.remaining, check.base, locale), category: catLabel(cat) }));
        return;
      }
    }
    const account =
      accounts.find((a) => a.currency === "AED" && a.account_type === "current") ??
      accounts.find((a) => a.currency === "AED") ??
      null;
    const receiptId = crypto.randomUUID();
    const now = new Date().toISOString();
    await add.mutateAsync(
      groups.map(([cat, items]) => ({
        account_id: account?.id ?? null,
        merchant_raw: receipt.raw,
        merchant_name: `${receipt.merchant} · ${catLabel(cat)}`,
        amount: Math.round(items.reduce((s, i) => s + i.price, 0) * 100) / 100,
        currency: "AED",
        category: cat,
        direction: "debit",
        payment_method: "card",
        shariah_compliant: true,
        receipt_id: receiptId,
        occurred_at: now,
      })),
    );
    toast.success(t("receipt.saved", { n: groups.length }));
    setStage("idle");
    onOpenChange(false);
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => {
        if (!o) setStage("idle");
        onOpenChange(o);
      }}
    >
      <DrawerContent className="mx-auto max-h-[92vh] max-w-md">
        <div className="overflow-y-auto px-5 pt-3 pb-8">
          <DrawerTitle className="mb-1 flex items-center gap-2 text-base font-semibold">
            <ScanLine className="size-5 text-gold" /> {t("receipt.title")}
          </DrawerTitle>
          <p className="mb-4 text-xs text-muted-foreground">{t("receipt.demo")}</p>

          <Segmented
            className="mb-4 w-full"
            size="sm"
            value={which}
            onChange={(v) => {
              setWhich(v);
              setStage("idle");
            }}
            options={[
              { value: "carrefour", label: "Carrefour" },
              { value: "costco", label: "Costco" },
            ]}
          />

          {stage !== "done" ? (
            <div className="relative overflow-hidden rounded-3xl border border-dashed border-gold/40 bg-surface p-5">
              <div className="space-y-2 font-mono text-[11px] text-muted-foreground/70" aria-hidden>
                <p className="text-center font-bold text-foreground/70">{receipt.merchant.toUpperCase()}</p>
                {receipt.items.map((i) => (
                  <div key={i.name} className="flex justify-between">
                    <span>{i.name}</span>
                    <span>{i.price.toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-dashed border-border pt-2 font-bold">
                  <span>TOTAL AED</span>
                  <span>{total.toFixed(2)}</span>
                </div>
              </div>
              {stage === "scanning" && (
                <>
                  <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-gold shadow-gold animate-scan" />
                  <div className="absolute inset-0 flex items-center justify-center bg-overlay/40">
                    <span className="inline-flex items-center gap-2 rounded-full bg-card px-4 py-2 text-sm font-semibold">
                      <Loader2 className="size-4 animate-spin text-gold" /> {t("receipt.scanning")}
                    </span>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-primary">
                <Check className="size-4" />
                {t("receipt.detected", { count: receipt.items.length, groups: groups.length })}
              </p>
              {groups.map(([cat, items]) => (
                <div key={cat} className="rounded-3xl border border-border bg-surface p-4">
                  <div className="mb-2 flex items-center gap-3">
                    <CategoryIcon category={cat} size="sm" />
                    <span className="flex-1 font-semibold">{catLabel(cat)}</span>
                    <span className="font-bold tabular-nums">
                      {formatMoney(items.reduce((s, i) => s + i.price, 0), "AED", locale)}
                    </span>
                  </div>
                  <ul className="space-y-1 ps-12 text-xs text-muted-foreground">
                    {items.map((i) => (
                      <li key={i.name} className="flex justify-between gap-2">
                        <span className="truncate">{i.name}</span>
                        <span className="tabular-nums">{i.price.toFixed(2)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <div className="flex justify-between px-1 text-sm">
                <span className="text-muted-foreground">{t("receipt.vat")}</span>
                <span className="font-bold">
                  {t("receipt.total")} {formatMoney(total, "AED", locale)}
                </span>
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={stage === "scanning" || add.isPending}
            onClick={stage === "done" ? confirm : snap}
            className={cn(
              "mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold transition-transform active:scale-[0.98] disabled:opacity-60",
              stage === "done" ? "bg-primary text-primary-foreground shadow-emerald" : "bg-gradient-gold text-gold-foreground shadow-gold",
            )}
          >
            {add.isPending ? <Loader2 className="size-4 animate-spin" /> : stage === "done" ? <Check className="size-5" /> : <Camera className="size-5" />}
            {stage === "done" ? t("receipt.confirm") : t("receipt.snap")}
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
