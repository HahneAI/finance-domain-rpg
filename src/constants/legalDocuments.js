// ─────────────────────────────────────────────────────────────────────────────
// legalDocuments.js — Terms of Service / Privacy Policy content + versioning.
//
// ⚠️ PLACEHOLDER TEXT. The markdown bodies below are structural scaffolding
// only — NOT reviewed or approved by counsel, NOT final, NOT fit to govern a
// real user's account. They exist so the consent-capture mechanism
// (database/migrations/033_add_consent_records.sql, LoginScreen.jsx's signup
// gate, App.jsx's re-consent check) has real content to render and version
// against while the actual legal text is drafted separately. Every section
// below is marked [PLACEHOLDER] inline for the same reason — so nobody
// mistakes a screenshot or a quick read for the real thing.
//
// Before this ships to real users:
//   1. Replace TERMS_OF_SERVICE_MARKDOWN and PRIVACY_POLICY_MARKDOWN with
//      lawyer-reviewed text.
//   2. Bump CURRENT_LEGAL_VERSION (any string works — a date, a semver, etc.
//      — it's only ever compared for equality, never parsed).
//   3. Flip ENFORCE_EXISTING_USER_RECONSENT to true so accounts created
//      before the real text shipped are prompted to (re-)agree on their next
//      login. Leaving it false (the default) means the version bump only
//      affects brand-new signups — existing users are never silently
//      interrupted by a version change until this is explicitly turned on.
// ─────────────────────────────────────────────────────────────────────────────

export const CURRENT_LEGAL_VERSION = "0.1-placeholder";

// See the ⚠️ note above — do not treat ENFORCE_EXISTING_USER_RECONSENT=true
// as safe to flip until CURRENT_LEGAL_VERSION points at real, reviewed text.
// Flipping it while the text below is still placeholder would show every
// existing user a mandatory "agree to continue" gate over draft copy.
export const ENFORCE_EXISTING_USER_RECONSENT = false;

export const TERMS_OF_SERVICE_MARKDOWN = `**[PLACEHOLDER — draft structure only, not final]**

## 1. Acceptance of Terms

[PLACEHOLDER] By creating an account with Authority Finance ("the Service"), you agree to be bound by these Terms of Service.

## 2. Description of Service

[PLACEHOLDER] Authority Finance is a personal finance dashboard for income modeling, budgeting, goal tracking, and related planning tools.

## 3. Your Account

[PLACEHOLDER] You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account.

## 4. Subscription & Billing

[PLACEHOLDER] Paid subscription terms, trial periods, cancellation, and refund policy go here.

## 5. Acceptable Use

[PLACEHOLDER] Restrictions on misuse of the Service go here.

## 6. Disclaimer of Financial Advice

[PLACEHOLDER] The Service provides informational tools only and does not constitute financial, tax, or legal advice.

## 7. Limitation of Liability

[PLACEHOLDER] Standard limitation-of-liability language goes here.

## 8. Changes to These Terms

[PLACEHOLDER] How and when these Terms may change, and how users are notified, goes here.

## 9. Contact

[PLACEHOLDER] Contact information goes here.`;

export const PRIVACY_POLICY_MARKDOWN = `**[PLACEHOLDER — draft structure only, not final]**

## 1. Overview

[PLACEHOLDER] This Privacy Policy describes how Authority Finance collects, uses, and protects your information.

## 2. Data We Collect

[PLACEHOLDER] Account information (email), financial data you enter (income, schedule, budget, goals), and usage data go here.

## 3. How We Use Your Data

[PLACEHOLDER] Description of how collected data powers the app's features goes here.

## 4. Data Storage & Security

[PLACEHOLDER] Current posture: data is encrypted in transit (TLS) and access-controlled via row-level security. No field-level encryption at rest exists today because nothing currently collected falls into a regulated/high-sensitivity class (see internal tracking: docs/TODO.md §11). This section must be updated if that changes.

## 5. Data Sharing

[PLACEHOLDER] Third-party processors (e.g. payment processing, hosting) go here.

## 6. Your Rights

[PLACEHOLDER] Access, correction, deletion, and export rights go here — note the app already has an in-app account-deletion flow.

## 7. Changes to This Policy

[PLACEHOLDER] How and when this Policy may change, and how users are notified, goes here.

## 8. Contact

[PLACEHOLDER] Contact information goes here.`;
