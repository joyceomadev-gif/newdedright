import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('scripts/security/revoke-eight-anon-grants.sql', 'utf8');
const rollback = readFileSync('scripts/security/rollback-eight-anon-grants.sql', 'utf8');

describe('authorized anonymous grant boundary', () => {
  it('revokes exactly the eight authorized existing tables', () => {
    const block = sql.match(/REVOKE ALL PRIVILEGES ON TABLE\s+([\s\S]*?)FROM anon;/)?.[1] ?? '';
    expect(block.match(/public\.[a-z_]+/g)?.sort()).toEqual([
      'public.branches', 'public.classes', 'public.fee_structures', 'public.library_books',
      'public.parents', 'public.staff', 'public.students', 'public.subjects',
    ]);
  });
  it('leaves all policies and signed-in grants untouched', () => {
    const statements = sql.replace(/--[^\n]*/g, '');
    expect(statements).not.toMatch(/\b(?:DROP|ALTER|CREATE)\s+POLICY\b/i);
    expect(statements).not.toMatch(/\b(?:authenticated|service_role)\b/i);
    expect(statements).not.toMatch(/\b(?:UPDATE|DELETE|INSERT|TRUNCATE)\b/i);
  });
  it('does not change any other table or owner-level defaults', () => {
    expect(sql.replace(/--[^\n]*/g, '')).not.toMatch(/ALTER DEFAULT PRIVILEGES|ALL TABLES IN SCHEMA/);
  });
  it('rollback restores all eight observed privileges without grant options', () => {
    const privileges = rollback.match(/GRANT ([\s\S]*?)\s+ON TABLE /)?.[1].split(',').map(p => p.trim()).sort();
    expect(privileges).toEqual(['DELETE', 'INSERT', 'MAINTAIN', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE']);
    expect(rollback).not.toMatch(/WITH GRANT OPTION/i);
    expect(rollback).toContain('TO anon GRANTED BY postgres;');
  });
});