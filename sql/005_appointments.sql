-- Appointments: the forward-looking schedule.
--
-- Deliberately MUTABLE, unlike consultations — rescheduling and cancelling
-- are the entire point. consultations stays the immutable record of advice
-- actually given; this table is what is going to happen.
--
-- Apply by pasting into the Supabase SQL Editor and running once, same as
-- 002-004. If profile.html then gets PGRST205 from /rest/v1/appointments,
-- PostgREST's schema cache is stale: run `notify pgrst, 'reload schema';`.
--
-- No FK to consultations, in either direction. consultations has no UPDATE
-- policy, so a consultations.appointment_id could only ever be written at
-- INSERT time — meaning it could not be backfilled later without breaking
-- the immutability guarantee. If the link is ever wanted it belongs on THIS
-- (mutable) side as appointments.consultation_id, set after the session
-- from a "log the consultation for this appointment" action.

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  -- Cascades: a schedule entry has no retention value once the person is
  -- erased. (consultations/documents deliberately do NOT cascade.)
  owner_id uuid not null references public.profiles(id) on delete cascade,
  scheduled_at timestamptz not null,
  duration_minutes int not null default 60 check (duration_minutes between 5 and 600),
  mode text not null check (mode in ('online','in_person')),
  -- No 'completed'. A past appointment still marked 'scheduled' IS a
  -- completed one, so storing that would need a manual click after every
  -- session — and the day one is missed the column starts lying. Only the
  -- two states the timestamp cannot infer are stored.
  --   upcoming = scheduled_at >= now()
  --   attended = scheduled_at < now() and status = 'scheduled'
  status text not null default 'scheduled'
    check (status in ('scheduled','cancelled','no_show')),
  -- Meeting URL when online, street address when in person. Rendered to the
  -- CLIENT, so profile.html only turns it into a link when it matches
  -- ^https:// — HTML-escaping does not neutralise a javascript: scheme.
  location text,
  -- Visible to the client (the SELECT policy grants owners their own rows).
  -- Preparation instructions, NOT private prep notes.
  notes text,
  -- Sync target for a future Calendly webhook. UNIQUE — and a plain
  -- constraint rather than a partial index, because upsert(..., {onConflict:
  -- 'external_ref'}) emits ON CONFLICT (external_ref), which will not match
  -- a partial index. Postgres treats NULLs as distinct, so any number of
  -- manually-created rows are unaffected.
  external_ref text unique,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.appointments enable row level security;

-- Without this trigger updated_at is a client-writable lie: PostgREST will
-- happily accept whatever value the browser sends. search_path is pinned at
-- creation because sql/004 exists precisely because that was omitted once.
create function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.set_updated_at() from public, anon, authenticated;

create trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

create policy "appointments_select" on public.appointments for select
  using (owner_id = auth.uid() or public.is_behaviourist());

create policy "appointments_insert_behaviourist_only" on public.appointments for insert
  with check (
    public.is_behaviourist()
    and created_by = auth.uid()
    and exists (select 1 from public.profiles p where p.id = owner_id and p.role = 'owner')
  );

-- WITH CHECK is spelled out even though Postgres would default it to the
-- USING expression — that default is the bug. With only USING, the
-- behaviourist could rewrite owner_id to ANY profile (including her own),
-- producing a row the INSERT policy would have rejected.
-- created_by is deliberately NOT pinned here: that works with one
-- behaviourist but silently breaks a second one editing a colleague's entry.
create policy "appointments_update_behaviourist_only" on public.appointments for update
  using (public.is_behaviourist())
  with check (
    public.is_behaviourist()
    and exists (select 1 from public.profiles p where p.id = owner_id and p.role = 'owner')
  );

-- Future-only. A typo (wrong client, duplicate) gets deleted so the client
-- never sees an event they were not booked for; a real session that did not
-- happen gets status 'cancelled'. History therefore cannot be rewritten.
-- now() is STABLE, which is legal in a policy — it would be rejected in a
-- CHECK constraint, which requires IMMUTABLE.
create policy "appointments_delete_future_only" on public.appointments for delete
  using (public.is_behaviourist() and scheduled_at > now());

-- One composite serves both directions: btree indexes scan backwards, so
-- this covers the ascending "upcoming" and descending "past" queries alike.
create index if not exists appointments_owner_scheduled_idx
  on public.appointments (owner_id, scheduled_at desc);
-- Serves the behaviourist's cross-client "what is on this week" list.
create index if not exists appointments_scheduled_idx
  on public.appointments (scheduled_at);
create index if not exists appointments_created_by_idx
  on public.appointments (created_by);
