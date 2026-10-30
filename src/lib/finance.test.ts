import { describe, expect, it } from "vitest";
import { convert } from "./currency";
import { accountKind, allocateReceipt, checkSpend, groupReceipt, openingBalance, paymentMethodFor, pensionEstimate, safeToSpend } from "./finance";

describe("currency pegs", () => {
  it("converts 3.75 SAR to 3.6725 AED (both pegged to 1 USD)", () => {
    expect(convert(3.75, "SAR", "AED")).toBeCloseTo(3.6725, 4);
  });
  it("converts 1 KWD to about 11.94 AED", () => {
    expect(convert(1, "KWD", "AED")).toBeCloseTo(11.943, 2);
  });
});

describe("safe to spend", () => {
  it("subtracts spend and the unspent part of committed buckets from income", () => {
    const r = safeToSpend({
      monthlyIncome: 20000,
      spentByCategory: { housing: 8000, dining: 500, savings: 1000 },
      budgets: [
        { category: "housing", monthly_limit: 8000 },
        { category: "savings", monthly_limit: 3000 },
        { category: "dining", monthly_limit: 900 },
      ],
      daysLeft: 10,
    });
    // 20000 - 9500 spent - 2000 savings still reserved
    expect(r.amount).toBe(8500);
    expect(r.perDay).toBe(850);
  });
});

describe("budget modes", () => {
  it("envelope mode blocks spend beyond the category limit", () => {
    expect(checkSpend({ mode: "envelope", limit: 900, spent: 850, amount: 60 }).allowed).toBe(false);
  });
  it("passive mode allows the same spend but flags it as over", () => {
    const r = checkSpend({ mode: "passive", limit: 900, spent: 850, amount: 60 });
    expect(r.allowed).toBe(true);
    expect(r.alert).toBe("over");
  });
  it("passive mode warns at 80% of the limit", () => {
    expect(checkSpend({ mode: "passive", limit: 1000, spent: 700, amount: 100 }).alert).toBe("near");
  });
});

describe("pension estimate", () => {
  it("UAE GPSSA pays 60% at 15 years of service", () => {
    expect(pensionEstimate("AE", 20000, 15).monthly).toBe(12000);
  });
  it("UAE GPSSA is not payable before 15 years", () => {
    expect(pensionEstimate("AE", 20000, 14).eligible).toBe(false);
  });
});

describe("accounts", () => {
  it("stores a credit card's amount owed as a negative balance", () => {
    expect(openingBalance("credit", 1200)).toBe(-1200);
  });
  it("stores cash and bank opening balances as positive", () => {
    expect(openingBalance("cash", 300)).toBe(300);
    expect(openingBalance("bank", 5000)).toBe(5000);
  });
  it("records cash-wallet expenses as paid in cash and card/bank as card", () => {
    expect(paymentMethodFor("cash")).toBe("cash");
    expect(paymentMethodFor("credit")).toBe("card");
    expect(paymentMethodFor("bank")).toBe("card");
  });
  it("treats older card accounts as credit and current accounts as bank", () => {
    expect(accountKind("card")).toBe("credit");
    expect(accountKind("current")).toBe("bank");
  });
});

describe("receipt split", () => {
  it("spreads 5% VAT over items so they add up to the total paid", () => {
    const lines = allocateReceipt(
      [
        { name: "Milk", price: 10, category: "groceries" },
        { name: "Cable", price: 90, category: "electronics" },
      ],
      105,
    );
    expect(lines.map((l) => l.price)).toEqual([10.5, 94.5]);
  });
  it("puts the rounding remainder on the biggest item so the sum is exact", () => {
    const lines = allocateReceipt(
      [
        { name: "A", price: 1, category: "groceries" },
        { name: "B", price: 1, category: "groceries" },
        { name: "C", price: 1, category: "groceries" },
      ],
      10,
    );
    expect(lines.reduce((s, l) => s + l.price, 0)).toBeCloseTo(10, 5);
  });
  it("uses 3 decimals for KWD receipts", () => {
    const lines = allocateReceipt(
      [
        { name: "A", price: 1, category: "dining" },
        { name: "B", price: 2, category: "dining" },
      ],
      1,
      3,
    );
    expect(lines.map((l) => l.price)).toEqual([0.333, 0.667]);
  });
  it("groups lines into one expense per category", () => {
    const groups = groupReceipt([
      { name: "Milk", price: 12.5, category: "groceries" },
      { name: "Rice", price: 54, category: "groceries" },
      { name: "Buds", price: 299, category: "electronics" },
    ]);
    expect(groups.map((g) => [g.category, g.amount])).toEqual([
      ["electronics", 299],
      ["groceries", 66.5],
    ]);
  });
});
