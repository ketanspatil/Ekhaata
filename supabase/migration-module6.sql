  -- ============================================================================
  -- EKHAATA MODULE 6: AUTHENTICATION MIGRATION
  -- Run this in Supabase SQL Editor AFTER the Module 5 schema has been applied.
  -- ============================================================================

  -- 1. Add owner_id to shops table (links shop to Supabase Auth user)
  ALTER TABLE public.shops
    ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

  -- 2. Remove the dev-only seed shop (now that real users will create their own shops)
  -- Only removes it if there is no real data attached to it yet:
  DELETE FROM public.shops
    WHERE id = '00000000-0000-0000-0000-000000000001'
      AND owner_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.customers WHERE shop_id = '00000000-0000-0000-0000-000000000001'
      );

  -- 3. Update RLS policies to enforce owner-based access on shops
  DROP POLICY IF EXISTS "Anon read on shops" ON public.shops;

  -- Authenticated users can read only their own shop
  CREATE POLICY "Owner can view own shop" ON public.shops
    FOR SELECT TO authenticated
    USING (owner_id = auth.uid());

  -- Authenticated users can insert a shop only for themselves
  CREATE POLICY "Owner can create shop" ON public.shops
    FOR INSERT TO authenticated
    WITH CHECK (owner_id = auth.uid());

  -- Authenticated users can update only their own shop
  CREATE POLICY "Owner can update own shop" ON public.shops
    FOR UPDATE TO authenticated
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());

  -- 4. Update RLS policies on customers — scope by shop ownership
  DROP POLICY IF EXISTS "Anon access on customers" ON public.customers;

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

  -- 5. Update RLS policies on transactions — scope by shop ownership
  DROP POLICY IF EXISTS "Anon access on transactions" ON public.transactions;

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

  -- Service role retains full access (no change needed — those policies already exist)

  -- 6. Create unique constraint: one shop per owner
  CREATE UNIQUE INDEX IF NOT EXISTS idx_shops_owner_id ON public.shops (owner_id)
    WHERE owner_id IS NOT NULL;

