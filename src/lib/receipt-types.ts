// Shared between the browser and the receipt reader on the server.
export const RECEIPT_CATEGORIES = [
  "groceries",
  "dining",
  "transport",
  "shopping",
  "electronics",
  "utilities",
  "health",
  "entertainment",
  "education",
  "housing",
  "fees",
  "other",
] as const;

export type ReceiptCategory = (typeof RECEIPT_CATEGORIES)[number];

export const PAYMENT_METHODS = ["cash", "credit_card", "debit_card", "card", "unknown"] as const;

/** How the receipt says it was paid (card brand, last 4 digits, issuing bank when printed). */
export interface ReceiptPayment {
  method: (typeof PAYMENT_METHODS)[number];
  brand: string | null;
  last4: string | null;
  bank: string | null;
}

export interface ScannedReceipt {
  merchant: string;
  date: string | null;
  currency: "AED" | "SAR" | "KWD" | null;
  total: number;
  items: { name: string; price: number; category: ReceiptCategory }[];
  payment: ReceiptPayment;
}

export type ReceiptScanResult =
  | { ok: true; receipt: ScannedReceipt }
  | { ok: false; reason: "notReceipt" | "credits" | "busy" | "failed" };
