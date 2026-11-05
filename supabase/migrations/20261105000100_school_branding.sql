-- School branding: each school sets its own name and logo in its settings.
-- The login page needs them before anyone signs in, so a small function exposes ONLY these two values publicly.

alter table public.school_settings add column if not exists logo_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('school-branding', 'school-branding', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

drop policy if exists "school-branding admins insert" on storage.objects;
create policy "school-branding admins insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'school-branding' and public.is_admin(auth.uid()));

drop policy if exists "school-branding admins update" on storage.objects;
create policy "school-branding admins update" on storage.objects
  for update to authenticated
  using (bucket_id = 'school-branding' and public.is_admin(auth.uid()))
  with check (bucket_id = 'school-branding' and public.is_admin(auth.uid()));

drop policy if exists "school-branding admins delete" on storage.objects;
create policy "school-branding admins delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'school-branding' and public.is_admin(auth.uid()));

create or replace function public.get_school_branding()
returns table (school_name text, logo_url text)
language sql
stable
security definer
set search_path = public
as $$
  select s.school_name::text, s.logo_url::text
  from public.school_settings s
  order by s.id
  limit 1
$$;

revoke all on function public.get_school_branding() from public;
grant execute on function public.get_school_branding() to anon, authenticated, service_role;