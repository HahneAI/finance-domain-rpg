// Migration 049 (TODO §32 B) — Coach memory at account deletion. Archived into the tombstone only for
// a non-payment deletion (a paid revival restores it); a user-requested deletion keeps none; a read
// error (e.g. 049 not applied yet) never blocks the deletion and writes no archive column.
import { describe, it, expect, vi } from "vitest";

vi.mock("../../../api/_stripeClient.js", () => ({ STRIPE_CLIENTS: [], cancelStripeSubscription: vi.fn() }));
const { archiveAndDeleteAccount } = await import("../../../api/_accountArchive.js");

function mkAdmin({ memoryRows = [], memoryError = null } = {}) {
  const upserts = [];
  const memoryReads = vi.fn();
  const adminClient = {
    auth: { admin: {
      getUserById: vi.fn().mockResolvedValue({ data: { user: { email: "a@example.com", app_metadata: {} } }, error: null }),
      deleteUser: vi.fn().mockResolvedValue({ error: null }),
    } },
    from: vi.fn((table) => {
      if (table === "user_data") return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { user_id: "u1", config: {} }, error: null }) }) }),
        delete: () => ({ eq: async () => ({ error: null }) }),
      };
      if (table === "coach_memory") return { select: () => ({ eq: async (...args) => { memoryReads(...args); return { data: memoryRows, error: memoryError }; } }) };
      if (table === "deleted_accounts") return {
        upsert: async (row) => { upserts.push(row); return { error: null }; },
        update: () => ({ eq: async () => ({ error: null }) }),
      };
      throw new Error(`unexpected table ${table}`);
    }),
  };
  return { adminClient, upserts, memoryReads };
}

const ROWS = [{ kind: "avoid", body: "No payday loans, ever", source: "coach", created_at: "2026-10-02T00:00:00Z" }];

describe("archiveAndDeleteAccount — Coach memory", () => {
  it("archives memory for a non-payment deletion", async () => {
    const { adminClient, upserts, memoryReads } = mkAdmin({ memoryRows: ROWS });
    await archiveAndDeleteAccount(adminClient, "u1", new Date(), "non_payment_dunning_expired");
    expect(memoryReads).toHaveBeenCalledWith("user_id", "u1");
    expect(upserts[0].archived_coach_memory).toEqual(ROWS);
  });

  it("keeps none for a user-requested deletion — it never even reads the table", async () => {
    const { adminClient, upserts, memoryReads } = mkAdmin({ memoryRows: ROWS });
    await archiveAndDeleteAccount(adminClient, "u1", new Date(), "user_requested");
    expect(memoryReads).not.toHaveBeenCalled();
    expect("archived_coach_memory" in upserts[0]).toBe(false);
  });

  it("a read error (049 not applied) still deletes the account and writes no archive column", async () => {
    const { adminClient, upserts } = mkAdmin({ memoryError: { message: 'relation "coach_memory" does not exist' } });
    await archiveAndDeleteAccount(adminClient, "u1", new Date(), "non_payment_dunning_expired");
    expect(upserts).toHaveLength(1);
    expect("archived_coach_memory" in upserts[0]).toBe(false);
    expect(adminClient.auth.admin.deleteUser).toHaveBeenCalledWith("u1");
  });
});
