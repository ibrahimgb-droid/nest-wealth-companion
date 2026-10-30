-- Track whether the user finished onboarding
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;

-- Accounts are now cash, bank or credit (older values stay valid for existing rows)
ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_account_type_check;
ALTER TABLE public.accounts ADD CONSTRAINT accounts_account_type_check
  CHECK (account_type IN ('cash','bank','credit','current','savings','card','investment'));
ALTER TABLE public.accounts ALTER COLUMN account_type SET DEFAULT 'bank';

-- New users start with an empty ledger and go through onboarding
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, home_wealth_value, pension_salary, pension_years, real_estate_value)
  VALUES (
    NEW.id,
    NULLIF(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''), ''),
    0, 0, 0, 0
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.seed_demo_data(uuid) IS 'DEPRECATED: new users no longer receive sample data; onboarding collects real accounts.';