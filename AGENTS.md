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

- Data access goes through react-query options and mutations in `src/lib/data.ts` using the browser client with RLS; every signed-in page loads via `ensureFinanceData` in its loader — keeps one cache shape for all screens.
- Money math (FX pegs, safe-to-spend, envelope checks, pension estimates) lives in pure functions in `src/lib/finance.ts` / `src/lib/currency.ts` with tests in `src/lib/finance.test.ts` — keeps business rules testable and out of components.
- Amounts are stored in their native account currency and only converted for display/aggregation — the app must never force-convert balances.
- Account balances are maintained by a database trigger on transaction insert/delete — never update `accounts.balance` from the client when adding transactions.
- New users get profile + sample GCC data from the `handle_new_user` → `seed_demo_data` trigger — change demo data there, not in app code.
- All user-facing text goes through `useI18n().t()` with keys in `src/lib/i18n/en.ts` and matching `ar.ts`; `dir` is set on `<html>` so layouts must use logical (`ms/me/ps/pe/start/end`) utilities.
