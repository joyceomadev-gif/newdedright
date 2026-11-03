-- Restore extended app_role enum values that previously existed outside the repository migration history.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'school_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'principal';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'vice_principal_academic';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'vice_principal_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'hod';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'class_teacher';
