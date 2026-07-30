-- Indexes for the foreign-key and sort columns that every profile page
-- read touches. Postgres indexes primary keys and unique constraints
-- automatically but NOT foreign-key columns, so without these each
-- consultation/document lookup is a sequential scan plus an in-memory
-- sort, and deleting a profile scans both child tables to check the FKs.
--
-- Separate from 002 because 002 has already been applied; run this one in
-- the Supabase SQL Editor the same way.

-- Serves .eq('owner_id', …).order('consultation_date', desc) and the
-- owner_id FK check.
create index if not exists consultations_owner_date_idx
  on public.consultations (owner_id, consultation_date desc);
create index if not exists consultations_created_by_idx
  on public.consultations (created_by);

-- Serves .eq('owner_id', …).order('created_at', desc) plus both FKs.
-- documents grows fastest of the three tables (several files per session).
create index if not exists documents_owner_created_idx
  on public.documents (owner_id, created_at desc);
create index if not exists documents_consultation_idx
  on public.documents (consultation_id);
create index if not exists documents_uploaded_by_idx
  on public.documents (uploaded_by);
