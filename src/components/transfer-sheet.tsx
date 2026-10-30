import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowLeftRight, CreditCard, Loader2 } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useAddTransactions, useFinance } from "@/lib/data";
import { convert, decimalsFor, formatMoney } from "@/lib/currency";
import { accountKind, canSpendFrom, outstanding, transferLegs } from "@/lib/finance";
import { useI18n } from "@/lib/i18n";
import { AccountPicker } from "./accounts";

export interface TransferPreset {
  /** "pay" pays off a credit card; "transfer" moves money between any two accounts. */
  mode: "transfer" | "pay";
  fromId?: string;
  toId?: string;
  /** Amount to fill in, in the currency of the account it relates to (card owed, loan balance). */
  amount?: number;
}

const field = "w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-gold";
const parse = (v: string) => Number(v.replace(",", ".")) || 0;
const fmt = (v: number, currency: string) => String(Number(v.toFixed(decimalsFor(currency))));

export function TransferSheet({
  open,
  onOpenChange,
  preset,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  preset: TransferPreset;
}) {
  const { t, locale } = useI18n();
  const { accounts } = useFinance();
  const add = useAddTransactions();
  const pay = preset.mode === "pay";

  const cards = accounts.filter((a) => accountKind(a.account_type) === "credit");
  const payers = accounts.filter((a) => canSpendFrom(a.account_type) && accountKind(a.account_type) !== "credit");

  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [received, setReceived] = useState("");
  const [receivedTouched, setReceivedTouched] = useState(false);
  const [note, setNote] = useState("");

  const from = accounts.find((a) => a.id === fromId) ?? null;
  const to = accounts.find((a) => a.id === toId) ?? null;
  const fromOptions = pay ? payers : accounts;
  const toOptions = useMemo(
    () => (pay ? cards : accounts).filter((a) => a.id !== fromId),
    [pay, cards, accounts, fromId],
  );
  const crossCurrency = !!from && !!to && from.currency !== to.currency;

  // Fill the form whenever the sheet opens.
  useEffect(() => {
    if (!open) return;
    const find = (id?: string) => accounts.find((a) => a.id === id) ?? null;
    let f = find(preset.fromId);
    let tgt = find(preset.toId);
    if (pay) {
      tgt = tgt ?? cards.find((c) => outstanding(Number(c.balance)) > 0) ?? cards[0] ?? null;
      f = f ?? payers.find((p) => p.currency === tgt?.currency && accountKind(p.account_type) === "bank") ?? payers.find((p) => p.currency === tgt?.currency) ?? payers[0] ?? null;
    } else {
      f = f ?? (tgt ? accounts.find((a) => a.id !== tgt?.id && canSpendFrom(a.account_type) && a.currency === tgt?.currency) : null) ?? accounts.find((a) => a.id !== tgt?.id) ?? null;
      tgt = tgt ?? accounts.find((a) => a.id !== f?.id && a.currency === f?.currency) ?? accounts.find((a) => a.id !== f?.id) ?? null;
    }
    setFromId(f?.id ?? null);
    setToId(tgt?.id ?? null);
    setNote("");
    setReceivedTouched(false);
    // A preset amount belongs to the account it came from (the card / loan); express it in the sending currency.
    const owner = preset.toId ? tgt : f;
    if (preset.amount && f && owner) {
      setAmount(fmt(convert(preset.amount, owner.currency, f.currency), f.currency));
      if (tgt && tgt.currency !== f.currency) {
        setReceived(fmt(preset.toId ? preset.amount : convert(preset.amount, f.currency, tgt.currency), tgt.currency));
        setReceivedTouched(true);
      } else setReceived("");
    } else {
      setAmount("");
      setReceived("");
    }
    // Only re-run when the sheet opens with a new preset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preset]);

  // Received amount follows the fixed rate until the user edits it.
  const autoReceived = from && to && crossCurrency ? fmt(convert(parse(amount), from.currency, to.currency), to.currency) : "";
  const receivedValue = receivedTouched ? received : autoReceived;
  const owed = to && accountKind(to.account_type) === "credit" ? outstanding(Number(to.balance)) : 0;

  function changeFrom(id: string) {
    setFromId(id);
    if (id === toId) setToId(toOptions.find((a) => a.id !== id)?.id ?? null);
    setReceivedTouched(false);
  }

  function payFull() {
    if (!from || !to) return;
    setAmount(fmt(convert(owed, to.currency, from.currency), from.currency));
    if (crossCurrency) {
      setReceived(fmt(owed, to.currency));
      setReceivedTouched(true);
    }
  }

  async function save() {
    if (!from || !to) return;
    const value = parse(amount);
    if (!(value > 0)) return;
    const cardPayment = accountKind(to.account_type) === "credit";
    try {
      await add.mutateAsync(
        transferLegs({
          from,
          to,
          amount: value,
          ...(crossCurrency ? { received: parse(receivedValue) } : {}),
          transferId: crypto.randomUUID(),
          occurredAt: new Date().toISOString(),
          toLabel: cardPayment ? t("xfer.cardPayment", { name: to.name }) : t("xfer.toName", { name: to.name }),
          fromLabel: cardPayment ? t("xfer.paymentFrom", { name: from.name }) : t("xfer.fromName", { name: from.name }),
          note,
        }),
      );
      toast.success(cardPayment ? t("xfer.paid") : t("xfer.saved"), { description: formatMoney(value, from.currency, locale) });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  }

  const empty = pay ? (cards.length === 0 ? t("xfer.noCards") : payers.length === 0 ? t("xfer.noPayer") : null) : accounts.length < 2 ? t("xfer.needTwo") : null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-h-[92vh] max-w-md">
        <div className="overflow-y-auto px-5 pt-3 pb-8">
          <DrawerTitle className="mb-4 flex items-center gap-2 text-base font-semibold">
            {pay ? <CreditCard className="size-5 text-gold" /> : <ArrowLeftRight className="size-5 text-gold" />}
            {pay ? t("xfer.payTitle") : t("xfer.title")}
          </DrawerTitle>

          {empty ? (
            <p className="rounded-2xl bg-gold-soft px-4 py-3 text-sm">{empty}</p>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">{t("xfer.from")}</p>
                <AccountPicker accounts={fromOptions} value={fromId} onChange={changeFrom} />
              </div>
              <ArrowDown className="mx-auto size-4 text-gold" />
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">{pay ? t("xfer.card") : t("xfer.to")}</p>
                <AccountPicker
                  accounts={toOptions}
                  value={toId}
                  onChange={(id) => {
                    setToId(id);
                    setReceivedTouched(false);
                  }}
                />
              </div>

              {owed > 0 && to && (
                <div className="flex items-center justify-between rounded-2xl bg-surface px-4 py-3 text-sm">
                  <span>{t("xfer.outstanding", { amount: formatMoney(owed, to.currency, locale) })}</span>
                  <button type="button" onClick={payFull} className="text-xs font-bold text-gold">
                    {t("xfer.payFull")}
                  </button>
                </div>
              )}

              <div className="flex items-baseline gap-3 border-b border-border pb-3">
                <span className="text-lg font-semibold text-gold">{from?.currency}</span>
                <input
                  inputMode="decimal"
                  placeholder={from?.currency === "KWD" ? "0.000" : "0.00"}
                  aria-label={t("xfer.from")}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
                  className="w-full bg-transparent font-display text-4xl font-medium tracking-tight outline-none placeholder:text-muted-foreground/40"
                />
              </div>

              {crossCurrency && to && (
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    {t("xfer.received", { currency: to.currency })}
                  </span>
                  <input
                    className={field}
                    inputMode="decimal"
                    value={receivedValue}
                    onChange={(e) => {
                      setReceivedTouched(true);
                      setReceived(e.target.value.replace(/[^\d.,]/g, ""));
                    }}
                  />
                  <span className="mt-1 block text-[11px] text-muted-foreground">{t("xfer.rateHint")}</span>
                </label>
              )}

              <input className={field} placeholder={t("xfer.note")} value={note} onChange={(e) => setNote(e.target.value)} />

              <button
                type="submit"
                disabled={add.isPending || !from || !to || !(parse(amount) > 0)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-gold py-4 text-base font-bold text-gold-foreground shadow-gold transition-transform active:scale-[0.98] disabled:opacity-60"
              >
                {add.isPending && <Loader2 className="size-4 animate-spin" />}
                {pay ? t("xfer.paySave") : t("xfer.save")}
              </button>
            </form>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
