GRANT EXECUTE ON FUNCTION public.is_class_teacher_of(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_class_teacher_of_student(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.teaches_class(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.teaches_class_subject(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.teaches_exam_subject(uuid, uuid) TO authenticated;