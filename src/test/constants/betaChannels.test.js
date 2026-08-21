import { describe, it, expect } from "vitest";
import { BETA_CHANNELS, BETA_CHANNEL_CODE_PREFIX, BETA_CHANNEL_SEED_SEATS, BETA_CHANNEL_LABEL } from "../../constants/betaChannels.js";

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
