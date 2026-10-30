import { convert } from "./currency";

export type Category =
  | "housing"
  | "groceries"
  | "dining"
  | "transport"
  | "shopping"
  | "electronics"
  | "utilities"
  | "remittance"
  | "savings"
  | "entertainment"
  | "health"
  | "education"
  | "fees"
  | "income"
  | "other";

export const SPEND_CATEGORIES: Category[] = [
  "housing",
  "groceries",
  "dining",
  "transport",
  "shopping",
  "electronics",
  "utilities",
  "remittance",
  "savings",
  "entertainment",
  "health",
  "education",
  "fees",
  "other",
];

/** Buckets whose remaining budget is reserved before calculating Safe-to-Spend. */
export const COMMITTED_CATEGORIES: Category[] = ["housing", "utilities", "remittance", "savings"];

export interface LedgerTx {
  amount: number;
  currency: string;
  direction: "debit" | "credit" | string;
  category: string;
  occurred_at: string;
  shariah_compliant?: boolean;
}

export function monthStart(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function daysLeftInMonth(d = new Date()): number {
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return last - d.getDate() + 1;
}

export function isInMonth(iso: string, ref = new Date()): boolean {
  const d = new Date(iso);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

/** Debit spend per category for the month of `ref`, converted to `base`. */
export function spendByCategory(txs: LedgerTx[], base: string, ref = new Date()) {
  const out: Record<string, number> = {};
  for (const t of txs) {
    if (t.direction !== "debit" || !isInMonth(t.occurred_at, ref)) continue;
    out[t.category] = (out[t.category] ?? 0) + convert(Number(t.amount), t.currency, base);
  }
  return out;
}

export interface SafeToSpendInput {
  monthlyIncome: number;
  spentByCategory: Record<string, number>;
  budgets: { category: string; monthly_limit: number }[];
  daysLeft: number;
}

/**
 * Safe-to-Spend = income − everything spent this month − what is still
 * reserved for committed buckets (rent, bills, remittances, savings).
 */
export function safeToSpend({ monthlyIncome, spentByCategory, budgets, daysLeft }: SafeToSpendInput) {
  const spent = Object.values(spentByCategory).reduce((a, b) => a + b, 0);
  const reserved = budgets
    .filter((b) => COMMITTED_CATEGORIES.includes(b.category as Category))
    .reduce((sum, b) => sum + Math.max(0, Number(b.monthly_limit) - (spentByCategory[b.category] ?? 0)), 0);
  const amount = Math.max(0, monthlyIncome - spent - reserved);
  return { amount, spent, reserved, perDay: daysLeft > 0 ? amount / daysLeft : amount };
}

export type BudgetMode = "passive" | "envelope";

export interface EnvelopeCheckInput {
  mode: BudgetMode;
  limit: number | null;
  spent: number;
  amount: number;
}

/**
 * Passive mode never blocks; it alerts at 80% ("near") and above 100% ("over").
 * Envelope mode blocks any spend that would take a budgeted category past its limit.
 */
export function checkSpend({ mode, limit, spent, amount }: EnvelopeCheckInput) {
  if (limit == null || limit <= 0) {
    return { allowed: true, alert: "none" as const, remaining: Infinity, pct: 0 };
  }
  const after = spent + amount;
  const remaining = Math.max(0, limit - spent);
  const pct = Math.round((after / limit) * 100);
  if (mode === "envelope" && after > limit + 0.0001) {
    return { allowed: false, alert: "over" as const, remaining, pct };
  }
  const alert = after > limit ? ("over" as const) : after >= limit * 0.8 ? ("near" as const) : ("none" as const);
  return { allowed: true, alert, remaining, pct };
}

export function toBeAssigned(monthlyIncome: number, budgets: { monthly_limit: number }[]) {
  return monthlyIncome - budgets.reduce((s, b) => s + Number(b.monthly_limit), 0);
}

export type PensionCountry = "AE" | "SA" | "KW";

/**
 * Indicative national pension estimate (percentage of pensionable salary):
 * - UAE GPSSA: eligible at 15 yrs → 60%, +2% per extra year, max 100%
 * - KSA GOSI: eligible at 10 yrs → 2.5% per year, max 100%
 * - Kuwait PIFSS: eligible at 15 yrs → 65%, +2% per extra year, max 95%
 */
export function pensionEstimate(country: PensionCountry, salary: number, years: number) {
  let pct = 0;
  if (country === "AE") pct = years >= 15 ? Math.min(100, 60 + 2 * (years - 15)) : 0;
  if (country === "SA") pct = years >= 10 ? Math.min(100, 2.5 * years) : 0;
  if (country === "KW") pct = years >= 15 ? Math.min(95, 65 + 2 * (years - 15)) : 0;
  return { eligible: pct > 0, pct, monthly: (salary * pct) / 100 };
}

export const PENSION_FUND: Record<PensionCountry, string> = { AE: "GPSSA", SA: "GOSI", KW: "PIFSS" };
export const COUNTRY_CURRENCY: Record<PensionCountry, "AED" | "SAR" | "KWD"> = {
  AE: "AED",
  SA: "SAR",
  KW: "KWD",
};
