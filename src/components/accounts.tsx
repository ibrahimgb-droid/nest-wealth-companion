import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ArrowLeftRight, Banknote, CreditCard, HandCoins, Handshake, Landmark, Loader2, Trash2 } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useAddAccount, useAddTransactions, useDeleteAccount, useFinance, useUpdateAccount, type Account } from "@/lib/data";
import { GCC_CURRENCIES, formatMoney, type GccCurrency } from "@/lib/currency";
import {
  CURRENCY_COUNTRY,
  LOAN_KINDS,
  SPEND_KINDS,
  accountKind,
  canSpendFrom,
  isLoan,
  openingBalance,
  outstanding,
  transferLegs,
  type AccountKind,
} from "@/lib/finance";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Segmented } from "./segmented";
import type { TransferPreset } from "./transfer-sheet";

const KIND_ICON = { cash: Banknote, bank: Landmark, credit: CreditCard, lent: HandCoins, borrowed: Handshake } as const;

const field = "w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-gold";

export function AccountIcon({ type, size = "md", className }: { type: string; size?: "sm" | "md"; className?: string }) {
  const Icon = KIND_ICON[accountKind(type)];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-2xl bg-gold-soft text-gold",
        size === "md" ? "size-11" : "size-8 rounded-xl",
        className,
      )}
    >
      <Icon className={size === "md" ? "size-5" : "size-4"} strokeWidth={1.75} />
    </span>
  );
}

/** Balance as the user thinks of it: cards and borrowed money show what is owed, lent money what is owed to you. */
export function AccountBalance({ account, className }: { account: Account; className?: string }) {
  const { t, locale } = useI18n();
  const bal = Number(account.balance);
  const kind = accountKind(account.account_type);
  let prefix: string | null = null;
  let shown = bal;
  if ((kind === "credit" || kind === "borrowed") && bal < 0) {
    prefix = kind === "credit" ? t("acct.owedShort") : t("acct.youOweShort");
    shown = -bal;
  } else if (kind === "lent" && bal > 0) {
    prefix = t("acct.owesYouShort");
  }
  return (
    <span className={cn("font-bold whitespace-nowrap tabular-nums", className)}>
      {prefix && <span className="me-1 text-xs font-medium text-muted-foreground">{prefix}</span>}
      {formatMoney(shown, account.currency, locale)}
    </span>
  );
}

/** Second line under an account name: bank or loan type, plus currency. */
export function accountSubtitle(a: Account, t: ReturnType<typeof useI18n>["t"]) {
  const kind = accountKind(a.account_type);
  const label = a.institution ?? (isLoan(a.account_type) ? t(`acct.kind.${kind}`) : null);
  return [label, a.currency].filter(Boolean).join(" · ");
}

export function AccountPicker({
  accounts,
  value,
  onChange,
  leading,
}: {
  accounts: Account[];
  value: string | null;
  onChange: (id: string) => void;
  /** Extra option shown before the accounts (e.g. "none"). */
  leading?: ReactNode;
}) {
  return (
    <div role="radiogroup" className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
      {leading}
      {accounts.map((a) => {
        const active = a.id === value;
        return (
          <button
            key={a.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(a.id)}
            className={cn(
              "flex shrink-0 items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-start transition-colors",
              active ? "border-gold bg-gold-soft" : "border-border bg-surface",
            )}
          >
            <AccountIcon type={a.account_type} size="sm" />
            <span className="min-w-0">
              <span className="block max-w-[9rem] truncate text-sm font-semibold">{a.name}</span>
              <AccountBalance account={a} className="block text-[11px] font-semibold text-muted-foreground" />
            </span>
          </button>
        );
      })}
    </div>
  );
}

function KindButton({ kind, active, onClick }: { kind: AccountKind; active: boolean; onClick: () => void }) {
  const { t } = useI18n();
  const Icon = KIND_ICON[kind];
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-2 rounded-2xl border p-3 text-start transition-colors",
        active ? "border-gold bg-gold-soft" : "border-border bg-surface",
      )}
    >
      <Icon className={cn("size-5", active ? "text-gold" : "text-muted-foreground")} strokeWidth={1.75} />
      <span>
        <span className="block text-xs font-bold">{t(`acct.kind.${kind}`)}</span>
        <span className="block text-[10px] leading-tight text-muted-foreground">{t(`acct.hint.${kind}`)}</span>
      </span>
    </button>
  );
}

