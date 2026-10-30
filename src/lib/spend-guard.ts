import { convert } from "./currency";
import { checkSpend, spendByCategory, type BudgetMode } from "./finance";
import type { Budget, Profile, Transaction } from "./data";

/** Evaluate a new spend against the user's budget mode (passive alerts vs strict envelopes). */
export function evaluateSpend(
  profile: Profile,
  budgets: Budget[],
  transactions: Transaction[],
  category: string,
  amount: number,
  currency: string,
) {
  const base = profile.base_currency;
  const spent = spendByCategory(transactions, base)[category] ?? 0;
  const budget = budgets.find((b) => b.category === category);
  const amountBase = convert(amount, currency, base);
  const result = checkSpend({
    mode: profile.budget_mode as BudgetMode,
    limit: budget ? Number(budget.monthly_limit) : null,
    spent,
    amount: amountBase,
  });
  return { ...result, base };
}
