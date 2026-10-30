// GCC currencies are pegged to USD, so conversion uses fixed peg rates.
// Rates are "units per 1 USD".
export const GCC_CURRENCIES = ["AED", "SAR", "KWD"] as const;
export type GccCurrency = (typeof GCC_CURRENCIES)[number];

export const USD_RATES: Record<string, number> = {
  USD: 1,
  AED: 3.6725,
  SAR: 3.75,
  KWD: 0.3075,
  INR: 88.5,
  PKR: 281,
  PHP: 58.5,
  EGP: 48.5,
  GBP: 0.79,
  EUR: 0.92,
};

export const HOME_CURRENCIES = ["INR", "PKR", "PHP", "EGP", "GBP", "EUR", "USD"] as const;

export function convert(amount: number, from: string, to: string): number {
  if (from === to) return amount;
  const f = USD_RATES[from];
  const t = USD_RATES[to];
  if (!f || !t) return amount;
  return (amount / f) * t;
}

export function decimalsFor(currency: string): number {
  return currency === "KWD" ? 3 : 2;
}

const AR_SYMBOLS: Record<string, string> = { AED: "د.إ", SAR: "ر.س", KWD: "د.ك" };

export function currencyLabel(currency: string, locale: "en" | "ar" = "en"): string {
  return locale === "ar" ? (AR_SYMBOLS[currency] ?? currency) : currency;
}

export function formatAmount(amount: number, currency: string, opts?: { compact?: boolean }): string {
  const d = opts?.compact ? 0 : decimalsFor(currency);
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
    notation: opts?.compact && Math.abs(amount) >= 100000 ? "compact" : "standard",
  }).format(amount);
}

export function formatMoney(
  amount: number,
  currency: string,
  locale: "en" | "ar" = "en",
  opts?: { compact?: boolean; signed?: boolean },
): string {
  const sign = opts?.signed && amount > 0 ? "+" : amount < 0 ? "−" : "";
  const n = formatAmount(Math.abs(amount), currency, opts);
  const label = currencyLabel(currency, locale);
  return locale === "ar" ? `${sign}${n} ${label}` : `${sign}${label} ${n}`;
}
