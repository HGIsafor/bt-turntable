-- Run this once in Supabase Dashboard > SQL Editor for an existing project.
create unique index if not exists user_settings_username_key
  on public.user_settings (lower(username));

create or replace function public.resolve_login_email(login_name text)
returns text language sql stable security definer set search_path = '' as $$
  select users.email
  from public.user_settings settings
  join auth.users users on users.id = settings.user_id
  where lower(settings.username) = lower(trim(login_name))
  limit 1;
$$;

revoke all on function public.resolve_login_email(text) from public;
grant execute on function public.resolve_login_email(text) to anon, authenticated;
