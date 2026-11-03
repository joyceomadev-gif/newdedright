// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const db = new PGlite();
const uuid = "00000000-0000-4000-8000-000000000001";
const staff = "00000000-0000-4000-8000-000000000002";

beforeAll(async () => {
  const migration = readFileSync("drizzle/migrations/0000_repair_recycle_bin_generic_primary_keys.sql", "utf8");
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE FUNCTION public.is_super_admin(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce($1='${uuid}'::uuid,false) $$;
    CREATE FUNCTION public.is_admin(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce($1='${uuid}'::uuid,false) $$;
    CREATE FUNCTION public.is_staff(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce($1='${uuid}'::uuid,false) $$;
    CREATE TABLE public.recycle_bin_audit(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,table_name text,record_id uuid,action text,actor_user_id uuid,reason text,snapshot jsonb);`);
  const tableArray = migration.match(/SELECT ARRAY\[(.*?)\]::text\[\]/)?.[1];
  if (!tableArray) throw new Error("Missing Recycle Bin table registry");
  for (const name of tableArray.match(/'[^']+'/g) ?? []) {
    const table = name.slice(1, -1);
    const key = table === "students" ? "student_id uuid PRIMARY KEY" : table === "class_teachers" ? "class_id uuid,staff_id uuid,PRIMARY KEY(class_id,staff_id)" : "id uuid PRIMARY KEY";
    await db.exec(`CREATE TABLE public.${table}(${key},deleted_at timestamptz,deleted_by uuid,delete_reason text);`);
  }
  await db.exec(migration);
  await db.exec(readFileSync("drizzle/migrations/0001_complete_recycle_bin_deletion_metadata.sql", "utf8"));
  await db.query("SELECT set_config('test.uid',$1,false)", [uuid]);
});
afterAll(async () => { await db.close(); });

describe("Generic audited Recycle Bin", () => {
  it("lists tables without an id column and preserves the student's original student_id", async () => {
    await db.query("INSERT INTO students(student_id) VALUES($1)", [uuid]);
    await db.query("SELECT soft_delete_row('students',$1,'faulty import')", [uuid]);
    const result = await db.query<{record_id:string;snapshot:Record<string,unknown>}>("SELECT * FROM list_recycle_bin('students')");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].record_id).toBe(uuid);
    expect(result.rows[0].snapshot.__recycle_bin_primary_key).toEqual({student_id:uuid});
  });
  it("restores and permanently deletes a renamed primary key with all actions audited", async () => {
    await db.query("SELECT restore_row('students',$1)", [uuid]);
    expect((await db.query("SELECT * FROM list_recycle_bin('students')")).rows).toHaveLength(0);
    await db.query("SELECT soft_delete_row('students',$1,'test')", [uuid]);
    await db.query("SELECT hard_delete_row('students',$1,'test')", [uuid]);
    expect((await db.query("SELECT * FROM students")).rows).toHaveLength(0);
    const audit = await db.query<{action:string;original_primary_key:unknown}>("SELECT action,original_primary_key FROM recycle_bin_audit ORDER BY id");
    expect(audit.rows.map(r => r.action)).toEqual(["soft_delete","restore","soft_delete","hard_delete"]);
    expect(audit.rows.every(r => JSON.stringify(r.original_primary_key) === JSON.stringify({student_id:uuid}))).toBe(true);
  });
  it("supports the composite class_teachers key through the same actions", async () => {
    await db.query("INSERT INTO class_teachers(class_id,staff_id) VALUES($1,$2)", [uuid,staff]);
    const key = await db.query<{id:string}>("SELECT recycle_bin_record_id('class_teachers',to_jsonb(t)) id FROM class_teachers t");
    const id = key.rows[0].id;
    await db.query("SELECT soft_delete_row('class_teachers',$1,'test')", [id]);
    expect((await db.query("SELECT * FROM list_recycle_bin('class_teachers')")).rows).toHaveLength(1);
    await db.query("SELECT restore_row('class_teachers',$1)", [id]);
    await db.query("SELECT soft_delete_row('class_teachers',$1,'test')", [id]);
    await db.query("SELECT hard_delete_row('class_teachers',$1,'test')", [id]);
    expect((await db.query("SELECT * FROM class_teachers")).rows).toHaveLength(0);
    const audit = await db.query<{original_primary_key:unknown}>("SELECT original_primary_key FROM recycle_bin_audit WHERE table_name='class_teachers'");
    expect(audit.rows).toHaveLength(4);
    expect(audit.rows[0].original_primary_key).toEqual({class_id:uuid,staff_id:staff});
  });
  it("still denies non-super-admin listing, restore and permanent deletion", async () => {
    await db.query("SELECT set_config('test.uid',$1,false)", [staff]);
    await expect(db.query("SELECT * FROM list_recycle_bin()" )).rejects.toThrow("Only super administrators");
    await expect(db.query("SELECT restore_row('students',$1)", [uuid])).rejects.toThrow("Only super administrators");
    await expect(db.query("SELECT hard_delete_row('students',$1)", [uuid])).rejects.toThrow("Only super administrators");
  });
});