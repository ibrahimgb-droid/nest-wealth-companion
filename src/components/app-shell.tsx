import { Link } from "@tanstack/react-router";
import { BarChart3, LayoutGrid, Plus, ReceiptText, Settings, WalletCards } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { QuickAddSheet } from "./quick-add-sheet";

const NAV = [
  { to: "/dashboard", key: "nav.dashboard", icon: LayoutGrid },
  { to: "/transactions", key: "nav.transactions", icon: ReceiptText },
  { to: "/budgets", key: "nav.budgets", icon: WalletCards },
  { to: "/analytics", key: "nav.analytics", icon: BarChart3 },
] as const;

export function AppShell({
  title,
  eyebrow,
  right,
  children,
  fab = true,
}: {
  title: string;
  eyebrow?: string;
  right?: ReactNode;
  children: ReactNode;
  fab?: boolean;
}) {
  const { t } = useI18n();
  const [quickOpen, setQuickOpen] = useState(false);

  return (
    <div className="mx-auto min-h-screen w-full max-w-md bg-background">
      <header className="sticky top-0 z-30 glass-nav border-b border-border px-5 pt-5 pb-4">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            {eyebrow && <p className="text-xs font-medium tracking-wide text-muted-foreground">{eyebrow}</p>}
            <h1 className="truncate font-display text-2xl font-medium tracking-tight">{title}</h1>
          </div>
          <div className="flex items-center gap-2">
            {right}
            <Link
              to="/settings"
              aria-label={t("common.settings")}
              className="inline-flex size-10 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground transition-colors hover:text-gold"
            >
              <Settings className="size-5" strokeWidth={1.75} />
            </Link>
          </div>
        </div>
      </header>

      <main className="px-5 pt-5 pb-36">{children}</main>

      {fab && (
        <button
          type="button"
          onClick={() => setQuickOpen(true)}
          aria-label={t("tx.addCash")}
          className="fixed bottom-24 z-40 inline-flex size-14 items-center justify-center rounded-full bg-gradient-gold text-gold-foreground shadow-gold transition-transform active:scale-95 end-[max(1.25rem,calc(50vw-14rem+1.25rem))]"
        >
          <Plus className="size-6" strokeWidth={2.25} />
        </button>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-md glass-nav border-t border-border pb-safe">
        <ul className="grid grid-cols-4">
          {NAV.map(({ to, key, icon: Icon }) => (
            <li key={to}>
              <Link
                to={to}
                className="group flex flex-col items-center gap-1 pt-3 pb-1 text-[11px] font-semibold text-muted-foreground transition-colors"
                activeProps={{ className: "text-gold", "aria-current": "page" }}
              >
                <Icon className="size-[22px]" strokeWidth={1.75} />
                <span>{t(key)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <QuickAddSheet open={quickOpen} onOpenChange={setQuickOpen} />
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground">{children}</h2>
      {action}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-3xl border border-border bg-card p-5 shadow-card ${className}`}>{children}</section>;
}
