-- Run this entire file once in Supabase Dashboard > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (char_length(username) between 1 and 50),
  avatar_path text,
  updated_at timestamptz not null default now()
);

create table if not exists public.sound_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  bass smallint not null check (bass between 0 and 100),
  mid smallint not null check (mid between 0 and 100),
  treble smallint not null check (treble between 0 and 100),
  ambience smallint not null check (ambience between 0 and 100),
  gain smallint not null check (gain between 0 and 100),
  created_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;
alter table public.sound_profiles enable row level security;

create policy "users manage own settings" on public.user_settings for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users read own profiles" on public.sound_profiles for select using ((select auth.uid()) = user_id);
create policy "users create own profiles" on public.sound_profiles for insert with check ((select auth.uid()) = user_id);
create policy "users update own profiles" on public.sound_profiles for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users delete own profiles" on public.sound_profiles for delete using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public) values ('avatars', 'avatars', false)
on conflict (id) do update set public = false;

create policy "users read own avatars" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "users upload own avatars" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "users update own avatars" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "users delete own avatars" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.user_settings (user_id, username)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), split_part(new.email, '@', 1)));
  insert into public.sound_profiles (user_id, name, bass, mid, treble, ambience, gain) values
    (new.id, 'Warm', 72, 55, 42, 28, 64),
    (new.id, 'Flat', 50, 50, 50, 20, 58),
    (new.id, 'Bright', 42, 58, 76, 24, 56);
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.delete_own_account() returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  delete from storage.objects where bucket_id = 'avatars' and owner_id = auth.uid()::text;
  delete from auth.users where id = auth.uid();
end;
$$;
revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;

-- Usernames are login identifiers, so they must be unique regardless of case.
create unique index if not exists user_settings_username_key
  on public.user_settings (lower(username));

-- Resolve an exact username to the corresponding Auth email for password login.
-- The function returns only an exact match and uses a generic error in the app.
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
