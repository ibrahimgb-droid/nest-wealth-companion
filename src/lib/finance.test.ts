import { describe, expect, it } from "vitest";
import { convert } from "./currency";
import {
  accountKind,
  allocateReceipt,
  applyToBalance,
  canSpendFrom,
  checkSpend,
  groupReceipt,
  matchPaymentAccount,
  paymentAccountName,
  paymentKind,
  openingBalance,
  outstanding,
  paymentMethodFor,
  pensionEstimate,
  safeToSpend,
  spendByCategory,
  transferLegs,
} from "./finance";

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
  it("records cash expenses as cash, credit card expenses as credit and bank as card", () => {
    expect(paymentMethodFor("cash")).toBe("cash");
    expect(paymentMethodFor("credit")).toBe("credit");
    expect(paymentMethodFor("card")).toBe("credit");
    expect(paymentMethodFor("bank")).toBe("card");
  });
  it("treats older card accounts as credit and current accounts as bank", () => {
    expect(accountKind("card")).toBe("credit");
    expect(accountKind("current")).toBe("bank");
  });
});

describe("loans", () => {
  it("stores money you lent as a positive balance (owed to you)", () => {
    expect(openingBalance("lent", 500)).toBe(500);
  });
  it("stores money you borrowed as a negative balance (you owe)", () => {
    expect(openingBalance("borrowed", 2000)).toBe(-2000);
  });
  it("loan accounts cannot pay for expenses", () => {
    expect(canSpendFrom("lent")).toBe(false);
    expect(canSpendFrom("borrowed")).toBe(false);
    expect(canSpendFrom("credit")).toBe(true);
  });
  it("repaying 800 of a 2000 loan from the bank leaves 1200 owed", () => {
    const [out, into] = transferLegs({
      from: { id: "bank", currency: "AED" },
      to: { id: "loan", currency: "AED" },
      amount: 800,
      transferId: "t1",
      occurredAt: "2026-10-30T10:00:00Z",
      fromLabel: "Bank",
      toLabel: "Ahmed",
    });
    expect(outstanding(applyToBalance(-2000, into!))).toBe(1200);
    expect(applyToBalance(5000, out!)).toBe(4200);
  });
});

describe("transfers", () => {
  const legs = (amount: number, toCurrency = "AED", received?: number) =>
    transferLegs({
      from: { id: "bank", currency: "AED" },
      to: { id: "card", currency: toCurrency },
      amount,
      ...(received != null ? { received } : {}),
      transferId: "t1",
      occurredAt: "2026-10-30T10:00:00Z",
      fromLabel: "Bank",
      toLabel: "Card",
    });
  it("paying 500 towards a card owing 1395.56 leaves 895.56 owed", () => {
    const [, into] = legs(500);
    expect(outstanding(applyToBalance(-1395.56, into!))).toBeCloseTo(895.56, 2);
  });
  it("takes the amount out of one account and puts it into the other", () => {
    const [out, into] = legs(500);
    expect([out?.direction, out?.account_id, out?.amount]).toEqual(["debit", "bank", 500]);
    expect([into?.direction, into?.account_id, into?.amount]).toEqual(["credit", "card", 500]);
    expect(out?.transfer_id).toBe(into?.transfer_id);
  });
  it("converts across currencies at the peg unless the received amount is given", () => {
    expect(legs(367.25, "SAR")[1]?.amount).toBeCloseTo(375, 2);
    expect(legs(100, "SAR", 101)[1]?.amount).toBe(101);
  });
  it("refuses a transfer into the same account", () => {
    expect(() =>
      transferLegs({
        from: { id: "a", currency: "AED" },
        to: { id: "a", currency: "AED" },
        amount: 10,
        transferId: "t",
        occurredAt: "",
        fromLabel: "",
        toLabel: "",
      }),
    ).toThrow();
  });
  it("transfers and card payments do not count as spending", () => {
    const now = new Date().toISOString();
    const spend = spendByCategory(
      [
        { amount: 40, currency: "AED", direction: "debit", category: "dining", occurred_at: now },
        { amount: 500, currency: "AED", direction: "debit", category: "transfer", occurred_at: now, transfer_id: "t1" },
      ],
      "AED",
    );
    expect(spend).toEqual({ dining: 40 });
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

describe("receipt payment account", () => {
  const accts = [
    { id: "cash", name: "Wallet", institution: null, account_type: "cash" },
    { id: "nbk", name: "NBK Visa", institution: "NBK", account_type: "credit" },
    { id: "adcb", name: "Card •4821", institution: "ADCB", account_type: "credit" },
    { id: "salary", name: "Salary", institution: "Emirates NBD", account_type: "bank" },
  ];
  const pay = (p: Partial<Parameters<typeof paymentKind>[0]>) => ({ method: "unknown" as const, brand: null, last4: null, bank: null, ...p });

  it("picks the card whose name shows the receipt's last 4 digits", () => {
    expect(matchPaymentAccount(accts, pay({ method: "card", brand: "Visa", last4: "**** 4821" }))).toEqual({ account: accts[2], exact: true });
  });
  it("matches a cash receipt to the cash wallet", () => {
    expect(matchPaymentAccount(accts, pay({ method: "cash" })).account?.id).toBe("cash");
  });
  it("treats mada / KNET card payments as paid from a bank account", () => {
    expect(paymentKind(pay({ method: "card", brand: "mada" }))).toBe("bank");
    expect(paymentKind(pay({ method: "card", brand: "KNET" }))).toBe("bank");
    expect(paymentKind(pay({ method: "card", brand: "Mastercard" }))).toBe("credit");
  });
  it("prefers the credit card from the bank printed on the receipt", () => {
    expect(matchPaymentAccount(accts, pay({ method: "credit_card", bank: "NBK" }))).toEqual({ account: accts[1], exact: true });
  });
  it("flags a card that isn't added yet so the user can add it", () => {
    const m = matchPaymentAccount(accts, pay({ method: "credit_card", brand: "Amex", last4: "9001" }));
    expect(m.exact).toBe(false);
    expect(paymentAccountName(pay({ brand: "Amex", last4: "xx9001" }))).toBe("Amex •9001");
  });
  it("suggests nothing when the receipt doesn't say how it was paid", () => {
    expect(matchPaymentAccount(accts, pay({}))).toEqual({ account: null, exact: false });
  });
});
