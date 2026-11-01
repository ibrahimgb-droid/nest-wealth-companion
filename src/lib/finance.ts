import { convert } from "./currency";
import type { ReceiptPayment } from "./receipt-types";

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
  transfer_id?: string | null;
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

/** Debit spend per category for the month of `ref`, converted to `base`. Transfers are not spending. */
export function spendByCategory(txs: LedgerTx[], base: string, ref = new Date()) {
  const out: Record<string, number> = {};
  for (const t of txs) {
    if (t.direction !== "debit" || isTransfer(t) || !isInMonth(t.occurred_at, ref)) continue;
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

// ---------------------------------------------------------------------------
// Accounts: every expense comes from a cash wallet, bank account or credit card.
// Loan accounts track money lent to someone (they owe you) or borrowed (you owe).

export type AccountKind = "cash" | "bank" | "credit" | "lent" | "borrowed";
/** Accounts an expense can be paid from. */
export const SPEND_KINDS = ["cash", "bank", "credit"] as const;
export const LOAN_KINDS = ["lent", "borrowed"] as const;
export const ACCOUNT_KINDS: AccountKind[] = [...SPEND_KINDS, ...LOAN_KINDS];

/** Older account types map onto the kinds the app offers. */
export function accountKind(type: string): AccountKind {
  if (type === "cash") return "cash";
  if (type === "credit" || type === "card") return "credit";
  if (type === "lent") return "lent";
  if (type === "borrowed") return "borrowed";
  return "bank";
}

export function isLoan(type: string) {
  const k = accountKind(type);
  return k === "lent" || k === "borrowed";
}

/** Only cash, bank and credit card accounts can pay for an expense. */
export function canSpendFrom(type: string) {
  return !isLoan(type);
}

/** How an expense from this account was paid. */
export function paymentMethodFor(type: string): "cash" | "card" | "credit" {
  const k = accountKind(type);
  if (k === "cash") return "cash";
  if (k === "credit") return "credit";
  return "card";
}

/**
 * Starting balance stored for a new account. Credit cards and money you
 * borrowed are what you owe, stored as a negative balance. Money you lent is
 * owed to you, so it stays positive.
 */
export function openingBalance(kind: AccountKind, entered: number): number {
  const v = Math.abs(Number.isFinite(entered) ? entered : 0);
  return kind === "credit" || kind === "borrowed" ? -v : v;
}

/** What is still owed on a credit card or borrowed loan (0 if nothing). */
export function outstanding(balance: number) {
  return balance < 0 ? -balance : 0;
}

export const CURRENCY_COUNTRY: Record<"AED" | "SAR" | "KWD", PensionCountry> = { AED: "AE", SAR: "SA", KWD: "KW" };

// ---------------------------------------------------------------------------
// Transfers: money moves out of one account and into another. Paying a credit
// card, lending or repaying a loan are all transfers, so they are never spending.

export const TRANSFER_CATEGORY = "transfer";

export function isTransfer(tx: { category: string; transfer_id?: string | null }) {
  return tx.category === TRANSFER_CATEGORY || !!tx.transfer_id;
}

export interface TransferAccount {
  id: string;
  currency: string;
}

export interface TransferInput {
  from: TransferAccount;
  to: TransferAccount;
  /** Amount leaving `from`, in its currency. */
  amount: number;
  /** Amount arriving in `to`, in its currency (defaults to `amount` when currencies match). */
  received?: number;
  transferId: string;
  occurredAt: string;
  fromLabel: string;
  toLabel: string;
  note?: string | null;
}

/** The two ledger rows of a transfer: a debit on `from` and a credit on `to`. */
export function transferLegs(input: TransferInput) {
  const { from, to, amount, transferId, occurredAt } = input;
  if (from.id === to.id) throw new Error("Pick two different accounts");
  if (!(amount > 0)) throw new Error("Enter an amount");
  const received = from.currency === to.currency ? amount : input.received ?? convert(amount, from.currency, to.currency);
  const shared = {
    category: TRANSFER_CATEGORY,
    payment_method: "transfer",
    shariah_compliant: true,
    transfer_id: transferId,
    occurred_at: occurredAt,
    merchant_raw: input.note?.trim() || null,
  };
  return [
    { ...shared, account_id: from.id, amount, currency: from.currency, direction: "debit", merchant_name: input.toLabel },
    { ...shared, account_id: to.id, amount: received, currency: to.currency, direction: "credit", merchant_name: input.fromLabel },
  ];
}

/** Balance after a ledger row, mirroring the database trigger. */
export function applyToBalance(balance: number, row: { amount: number; direction: string }) {
  return balance + (row.direction === "credit" ? row.amount : -row.amount);
}

// ---------------------------------------------------------------------------
// Receipts: line items are split into one expense per category.

export interface ReceiptLine {
  name: string;
  price: number;
  category: string;
}

function roundTo(v: number, decimals: number) {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

/**
 * Spread VAT, service charges or discounts over the line items so that the
 * items add up exactly to the total paid. Any rounding remainder goes to the
 * most expensive item.
 */
export function allocateReceipt(items: ReceiptLine[], total: number, decimals = 2): ReceiptLine[] {
  const clean = items.filter((i) => Number.isFinite(i.price) && i.price > 0);
  const sum = clean.reduce((s, i) => s + i.price, 0);
  if (clean.length === 0 || sum <= 0 || !(total > 0)) return clean.map((i) => ({ ...i, price: roundTo(i.price, decimals) }));
  const scaled = clean.map((i) => ({ ...i, price: roundTo((i.price / sum) * total, decimals) }));
  const diff = roundTo(total - scaled.reduce((s, i) => s + i.price, 0), decimals);
  if (diff !== 0) {
    let max = 0;
    scaled.forEach((i, idx) => {
      if (i.price > (scaled[max]?.price ?? 0)) max = idx;
    });
    const target = scaled[max];
    if (target) target.price = roundTo(target.price + diff, decimals);
  }
  return scaled;
}

/** Group receipt lines by category, largest first. */
export function groupReceipt(items: ReceiptLine[], decimals = 2) {
  const map = new Map<string, ReceiptLine[]>();
  for (const i of items) map.set(i.category, [...(map.get(i.category) ?? []), i]);
  return [...map.entries()]
    .map(([category, lines]) => ({ category, lines, amount: roundTo(lines.reduce((s, l) => s + l.price, 0), decimals) }))
    .sort((a, b) => b.amount - a.amount);
}

// ---------------------------------------------------------------------------
// Receipt payment → account: use what the receipt printed (cash, card brand,
// last 4 digits, bank) to pick the account it was paid from.

/** Account kind a receipt payment comes from: cash wallet, credit card, or bank (debit card / mada / KNET). */
export function paymentKind(p: ReceiptPayment): "cash" | "bank" | "credit" | null {
  if (p.method === "cash") return "cash";
  if (p.method === "credit_card") return "credit";
  if (p.method === "debit_card") return "bank";
  if (p.method === "card") return /mada|knet|debit/i.test(p.brand ?? "") ? "bank" : "credit";
  return null;
}

/** Suggested name for a new account made from a receipt payment, e.g. "Visa •1234". */
export function paymentAccountName(p: ReceiptPayment): string | null {
  const brand = p.brand?.trim() || null;
  const last4 = p.last4?.replace(/\D/g, "").slice(-4) || null;
  if (!brand && !last4) return null;
  return [brand, last4 ? `•${last4}` : null].filter(Boolean).join(" ");
}

interface MatchableAccount {
  id: string;
  name: string;
  institution: string | null;
  account_type: string;
}

/**
 * Picks the account a receipt was paid from: an account whose name or bank
 * shows the card's last 4 digits wins; otherwise an account of the matching
 * kind (preferring the printed bank). `exact` is true only for a last-4 match
 * or the only account of that kind.
 */
export function matchPaymentAccount<T extends MatchableAccount>(accounts: T[], p: ReceiptPayment) {
  const last4 = p.last4?.replace(/\D/g, "").slice(-4);
  if (last4 && last4.length === 4) {
    const hit = accounts.find((a) => `${a.name} ${a.institution ?? ""}`.includes(last4));
    if (hit) return { account: hit, exact: true };
  }
  const kind = paymentKind(p);
  if (!kind) return { account: null, exact: false };
  const sameKind = accounts.filter((a) => accountKind(a.account_type) === kind);
  const bank = p.bank?.trim().toLowerCase();
  const byBank = bank
    ? sameKind.find((a) => {
        const inst = (a.institution ?? "").trim().toLowerCase();
        return `${a.name} ${inst}`.toLowerCase().includes(bank) || (inst.length > 1 && bank.includes(inst));
      })
    : undefined;
  const account = byBank ?? sameKind[0] ?? null;
  const exact = !!account && !last4 && (!!byBank || sameKind.length === 1 || kind === "cash");
  return { account, exact };
};
}
