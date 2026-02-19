-- ================================================================
-- 002: Auto-assign admin role for contact@cggroupe.fr
-- ================================================================

-- Update existing profile if already created
UPDATE public.profiles
SET role = 'admin'
WHERE email = 'contact@cggroupe.fr';

-- Replace the handle_new_user trigger function to auto-assign admin role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, locale)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
    CASE WHEN NEW.email = 'contact@cggroupe.fr' THEN 'admin' ELSE 'user' END,
    'fr'
  );
  RETURN NEW;
END;
$$;
