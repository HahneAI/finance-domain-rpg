// Lifecycle email templates (docs/TODO.md §17.G). Shared helper, not an endpoint.
//
// DISCLOSURE RULE (absolute, §17.D/§17.H): no subject, preview, or body may
// ever reference the hidden 7-day grace window, a "21-day" anything, or an
// "extra week." All user-facing copy references the 14-day trial only. The
// grace-phase template says "your trial has ended" — never how much access
// actually remains. Enforced by src/test/api/lifecycleEmails.test.js.
//
// Also deliberate: no "you won't be charged until your trial ends" promises.
// The trial is app-managed (§17.B — no trial_period_days on the Stripe price),
// so going through Checkout starts the paid subscription immediately.

const BRAND = {
  bg: "#05100c",
  surface: "#112c1f",
  border: "#1f3b31",
  accent: "#00c896",
  text: "#e6f4ef",
  textSecondary: "#7fa39a",
  red: "#ef4444",
};

function layout({ heading, bodyHtml, ctaLabel, appUrl, headingColor = BRAND.accent }) {
  const cta = appUrl
    ? `<a href="${appUrl}" style="display:inline-block;margin-top:20px;padding:12px 24px;background:${BRAND.accent};color:${BRAND.bg};font-weight:700;text-decoration:none;border-radius:12px;font-size:13px;letter-spacing:1px;text-transform:uppercase;">${ctaLabel}</a>`
    : "";
  return `<div style="background:${BRAND.bg};padding:32px 16px;font-family:Inter,Helvetica,Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:16px;padding:28px 24px;">
    <p style="margin:0 0 16px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${BRAND.textSecondary};">Authority Finance</p>
    <h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;color:${headingColor};">${heading}</h1>
    <div style="font-size:14px;line-height:1.6;color:${BRAND.text};">${bodyHtml}</div>
    ${cta}
  </div>
</div>`;
}

/**
 * @param {"trial_nudge"|"grace_warning"|"deletion_warning"} template
 * @param {{ trialDaysLeft?: number, appUrl?: string }} params
 * @returns {{ subject: string, html: string, text: string }}
 */
export function buildLifecycleEmail(template, { trialDaysLeft = 0, appUrl = "" } = {}) {
  if (template === "trial_nudge") {
    const days = Math.max(1, trialDaysLeft);
    const dayWord = days === 1 ? "day" : "days";
    return {
      subject: `${days} ${dayWord} left in your free trial — add a card to avoid interruption`,
      html: layout({
        heading: `${days} ${dayWord} left in your free trial`,
        bodyHtml:
          `<p style="margin:0 0 12px;">You have <strong>${days} ${dayWord}</strong> left in your 14-day free trial of Authority Finance.</p>` +
          `<p style="margin:0;">Add a payment method before it ends to keep uninterrupted access to your income model, budget, and goals — upgrade any time from the Account tab.</p>`,
        ctaLabel: "Add a card",
        appUrl,
      }),
      text:
        `You have ${days} ${dayWord} left in your 14-day free trial of Authority Finance. ` +
        `Add a payment method before it ends to keep uninterrupted access to your income model, budget, and goals. ` +
        (appUrl ? `Upgrade from the Account tab: ${appUrl}` : `Upgrade from the Account tab.`),
    };
  }

  if (template === "grace_warning") {
    return {
      subject: "Your free trial has ended — add a card to keep using Authority Finance",
      html: layout({
        heading: "Your free trial has ended",
        bodyHtml:
          `<p style="margin:0 0 12px;">Your 14-day free trial of Authority Finance has ended.</p>` +
          `<p style="margin:0;">Add a payment method to keep using the app. Your income model, budget, goals, and history are all saved and waiting for you.</p>`,
        ctaLabel: "Add a card",
        appUrl,
      }),
      text:
        `Your 14-day free trial of Authority Finance has ended. ` +
        `Add a payment method to keep using the app. Your income model, budget, goals, and history are all saved and waiting for you.` +
        (appUrl ? ` Upgrade here: ${appUrl}` : ""),
    };
  }

  if (template === "deletion_warning") {
    return {
      subject: "Action required — your Authority Finance account is scheduled for deletion",
      html: layout({
        heading: "Your account is scheduled for deletion",
        headingColor: BRAND.red,
        bodyHtml:
          `<p style="margin:0 0 12px;">Your free trial ended and there is no payment method on your account.</p>` +
          `<p style="margin:0;">Your account and all of its data — income model, budget, goals, and history — will be <strong>permanently deleted</strong> soon. Add a payment method now to keep your account.</p>`,
        ctaLabel: "Keep my account",
        appUrl,
      }),
      text:
        `Your free trial of Authority Finance ended and there is no payment method on your account. ` +
        `Your account and all of its data will be permanently deleted soon. Add a payment method now to keep your account.` +
        (appUrl ? ` ${appUrl}` : ""),
    };
  }

  throw new Error(`Unknown lifecycle email template: ${template}`);
}
