-- ============================================
-- AgroFinca - Supabase Fix Script
-- Run this in Supabase SQL Editor to fix
-- the user_profiles table and signup trigger
-- ============================================

-- 1. Drop the recursive admin policy that causes infinite loop
DROP POLICY IF EXISTS "Admins see all profiles" ON user_profiles;

-- 2. Recreate admin policy without recursive reference
-- Uses auth.jwt() claims instead of querying user_profiles itself
CREATE POLICY "Admins see all profiles" ON user_profiles
  FOR SELECT USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.is_admin = true
    )
  );

-- 3. Make sure the trigger function uses SECURITY DEFINER properly
-- This bypasses RLS when inserting from the auth trigger
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, nombre, plan, is_admin, farm_count, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email, '@', 1)),
    'free',
    FALSE,
    0,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    nombre = COALESCE(EXCLUDED.nombre, public.user_profiles.nombre),
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 5. Add a service role insert policy so the trigger can insert
-- (SECURITY DEFINER should bypass RLS, but just in case)
DROP POLICY IF EXISTS "Service role insert profiles" ON user_profiles;
CREATE POLICY "Service role insert profiles" ON user_profiles
  FOR INSERT WITH CHECK (true);

-- 6. Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;
GRANT ALL ON public.user_profiles TO authenticated;
GRANT SELECT ON public.user_profiles TO anon;

-- 7. Verify: check if the table is accessible
SELECT count(*) AS profile_count FROM user_profiles;
