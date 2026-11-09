-- ============================================================================
-- EKHAATA COMPLETE DATABASE SETUP (FOR EMPTY SUPABASE PROJECTS)
-- Run this entire script in Supabase Dashboard -> SQL Editor -> Run
-- ============================================================================

-- 1. Enable standard extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. SHOPS TABLE (Multi-shop, tied to Supabase Auth users)
CREATE TABLE IF NOT EXISTS public.shops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    owner_phone VARCHAR(20),
    currency VARCHAR(10) DEFAULT 'INR',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint: one shop per registered owner
CREATE UNIQUE INDEX IF NOT EXISTS idx_shops_owner_id ON public.shops (owner_id)
    WHERE owner_id IS NOT NULL;

-- 3. CUSTOMERS TABLE
-- Stores full customer profiles and normalized names for Indic phonetic matching
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    normalized_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_shop_customer_normalized UNIQUE (shop_id, normalized_name)
);

CREATE INDEX IF NOT EXISTS idx_customers_shop_id ON public.customers (shop_id);
CREATE INDEX IF NOT EXISTS idx_customers_normalized ON public.customers (shop_id, normalized_name);

-- 4. TRANSACTIONS TABLE
-- Financial Ledger: Accurate storage in integer paise (1 Rupee = 100 paise) and NUMERIC(12, 2)
-- Types: 'udhaar' (credit / outstanding increases), 'jama' (payment / outstanding decreases), 'reversal'
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    type VARCHAR(20) NOT NULL CHECK (type IN ('udhaar', 'jama', 'reversal')),
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    idempotency_key VARCHAR(128) UNIQUE,
    description TEXT,
    reversal_of_id UUID REFERENCES public.transactions(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_customer ON public.transactions (customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_shop ON public.transactions (shop_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON public.transactions (created_at DESC);

-- 5. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Service Role (Full Server Access)
CREATE POLICY "Service role full access on shops" ON public.shops
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on customers" ON public.customers
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on transactions" ON public.transactions
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated Users (Owner-based isolation)
CREATE POLICY "Owner can view own shop" ON public.shops
    FOR SELECT TO authenticated
    USING (owner_id = auth.uid());

CREATE POLICY "Owner can create shop" ON public.shops
    FOR INSERT TO authenticated
    WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owner can update own shop" ON public.shops
    FOR UPDATE TO authenticated
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());

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

-- 6. DYNAMIC BALANCE VIEW
-- Calculates customer balances directly from transaction history (never manually stored)
CREATE OR REPLACE VIEW public.customer_balances_view AS
SELECT 
    c.id AS customer_id,
    c.shop_id,
    c.name AS customer_name,
    c.normalized_name,
    c.phone,
    COALESCE(SUM(CASE WHEN t.type = 'udhaar' THEN t.amount_paise ELSE 0 END), 0) AS total_credit_paise,
    COALESCE(SUM(CASE WHEN t.type = 'jama' THEN t.amount_paise ELSE 0 END), 0) AS total_payment_paise,
    COALESCE(SUM(CASE 
        WHEN t.type = 'udhaar' THEN t.amount_paise 
        WHEN t.type = 'jama' THEN -t.amount_paise 
        ELSE 0 
    END), 0) AS balance_paise,
    ROUND(COALESCE(SUM(CASE 
        WHEN t.type = 'udhaar' THEN t.amount 
        WHEN t.type = 'jama' THEN -t.amount 
        ELSE 0 
    END), 0), 2) AS balance_rupees,
    COUNT(t.id) AS transaction_count,
    MAX(t.created_at) AS last_transaction_at
FROM public.customers c
LEFT JOIN public.transactions t ON c.id = t.customer_id
GROUP BY c.id, c.shop_id, c.name, c.normalized_name, c.phone;

