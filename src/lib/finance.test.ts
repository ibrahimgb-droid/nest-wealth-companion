import { describe, expect, it } from "vitest";
import { convert } from "./currency";
import { checkSpend, pensionEstimate, safeToSpend } from "./finance";

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
