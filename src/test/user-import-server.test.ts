import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listUsers: vi.fn(), invite: vi.fn(), deleteUser: vi.fn(), from: vi.fn(),
  profileUpsert: vi.fn(), roleUpsert: vi.fn(), rpc: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = { middleware: () => chain, inputValidator: () => chain, handler: (handler: unknown) => handler };
    return chain;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  auth: { admin: { listUsers: mocks.listUsers, inviteUserByEmail: mocks.invite, deleteUser: mocks.deleteUser } },
  from: mocks.from,
} }));
import { importUserWithRoles } from "@/lib/user-import.functions";

const run = importUserWithRoles as unknown as (args: {
  data: { email: string; full_name: string; phone: null; roles: string[] };
  context: { userId: string; supabase: { rpc: typeof mocks.rpc } };
}) => Promise<unknown>;
const args = () => ({ data: { email: "teacher@example.com", full_name: "Teacher", phone: null, roles: ["teacher"] }, context: { userId: "caller", supabase: { rpc: mocks.rpc } } });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.rpc.mockImplementation(async (name) => ({ data: name === "is_admin", error: null }));
  mocks.listUsers.mockResolvedValue({ data: { users: [] }, error: null });
  mocks.invite.mockResolvedValue({ data: { user: { id: "new-user" } }, error: null });
  mocks.profileUpsert.mockResolvedValue({ error: null });
  mocks.roleUpsert.mockResolvedValue({ error: null });
  mocks.deleteUser.mockResolvedValue({ error: null });
  mocks.from.mockImplementation((table) => ({ upsert: table === "profiles" ? mocks.profileUpsert : mocks.roleUpsert }));
});

describe("user import server safeguards", () => {
  it("rejects non-admins before privileged account access", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    await expect(run(args())).rejects.toThrow("Only administrators");
    expect(mocks.listUsers).not.toHaveBeenCalled();
  });
  it("protects existing super administrator accounts", async () => {
    mocks.listUsers.mockResolvedValue({ data: { users: [{ id: "super", email: "teacher@example.com" }] }, error: null });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    await expect(run(args())).rejects.toThrow("Super administrator accounts");
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("adds roles without changing existing profiles or passwords", async () => {
    mocks.listUsers.mockResolvedValue({ data: { users: [{ id: "existing", email: "teacher@example.com" }] }, error: null });
    await run(args());
    expect(mocks.invite).not.toHaveBeenCalled();
    expect(mocks.profileUpsert).not.toHaveBeenCalled();
    expect(mocks.roleUpsert).toHaveBeenCalledWith([{ user_id: "existing", role: "teacher" }], { onConflict: "user_id,role", ignoreDuplicates: true });
  });
  it("invites new accounts and saves their profile and roles", async () => {
    await expect(run(args())).resolves.toEqual({ user_id: "new-user", created_new: true, invitation_sent: true });
    expect(mocks.invite).toHaveBeenCalledWith("teacher@example.com", { data: { full_name: "Teacher" } });
    expect(mocks.profileUpsert).toHaveBeenCalledWith({ id: "new-user", full_name: "Teacher", email: "teacher@example.com", phone: null }, { onConflict: "id" });
    expect(mocks.roleUpsert).toHaveBeenCalledWith([{ user_id: "new-user", role: "teacher" }], expect.any(Object));
  });
  it("removes only the newly created account after a failed role assignment", async () => {
    mocks.roleUpsert.mockResolvedValue({ error: { message: "Failed" } });
    await expect(run(args())).rejects.toThrow("Could not assign");
    expect(mocks.deleteUser).toHaveBeenCalledWith("new-user");
  });
  it("does not delete existing accounts when adding roles fails", async () => {
    mocks.listUsers.mockResolvedValue({ data: { users: [{ id: "existing", email: "teacher@example.com" }] }, error: null });
    mocks.roleUpsert.mockResolvedValue({ error: { message: "Failed" } });
    await expect(run(args())).rejects.toThrow("Could not assign");
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });
});