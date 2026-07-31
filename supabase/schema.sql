-- =========================================================================
-- Lotti Homes — Site Induction & Daily Check-In
-- Run this once in your fresh Supabase project:
-- Dashboard → SQL Editor → New Query → paste this whole file → Run
-- =========================================================================

create extension if not exists pgcrypto;

-- -------------------------------------------------------------------------
-- SITE INDUCTIONS
-- One row per worker/subcontractor per induction (the 24-point form).
-- -------------------------------------------------------------------------
create table public.site_inductions (
  id                                      uuid primary key default gen_random_uuid(),
  created_at                              timestamptz not null default now(),

  -- who / where
  worker_name                             text not null,
  company                                 text not null,
  trade                                   text not null,
  induction_date                          date not null,
  supervisor                              text not null,

  -- all 24 Yes/No answers (+ optional comment on "No"), keyed by question id
  -- e.g. {"fit_for_work": {"answer": "yes"}, "ppe": {"answer": "no", "comment": "..."}}
  responses                               jsonb not null,

  -- worker declaration checkboxes
  declaration_completed_induction         boolean not null default false,
  declaration_understand_whs              boolean not null default false,
  declaration_agree_policies              boolean not null default false,
  declaration_report_hazards              boolean not null default false,
  declaration_understand_consequences     boolean not null default false,

  -- typed-name signature
  signature_name                          text not null,
  user_agent                              text
);

comment on table public.site_inductions is 'Worker & Subcontractor Safety Induction submissions.';

create index site_inductions_created_at_idx on public.site_inductions (created_at desc);
create index site_inductions_worker_name_idx on public.site_inductions (worker_name);
create index site_inductions_induction_date_idx on public.site_inductions (induction_date);

alter table public.site_inductions enable row level security;

-- Anyone with the public anon key can submit an induction (the form is
-- public, accessed via QR code on site) — but they cannot read, update
-- or delete rows back. Only the service_role key (used from a trusted
-- admin dashboard/backend, never in the browser) can read submissions.
create policy "Public can submit inductions"
  on public.site_inductions
  for insert
  to anon
  with check (true);

-- -------------------------------------------------------------------------
-- DAILY CHECK-INS
-- One row per worker per shift.
-- -------------------------------------------------------------------------
create table public.daily_checkins (
  id                     uuid primary key default gen_random_uuid(),
  created_at             timestamptz not null default now(),

  worker_name            text not null,
  company                text not null,
  checkin_date           date not null,
  site_address           text not null,

  -- all checklist answers (+ optional comment on "No"), keyed by item id
  responses              jsonb not null,

  hazards_identified     text,
  incidents_near_misses  text,
  additional_notes       text,

  signature_name         text not null,
  user_agent             text
);

comment on table public.daily_checkins is 'Daily pre-start site check-in submissions.';

create index daily_checkins_created_at_idx on public.daily_checkins (created_at desc);
create index daily_checkins_worker_name_idx on public.daily_checkins (worker_name);
create index daily_checkins_checkin_date_idx on public.daily_checkins (checkin_date);

alter table public.daily_checkins enable row level security;

create policy "Public can submit daily check-ins"
  on public.daily_checkins
  for insert
  to anon
  with check (true);

-- =========================================================================
-- That's it. After running this:
--   1. Project Settings → API → copy "Project URL" and the "anon" "public" key
--   2. Paste them into js/supabase-config.js on the website
--
-- To view submissions, use the Supabase Table Editor (Dashboard → Table
-- Editor → site_inductions / daily_checkins) while logged in as the
-- project owner — the RLS policies above only allow inserts from the
-- public site, not reads, so worker submissions can't be viewed or
-- tampered with by anyone else visiting the form.
-- =========================================================================
