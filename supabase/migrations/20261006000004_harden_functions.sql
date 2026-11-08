-- Security advisor fixes: pin search_path on the trigger helper and keep the
-- SECURITY DEFINER auth triggers out of the public RPC surface. Triggers still
-- fire; EXECUTE is only needed by API callers, which these never should be.
alter function public.set_updated_date() set search_path = public;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_confirmed() from public, anon, authenticated;
revoke execute on function public.set_updated_date() from public, anon, authenticated;
