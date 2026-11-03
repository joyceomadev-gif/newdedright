-- SECURITY WARNING: restores the exact anonymous grants observed 2026-10-24.
-- Review and explicitly authorize before applying. This is NOT applied automatically.
-- Original grantor for the eight tables was postgres; no grant options existed.
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
ON TABLE public.branches, public.classes, public.fee_structures, public.library_books,
  public.parents, public.staff, public.students, public.subjects
TO anon GRANTED BY postgres;

-- Owner-level default privileges were NOT changed; do not modify them on rollback.