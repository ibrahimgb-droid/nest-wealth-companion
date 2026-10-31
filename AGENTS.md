<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules

- Data access goes through react-query options and mutations in `src/lib/data.ts` using the browser client with RLS; every signed-in page loads via `ensureFinanceData` (which redirects to `/onboarding` until `profiles.onboarded_at` is set), and only the onboarding route uses `ensureOnboardingData` — keeps one cache shape and one setup gate for all screens.
- Money math (FX pegs, safe-to-spend, envelope checks, pension estimates) lives in pure functions in `src/lib/finance.ts` / `src/lib/currency.ts` with tests in `src/lib/finance.test.ts` — keeps business rules testable and out of components.
- Amounts are stored in their native account currency and only converted for display/aggregation — the app must never force-convert balances.
- Account balances are maintained by a database trigger on transaction insert/delete — never update `accounts.balance` from the client when adding transactions.
- New users get an empty profile from the `handle_new_user` trigger and no sample data; `seed_demo_data` is deprecated — real accounts come from onboarding.
- Every expense must reference a spendable account (`cash` / `bank` / `credit`, see `canSpendFrom`) and use that account's currency; loan accounts (`lent` positive = owed to user, `borrowed` negative = user owes) are never expense sources. Payment method and sign rules live in `src/lib/finance.ts` — keeps balances consistent with the trigger.
- Transfers, card payments and loan moves are two linked transaction rows (source debit, destination credit) sharing `transfer_id`, built by `transferLegs`, created and deleted together, and excluded from spend/income aggregates via `isTransfer` — keeps balances trigger-driven without counting money moves as spending.
- Receipt reading runs server-side in `src/lib/receipt.server.ts` behind the auth-protected `scanReceipt` server function (`receipt.functions.ts`), accepting photo or PDF data URLs; shared types live in `receipt-types.ts` — keeps the AI key and prompt off the browser.
- All user-facing text goes through `useI18n().t()` with keys in `src/lib/i18n/en.ts` and matching `ar.ts`; `dir` is set on `<html>` so layouts must use logical (`ms/me/ps/pe/start/end`) utilities.
