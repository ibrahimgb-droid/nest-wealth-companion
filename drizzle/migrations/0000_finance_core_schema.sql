-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  user_type text NOT NULL DEFAULT 'expat' CHECK (user_type IN ('expat','national')),
  base_currency text NOT NULL DEFAULT 'AED' CHECK (base_currency IN ('AED','SAR','KWD')),
  budget_mode text NOT NULL DEFAULT 'passive' CHECK (budget_mode IN ('passive','envelope')),
  locale text NOT NULL DEFAULT 'en' CHECK (locale IN ('en','ar')),
  monthly_income numeric(14,3) NOT NULL DEFAULT 0,
  home_country text DEFAULT 'India',
  home_currency text DEFAULT 'INR',
  home_wealth_value numeric(16,2) DEFAULT 0,
  pension_country text DEFAULT 'AE' CHECK (pension_country IN ('AE','SA','KW')),
  pension_salary numeric(14,3) DEFAULT 0,
  pension_years integer DEFAULT 0,
  real_estate_label text,
  real_estate_value numeric(16,2) DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own profile select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ACCOUNTS
CREATE TABLE public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  institution text,
  country text NOT NULL CHECK (country IN ('AE','SA','KW')),
  currency text NOT NULL CHECK (currency IN ('AED','SAR','KWD')),
  account_type text NOT NULL DEFAULT 'current' CHECK (account_type IN ('current','savings','card','cash','investment')),
  balance numeric(16,3) NOT NULL DEFAULT 0,
  is_islamic boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX accounts_user_idx ON public.accounts(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO authenticated;
GRANT ALL ON public.accounts TO service_role;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own accounts select" ON public.accounts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own accounts insert" ON public.accounts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own accounts update" ON public.accounts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own accounts delete" ON public.accounts FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- TRANSACTIONS
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  merchant_raw text,
  merchant_name text NOT NULL,
  amount numeric(14,3) NOT NULL CHECK (amount >= 0),
  direction text NOT NULL DEFAULT 'debit' CHECK (direction IN ('debit','credit')),
  currency text NOT NULL CHECK (currency IN ('AED','SAR','KWD')),
  category text NOT NULL,
  payment_method text NOT NULL DEFAULT 'card' CHECK (payment_method IN ('card','apple_pay','mada','knet','bank_transfer','cash')),
  shariah_compliant boolean NOT NULL DEFAULT true,
  receipt_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX transactions_user_date_idx ON public.transactions(user_id, occurred_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own tx select" ON public.transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own tx insert" ON public.transactions FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id AND (account_id IS NULL OR EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = account_id AND a.user_id = auth.uid()))
);
CREATE POLICY "Own tx update" ON public.transactions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (
  auth.uid() = user_id AND (account_id IS NULL OR EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = account_id AND a.user_id = auth.uid()))
);
CREATE POLICY "Own tx delete" ON public.transactions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- BUDGETS
CREATE TABLE public.budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category text NOT NULL,
  monthly_limit numeric(14,3) NOT NULL DEFAULT 0 CHECK (monthly_limit >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, category)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budgets TO authenticated;
GRANT ALL ON public.budgets TO service_role;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own budgets select" ON public.budgets FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own budgets insert" ON public.budgets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own budgets update" ON public.budgets FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own budgets delete" ON public.budgets FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Keep account balances in sync with ledger entries
CREATE OR REPLACE FUNCTION public.apply_transaction_to_balance()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.account_id IS NOT NULL THEN
    UPDATE public.accounts SET balance = balance + CASE WHEN NEW.direction = 'credit' THEN NEW.amount ELSE -NEW.amount END
    WHERE id = NEW.account_id;
  ELSIF TG_OP = 'DELETE' AND OLD.account_id IS NOT NULL THEN
    UPDATE public.accounts SET balance = balance - CASE WHEN OLD.direction = 'credit' THEN OLD.amount ELSE -OLD.amount END
    WHERE id = OLD.account_id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER transactions_balance_trg AFTER INSERT OR DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.apply_transaction_to_balance();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed realistic GCC demo data for a user
