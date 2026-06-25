-- ================================================================
-- 003: SECURITY DEFINER is_admin() helper + rewrite admin RLS policies
-- ================================================================
-- The original "users_own_data" policies (001) inlined
--   EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
-- which is re-evaluated PER ROW and reads `profiles` under RLS. Replacing it
-- with a STABLE SECURITY DEFINER function makes the admin check evaluate once
-- per statement and bypass RLS cleanly (no risk of recursive policy evaluation).

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Only authenticated users may call it
REVOKE ALL ON FUNCTION public.is_admin() FROM public;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Rewrite the per-table policies to use the helper
DROP POLICY IF EXISTS "users_own_data" ON public.documents;
CREATE POLICY "users_own_data" ON public.documents
  FOR ALL USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "users_own_data" ON public.projects;
CREATE POLICY "users_own_data" ON public.projects
  FOR ALL USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "users_own_data" ON public.jobs;
CREATE POLICY "users_own_data" ON public.jobs
  FOR ALL USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "users_own_data" ON public.signature_certificates;
CREATE POLICY "users_own_data" ON public.signature_certificates
  FOR ALL USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "users_own_data" ON public.share_links;
CREATE POLICY "users_own_data" ON public.share_links
  FOR ALL USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "users_own_data" ON public.annotations;
CREATE POLICY "users_own_data" ON public.annotations
  FOR ALL USING (user_id = auth.uid() OR public.is_admin());
