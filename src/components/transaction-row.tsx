import { useState } from "react";
import { format } from "date-fns";
import { arSA, enUS } from "date-fns/locale";
import { CircleAlert, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Account, Transaction } from "@/lib/data";
import { useDeleteTransaction, useToggleShariah } from "@/lib/data";
import { formatMoney } from "@/lib/currency";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "./category-icon";

export function ShariahBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex size-5 items-center justify-center rounded-full",
        ok ? "bg-primary/15 text-primary" : "bg-warning/15 text-warning",
      )}
    >
      {ok ? <ShieldCheck className="size-3.5" strokeWidth={2.25} /> : <CircleAlert className="size-3.5" strokeWidth={2.25} />}
    </span>
  );
}

export function TransactionRow({ tx, account }: { tx: Transaction; account?: Account }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const toggle = useToggleShariah();
  const del = useDeleteTransaction();
  const credit = tx.direction === "credit";
  const time = format(new Date(tx.occurred_at), "HH:mm", { locale: locale === "ar" ? arSA : enUS });

  return (
    <li className="rounded-2xl transition-colors">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 py-3 text-start"
      >
        <CategoryIcon category={tx.category} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate font-semibold">{tx.merchant_name}</p>
            <ShariahBadge ok={tx.shariah_compliant} label={tx.shariah_compliant ? t("tx.halal") : t("tx.nonHalal")} />
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {t(`cat.${tx.category}` as MessageKey)} · {t(`pm.${tx.payment_method}` as MessageKey)} · {time}
          </p>
        </div>
        <span className={cn("shrink-0 font-bold tabular-nums", credit ? "text-primary" : "text-foreground")}>
          {formatMoney(credit ? Number(tx.amount) : -Number(tx.amount), tx.currency, locale, { signed: true })}
        </span>
      </button>

      {open && (
        <div className="mb-3 space-y-3 rounded-2xl border border-border bg-surface p-4 text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            <dt className="text-muted-foreground">{t("tx.raw")}</dt>
            <dd className="truncate text-end font-mono text-xs">{tx.merchant_raw ?? "—"}</dd>
            <dt className="text-muted-foreground">{t("tx.account")}</dt>
            <dd className="truncate text-end">
              {account ? `${account.institution ? account.institution + " · " : ""}${account.name}` : "—"}
            </dd>
          </dl>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={toggle.isPending}
              onClick={() => toggle.mutate({ id: tx.id, value: !tx.shariah_compliant })}
              className={cn(
                "flex-1 rounded-xl border px-3 py-2 text-xs font-semibold",
                tx.shariah_compliant ? "border-warning/40 text-warning" : "border-primary/40 text-primary",
              )}
            >
              {tx.shariah_compliant ? t("tx.markNonHalal") : t("tx.markHalal")}
            </button>
            <button
              type="button"
              aria-label={t("common.delete")}
              disabled={del.isPending}
              onClick={async () => {
                await del.mutateAsync(tx.id);
                toast(t("tx.deleted"));
              }}
              className="rounded-xl border border-destructive/40 px-3 py-2 text-destructive"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
