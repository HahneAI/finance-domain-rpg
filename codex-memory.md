## DHL Payroll + Benefits Summary (2026-04-02)

- Standard DHL preset now produces realistic paychecks for anyone outside the original account: short weeks project ~\$925 take-home (mandatory OT keeps gross above \$1.1k) and long weeks project ~\$1.14k net off ~\$1.5k gross.
- Rotation labels were normalized to "Short Week" / "Long Week" for all user-facing panels, while admins still see the legacy 4-Day / 6-Day tags; the new `src/lib/rotation.js` helper keeps older data strings compatible.
- 401k UX clarifies when deductions actually start by falling back to the benefits start date, and Profile/Benefits now show “Contribution Start” plus a proper “401K / Retirement” pill so new DHL coworkers can trust the setup wizard output.
