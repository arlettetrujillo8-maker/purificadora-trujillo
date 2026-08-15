-- RLS policies execute these identity helpers as the authenticated caller.
-- Keep the schema private from anon/public while granting the minimum access
-- required for authenticated policies to evaluate.

revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated;

revoke all on function app_private.current_profile_id() from public, anon, authenticated;
revoke all on function app_private.current_role() from public, anon, authenticated;
revoke all on function app_private.current_route() from public, anon, authenticated;
revoke all on function app_private.is_admin() from public, anon, authenticated;

grant execute on function app_private.current_profile_id() to authenticated;
grant execute on function app_private.current_role() to authenticated;
grant execute on function app_private.current_route() to authenticated;
grant execute on function app_private.is_admin() to authenticated;
