import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Camera, Check, ImageUp, Loader2, RotateCcw, ScanLine } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useAddTransactions, useFinance } from "@/lib/data";
import { GCC_CURRENCIES, decimalsFor, formatMoney, type GccCurrency } from "@/lib/currency";
import { accountKind, allocateReceipt, groupReceipt, paymentMethodFor } from "@/lib/finance";
import { photoToDataUrl } from "@/lib/image";
import { scanReceipt } from "@/lib/receipt.functions";
import type { ScannedReceipt } from "@/lib/receipt-types";
import { evaluateSpend } from "@/lib/spend-guard";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { AccountForm, AccountPicker } from "./accounts";
import { CategoryIcon } from "./category-icon";
import { Segmented } from "./segmented";

type Stage = "pick" | "reading" | "review";

/** Purchase time for the ledger: the receipt's date (if in the past), else now. */
function occurredAt(date: string | null) {
  const now = new Date();
  if (!date) return now.toISOString();
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime()) || d > now || d.toDateString() === now.toDateString()) return now.toISOString();
  return d.toISOString();
}

export function ReceiptSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t, locale } = useI18n();
  const { profile, accounts, budgets, transactions } = useFinance();
  const add = useAddTransactions();
  const scan = useServerFn(scanReceipt);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>("pick");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ScannedReceipt | null>(null);
  const [merchant, setMerchant] = useState("");
  const [currency, setCurrency] = useState<GccCurrency>(profile.base_currency as GccCurrency);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [addingAccount, setAddingAccount] = useState(false);

  const catLabel = (c: string) => t(`cat.${c}` as MessageKey);
  const matching = accounts.filter((a) => a.currency === currency);
  const account = matching.find((a) => a.id === accountId) ?? null;

  const groups = useMemo(() => {
    if (!receipt) return [];
    const d = decimalsFor(currency);
    return groupReceipt(allocateReceipt(receipt.items, receipt.total, d), d);
  }, [receipt, currency]);
  const total = groups.reduce((s, g) => s + g.amount, 0);
  const itemCount = groups.reduce((s, g) => s + g.lines.length, 0);

  function reset() {
    setStage("pick");
    setPreview(null);
    setError(null);
    setReceipt(null);
    setAddingAccount(false);
  }

  function pickAccount(cur: string) {
    const list = accounts.filter((a) => a.currency === cur);
    const preferred = list.find((a) => accountKind(a.account_type) !== "cash") ?? list[0];
    setAccountId(preferred?.id ?? null);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setStage("reading");
    try {
      const dataUrl = await photoToDataUrl(file);
      setPreview(dataUrl);
      const res = await scan({ data: { image: dataUrl } });
      if (!res.ok) {
        setError(t(`receipt.err.${res.reason}`));
        setStage("pick");
        return;
      }
      const cur = (res.receipt.currency ?? profile.base_currency) as GccCurrency;
      setReceipt(res.receipt);
      setMerchant(res.receipt.merchant);
      setCurrency(cur);
      pickAccount(cur);
      setStage("review");
    } catch {
      setError(t("receipt.err.failed"));
      setStage("pick");
    }
  }

  async function confirm() {
    if (!receipt || !account) return;
    for (const g of groups) {
      const check = evaluateSpend(profile, budgets, transactions, g.category, g.amount, currency);
      if (!check.allowed) {
        toast.error(t("quick.blocked", { amount: formatMoney(check.remaining, check.base, locale), category: catLabel(g.category) }));
        return;
      }
    }
    const receiptId = crypto.randomUUID();
    const when = occurredAt(receipt.date);
    const name = merchant.trim() || receipt.merchant;
    await add.mutateAsync(
      groups.map((g) => ({
        account_id: account.id,
        merchant_raw: g.lines.map((l) => l.name).join(", ").slice(0, 240),
        merchant_name: groups.length > 1 ? `${name} · ${catLabel(g.category)}` : name,
        amount: g.amount,
        currency,
        category: g.category,
        direction: "debit",
        payment_method: paymentMethodFor(account.account_type),
        shariah_compliant: true,
        receipt_id: receiptId,
        occurred_at: when,
      })),
    );
    toast.success(t("receipt.saved", { n: groups.length }), { description: formatMoney(total, currency, locale) });
    reset();
    onOpenChange(false);
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => {
        if (!o && stage !== "reading") reset();
        onOpenChange(o);
      }}
    >
      <DrawerContent className="mx-auto max-h-[92vh] max-w-md">
        <div className="overflow-y-auto px-5 pt-3 pb-8">
          <DrawerTitle className="mb-1 flex items-center gap-2 text-base font-semibold">
            <ScanLine className="size-5 text-gold" /> {t("receipt.title")}
          </DrawerTitle>

          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="hidden"
            aria-label={t("receipt.upload")}
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />

          {stage === "pick" && (
            <>
              <p className="mb-4 text-xs text-muted-foreground">{t("receipt.intro")}</p>
              {error && <p className="mb-4 rounded-2xl bg-destructive/15 px-4 py-3 text-sm text-destructive">{error}</p>}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => cameraRef.current?.click()}
                  className="flex flex-col items-center gap-2 rounded-3xl bg-gradient-gold py-6 font-bold text-gold-foreground shadow-gold active:scale-[0.98]"
                >
                  <Camera className="size-6" /> {t("receipt.take")}
                </button>
                <button
                  type="button"
                  onClick={() => galleryRef.current?.click()}
                  className="flex flex-col items-center gap-2 rounded-3xl border border-gold/30 bg-surface py-6 font-bold active:scale-[0.98]"
                >
                  <ImageUp className="size-6 text-gold" /> {t("receipt.upload")}
                </button>
              </div>
            </>
          )}

          {stage === "reading" && (
            <div className="relative mt-3 flex min-h-64 items-center justify-center overflow-hidden rounded-3xl border border-dashed border-gold/40 bg-surface">
              {preview && <img src={preview} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />}
              <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-gold shadow-gold animate-scan" />
              <span className="relative inline-flex items-center gap-2 rounded-full bg-card px-4 py-2 text-sm font-semibold">
                <Loader2 className="size-4 animate-spin text-gold" /> {t("receipt.scanning")}
              </span>
            </div>
          )}

          {stage === "review" && receipt && (
            <div className="mt-3 space-y-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-primary">
                <Check className="size-4" />
                {t("receipt.detected", { count: itemCount, groups: groups.length })}
              </p>

              <div className="grid grid-cols-[1fr_auto] items-end gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{t("receipt.merchant")}</span>
                  <input
                    value={merchant}
                    onChange={(e) => setMerchant(e.target.value)}
                    className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-gold"
                  />
                </label>
                <Segmented
                  size="sm"
                  value={currency}
                  onChange={(c) => {
                    setCurrency(c);
                    pickAccount(c);
                    setAddingAccount(false);
                  }}
                  options={GCC_CURRENCIES.map((c) => ({ value: c, label: c }))}
                />
              </div>

              {groups.map((g) => (
                <div key={g.category} className="rounded-3xl border border-border bg-surface p-4">
                  <div className="mb-2 flex items-center gap-3">
                    <CategoryIcon category={g.category} size="sm" />
                    <span className="flex-1 font-semibold">{catLabel(g.category)}</span>
                    <span className="font-bold tabular-nums">{formatMoney(g.amount, currency, locale)}</span>
                  </div>
                  <ul className="space-y-1 ps-12 text-xs text-muted-foreground">
                    {g.lines.map((l, i) => (
                      <li key={`${l.name}-${i}`} className="flex justify-between gap-2">
                        <span className="truncate">{l.name}</span>
                        <span className="tabular-nums">{l.price.toFixed(decimalsFor(currency))}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              <div className="flex items-center justify-between px-1 text-sm">
                <span className="text-xs text-muted-foreground">{t("receipt.vat")}</span>
                <span className="font-bold">
                  {t("receipt.total")} {formatMoney(total, currency, locale)}
                </span>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">{t("receipt.paidFrom")}</p>
                {matching.length > 0 && !addingAccount ? (
                  <AccountPicker accounts={matching} value={accountId} onChange={setAccountId} />
                ) : (
                  <div className="space-y-3 rounded-3xl border border-border p-4">
                    <p className="text-sm">{t("receipt.noAccount", { currency })}</p>
                    <AccountForm
                      defaultCurrency={currency}
                      lockCurrency
                      onSaved={(a) => {
                        setAccountId(a.id);
                        setAddingAccount(false);
                      }}
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-[auto_1fr] gap-3">
                <button
                  type="button"
                  onClick={reset}
                  aria-label={t("receipt.retake")}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border px-4 text-sm font-semibold text-muted-foreground"
                >
                  <RotateCcw className="size-4" />
                </button>
                <button
                  type="button"
                  disabled={add.isPending || !account || groups.length === 0}
                  onClick={confirm}
                  className={cn(
                    "inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-bold text-primary-foreground shadow-emerald transition-transform active:scale-[0.98] disabled:opacity-60",
                  )}
                >
                  {add.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-5" />}
                  {t("receipt.confirm")}
                </button>
              </div>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
