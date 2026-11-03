
ALTER TABLE public.staff_attendance
  ADD CONSTRAINT staff_attendance_staff_id_fkey
  FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;

ALTER TABLE public.staff_leave
  ADD CONSTRAINT staff_leave_staff_id_fkey
  FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;

ALTER TABLE public.payroll
  ADD CONSTRAINT payroll_staff_id_fkey
  FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;

ALTER TABLE public.staff_evaluations
  ADD CONSTRAINT staff_evaluations_staff_id_fkey
  FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;
