-- 1) Staff: revoke sensitive columns from client roles (admin reads via service_role server functions)
REVOKE SELECT (salary, date_of_birth, nin, bank_name, bank_account, bank_code, bank_account_number, bank_account_name, paystack_recipient_code)
  ON public.staff FROM authenticated;
REVOKE SELECT (salary, date_of_birth, nin, bank_name, bank_account, bank_code, bank_account_number, bank_account_name, paystack_recipient_code)
  ON public.staff FROM anon;

-- 2) Students: revoke sensitive medical / emergency / DOB columns from client roles
REVOKE SELECT (medical_info, allergies, disabilities, blood_group, genotype, emergency_contact_name, emergency_contact_phone, emergency_contact_relation, date_of_birth)
  ON public.students FROM authenticated;
REVOKE SELECT (medical_info, allergies, disabilities, blood_group, genotype, emergency_contact_name, emergency_contact_phone, emergency_contact_relation, date_of_birth)
  ON public.students FROM anon;

-- 3) Parents: revoke contact PII from client roles (still accessible via server functions / admin)
REVOKE SELECT (email, phone, address)
  ON public.parents FROM authenticated;
REVOKE SELECT (email, phone, address)
  ON public.parents FROM anon;

-- Parents may still need to read their OWN contact info — that requires service_role
-- through a server function, OR we can grant back to a tightened SELECT path.
-- Keep simple: own-profile read goes through a server function as well.

-- 4) staff_attendance: drop the recorder-overreach policy
DROP POLICY IF EXISTS "Recorder view staff_attendance" ON public.staff_attendance;
