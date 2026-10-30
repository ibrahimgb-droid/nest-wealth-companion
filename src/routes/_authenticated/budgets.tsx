import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Lock, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell, Card } from "@/components/app-shell";
import { CategoryIcon } from "@/components/category-icon";
import { PageLoader } from "@/components/page-loader";
import { Segmented } from "@/components/segmented";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { ensureFinanceData, useDeleteBudget, useFinance, useUpdateProfile, useUpsertBudget } from "@/lib/data";
import { formatAmount, formatMoney } from "@/lib/currency";
import { SPEND_CATEGORIES, spendByCategory, toBeAssigned, type BudgetMode } from "@/lib/finance";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/budgets")({
  head: () => ({
    meta: [
      { title: "Budgets — Thara" },
      { name: "description", content: "Switch between passive cash-flow tracking and strict envelope budgeting." },
      { property: "og:title", content: "Budgets — Thara" },
      { property: "og:description", content: "Switch between passive cash-flow tracking and strict envelope budgeting." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => ensureFinanceData(context.queryClient),
  pendingComponent: PageLoader,
  component: Budgets,
});

function Budgets() {
  const { t, locale } = useI18n();
  const { profile, budgets, transactions } = useFinance();
  const updateProfile = useUpdateProfile();
  const upsert = useUpsertBudget();
  const remove = useDeleteBudget();
  const base = profile.base_currency;
  const mode = profile.budget_mode as BudgetMode;
  const income = Number(profile.monthly_income);
  const [editing, setEditing] = useState<{ category: string; id?: string; value: string } | null>(null);
  const [adding, setAdding] = useState(false);

  const spent = useMemo(() => spendByCategory(transactions, base), [transactions, base]);
  const sorted = [...budgets].sort(
    (a, b) => SPEND_CATEGORIES.indexOf(a.category as never) - SPEND_CATEGORIES.indexOf(b.category as never),
  );
  const assignable = toBeAssigned(income, budgets);
  const totalBudgeted = budgets.reduce((s, b) => s + Number(b.monthly_limit), 0);
  const totalSpent = budgets.reduce((s, b) => s + (spent[b.category] ?? 0), 0);
  const unbudgeted = SPEND_CATEGORIES.filter((c) => !budgets.some((b) => b.category === c));
  const catLabel = (c: string) => t(`cat.${c}` as MessageKey);
  const money = (n: number) => formatMoney(n, base, locale);

  async function saveLimit() {
    if (!editing) return;
    const value = Math.max(0, Number(editing.value) || 0);
    if (mode === "envelope") {
      const others = budgets.filter((b) => b.category !== editing.category).reduce((s, b) => s + Number(b.monthly_limit), 0);
      if (others + value > income) {
        toast.error(t("budget.cantExceed"));
        return;
      }
    }
    await upsert.mutateAsync({ category: editing.category, monthly_limit: value });
    toast.success(t("budget.updated"));
    setEditing(null);
  }

  return (
    <AppShell title={t("budget.title")}>
      <Segmented
        className="w-full"
        value={mode}
        onChange={(v) => updateProfile.mutate({ budget_mode: v })}
        options={[
          { value: "passive", label: t("budget.passive") },
          { value: "envelope", label: t("budget.envelope") },
        ]}
      />

      <Card className="mt-5">
        <p className="font-semibold">{mode === "envelope" ? t("budget.envelopeTitle") : t("budget.passiveTitle")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{mode === "envelope" ? t("budget.envelopeDesc") : t("budget.passiveDesc")}</p>
        {mode === "envelope" ? (
          <div className={cn("mt-4 rounded-2xl px-4 py-3", assignable < 0 ? "bg-destructive/15" : "bg-gold-soft")}>
            <p className="text-xs text-muted-foreground">{assignable < 0 ? t("budget.overAssigned") : t("budget.toAssign")}</p>
            <p className={cn("font-display text-3xl font-medium", assignable < 0 ? "text-destructive" : "text-gold")}>
              {money(Math.abs(assignable))}
            </p>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-surface p-3">
              <p className="text-xs text-muted-foreground">{t("dash.spent")}</p>
              <p className="font-bold tabular-nums">{money(totalSpent)}</p>
            </div>
            <div className="rounded-2xl bg-surface p-3">
              <p className="text-xs text-muted-foreground">{t("budget.totalBudgeted")}</p>
              <p className="font-bold tabular-nums">{money(totalBudgeted)}</p>
            </div>
          </div>
        )}
      </Card>

      <ul className="mt-5 space-y-3">
        {sorted.map((b) => {
          const limit = Number(b.monthly_limit);
          const s = spent[b.category] ?? 0;
          const ratio = limit > 0 ? s / limit : 0;
          const over = s > limit;
          const near = !over && ratio >= 0.8;
          const locked = mode === "envelope" && s >= limit;
          return (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => setEditing({ category: b.category, id: b.id, value: String(limit) })}
                className="w-full rounded-3xl border border-border bg-card p-4 text-start shadow-card"
              >
                <div className="flex items-center gap-3">
                  <CategoryIcon category={b.category} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-semibold">
                      {catLabel(b.category)}
                      {locked && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-bold text-destructive">
                          <Lock className="size-3" /> {t("budget.locked")}
                        </span>
                      )}
                      {!locked && near && (
                        <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold text-warning">{t("budget.near")}</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {t("budget.spentOf", { spent: formatAmount(s, base), limit: formatMoney(limit, base, locale) })}
                    </p>
                  </div>
                  <span className={cn("shrink-0 text-sm font-bold whitespace-nowrap tabular-nums", over ? "text-destructive" : "text-primary")}>
                    {over ? t("budget.over", { amount: money(s - limit) }) : t("budget.left", { amount: money(limit - s) })}
                  </span>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full transition-all", over ? "bg-destructive" : near ? "bg-warning" : "bg-primary")}
                    style={{ width: `${Math.min(100, ratio * 100)}%` }}
                  />
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {unbudgeted.length > 0 && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-3xl border border-dashed border-gold/40 py-4 text-sm font-semibold text-gold"
        >
          <Plus className="size-4" /> {t("budget.add")}
        </button>
      )}

      <Drawer open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DrawerContent className="mx-auto max-w-md">
          {editing && (
            <form
              className="px-5 pt-3 pb-8"
              onSubmit={(e) => {
                e.preventDefault();
                void saveLimit();
              }}
            >
              <DrawerTitle className="mb-4 flex items-center gap-3 text-base font-semibold">
                <CategoryIcon category={editing.category} size="sm" /> {catLabel(editing.category)}
              </DrawerTitle>
              <label className="text-xs text-muted-foreground">
                {t("budget.limit")} ({base})
              </label>
              <input
                inputMode="decimal"
                autoFocus
                value={editing.value}
                onChange={(e) => setEditing({ ...editing, value: e.target.value.replace(/[^\d.]/g, "") })}
                className="mt-1 w-full border-b border-border bg-transparent pb-2 font-display text-4xl outline-none focus:border-gold"
              />
              {mode === "envelope" && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("budget.toAssign")}: {money(assignable + (budgets.find((b) => b.category === editing.category)?.monthly_limit ?? 0) - (Number(editing.value) || 0))}
                </p>
              )}
              <button
                type="submit"
                disabled={upsert.isPending}
                className="mt-6 w-full rounded-2xl bg-gradient-gold py-4 font-bold text-gold-foreground shadow-gold disabled:opacity-60"
              >
                {t("common.save")}
              </button>
              {editing.id && (
                <button
                  type="button"
                  onClick={async () => {
                    await remove.mutateAsync(editing.id!);
                    setEditing(null);
                  }}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-destructive/40 py-3 text-sm font-semibold text-destructive"
                >
                  <Trash2 className="size-4" /> {t("budget.remove")}
                </button>
              )}
            </form>
          )}
        </DrawerContent>
      </Drawer>

      <Drawer open={adding} onOpenChange={setAdding}>
        <DrawerContent className="mx-auto max-w-md">
          <div className="px-5 pt-3 pb-8">
            <DrawerTitle className="mb-4 text-base font-semibold">{t("budget.add")}</DrawerTitle>
            <div className="grid grid-cols-3 gap-2">
              {unbudgeted.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setEditing({ category: c, value: "" });
                  }}
                  className="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-surface p-3 text-[11px] font-semibold"
                >
                  <CategoryIcon category={c} size="sm" />
                  {catLabel(c)}
                </button>
              ))}
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </AppShell>
  );
}
