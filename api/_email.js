// Leading underscore excludes this file from Vercel's file-based /api routing —
// it's a shared helper, not an endpoint.
//
// Transactional email via Resend's REST API (docs/TODO.md §17.G). Called with
// plain fetch rather than the `resend` npm SDK — the API is a single POST and
// skipping the dependency keeps the serverless bundle lean.
//
// Sender: until a custom domain is verified in Resend, EMAIL_FROM stays unset
// and sends go out from Resend's shared dev sender (onboarding@resend.dev).
// That sender only delivers to the Resend account owner's own address — fine
// for building/testing §G, but a verified domain must be added (and EMAIL_FROM
// set) before real users hit day 7 of a trial.

const env = globalThis.process?.env ?? {};

export const EMAIL_FROM = env.EMAIL_FROM || "Authority Finance <onboarding@resend.dev>";

export function isEmailConfigured() {
  return Boolean(env.EMAIL_API_KEY);
}

export async function sendEmail({ to, subject, html, text }) {
  if (!env.EMAIL_API_KEY) {
    throw new Error("EMAIL_API_KEY is not configured");
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.EMAIL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: EMAIL_FROM, to, subject, html, text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend send failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.json();
}
