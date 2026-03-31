// ─────────────────────────────────────────────────────────────
// STATE_TAX_TABLE — 50-state income tax lookup
//
// Three models:
//   NONE        → state income tax = 0 (return immediately)
//   FLAT        → tax = income × flatRate
//   PROGRESSIVE → tax = iterate through brackets (same pattern as fedTax)
//
// Used by stateTax(income, stateConfig) in finance.js.
// Wizard Step 4 populates userState; Step 5 reads this table for display.
//
// Rate accuracy: verify against each state's 2026 published tables before launch.
// Flat rates listed are based on current law as of 2026-03-24; some states adjust annually.
// ─────────────────────────────────────────────────────────────

export const STATE_TAX_TABLE = {
  // ── No income tax ──────────────────────────────────────────
  AK: { model: "NONE", name: "Alaska" },
  FL: { model: "NONE", name: "Florida" },
  NV: { model: "NONE", name: "Nevada" },
  NH: { model: "NONE", name: "New Hampshire" },
  SD: { model: "NONE", name: "South Dakota" },
  TN: { model: "NONE", name: "Tennessee" },
  TX: { model: "NONE", name: "Texas" },
  WA: { model: "NONE", name: "Washington" },     // wage income exempt; separate capital gains tax exists
  WY: { model: "NONE", name: "Wyoming" },

  // ── Flat tax ───────────────────────────────────────────────
  AZ: { model: "FLAT", name: "Arizona",       flatRate: 0.025  },
  CO: { model: "FLAT", name: "Colorado",      flatRate: 0.044  },
  GA: { model: "FLAT", name: "Georgia",       flatRate: 0.055  },
  ID: { model: "FLAT", name: "Idaho",         flatRate: 0.058  },
  IL: { model: "FLAT", name: "Illinois",      flatRate: 0.0495 },
  IN: { model: "FLAT", name: "Indiana",       flatRate: 0.0305 },
  IA: { model: "FLAT", name: "Iowa",          flatRate: 0.038  },
  KY: { model: "FLAT", name: "Kentucky",      flatRate: 0.04   },
  LA: { model: "FLAT", name: "Louisiana",     flatRate: 0.03   },
  // Massachusetts applies a 4% surtax on taxable income above $1M.
  // Modeled as marginal brackets so top-income portions are not flattened.
  MI: { model: "FLAT", name: "Michigan",      flatRate: 0.0425 },
  MS: { model: "FLAT", name: "Mississippi",   flatRate: 0.047  },  // transitioning system; revisit
  NC: { model: "FLAT", name: "North Carolina", flatRate: 0.045 },
  PA: { model: "FLAT", name: "Pennsylvania",  flatRate: 0.0307 },
  UT: { model: "FLAT", name: "Utah",          flatRate: 0.0465 },

  // ── Progressive — brackets listed as [maxIncome, rate] pairs ──
  // Same shape as FED_BRACKETS: iterate until income is covered.
  // Stubbed states use approximate effective rates; mark with TODO to refine.
  AL: { model: "PROGRESSIVE", name: "Alabama", brackets: [
    { max: 500,      rate: 0.02  },
    { max: 3000,     rate: 0.04  },
    { max: Infinity, rate: 0.05  },
  ]},
  AR: { model: "PROGRESSIVE", name: "Arkansas", brackets: [
    { max: 4300,     rate: 0.02  },
    { max: 8500,     rate: 0.04  },
    { max: Infinity, rate: 0.059 },
  ]},
  CA: { model: "PROGRESSIVE", name: "California", brackets: [
    { max: 10412,    rate: 0.01  },
    { max: 24684,    rate: 0.02  },
    { max: 38959,    rate: 0.04  },
    { max: 54081,    rate: 0.06  },
    { max: 68350,    rate: 0.08  },
    { max: 349137,   rate: 0.093 },
    { max: 418961,   rate: 0.103 },
    { max: 698274,   rate: 0.113 },
    { max: Infinity, rate: 0.123 },
  ]},
  CT: { model: "PROGRESSIVE", name: "Connecticut", brackets: [
    { max: 10000,    rate: 0.03  },
    { max: 50000,    rate: 0.05  },
    { max: 100000,   rate: 0.055 },
    { max: 200000,   rate: 0.06  },
    { max: 250000,   rate: 0.065 },
    { max: 500000,   rate: 0.069 },
    { max: Infinity, rate: 0.0699 },
  ]},
  DE: { model: "PROGRESSIVE", name: "Delaware", brackets: [
    { max: 2000,     rate: 0.00  },
    { max: 5000,     rate: 0.022 },
    { max: 10000,    rate: 0.039 },
    { max: 20000,    rate: 0.048 },
    { max: 25000,    rate: 0.052 },
    { max: 60000,    rate: 0.0555 },
    { max: Infinity, rate: 0.066 },
  ]},
  DC: { model: "PROGRESSIVE", name: "District of Columbia", brackets: [
    { max: 10000,    rate: 0.04  },
    { max: 40000,    rate: 0.06  },
    { max: 60000,    rate: 0.065 },
    { max: 250000,   rate: 0.085 },
    { max: 500000,   rate: 0.0925 },
    { max: 1000000,  rate: 0.0975 },
    { max: Infinity, rate: 0.1075 },
  ]},
  HI: { model: "PROGRESSIVE", name: "Hawaii", brackets: [
    { max: 2400,     rate: 0.014 },
    { max: 4800,     rate: 0.032 },
    { max: 9600,     rate: 0.055 },
    { max: 14400,    rate: 0.064 },
    { max: 19200,    rate: 0.068 },
    { max: 24000,    rate: 0.072 },
    { max: 36000,    rate: 0.076 },
    { max: 48000,    rate: 0.079 },
    { max: 150000,   rate: 0.0825 },
    { max: 175000,   rate: 0.09  },
    { max: 200000,   rate: 0.10  },
    { max: Infinity, rate: 0.11  },
  ]},
  KS: { model: "PROGRESSIVE", name: "Kansas", brackets: [
    { max: 15000,    rate: 0.031 },
    { max: 30000,    rate: 0.0525 },
    { max: Infinity, rate: 0.057 },
  ]},
  ME: { model: "PROGRESSIVE", name: "Maine", brackets: [
    { max: 24500,    rate: 0.058 },
    { max: 58050,    rate: 0.0675 },
    { max: Infinity, rate: 0.0715 },
  ]},
  MD: { model: "PROGRESSIVE", name: "Maryland", brackets: [
    { max: 1000,     rate: 0.02  },
    { max: 2000,     rate: 0.03  },
    { max: 3000,     rate: 0.04  },
    { max: 100000,   rate: 0.0475 },
    { max: 125000,   rate: 0.05  },
    { max: 150000,   rate: 0.0525 },
    { max: 250000,   rate: 0.055 },
    { max: Infinity, rate: 0.0575 },
  ]},
  MN: { model: "PROGRESSIVE", name: "Minnesota", brackets: [
    { max: 30070,    rate: 0.0535 },
    { max: 98760,    rate: 0.068  },
    { max: 183340,   rate: 0.0785 },
    { max: Infinity, rate: 0.0985 },
  ]},
  MA: { model: "PROGRESSIVE", name: "Massachusetts", brackets: [
    { max: 1000000,  rate: 0.05 },
    { max: Infinity, rate: 0.09 },
  ]},
  MO: { model: "PROGRESSIVE", name: "Missouri", brackets: [
    // 2025 individual income tax table: top marginal rate reduced to 4.7%.
    // Brackets are marginal; only income above each threshold is taxed at that rate.
    { max: 1273,     rate: 0.00 },
    { max: 2546,     rate: 0.02 },
    { max: 3819,     rate: 0.025 },
    { max: 5092,     rate: 0.03 },
    { max: 6365,     rate: 0.035 },
    { max: 7638,     rate: 0.04 },
    { max: 8911,     rate: 0.045 },
    { max: Infinity, rate: 0.047 },
  ]},
  MT: { model: "PROGRESSIVE", name: "Montana", brackets: [
    { max: 20500,    rate: 0.047 },
    { max: Infinity, rate: 0.059 },
  ]},
  NE: { model: "PROGRESSIVE", name: "Nebraska", brackets: [
    { max: 3700,     rate: 0.0246 },
    { max: 22170,    rate: 0.0351 },
    { max: 35730,    rate: 0.0501 },
    { max: Infinity, rate: 0.0584 },
  ]},
  NJ: { model: "PROGRESSIVE", name: "New Jersey", brackets: [
    { max: 20000,    rate: 0.014  },
    { max: 35000,    rate: 0.0175 },
    { max: 40000,    rate: 0.035  },
    { max: 75000,    rate: 0.05525 },
    { max: 500000,   rate: 0.0637 },
    { max: 1000000,  rate: 0.0897 },
    { max: Infinity, rate: 0.1075 },
  ]},
  NM: { model: "PROGRESSIVE", name: "New Mexico", brackets: [
    { max: 5500,     rate: 0.017 },
    { max: 11000,    rate: 0.032 },
    { max: 16000,    rate: 0.047 },
    { max: 210000,   rate: 0.049 },
    { max: Infinity, rate: 0.059 },
  ]},
  NY: { model: "PROGRESSIVE", name: "New York", brackets: [
    { max: 17150,    rate: 0.04   },
    { max: 23600,    rate: 0.045  },
    { max: 27900,    rate: 0.0525 },
    { max: 161550,   rate: 0.0585 },
    { max: 323200,   rate: 0.0625 },
    { max: 2155350,  rate: 0.0685 },
    { max: 5000000,  rate: 0.0965 },
    { max: 25000000, rate: 0.103  },
    { max: Infinity, rate: 0.109  },
  ]},
  OH: { model: "PROGRESSIVE", name: "Ohio", brackets: [
    { max: 26050,    rate: 0.00 },
    { max: 100000,   rate: 0.0275 },
    { max: Infinity, rate: 0.035 },
  ]},
  ND: { model: "PROGRESSIVE", name: "North Dakota", brackets: [
    { max: 44725,    rate: 0.0195 },
    { max: 225975,   rate: 0.0245 },
    { max: Infinity, rate: 0.029  },
  ]},
  OK: { model: "PROGRESSIVE", name: "Oklahoma", brackets: [
    { max: 1000,     rate: 0.0025 },
    { max: 2500,     rate: 0.0075 },
    { max: 3750,     rate: 0.0175 },
    { max: 4900,     rate: 0.0275 },
    { max: 7200,     rate: 0.0375 },
    { max: Infinity, rate: 0.0475 },
  ]},
  OR: { model: "PROGRESSIVE", name: "Oregon", brackets: [
    { max: 18400,    rate: 0.0475 },
    { max: 46200,    rate: 0.0675 },
    { max: 250000,   rate: 0.0875 },
    { max: Infinity, rate: 0.099  },
  ]},
  RI: { model: "PROGRESSIVE", name: "Rhode Island", brackets: [
    { max: 77450,    rate: 0.0375 },
    { max: 176050,   rate: 0.0475 },
    { max: Infinity, rate: 0.0599 },
  ]},
  SC: { model: "PROGRESSIVE", name: "South Carolina", brackets: [
    { max: 3460,     rate: 0.00  },
    { max: 6440,     rate: 0.03  },
    { max: Infinity, rate: 0.064 },
  ]},
  VT: { model: "PROGRESSIVE", name: "Vermont", brackets: [
    { max: 45400,    rate: 0.0335 },
    { max: 110050,   rate: 0.066  },
    { max: 229550,   rate: 0.076  },
    { max: Infinity, rate: 0.0875 },
  ]},
  VA: { model: "PROGRESSIVE", name: "Virginia", brackets: [
    { max: 3000,     rate: 0.02  },
    { max: 5000,     rate: 0.03  },
    { max: 17000,    rate: 0.05  },
    { max: Infinity, rate: 0.0575 },
  ]},
  WI: { model: "PROGRESSIVE", name: "Wisconsin", brackets: [
    { max: 14320,    rate: 0.035  },
    { max: 28640,    rate: 0.044  },
    { max: 315310,   rate: 0.053  },
    { max: Infinity, rate: 0.0765 },
  ]},
  WV: { model: "PROGRESSIVE", name: "West Virginia", brackets: [
    { max: 10000,    rate: 0.03  },
    { max: 25000,    rate: 0.04  },
    { max: 40000,    rate: 0.045 },
    { max: 60000,    rate: 0.06  },
    { max: Infinity, rate: 0.065 },
  ]},
};

// Full state name → code lookup (for wizard dropdown sorted by name)
export const STATE_NAMES = Object.entries(STATE_TAX_TABLE)
  .sort(([, a], [, b]) => a.name.localeCompare(b.name))
  .map(([code, { name }]) => ({ code, name }));
