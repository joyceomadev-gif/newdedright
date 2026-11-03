-- Replace USING (true) SELECT policies with authenticated-only predicates.
-- Access for signed-in users is unchanged; anonymous access is no longer implied.

DROP POLICY "All view trait_items" ON public.trait_items;
CREATE POLICY "All view trait_items" ON public.trait_items FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY "role_permissions readable by authenticated" ON public.role_permissions;
CREATE POLICY "role_permissions readable by authenticated" ON public.role_permissions FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY "All view fee_structures" ON public.fee_structures;
CREATE POLICY "All view fee_structures" ON public.fee_structures FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY "All view resources" ON public.library_resources;
CREATE POLICY "All view resources" ON public.library_resources FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY "View result_component_scores" ON public.result_component_scores;
CREATE POLICY "View result_component_scores" ON public.result_component_scores FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY "rsp_read" ON public.role_submodule_permissions;
CREATE POLICY "rsp_read" ON public.role_submodule_permissions FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY "View assessment_components" ON public.assessment_components;
CREATE POLICY "View assessment_components" ON public.assessment_components FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY "All view sessions" ON public.sessions;
CREATE POLICY "All view sessions" ON public.sessions FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY "All view books" ON public.library_books;
CREATE POLICY "All view books" ON public.library_books FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY "View assessment_structures" ON public.assessment_structures;
CREATE POLICY "View assessment_structures" ON public.assessment_structures FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY "All view terms" ON public.terms;
CREATE POLICY "All view terms" ON public.terms FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY "permissions readable by authenticated" ON public.permissions;
CREATE POLICY "permissions readable by authenticated" ON public.permissions FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY "Authenticated view plans" ON public.subscription_plans;
CREATE POLICY "Authenticated view plans" ON public.subscription_plans FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY "All view labs" ON public.labs;
CREATE POLICY "All view labs" ON public.labs FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY "Authenticated can view role permissions" ON public.role_module_permissions;
CREATE POLICY "Authenticated can view role permissions" ON public.role_module_permissions FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY "All view timetable" ON public.timetable;
CREATE POLICY "All view timetable" ON public.timetable FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY "View grading_scales" ON public.grading_scales;
CREATE POLICY "View grading_scales" ON public.grading_scales FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY "Authenticated can view custom roles" ON public.custom_roles;
CREATE POLICY "Authenticated can view custom roles" ON public.custom_roles FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY "rfp_read" ON public.role_function_permissions;
CREATE POLICY "rfp_read" ON public.role_function_permissions FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY "All view school_settings" ON public.school_settings;
CREATE POLICY "All view school_settings" ON public.school_settings FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY "All view trait_categories" ON public.trait_categories;
CREATE POLICY "All view trait_categories" ON public.trait_categories FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);