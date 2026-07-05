// §17.G email copy tests, including the disclosure guard (§17.D/§17.H): no
// subject or body may ever reveal the hidden grace window — all copy
// references the 14-day trial only. Same forbidden-pattern approach as
// TrialBanner.test.jsx / UpgradeModal.test.jsx, applied to the email surface.
import { describe, it, expect } from "vitest";
import { buildLifecycleEmail } from "../../../api/_lifecycleEmails.js";

const APP_URL = "https://authority-finance.vercel.app";
const TEMPLATES = [
  ["trial_nudge", { trialDaysLeft: 7, appUrl: APP_URL }],
  ["grace_warning", { appUrl: APP_URL }],
  ["deletion_warning", { appUrl: APP_URL }],
];

// "grace", any "21", "extra week", or the internal access-cutoff concept —
// none of these may appear in any user-facing email string.
const FORBIDDEN = [/grace/i, /21/, /extra\s+week/i, /access\s+ends/i];

describe("buildLifecycleEmail — disclosure guard", () => {
  it.each(TEMPLATES)("%s never reveals the grace window", (template, params) => {
    const { subject, html, text } = buildLifecycleEmail(template, params);
    for (const content of [subject, html, text]) {
      // Guard against a vacuous pass on an empty build.
      expect(content.length).toBeGreaterThan(20);
      for (const pattern of FORBIDDEN) {
        expect(content).not.toMatch(pattern);
      }
    }
  });

  it("trial and grace copy reference the 14-day trial explicitly", () => {
    expect(buildLifecycleEmail("trial_nudge", { trialDaysLeft: 3 }).text).toMatch(/14-day/);
    expect(buildLifecycleEmail("grace_warning", {}).text).toMatch(/14-day/);
  });
});

describe("buildLifecycleEmail — content", () => {
  it("trial nudge interpolates days left and pluralizes", () => {
    const plural = buildLifecycleEmail("trial_nudge", { trialDaysLeft: 7 });
    expect(plural.subject).toBe("7 days left in your free trial — add a card to avoid interruption");
    const singular = buildLifecycleEmail("trial_nudge", { trialDaysLeft: 1 });
    expect(singular.subject).toMatch(/^1 day left/);
  });

  it("grace warning says the trial ended, never how much access remains", () => {
    const { subject, text } = buildLifecycleEmail("grace_warning", {});
    expect(subject).toMatch(/trial has ended/i);
    expect(text).not.toMatch(/\d+\s+days?\s+(left|remaining)/i);
  });

  it("deletion warning states permanent deletion and asks for a payment method", () => {
    const { subject, text } = buildLifecycleEmail("deletion_warning", {});
    expect(subject).toMatch(/scheduled for deletion/i);
    expect(text).toMatch(/permanently deleted/i);
    expect(text).toMatch(/payment method/i);
  });

  it("includes the app URL as the CTA target when provided", () => {
    for (const [template, params] of TEMPLATES) {
      const { html, text } = buildLifecycleEmail(template, params);
      expect(html).toContain(`href="${APP_URL}"`);
      expect(text).toContain(APP_URL);
    }
  });

  it("throws on an unknown template rather than sending something blank", () => {
    expect(() => buildLifecycleEmail("nonsense", {})).toThrow(/Unknown lifecycle email template/);
  });
});
