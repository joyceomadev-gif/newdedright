import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const accounts = [
  { email: 'peter.ibrahim@demo.school', name: 'Peter Ibrahim', role: 'student', table: 'students', rowId: '081bfaa1-cd65-4bc0-bf7f-3d1623316058' },
  { email: 'ada.okafor@demo.school', name: 'Ada Okafor', role: 'teacher', table: 'staff', rowId: 'b0aba0be-aee0-4736-9dd1-d861939b7c8e' },
];

for (const a of accounts) {
  let userId;
  const { data: created, error } = await supabase.auth.admin.createUser({
    email: a.email, password: 'Demo1234!', email_confirm: true,
    user_metadata: { full_name: a.name }
  });
  if (error && !String(error.message).includes('already')) { console.error(a.email, error.message); continue; }
  if (created?.user) userId = created.user.id;
  else {
    const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    userId = list.users.find(u => u.email === a.email)?.id;
  }
  await supabase.from('user_roles').upsert({ user_id: userId, role: a.role }, { onConflict: 'user_id,role' });
  await supabase.from(a.table).update({ user_id: userId, email: a.email }).eq('id', a.rowId);
  console.log(`✓ ${a.email} (${a.role}) -> ${userId}`);
}
