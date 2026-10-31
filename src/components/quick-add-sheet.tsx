import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, ReceiptText } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useAddTransactions, useFinance } from "@/lib/data";
import { formatMoney } from "@/lib/currency";
import { accountKind, canSpendFrom, paymentMethodFor } from "@/lib/finance";
import { evaluateSpend } from "@/lib/spend-guard";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { AccountForm, AccountPicker } from "./accounts";
import { CategoryIcon } from "./category-icon";

const QUICK_CATEGORIES = [
  "groceries",
  "dining",
  "transport",
  "shopping",
  "utilities",
  "health",
  "entertainment",
  "housing",
  "other",
] as const;

export function QuickAddSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t, locale } = useI18n();
  const { profile, accounts: allAccounts, budgets, transactions } = useFinance();
  // Loans can't pay for things; expenses come from cash, bank or credit card.
  const accounts = useMemo(() => allAccounts.filter((a) => canSpendFrom(a.account_type)), [allAccounts]);
  const add = useAddTransactions();
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [category, setCategory] = useState<string>("groceries");
  const [merchant, setMerchant] = useState("");
  const [blocked, setBlocked] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const account = accounts.find((a) => a.id === accountId) ?? null;
  const currency = account?.currency ?? profile.base_currency;

  useEffect(() => {
    if (!open) return undefined;
    setBlocked(null);
    setAccountId((current) => {
      if (current && accounts.some((a) => a.id === current)) return current;
      const preferred =
        accounts.find((a) => accountKind(a.account_type) === "cash" && a.currency === profile.base_currency) ??
        accounts.find((a) => a.currency === profile.base_currency) ??
        accounts[0];
      return preferred?.id ?? null;
    });
    const id = window.setTimeout(() => inputRef.current?.focus(), 150);
    return () => window.clearTimeout(id);
  }, [open, accounts, profile.base_currency]);

  const catLabel = (c: string) => t(`cat.${c}` as MessageKey);

  async function save() {
    const value = Number(amount.replace(",", "."));
    if (!value || value <= 0) {
      inputRef.current?.focus();
      return;
    }
    if (!account) return;
    const check = evaluateSpend(profile, budgets, transactions, category, value, currency);
    if (!check.allowed) {
      const msg = t("quick.blocked", {
        amount: formatMoney(check.remaining, check.base, locale),
        category: catLabel(category),
      });
      setBlocked(msg);
      toast.error(msg);
      return;
    }
    await add.mutateAsync([
      {
        account_id: account.id,
        merchant_raw: null,
        merchant_name: merchant.trim() || catLabel(category),
        amount: value,
        currency,
        category,
        direction: "debit",
        payment_method: paymentMethodFor(account.account_type),
        shariah_compliant: true,
        occurred_at: new Date().toISOString(),
      },
    ]);
    toast.success(t("quick.saved"), { description: formatMoney(value, currency, locale) });
    if (check.alert === "near") toast.warning(t("quick.near", { category: catLabel(category), pct: check.pct }));
    if (check.alert === "over") toast.warning(t("quick.over", { category: catLabel(category) }));
    setAmount("");
    setMerchant("");
    onOpenChange(false);
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-h-[92vh] max-w-md">
        <div className="overflow-y-auto px-5 pt-3 pb-8">
          <DrawerTitle className="mb-4 flex items-center gap-2 text-base font-semibold">
            <ReceiptText className="size-5 text-gold" /> {t("quick.title")}
          </DrawerTitle>

          {accounts.length === 0 ? (
            <>
              <p className="mb-4 rounded-2xl bg-gold-soft px-4 py-3 text-sm">{t("quick.noAccounts")}</p>
              <AccountForm defaultCurrency={profile.base_currency} allowLoans={false} onSaved={(a) => setAccountId(a.id)} />
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <div className="flex items-baseline gap-3 border-b border-border pb-3">
                <span className="text-lg font-semibold text-gold">{currency}</span>
                <input
                  ref={inputRef}
                  inputMode="decimal"
                  enterKeyHint="done"
                  placeholder={currency === "KWD" ? "0.000" : "0.00"}
                  aria-label="Amount"
                  value={amount}
                  onChange={(e) => {
                    setBlocked(null);
                    setAmount(e.target.value.replace(/[^\d.,]/g, ""));
                  }}
                  className="w-full bg-transparent font-display text-5xl font-medium tracking-tight outline-none placeholder:text-muted-foreground/40"
                />
              </div>

              <p className="mt-4 mb-2 text-xs font-medium text-muted-foreground">{t("quick.from")}</p>
              <AccountPicker accounts={accounts} value={accountId} onChange={setAccountId} />

              <div className="mt-4 grid grid-cols-3 gap-2">
                {QUICK_CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setBlocked(null);
                      setCategory(c);
                    }}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-2xl border p-2.5 text-[11px] font-semibold transition-colors",
                      category === c
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-surface text-muted-foreground",
                    )}
                  >
                    <CategoryIcon category={c} size="sm" />
                    {catLabel(c)}
                  </button>
                ))}
              </div>

              <input
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                placeholder={t("quick.merchant")}
                className="mt-4 w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-gold"
              />

              {blocked && <p className="mt-3 rounded-2xl bg-destructive/15 px-4 py-3 text-sm text-destructive">{blocked}</p>}

              <button
                type="submit"
                disabled={add.isPending || !account}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-gold py-4 text-base font-bold text-gold-foreground shadow-gold transition-transform active:scale-[0.98] disabled:opacity-60"
              >
                {add.isPending && <Loader2 className="size-4 animate-spin" />}
                {t("quick.save")}
              </button>
            </form>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
