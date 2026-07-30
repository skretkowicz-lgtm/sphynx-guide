-- Adds user accounts (owners + one behaviourist), consultation history, and
-- document storage on top of the existing contact_submissions table.
--
-- Apply by pasting this whole file into the Supabase SQL Editor and running
-- it once. After running, promote the real behaviourist's own account:
--
--   update public.profiles set role = 'behaviourist' where email = 'her-email@example.com';

-- ---------- profiles ----------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','behaviourist')),
  full_name text,
  email text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- Auto-create the profile row on signup. role is always 'owner' here and is
-- never set from client input, closing off self-promotion at creation time.
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- Keep profiles.email in sync if a user ever changes their auth email.
create function public.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;
create trigger on_auth_user_email_updated
  after update of email on auth.users for each row execute function public.handle_user_email_change();

-- Block role changes from any authenticated client session (blocks the
-- devtools "update profiles set role='behaviourist'" self-promotion attack).
-- The one-off manual promotion above still works because it runs from the
-- SQL Editor, where auth.uid() is null (no JWT in that context).
create function public.prevent_role_escalation()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and new.role <> old.role then
    raise exception 'role cannot be changed from a client session';
  end if;
  return new;
end;
$$;
create trigger profiles_block_role_change
  before update on public.profiles for each row execute function public.prevent_role_escalation();

-- Helper used by every policy below. security definer + fixed search_path
-- avoids both RLS recursion on profiles and search-path hijacking.
create function public.is_behaviourist()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'behaviourist');
$$;
revoke all on function public.is_behaviourist() from public;
grant execute on function public.is_behaviourist() to authenticated;

create policy "profiles_select_own_or_behaviourist" on public.profiles for select
  using (id = auth.uid() or public.is_behaviourist());
create policy "profiles_update_own" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- ---------- consultations ----------

create table public.consultations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  consultation_date timestamptz not null,
  mode text not null check (mode in ('online','in_person')),
  notes text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.consultations enable row level security;

create policy "consultations_select" on public.consultations for select
  using (owner_id = auth.uid() or public.is_behaviourist());

-- Only the behaviourist logs sessions. Pins created_by to the caller and
-- confirms owner_id actually points at an owner-role profile.
create policy "consultations_insert_behaviourist_only" on public.consultations for insert
  with check (
    public.is_behaviourist()
    and created_by = auth.uid()
    and exists (select 1 from public.profiles p where p.id = owner_id and p.role = 'owner')
  );
-- No update/delete policy: immutable session log by design (default deny).

-- ---------- documents ----------

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  consultation_id uuid references public.consultations(id),
  uploaded_by uuid not null references public.profiles(id),
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  category text not null default 'other'
    check (category in ('behaviourist_advice','medical','recording','image','other')),
  created_at timestamptz not null default now()
);
alter table public.documents enable row level security;

create policy "documents_select" on public.documents for select
  using (owner_id = auth.uid() or public.is_behaviourist());

-- Both owners and the behaviourist can upload. uploaded_by always pins to
-- the caller. An owner can only attach documents to their own owner_id, and
-- only if their own profile really is role 'owner'. If a consultation_id is
-- given, it must belong to that same owner_id (blocks cross-owner
-- correlation of consultation metadata via a document row).
create policy "documents_insert" on public.documents for insert
  with check (
    uploaded_by = auth.uid()
    and (
      (owner_id = auth.uid()
        and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'))
      or public.is_behaviourist()
    )
    and (
      consultation_id is null
      or exists (select 1 from public.consultations c
                 where c.id = consultation_id and c.owner_id = documents.owner_id)
    )
  );
-- No update/delete policy: immutable, by design.

-- ---------- storage ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'consultation-documents', 'consultation-documents', false,
  52428800, -- 50 MB, server-enforced (client-side checks are UX only)
  array[
    'application/pdf','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg','image/png','image/webp','image/heic',
    'video/mp4','video/quicktime'
  ]
);

-- Path convention: {owner_id}/{document_id}/{filename} — the first path
-- segment is checked against auth.uid() for owners; the behaviourist
-- bypasses that check entirely.
create policy "storage_select" on storage.objects for select
  using (bucket_id = 'consultation-documents'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_behaviourist()));
create policy "storage_insert" on storage.objects for insert
  with check (bucket_id = 'consultation-documents'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_behaviourist()));
-- No update/delete storage policy: consistent with documents table immutability.
