-- ═══════════════════════════════════════════════════════════════
-- WEBSITE PROJECT TRACKER — CHELO  |  Artchelo Design
-- Supabase Setup Script
--
-- INSTRUCTIONS:
--   1. Go to your Supabase project → SQL Editor
--   2. Paste this entire file and click "Run"
--   3. Follow the post-setup steps at the bottom
-- ═══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1. PROFILES TABLE
--    Stores role ('admin' or 'client') for each auth user.
--    One row per user, auto-created on sign-up via trigger.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT,
  role       TEXT NOT NULL DEFAULT 'client'
               CHECK (role IN ('admin', 'client')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast role lookups
CREATE INDEX IF NOT EXISTS profiles_role_idx ON public.profiles(role);


-- ─────────────────────────────────────────────────────────────
-- 2. PROJECTS TABLE
--    Core data store for all tracked website projects.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.projects (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name     TEXT NOT NULL,
  project_title    TEXT NOT NULL,
  package_category TEXT NOT NULL DEFAULT 'Unspecified'
                     CHECK (package_category IN (
                       'Package 1: Basic',
                       'Package 2: Dynamic',
                       'Package 3: E-commerce',
                       'Package 4: Enhancement',
                       'Website Translation',
                       'Unspecified'
                     )),
  project_status   TEXT NOT NULL DEFAULT 'Ongoing'
                     CHECK (project_status IN ('Ongoing', 'Completed')),
  payment_status   TEXT NOT NULL DEFAULT 'Pending'
                     CHECK (payment_status IN (
                       'Pending',
                       'Partially Paid',
                       'Fully Paid',
                       'Overdue'
                     )),
  total_php        NUMERIC(14, 2),
  total_ntd        NUMERIC(14, 2),
  live_url         TEXT,
  remarks          TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common filter operations
CREATE INDEX IF NOT EXISTS projects_project_status_idx ON public.projects(project_status);
CREATE INDEX IF NOT EXISTS projects_payment_status_idx ON public.projects(payment_status);
CREATE INDEX IF NOT EXISTS projects_created_at_idx     ON public.projects(created_at DESC);


-- ─────────────────────────────────────────────────────────────
-- 3. AUTO-CREATE PROFILE ON SIGN-UP
--    This trigger fires whenever a new user is created in
--    Supabase Auth and automatically inserts a matching row
--    in the profiles table with role = 'client'.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'client')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Drop and recreate trigger to avoid duplicates on re-run
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- ─────────────────────────────────────────────────────────────
-- 4. ROW LEVEL SECURITY (RLS)
--    Enforces access control at the database level.
--    The anon key alone cannot bypass these policies.
-- ─────────────────────────────────────────────────────────────

-- Enable RLS on both tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;


-- ── profiles policies ──────────────────────────────────────

-- Drop existing policies first (safe to re-run)
DROP POLICY IF EXISTS "profiles_select_own"  ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own"  ON public.profiles;

-- Users can only read their own profile row
CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Users can update only their own profile (e.g. future self-service)
CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id);


-- ── projects policies ──────────────────────────────────────

-- Drop existing policies first
DROP POLICY IF EXISTS "projects_select_authenticated" ON public.projects;
DROP POLICY IF EXISTS "projects_insert_admin"         ON public.projects;
DROP POLICY IF EXISTS "projects_update_admin"         ON public.projects;
DROP POLICY IF EXISTS "projects_delete_admin"         ON public.projects;

-- All authenticated users (admin + client) can read all projects
CREATE POLICY "projects_select_authenticated"
  ON public.projects
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only admins can create new projects
CREATE POLICY "projects_insert_admin"
  ON public.projects
  FOR INSERT
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- Only admins can update projects
CREATE POLICY "projects_update_admin"
  ON public.projects
  FOR UPDATE
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- Only admins can delete projects
CREATE POLICY "projects_delete_admin"
  ON public.projects
  FOR DELETE
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );


-- ═══════════════════════════════════════════════════════════════
-- POST-SETUP STEPS (run these AFTER creating users in Auth)
-- ═══════════════════════════════════════════════════════════════

-- STEP A — Promote a user to admin.
-- Replace the email below with your actual admin email, then run:
--
--   UPDATE public.profiles
--   SET role = 'admin'
--   WHERE email = 'admin@artchelo.com';
--
-- STEP B — Verify roles are set correctly:
--
--   SELECT email, role FROM public.profiles;
--
-- ═══════════════════════════════════════════════════════════════
