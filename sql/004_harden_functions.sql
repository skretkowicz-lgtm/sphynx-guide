-- Security hardening flagged by Supabase's database linter.
-- Apply in the SQL Editor like the earlier files.

-- 1. prevent_role_escalation() was the only function left with a mutable
--    search_path. It is the trigger that stops a signed-in user promoting
--    themselves to 'behaviourist', and it decides that by calling
--    auth.uid(). With an unpinned search_path, anyone able to create a
--    shadowing auth.uid() earlier in the path could make the check see NULL
--    and pass. Supabase does not grant `authenticated` rights to create
--    objects, so this is defence in depth rather than an open hole — but
--    it is the last function that should be left resolvable.
create or replace function public.prevent_role_escalation()
returns trigger language plpgsql set search_path = public, auth as $$
begin
  if auth.uid() is not null and new.role <> old.role then
    raise exception 'role cannot be changed from a client session';
  end if;
  return new;
end;
$$;

-- 2. The two trigger functions are only ever invoked by their triggers.
--    PostgREST already refuses to expose functions returning `trigger`
--    (calling them over the REST API returns PGRST202), so this closes a
--    path that is not currently reachable — but it removes the standing
--    grant rather than relying on PostgREST's behaviour not changing.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.handle_user_email_change() from public, anon, authenticated;

-- 3. is_behaviourist() is called from RLS policy expressions, so
--    `authenticated` must keep EXECUTE. `anon` never has a uid, so the
--    function can only ever return false for them — revoking anyway keeps
--    the exposed surface to what is actually used.
revoke all on function public.is_behaviourist() from public, anon;
grant execute on function public.is_behaviourist() to authenticated;
