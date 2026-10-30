import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Banknote, CreditCard, Landmark, Loader2, Trash2 } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useAddAccount, useDeleteAccount, useUpdateAccount, type Account } from "@/lib/data";
import { GCC_CURRENCIES, formatMoney, type GccCurrency } from "@/lib/currency";
import { ACCOUNT_KINDS, CURRENCY_COUNTRY, accountKind, openingBalance, type AccountKind } from "@/lib/finance";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Segmented } from "./segmented";

const KIND_ICON = { cash: Banknote, bank: Landmark, credit: CreditCard } as const;

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

/** Balance as the user thinks of it: credit cards show what is owed. */
export function AccountBalance({ account, className }: { account: Account; className?: string }) {
  const { t, locale } = useI18n();
  const bal = Number(account.balance);
  const credit = accountKind(account.account_type) === "credit";
  return (
    <span className={cn("font-bold whitespace-nowrap tabular-nums", className)}>
      {credit && bal < 0 ? (
        <>
          <span className="me-1 text-xs font-medium text-muted-foreground">{t("acct.owedShort")}</span>
          {formatMoney(-bal, account.currency, locale)}
        </>
      ) : (
        formatMoney(bal, account.currency, locale)
      )}
    </span>
  );
}

export function AccountPicker({
  accounts,
  value,
  onChange,
}: {
  accounts: Account[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <div role="radiogroup" className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
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

export function AccountForm({
  defaultCurrency,
  lockCurrency = false,
  onSaved,
  submitLabel,
}: {
  defaultCurrency: string;
  lockCurrency?: boolean;
  onSaved?: (account: Account) => void;
  submitLabel?: string;
}) {
  const { t } = useI18n();
  const add = useAddAccount();
  const [kind, setKind] = useState<AccountKind>("cash");
  const [name, setName] = useState("");
  const [institution, setInstitution] = useState("");
  const [currency, setCurrency] = useState<GccCurrency>(defaultCurrency as GccCurrency);
  const [balance, setBalance] = useState("");

  useEffect(() => setCurrency(defaultCurrency as GccCurrency), [defaultCurrency]);

  async function save() {
    const entered = Number(balance.replace(",", ".").replace(/[^\d.]/g, "")) || 0;
    try {
      const account = await add.mutateAsync({
        name: name.trim() || t(`acct.default.${kind}`),
        institution: kind === "cash" ? null : institution.trim() || null,
        account_type: kind,
        currency,
        country: CURRENCY_COUNTRY[currency],
        balance: openingBalance(kind, entered),
      });
      toast.success(t("acct.saved"));
      setName("");
      setInstitution("");
      setBalance("");
      onSaved?.(account);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div role="radiogroup" className="grid grid-cols-3 gap-2">
        {ACCOUNT_KINDS.map((k) => {
          const Icon = KIND_ICON[k];
          const active = k === kind;
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setKind(k)}
              className={cn(
                "flex flex-col items-start gap-2 rounded-2xl border p-3 text-start transition-colors",
                active ? "border-gold bg-gold-soft" : "border-border bg-surface",
              )}
            >
              <Icon className={cn("size-5", active ? "text-gold" : "text-muted-foreground")} strokeWidth={1.75} />
              <span>
                <span className="block text-xs font-bold">{t(`acct.kind.${k}`)}</span>
                <span className="block text-[10px] leading-tight text-muted-foreground">{t(`acct.hint.${k}`)}</span>
              </span>
            </button>
          );
        })}
      </div>

      <input
        className={field}
        aria-label={t("acct.name")}
        placeholder={t(`acct.default.${kind}`)}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      {kind !== "cash" && (
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
          onChange={setCurrency}
          options={GCC_CURRENCIES.map((c) => ({ value: c, label: c }))}
        />
      )}
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
          {kind === "credit" ? t("acct.owed") : t("acct.balance")} ({currency})
        </span>
        <input
          className={field}
          inputMode="decimal"
          placeholder="0.00"
          value={balance}
          onChange={(e) => setBalance(e.target.value.replace(/[^\d.,]/g, ""))}
        />
      </label>
      <button
        type="submit"
        disabled={add.isPending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground shadow-emerald disabled:opacity-60"
      >
        {add.isPending && <Loader2 className="size-4 animate-spin" />}
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
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  account?: Account | null;
  defaultCurrency: string;
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

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-h-[92vh] max-w-md">
        <div className="overflow-y-auto px-5 pt-3 pb-8">
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
              <input className={field} aria-label={t("acct.name")} value={name} onChange={(e) => setName(e.target.value)} />
              {accountKind(account.account_type) !== "cash" && (
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
