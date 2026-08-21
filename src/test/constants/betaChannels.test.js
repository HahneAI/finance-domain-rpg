import { describe, it, expect } from "vitest";
import { BETA_CHANNELS, BETA_CHANNEL_CODE_PREFIX, BETA_CHANNEL_SEED_SEATS, BETA_CHANNEL_LABEL, resolveBetaChannel } from "../../constants/betaChannels.js";

// Guards against silent drift between these documentation constants and the
// actual channel/prefix values live in Supabase's beta_codes table — nothing
// in api/seed.js reads these (it matches on the `channel` column only), so a
// mismatch here would otherwise go unnoticed until someone hand-checked prod.
describe("betaChannels constants", () => {
  it("defines exactly the two known channels", () => {
    expect(BETA_CHANNELS).toEqual({ WEBSITE: "website", FLYER: "flyer" });
  });

  it("maps each channel to its seeded code prefix", () => {
    expect(BETA_CHANNEL_CODE_PREFIX).toEqual({
      website: "glass",
      flyer: "clarity",
    });
  });

  it("maps each channel to its last-seeded seat count", () => {
    expect(BETA_CHANNEL_SEED_SEATS).toEqual({
      website: 20,
      flyer: 20,
    });
  });

  it("maps each channel to a human-facing display label", () => {
    expect(BETA_CHANNEL_LABEL).toEqual({
      website: "Website",
      flyer: "Flyer",
    });
  });
});

// Backs the per-channel-pool-full detection App.jsx/ProfilePanel.jsx both
// use (BetaChannelFullModal.jsx, 2026-08-21/22), and LoginScreen.jsx's
// pre-signup seat-count banner — a submitted value must match a channel
// name exactly (trimmed/case-insensitively) to resolve to that channel,
// never a partial or unrelated match.
describe("resolveBetaChannel", () => {
  it("resolves a channel name case-insensitively and trims whitespace", () => {
    expect(resolveBetaChannel("flyer")).toBe(BETA_CHANNELS.FLYER);
    expect(resolveBetaChannel("WEBSITE")).toBe(BETA_CHANNELS.WEBSITE);
    expect(resolveBetaChannel("  Flyer  ")).toBe(BETA_CHANNELS.FLYER);
  });

  it("returns null for an unrelated/one-off code — no pool concept applies", () => {
    expect(resolveBetaChannel("clarity802")).toBeNull();
    expect(resolveBetaChannel("glass042")).toBeNull();
    expect(resolveBetaChannel("some-vip-code")).toBeNull();
  });

  it("handles non-string/empty input safely", () => {
    expect(resolveBetaChannel(null)).toBeNull();
    expect(resolveBetaChannel(undefined)).toBeNull();
    expect(resolveBetaChannel("")).toBeNull();
  });
});
