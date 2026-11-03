-- Preserve all RLS policies, authenticated grants and service_role grants.
REVOKE ALL PRIVILEGES ON TABLE
  public.branches, public.classes, public.fee_structures, public.library_books,
  public.parents, public.staff, public.students, public.subjects
FROM anon;

-- Owner-level defaults were audited but are not changed: Cloud refused them.
-- Defaults apply on object creation, not retroactively to these existing tables.