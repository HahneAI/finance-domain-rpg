import { describe, it, expect } from "vitest";
import { BETA_CHANNELS, BETA_CHANNEL_CODE_PREFIX, BETA_CHANNEL_SEED_SEATS, BETA_CHANNEL_LABEL, isBetaChannelValue } from "../../constants/betaChannels.js";

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

// Backs the flyer-pool-full detection App.jsx/ProfilePanel.jsx both use
// (FlyerBetaFullModal.jsx, 2026-08-21) — a submitted value must match a
// channel name exactly (trimmed/case-insensitively) to count as that
// channel's own keyword, never a partial or unrelated match.
describe("isBetaChannelValue", () => {
  it("matches a channel name case-insensitively and trims whitespace", () => {
    expect(isBetaChannelValue("flyer", BETA_CHANNELS.FLYER)).toBe(true);
    expect(isBetaChannelValue("FLYER", BETA_CHANNELS.FLYER)).toBe(true);
    expect(isBetaChannelValue("  Flyer  ", BETA_CHANNELS.FLYER)).toBe(true);
  });

  it("does not match the other channel or an unrelated/one-off code", () => {
    expect(isBetaChannelValue("website", BETA_CHANNELS.FLYER)).toBe(false);
    expect(isBetaChannelValue("clarity802", BETA_CHANNELS.FLYER)).toBe(false);
    expect(isBetaChannelValue("some-vip-code", BETA_CHANNELS.FLYER)).toBe(false);
  });

  it("handles non-string/empty input safely", () => {
    expect(isBetaChannelValue(null, BETA_CHANNELS.FLYER)).toBe(false);
    expect(isBetaChannelValue(undefined, BETA_CHANNELS.FLYER)).toBe(false);
    expect(isBetaChannelValue("", BETA_CHANNELS.FLYER)).toBe(false);
  });
});
