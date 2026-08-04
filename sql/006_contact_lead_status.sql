-- Turns contact_submissions from a write-only mailbox copy into a lead list
-- the behaviourist can actually work through in the app.
--
-- The table was created (see server/README.md) with RLS enabled and ZERO
-- policies, which made it unreachable with the anon key and readable only by
-- the server's service_role. This file opens exactly one door: the
-- behaviourist may read every row and change the two workflow columns. The
-- anon key still cannot see or write anything here, and INSERT deliberately
-- gets no policy at all — submissions keep arriving only via the server, so
-- a lead cannot be forged from a browser.
--
-- Apply by pasting into the Supabase SQL Editor and running once, same as
-- 002-005. If profile.html then gets PGRST204 for one of the new columns,
-- PostgREST's schema cache is stale: run `notify pgrst, 'reload schema';`.

alter table public.contact_submissions
  -- 'new' is the only honest default for rows that predate this file: they
  -- may well have been answered by email, but nothing recorded that.
  add column status text not null default 'new'
    check (status in ('new','contacted','converted','archived')),
  -- Private working notes. Safe to keep on this table precisely because no
  -- one without the behaviourist role can select from it at all — unlike
  -- appointments.notes, which the owner can read.
  add column internal_note text,
  add column handled_by uuid references public.profiles(id),
  add column handled_at timestamptz;

-- handled_by/handled_at are derived, so they are set here rather than being
-- accepted from the browser: a client-writable "who dealt with this, and
-- when" is a field that can lie. Only a real status change stamps them, so
-- editing a note does not rewrite the history of when the lead was worked.
create function public.set_contact_submission_handled()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status is distinct from old.status then
    new.handled_at = now();
    new.handled_by = auth.uid();
  end if;
  return new;
end;
$$;
revoke all on function public.set_contact_submission_handled() from public, anon, authenticated;

create trigger contact_submissions_set_handled
  before update on public.contact_submissions
  for each row execute function public.set_contact_submission_handled();

create policy "contact_submissions_select_behaviourist" on public.contact_submissions for select
  using (public.is_behaviourist());

-- WITH CHECK is spelled out rather than left to default to the USING clause,
-- for the same reason sql/005 spells it out.
create policy "contact_submissions_update_behaviourist" on public.contact_submissions for update
  using (public.is_behaviourist())
  with check (public.is_behaviourist());

-- RLS decides which ROWS are visible; it cannot restrict which COLUMNS may be
-- written. Without this, the policy above would let the behaviourist rewrite
-- name, email, or the message itself — i.e. edit what a visitor said they
-- said. Column-level grants are the mechanism that actually pins that down,
-- and they leave the two workflow columns writable. handled_by/handled_at are
-- absent on purpose: the trigger sets them, so nothing needs to send them.
revoke update on public.contact_submissions from anon, authenticated;
grant update (status, internal_note) on public.contact_submissions to authenticated;

-- Serves the default "what still needs dealing with" view, and the
-- created_at ordering within it.
create index if not exists contact_submissions_status_created_idx
  on public.contact_submissions (status, created_at desc);