export function AccountForm({
  defaultCurrency,
  lockCurrency = false,
  allowLoans = true,
  onSaved,
  submitLabel,
  initial,
}: {
  defaultCurrency: string;
  lockCurrency?: boolean;
  allowLoans?: boolean;
  onSaved?: (account: Account) => void;
  submitLabel?: string;
  /** Pre-fill, e.g. from the card printed on a scanned receipt. */
  initial?: { kind?: AccountKind | undefined; name?: string | null; institution?: string | null } | undefined;
}) {
  const { t } = useI18n();
  const { accounts } = useFinance();
  const add = useAddAccount();
  const addTx = useAddTransactions();
  const [kind, setKind] = useState<AccountKind>(initial?.kind ?? "cash");
  const [name, setName] = useState(initial?.name ?? "");
  const [institution, setInstitution] = useState(initial?.institution ?? "");
  const [currency, setCurrency] = useState<GccCurrency>(defaultCurrency as GccCurrency);
  const [balance, setBalance] = useState("");
  const [linkId, setLinkId] = useState<string | null>(null);

  useEffect(() => setCurrency(defaultCurrency as GccCurrency), [defaultCurrency]);

  const loan = kind === "lent" || kind === "borrowed";
  // Loans can move the money from/into one of your accounts in the same currency.
  const linkable = loan ? accounts.filter((a) => canSpendFrom(a.account_type) && a.currency === currency) : [];
  const link = linkable.find((a) => a.id === linkId) ?? null;

  async function save() {
    const entered = Number(balance.replace(",", ".").replace(/[^\d.]/g, "")) || 0;
    const finalName = name.trim() || t(`acct.default.${kind}`);
    try {
      const account = await add.mutateAsync({
        name: finalName,
        institution: kind === "bank" || kind === "credit" ? institution.trim() || null : null,
        account_type: kind,
        currency,
        country: CURRENCY_COUNTRY[currency],
        balance: link && entered > 0 ? 0 : openingBalance(kind, entered),
      });
      if (link && entered > 0) {
        const lent = kind === "lent";
        const label = t(`acct.loanLabel.${kind}` as "acct.loanLabel.lent", { name: finalName });
        await addTx.mutateAsync(
          transferLegs({
            from: lent ? link : account,
            to: lent ? account : link,
            amount: entered,
            transferId: crypto.randomUUID(),
            occurredAt: new Date().toISOString(),
            // Name on the "from" row describes where the money went, and vice versa.
            toLabel: lent ? label : t("xfer.toName", { name: link.name }),
            fromLabel: lent ? t("xfer.fromName", { name: link.name }) : label,
          }),
        );
      }
      toast.success(t("acct.saved"));
      setName("");
      setInstitution("");
      setBalance("");
      setLinkId(null);
      onSaved?.(account);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  }

  const pending = add.isPending || addTx.isPending;
  const balanceLabel =
    kind === "credit" ? t("acct.owed") : kind === "lent" ? t("acct.loanLent") : kind === "borrowed" ? t("acct.loanBorrowed") : t("acct.balance");

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div role="radiogroup" className="space-y-2">
        <div className="grid grid-cols-3 gap-2">
          {SPEND_KINDS.map((k) => (
            <KindButton key={k} kind={k} active={k === kind} onClick={() => setKind(k)} />
          ))}
        </div>
        {allowLoans && (
          <>
            <p className="pt-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{t("acct.loans")}</p>
            <div className="grid grid-cols-2 gap-2">
              {LOAN_KINDS.map((k) => (
                <KindButton key={k} kind={k} active={k === kind} onClick={() => setKind(k)} />
              ))}
            </div>
          </>
        )}
      </div>

      <input
        className={field}
        aria-label={loan ? t("acct.person") : t("acct.name")}
        placeholder={loan ? t("acct.person") : t(`acct.default.${kind}`)}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      {(kind === "bank" || kind === "credit") && (
        <input
          className={field}
          aria-label={t("acct.institution")}
          placeholder={t("acct.institution")}
          value={institution}
          onChange={(e) => setInstitution(e.target.value)}
        />
      )}
      {!lockCurrency && (
        <Segmented
          className="w-full"
          size="sm"
          value={currency}
          onChange={(c) => {
            setCurrency(c);
            setLinkId(null);
          }}
          options={GCC_CURRENCIES.map((c) => ({ value: c, label: c }))}
        />
      )}
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
          {balanceLabel} ({currency})
        </span>
        <input
          className={field}
          inputMode="decimal"
          placeholder="0.00"
          value={balance}
          onChange={(e) => setBalance(e.target.value.replace(/[^\d.,]/g, ""))}
        />
      </label>

      {loan && linkable.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            {kind === "lent" ? t("acct.linkLent") : t("acct.linkBorrowed")}
          </p>
          <AccountPicker
            accounts={linkable}
            value={linkId}
            onChange={setLinkId}
            leading={
              <button
                type="button"
                role="radio"
                aria-checked={linkId === null}
                onClick={() => setLinkId(null)}
                className={cn(
                  "shrink-0 rounded-2xl border px-3 py-2.5 text-sm font-semibold",
                  linkId === null ? "border-gold bg-gold-soft" : "border-border bg-surface text-muted-foreground",
                )}
              >
                {t("acct.linkNone")}
              </button>
            }
          />
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground shadow-emerald disabled:opacity-60"
      >
        {pending && <Loader2 className="size-4 animate-spin" />}
        {submitLabel ?? t("acct.save")}
      </button>
    </form>
  );
}

/** Add a new account, or rename / remove an existing one. */
export function AccountSheet({
  open,
  onOpenChange,
  account,
  defaultCurrency,
  onMoveMoney,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  account?: Account | null;
  defaultCurrency: string;
  /** Opens the transfer sheet (pay card, loan repayment, transfer). */
  onMoveMoney?: (preset: TransferPreset) => void;
}) {
  const { t } = useI18n();
  const update = useUpdateAccount();
  const del = useDeleteAccount();
  const [name, setName] = useState("");
  const [institution, setInstitution] = useState("");

  useEffect(() => {
    if (open && account) {
      setName(account.name);
      setInstitution(account.institution ?? "");
    }
  }, [open, account]);

  const kind = account ? accountKind(account.account_type) : null;
  const bal = account ? Number(account.balance) : 0;
  const owed = outstanding(bal);

  const actions: { label: string; preset: TransferPreset; primary?: boolean }[] = [];
  if (account && onMoveMoney) {
    if (kind === "credit" && owed > 0) actions.push({ label: t("acct.payCard"), preset: { mode: "pay", toId: account.id, amount: owed }, primary: true });
    if (kind === "lent" && bal > 0) actions.push({ label: t("acct.gotRepaid"), preset: { mode: "transfer", fromId: account.id, amount: bal }, primary: true });
    if (kind === "borrowed" && owed > 0) actions.push({ label: t("acct.repay"), preset: { mode: "transfer", toId: account.id, amount: owed }, primary: true });
    actions.push({ label: t("acct.transfer"), preset: { mode: "transfer", fromId: account.id } });
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-h-[92dvh] max-w-md">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-3 pb-[calc(2rem+env(safe-area-inset-bottom))]">
          <DrawerTitle className="mb-4 text-base font-semibold">{account ? t("acct.edit") : t("acct.add")}</DrawerTitle>
          {account ? (
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                await update.mutateAsync({
                  id: account.id,
                  patch: { name: name.trim() || account.name, institution: institution.trim() || null },
                });
                toast.success(t("acct.updated"));
                onOpenChange(false);
              }}
            >
              <div className="flex items-center gap-3 rounded-2xl bg-surface p-3">
                <AccountIcon type={account.account_type} size="sm" />
                <span className="flex-1 text-sm font-semibold">{t(`acct.kind.${accountKind(account.account_type)}`)}</span>
                <AccountBalance account={account} className="text-sm" />
              </div>

              {actions.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {actions.map((a) => (
                    <button
                      key={a.label}
                      type="button"
                      onClick={() => onMoveMoney?.(a.preset)}
                      className={cn(
                        "inline-flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold",
                        a.primary ? "bg-gradient-gold text-gold-foreground shadow-gold" : "border border-gold/30 bg-surface",
                        actions.length === 1 && "col-span-2",
                      )}
                    >
                      {!a.primary && <ArrowLeftRight className="size-4 text-gold" />}
                      {a.label}
                    </button>
                  ))}
                </div>
              )}

              <input className={field} aria-label={t("acct.name")} value={name} onChange={(e) => setName(e.target.value)} />
              {(kind === "bank" || kind === "credit") && (
                <input
                  className={field}
                  aria-label={t("acct.institution")}
                  placeholder={t("acct.institution")}
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                />
              )}
              <button
                type="submit"
                disabled={update.isPending}
                className="w-full rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground shadow-emerald disabled:opacity-60"
              >
                {t("common.save")}
              </button>
              <button
                type="button"
                disabled={del.isPending}
                onClick={async () => {
                  await del.mutateAsync(account.id);
                  toast(t("acct.deleted"));
                  onOpenChange(false);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-destructive/40 py-3 text-sm font-semibold text-destructive"
              >
                <Trash2 className="size-4" /> {t("acct.delete")}
              </button>
              <p className="text-center text-[11px] text-muted-foreground">{t("acct.deleteHint")}</p>
            </form>
          ) : (
            <AccountForm defaultCurrency={defaultCurrency} onSaved={() => onOpenChange(false)} />
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