CREATE OR REPLACE FUNCTION public.seed_demo_data(_uid uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a_enbd uuid; a_adib uuid; a_rajhi uuid; a_kfh uuid; a_cash uuid; a_card uuid;
  m int; month_start timestamptz; ts timestamptz; r record; amt numeric;
BEGIN
  INSERT INTO public.accounts (user_id,name,institution,country,currency,account_type,is_islamic)
    VALUES (_uid,'Current Account','Emirates NBD','AE','AED','current',false) RETURNING id INTO a_enbd;
  INSERT INTO public.accounts (user_id,name,institution,country,currency,account_type,is_islamic)
    VALUES (_uid,'Ghina Savings','ADIB','AE','AED','savings',true) RETURNING id INTO a_adib;
  INSERT INTO public.accounts (user_id,name,institution,country,currency,account_type,is_islamic)
    VALUES (_uid,'Mashreq Cashback Card','Mashreq','AE','AED','card',false) RETURNING id INTO a_card;
  INSERT INTO public.accounts (user_id,name,institution,country,currency,account_type,is_islamic)
    VALUES (_uid,'Cash Wallet',NULL,'AE','AED','cash',true) RETURNING id INTO a_cash;
  INSERT INTO public.accounts (user_id,name,institution,country,currency,account_type,is_islamic)
    VALUES (_uid,'Current Account','Al Rajhi Bank','SA','SAR','current',true) RETURNING id INTO a_rajhi;
  INSERT INTO public.accounts (user_id,name,institution,country,currency,account_type,is_islamic)
    VALUES (_uid,'Al-Thimar Savings','Kuwait Finance House','KW','KWD','savings',true) RETURNING id INTO a_kfh;

  FOR m IN 0..2 LOOP
    month_start := date_trunc('month', now()) - make_interval(months => m);
    FOR r IN SELECT * FROM (VALUES
      (1,'SALARY CR ACME FZ LLC REF 2210','Salary · Acme FZ-LLC',28500.0,'credit','AED','income','bank_transfer',true,'enbd',false),
      (2,'SI RENT EJARI 0912 ENBD','Rent · Marina Heights',9500.0,'debit','AED','housing','bank_transfer',true,'enbd',false),
      (3,'POS 4412 COSTA COFFEE DXB MALL AE','Costa Coffee Dubai Mall',24.0,'debit','AED','dining','card',true,'card',true),
      (4,'CAREEM*RIDE 7781 DUBAI','Careem ride',38.5,'debit','AED','transport','apple_pay',true,'card',true),
      (5,'TALABAT.COM*ORD 99812','Talabat · Shake Shack',86.0,'debit','AED','dining','apple_pay',true,'card',true),
      (6,'NOON.COM MP 55102 AE','Noon · Home essentials',342.0,'debit','AED','shopping','card',true,'card',true),
      (7,'CARREFOUR MOE 0034 DXB','Carrefour Mall of the Emirates',412.75,'debit','AED','groceries','card',true,'enbd',true),
      (8,'DEWA BILL PMT 7710231','DEWA · Electricity & Water',620.0,'debit','AED','utilities','bank_transfer',true,'enbd',true),
      (9,'ALANSARI REMIT INR 88123','Al Ansari Exchange · Remit to India',3500.0,'debit','AED','remittance','bank_transfer',true,'enbd',false),
      (10,'MYFATOORAH*GYMNATION KW','GymNation membership',18.5,'debit','KWD','health','knet',true,'kfh',false),
      (11,'TAP*JAHEZ RIYADH 5521','Jahez · Al Baik',62.0,'debit','SAR','dining','mada',true,'rajhi',true),
      (12,'STC PAY TOPUP 4410','stc pay top-up',200.0,'debit','SAR','utilities','mada',true,'rajhi',false),
      (13,'POS 2231 LULU HYPERMKT AUH','Lulu Hypermarket',268.4,'debit','AED','groceries','card',true,'enbd',true),
      (14,'SALIK TOPUP 00921','Salik toll top-up',100.0,'debit','AED','transport','card',true,'card',false),
      (15,'ENOC 1123 SZR DXB','ENOC fuel · Sheikh Zayed Rd',145.0,'debit','AED','transport','card',true,'card',true),
      (16,'NETFLIX.COM AMSTERDAM','Netflix',56.0,'debit','AED','entertainment','card',true,'card',false),
      (17,'TAP*VOX CINEMAS MOE','VOX Cinemas Mall of the Emirates',110.0,'debit','AED','entertainment','apple_pay',true,'card',true),
      (18,'ADIB GHINA SAVINGS TRF','Transfer to ADIB Ghina Savings',3000.0,'debit','AED','savings','bank_transfer',true,'enbd',false),
      (19,'MASHREQ CC FINANCE CHG','Credit card finance charge',74.2,'debit','AED','fees','card',false,'card',true),
      (20,'KNET*ALSHAYA H&M AVENUES','H&M The Avenues',24.75,'debit','KWD','shopping','knet',true,'kfh',true),
      (21,'TAP*TABBY INSTALLMENT 3/4','Tabby · Installment',210.0,'debit','AED','shopping','card',true,'card',false),
      (22,'POS 7781 SPINNEYS JLT','Spinneys JLT',156.3,'debit','AED','groceries','apple_pay',true,'enbd',true),
      (23,'DU POSTPAID 0551 AE','du · Mobile postpaid',325.0,'debit','AED','utilities','bank_transfer',true,'enbd',false),
      (24,'CASH','RTA Nol card top-up',50.0,'debit','AED','transport','cash',true,'cash',false),
      (25,'ENJAZ REMIT 33441 SA','Enjaz · Family transfer',1500.0,'debit','SAR','remittance','bank_transfer',true,'rajhi',false),
      (26,'AXA INS PREMIUM 8812','AXA conventional car insurance',285.0,'debit','AED','transport','card',false,'card',false),
      (27,'CAREEM FOOD 1182 DXB','Careem Food · Operation Falafel',48.0,'debit','AED','dining','apple_pay',true,'card',true),
      (28,'CASH','Karak tea · Al Satwa cafeteria',6.0,'debit','AED','dining','cash',true,'cash',false)
    ) AS t(day, raw, clean, amount, dir, cur, cat, pm, halal, acct, variable)
    LOOP
      ts := month_start + make_interval(days => r.day - 1, hours => 9 + (r.day % 11));
      CONTINUE WHEN ts > now();
      amt := CASE WHEN r.variable THEN round((r.amount * (1 + ((m * 7 + r.day) % 5 - 2) * 0.06))::numeric, 2) ELSE r.amount END;
      INSERT INTO public.transactions (user_id, account_id, occurred_at, merchant_raw, merchant_name, amount, direction, currency, category, payment_method, shariah_compliant)
      VALUES (_uid,
        CASE r.acct WHEN 'enbd' THEN a_enbd WHEN 'card' THEN a_card WHEN 'cash' THEN a_cash WHEN 'rajhi' THEN a_rajhi WHEN 'kfh' THEN a_kfh ELSE a_adib END,
        ts, r.raw, r.clean, amt, r.dir, r.cur, r.cat, r.pm, r.halal);
    END LOOP;
  END LOOP;

  -- Set realistic present-day balances
  UPDATE public.accounts SET balance = 48250.00 WHERE id = a_enbd;
  UPDATE public.accounts SET balance = 72400.00 WHERE id = a_adib;
  UPDATE public.accounts SET balance = -3420.55 WHERE id = a_card;
  UPDATE public.accounts SET balance = 650.00 WHERE id = a_cash;
  UPDATE public.accounts SET balance = 31780.40 WHERE id = a_rajhi;
  UPDATE public.accounts SET balance = 4215.750 WHERE id = a_kfh;

  INSERT INTO public.budgets (user_id, category, monthly_limit) VALUES
    (_uid,'housing',9500),(_uid,'groceries',1400),(_uid,'dining',900),(_uid,'transport',800),
    (_uid,'shopping',1000),(_uid,'utilities',1200),(_uid,'remittance',5000),(_uid,'savings',3000),
    (_uid,'entertainment',300),(_uid,'health',250)
  ON CONFLICT (user_id, category) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.seed_demo_data(uuid) FROM PUBLIC, anon, authenticated;

-- Create profile + demo data on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, monthly_income, pension_salary, pension_years, real_estate_label, real_estate_value, home_wealth_value)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    28500, 28500, 6, 'Apartment · Dubai Hills', 1850000, 4800000
  );
  PERFORM public.seed_demo_data(NEW.id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();