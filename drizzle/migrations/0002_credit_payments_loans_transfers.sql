-- Credit card spend gets its own payment method; transfers between accounts too.
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_payment_method_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_payment_method_check
  CHECK (payment_method IN ('card','apple_pay','mada','knet','bank_transfer','cash','credit','transfer'));

-- Both sides of a transfer share one transfer_id.
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS transfer_id uuid;
CREATE INDEX IF NOT EXISTS transactions_transfer_idx ON public.transactions(transfer_id) WHERE transfer_id IS NOT NULL;

-- Backfill: expenses already paid from credit cards are credit payments.
UPDATE public.transactions t SET payment_method = 'credit'
FROM public.accounts a
WHERE a.id = t.account_id AND a.account_type IN ('credit','card') AND t.payment_method = 'card';

-- Loan accounts: money lent to someone, or borrowed from someone.
ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_account_type_check;
ALTER TABLE public.accounts ADD CONSTRAINT accounts_account_type_check
  CHECK (account_type IN ('cash','bank','credit','lent','borrowed','current','savings','card','investment'));