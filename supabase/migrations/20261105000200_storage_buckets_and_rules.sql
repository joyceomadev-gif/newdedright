-- Storage buckets and access rules, copied from the old database's own catalog.
-- All five buckets are PRIVATE. Safe to re-run.

insert into storage.buckets (id, name, public) values
  ('student-photos', 'student-photos', false),
  ('staff-photos', 'staff-photos', false),
  ('library-files', 'library-files', false),
  ('question-media', 'question-media', false),
  ('exam-uploads', 'exam-uploads', false)
on conflict (id) do update set public = false;

-- ---------- staff-photos ----------
drop policy if exists "Admins manage staff photos" on storage.objects;
create policy "Admins manage staff photos" on storage.objects
  for all to authenticated
  using (bucket_id = 'staff-photos' and public.is_admin(auth.uid()))
  with check (bucket_id = 'staff-photos' and public.is_admin(auth.uid()));

drop policy if exists "Staff read staff photos" on storage.objects;
create policy "Staff read staff photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'staff-photos' and public.is_staff(auth.uid()));

-- ---------- student-photos ----------
drop policy if exists "Scoped read student photos" on storage.objects;
create policy "Scoped read student photos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'student-photos'
    and (
      public.is_staff(auth.uid())
      or exists (
        select 1 from public.students s
        where s.photo_url is not null
          and s.photo_url like '%' || objects.name || '%'
          and (
            s.user_id = auth.uid()
            or exists (select 1 from public.parents p where p.id = s.parent_id and p.user_id = auth.uid())
          )
      )
    )
  );

drop policy if exists "Staff upload student photos" on storage.objects;
create policy "Staff upload student photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'student-photos' and public.is_staff(auth.uid()));

drop policy if exists "Staff update student photos" on storage.objects;
create policy "Staff update student photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'student-photos' and public.is_staff(auth.uid()));

drop policy if exists "Staff delete student photos" on storage.objects;
create policy "Staff delete student photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'student-photos' and public.is_staff(auth.uid()));

-- ---------- library-files ----------
drop policy if exists "Staff read library-files" on storage.objects;
create policy "Staff read library-files" on storage.objects
  for select to authenticated
  using (bucket_id = 'library-files' and public.is_staff(auth.uid()));

drop policy if exists "Staff upload library-files" on storage.objects;
create policy "Staff upload library-files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'library-files' and public.is_staff(auth.uid()));

drop policy if exists "Staff update library-files" on storage.objects;
create policy "Staff update library-files" on storage.objects
  for update to authenticated
  using (bucket_id = 'library-files' and public.is_staff(auth.uid()));

drop policy if exists "Staff delete library-files" on storage.objects;
create policy "Staff delete library-files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'library-files' and public.is_staff(auth.uid()));

-- ---------- question-media ----------
drop policy if exists "Staff manage question media" on storage.objects;
create policy "Staff manage question media" on storage.objects
  for all to authenticated
  using (bucket_id = 'question-media' and public.is_staff(auth.uid()))
  with check (bucket_id = 'question-media' and public.is_staff(auth.uid()));

drop policy if exists "Staff read question media" on storage.objects;
create policy "Staff read question media" on storage.objects
  for select to authenticated
  using (bucket_id = 'question-media' and public.is_staff(auth.uid()));

-- ---------- exam-uploads ----------
drop policy if exists "Students manage own exam uploads" on storage.objects;
create policy "Students manage own exam uploads" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'exam-uploads'
    and (
      (storage.foldername(name))[1] in (
        select a.id::text
        from public.exam_attempts a
        join public.students s on s.id = a.student_id
        where s.user_id = auth.uid()
      )
      or public.is_staff(auth.uid())
    )
  )
  with check (
    bucket_id = 'exam-uploads'
    and (storage.foldername(name))[1] in (
      select a.id::text
      from public.exam_attempts a
      join public.students s on s.id = a.student_id
      where s.user_id = auth.uid()
    )
  );