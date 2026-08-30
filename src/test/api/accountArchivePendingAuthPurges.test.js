// Migration 046 — finishPendingAuthPurges() is the recovery path for an
// account stuck with its user_data row already deleted but its auth.users
// row still alive (the "logs back in like a first-time user" symptom found
// live 2026-08-30). Migration 045 fixed the specific FK that caused this in
// production (consent_records.user_id had no ON DELETE CASCADE), but this
// function is what actually recovers any account already stuck in that
// state, and stays the safety net for any other future auth-admin failure at
// that same step.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { finishPendingAuthPurges } from "../../../api/_accountArchive.js";

function mkAdminAndSpies({ pendingRows, deleteUserResults = {} }) {
  const updateEq = vi.fn().mockResolvedValue({ error: null });
  const deleteUser = vi.fn((id) => Promise.resolve(deleteUserResults[id] ?? { error: null }));
  const adminClient = {
    from: vi.fn((table) => {
      if (table !== "deleted_accounts") throw new Error(`unexpected table: ${table}`);
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockResolvedValue({ data: pendingRows, error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({ eq: updateEq }),
      };
    }),
    auth: { admin: { deleteUser } },
  };
  return { adminClient, updateEq, deleteUser };
}

const NOW = new Date("2026-08-30T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("finishPendingAuthPurges", () => {
  it("purges every tombstone still marked auth_purge_pending and clears the flag", async () => {
    const { adminClient, updateEq, deleteUser } = mkAdminAndSpies({
      pendingRows: [{ email: "a@example.com", former_user_id: "user-a" }],
    });
    const results = await finishPendingAuthPurges(adminClient, NOW);
    expect(results).toEqual({ checked: 1, purged: 1, errors: 0 });
    expect(deleteUser).toHaveBeenCalledWith("user-a");
    expect(updateEq).toHaveBeenCalledWith("email", "a@example.com");
  });

  it("treats a not-found delete as already purged, not a failure", async () => {
    const { adminClient, updateEq } = mkAdminAndSpies({
      pendingRows: [{ email: "gone@example.com", former_user_id: "user-gone" }],
      deleteUserResults: { "user-gone": { error: { status: 404, message: "User not found" } } },
    });
    const results = await finishPendingAuthPurges(adminClient, NOW);
    expect(results).toEqual({ checked: 1, purged: 1, errors: 0 });
    expect(updateEq).toHaveBeenCalledWith("email", "gone@example.com");
  });

  it("leaves a genuine failure pending for the next run", async () => {
    const { adminClient, updateEq } = mkAdminAndSpies({
      pendingRows: [{ email: "stuck@example.com", former_user_id: "user-stuck" }],
      deleteUserResults: { "user-stuck": { error: { message: "gateway timeout" } } },
    });
    const results = await finishPendingAuthPurges(adminClient, NOW);
    expect(results).toEqual({ checked: 1, purged: 0, errors: 1 });
    expect(updateEq).not.toHaveBeenCalled();
  });

  it("clears the flag without calling deleteUser when there's no former_user_id to purge", async () => {
    const { adminClient, updateEq, deleteUser } = mkAdminAndSpies({
      pendingRows: [{ email: "no-id@example.com", former_user_id: null }],
    });
    const results = await finishPendingAuthPurges(adminClient, NOW);
    expect(deleteUser).not.toHaveBeenCalled();
    expect(updateEq).toHaveBeenCalledWith("email", "no-id@example.com");
    expect(results.checked).toBe(1);
  });

  it("returns an empty result with no rows pending", async () => {
    const { adminClient } = mkAdminAndSpies({ pendingRows: [] });
    const results = await finishPendingAuthPurges(adminClient, NOW);
    expect(results).toEqual({ checked: 0, purged: 0, errors: 0 });
  });
});
