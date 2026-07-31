-- =========================================================================
-- Lotti Homes — Admin Portal read access
-- Run this AFTER schema.sql, once, in your Supabase project:
-- Dashboard → SQL Editor → New Query → paste this whole file → Run
--
-- This does two things:
--   1. Lets logged-in ("authenticated") users read the submissions —
--      the public form pages still only get INSERT (see schema.sql),
--      never SELECT, so workers can never browse other people's data.
--   2. Nothing here creates a login — you still create the admin
--      account yourself in the dashboard (see step below).
-- =========================================================================

create policy "Authenticated users can read inductions"
  on public.site_inductions
  for select
  to authenticated
  using (true);

create policy "Authenticated users can read daily check-ins"
  on public.daily_checkins
  for select
  to authenticated
  using (true);

-- =========================================================================
-- Create your admin login (do this once, in the dashboard — not SQL):
--   Dashboard → Authentication → Users → Add User
--     - Email: e.g. admin@lottihomes.com.au
--     - Password: set one, or "Auto-generate" and copy it
--     - Leave "Auto Confirm User" ON so it can log in immediately
--
-- Also turn OFF public sign-ups so nobody else can create an account:
--   Dashboard → Authentication → Providers → Email
--     - Toggle "Allow new users to sign up" OFF
--   (admin.html has no sign-up form anyway — this just closes the API too)
--
-- Add more admins later the same way (Authentication → Users → Add User).
-- =========================================================================
