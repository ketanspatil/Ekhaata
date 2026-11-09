-- ============================================================================
-- EKHAATA: MIGRATION SCRIPT FOR EXISTING DATABASE SCHEMA
-- Run this in Supabase SQL Editor -> New Query -> Run
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. UPDATE SHOPS TABLE
-- ----------------------------------------------------------------------------
-- Add currency column if missing
ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ----------------------------------------------------------------------------
-- 2. UPDATE CUSTOMERS TABLE
-- ----------------------------------------------------------------------------
-- Add notes and updated_at if missing
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Ensure unique constraint on (shop_id, normalized_name) to prevent duplicate customers
CREATE UNIQUE INDEX IF NOT EXISTS unique_shop_customer_normalized
  ON public.customers (shop_id, normalized_name);

-- ----------------------------------------------------------------------------
-- 3. UPDATE TRANSACTIONS TABLE
-- ----------------------------------------------------------------------------
-- The application uses 'udhaar' (credit) and 'jama' (payment), as well as 'reversal'.
-- Also add shop_id and reversal_of_id for direct shop queries and auditing.

-- Step 3a: Add shop_id to transactions (and backfill from customers)
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES public.shops(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS reversal_of_id UUID REFERENCES public.transactions(id);

-- Backfill shop_id from the related customer if any transactions exist without it
UPDATE public.transactions t
SET shop_id = c.shop_id
FROM public.customers c
WHERE t.customer_id = c.id
  AND t.shop_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_shop ON public.transactions (shop_id);

-- Step 3b: Update type check constraint to accept both lowercase ('udhaar', 'jama', 'reversal')
-- and uppercase ('CREDIT', 'PAYMENT') so both formats work seamlessly!
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_type_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_type_check
  CHECK (
    (type)::text = ANY (
      ARRAY[
        'udhaar'::text,
        'jama'::text,
        'reversal'::text,
        'CREDIT'::text,
        'PAYMENT'::text
      ]
    )
  );

-- ----------------------------------------------------------------------------
-- 4. ENABLE ROW LEVEL SECURITY & ADD POLICIES
-- ----------------------------------------------------------------------------
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- 4a. Service role (server-side admin execution)
DROP POLICY IF EXISTS "Service role full access on shops" ON public.shops;
CREATE POLICY "Service role full access on shops" ON public.shops
  FOR ALL TO service_role USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "Service role full access on customers" ON public.customers;
  CREATE POLICY "Service role full access on customers" ON public.customers
    FOR ALL TO service_role USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "Service role full access on transactions" ON public.transactions;
  CREATE POLICY "Service role full access on transactions" ON public.transactions
    FOR ALL TO service_role USING (true) WITH CHECK (true);

  -- 4b. Authenticated Users (Owner-based isolation)
  DROP POLICY IF EXISTS "Owner can view own shop" ON public.shops;
  CREATE POLICY "Owner can view own shop" ON public.shops
    FOR SELECT TO authenticated
    USING (owner_id = auth.uid());

  DROP POLICY IF EXISTS "Owner can create shop" ON public.shops;
  CREATE POLICY "Owner can create shop" ON public.shops
    FOR INSERT TO authenticated
    WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Owner can update own shop" ON public.shops;
CREATE POLICY "Owner can update own shop" ON public.shops
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Owner can access own customers" ON public.customers;
CREATE POLICY "Owner can access own customers" ON public.customers
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.shops
      WHERE shops.id = customers.shop_id
        AND shops.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.shops
      WHERE shops.id = customers.shop_id
        AND shops.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owner can access own transactions" ON public.transactions;
CREATE POLICY "Owner can access own transactions" ON public.transactions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.shops
      WHERE shops.id = transactions.shop_id
        AND shops.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.shops
      WHERE shops.id = transactions.shop_id
        AND shops.owner_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 5. DYNAMIC BALANCE VIEW
-- Calculates customer balances directly from transaction history
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.customer_balances_view;

CREATE VIEW public.customer_balances_view AS
SELECT 
    c.id AS customer_id,
    c.shop_id,
    COALESCE(c.name, c.full_name) AS customer_name,
    c.normalized_name,
    c.phone,
    COALESCE(SUM(CASE WHEN t.type IN ('udhaar', 'CREDIT') THEN t.amount_paise ELSE 0 END), 0) AS total_credit_paise,
    COALESCE(SUM(CASE WHEN t.type IN ('jama', 'PAYMENT') THEN t.amount_paise ELSE 0 END), 0) AS total_payment_paise,
    COALESCE(SUM(CASE 
        WHEN t.type IN ('udhaar', 'CREDIT') THEN t.amount_paise 
        WHEN t.type IN ('jama', 'PAYMENT') THEN -t.amount_paise 
        ELSE 0 
    END), 0) AS balance_paise,
    ROUND(COALESCE(SUM(CASE 
        WHEN t.type IN ('udhaar', 'CREDIT') THEN t.amount 
        WHEN t.type IN ('jama', 'PAYMENT') THEN -t.amount 
        ELSE 0 
    END), 0), 2) AS balance_rupees,
    COUNT(t.id) AS transaction_count,
    MAX(t.created_at) AS last_transaction_at
FROM public.customers c
LEFT JOIN public.transactions t ON c.id = t.customer_id
GROUP BY c.id, c.shop_id, c.name, c.full_name, c.normalized_name, c.phone;

