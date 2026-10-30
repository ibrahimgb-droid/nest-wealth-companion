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

export interface ScannedReceipt {
  merchant: string;
  date: string | null;
  currency: "AED" | "SAR" | "KWD" | null;
  total: number;
  items: { name: string; price: number; category: ReceiptCategory }[];
}

export type ReceiptScanResult =
  | { ok: true; receipt: ScannedReceipt }
  | { ok: false; reason: "notReceipt" | "credits" | "busy" | "failed" };
