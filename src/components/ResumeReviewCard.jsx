import { useEffect, useMemo, useState } from "react";
import { Pressable, SH } from "./ui.jsx";
import { chatWithCoach } from "../lib/claude.js";
import { RESUME_REVIEW_SYSTEM_PROMPT } from "../lib/coachPrompts.js";
import { loadResumeProfile, saveResumeProfile, saveCoachChat } from "../lib/db.js";

const labelStyle = {
  fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase",
  color: "var(--color-text-secondary)", display: "block", marginBottom: "6px",
};
const inputStyle = {
  width: "100%",
  background: "var(--color-bg-raised)",
  border: "1px solid var(--color-border-subtle)",
  borderRadius: "10px",
  color: "var(--color-text-primary)",
  fontSize: "14px",
  fontFamily: "var(--font-sans)",
  padding: "9px 12px",
  colorScheme: "dark",
  boxSizing: "border-box",
};

/**
 * §18.E1 — Résumé Review v1. Paste-text only (no file upload — see
 * docs/TODO.md §18.E1's storage decision: a pasted résumé and a
 * PDF-extracted one look identical to the analysis pipeline downstream, so
 * upload is deferred to a v2 that's only worth building if this proves used).
 * A one-shot review, not a back-and-forth chat — matches the v1 phasing:
 * "a 'Resume' card... with a paste-text textarea + 'Get skill-gap review'
 * button." Target role defaults from the most recent logged application's
 * role (read-only reference into config.jobApplications — ReemploymentTracker
 * itself needs no changes for this) with a free-text override field.
 *
 * The review itself is saved as a coach_chats row (chat_type: 'resume_review',
 * migration 032) so it isn't lost — no history-browser UI for past reviews
 * yet, that's a follow-up pass, same as Ask Coach's history list arrived
 * after its own v1.
 */
export function ResumeReviewCard({ config }) {
  const [loading, setLoading] = useState(true);
  const [resumeText, setResumeText] = useState("");
  const [targetRoleDraft, setTargetRoleDraft] = useState("");
  const [savedTargetRole, setSavedTargetRole] = useState("");
  const [review, setReview] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [errored, setErrored] = useState(false);

  const mostRecentAppliedRole = useMemo(() => {
    const apps = Array.isArray(config?.jobApplications) ? config.jobApplications : [];
    if (!apps.length) return "";
    return [...apps].sort((a, b) => (b.dateApplied ?? "").localeCompare(a.dateApplied ?? ""))[0]?.role ?? "";
  }, [config?.jobApplications]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const profile = await loadResumeProfile();
      if (cancelled) return;
      setResumeText(profile?.resumeText ?? "");
      setSavedTargetRole(profile?.targetRole ?? "");
      setTargetRoleDraft(profile?.targetRole ?? "");
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const effectiveTargetRole = (targetRoleDraft || savedTargetRole || mostRecentAppliedRole || "").trim();
  const canReview = resumeText.trim().length > 0 && !reviewing;

  const commitResumeText = () => {
    saveResumeProfile({ resumeText, targetRole: savedTargetRole });
  };

  const getReview = async () => {
    if (!canReview) return;
    setErrored(false);
    setReviewing(true);
    setReview("");
    const roleForPrompt = effectiveTargetRole || "(not specified — infer the likely target from the résumé content itself)";
    try {
      const contextBlock = `Résumé text:\n${resumeText.trim()}\n\nTarget role: ${roleForPrompt}`;
      const messages = [{ role: "user", content: "Please review my resume against the target role." }];
      let accumulated = "";
      for await (const chunk of chatWithCoach(messages, RESUME_REVIEW_SYSTEM_PROMPT, contextBlock, "sonnet")) {
        accumulated += chunk;
        setReview(accumulated);
      }
      const now = new Date().toISOString();
      setSavedTargetRole(effectiveTargetRole);
      saveResumeProfile({ resumeText, targetRole: effectiveTargetRole, lastReviewedAt: now });
      saveCoachChat({
        chatType: "resume_review",
        title: effectiveTargetRole ? `Résumé review — ${effectiveTargetRole}` : "Résumé review",
        messages: [
          { role: "user", content: "Please review my resume against the target role.", timestamp: now },
          { role: "assistant", content: accumulated, timestamp: now },
        ],
      });
    } catch {
      setErrored(true);
    } finally {
      setReviewing(false);
    }
  };

  if (loading) return null;

  return (
    <div style={{ marginTop: "16px" }}>
      <SH>Résumé Review</SH>
      <div style={{
        background: "var(--color-bg-raised)", border: "1px solid var(--color-border-subtle)",
        borderRadius: "10px", padding: "12px",
      }}>
        <label style={labelStyle}>Paste your résumé</label>
        <textarea
          value={resumeText}
          onChange={(e) => setResumeText(e.target.value)}
          onBlur={commitResumeText}
          placeholder="Paste your résumé text here…"
          rows={8}
          style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5, marginBottom: "12px" }}
        />

        <label style={labelStyle}>Target role</label>
        <input
          type="text"
          value={targetRoleDraft}
          onChange={(e) => setTargetRoleDraft(e.target.value)}
          onBlur={() => { setSavedTargetRole(effectiveTargetRole); saveResumeProfile({ resumeText, targetRole: effectiveTargetRole }); }}
          placeholder={mostRecentAppliedRole || "e.g. Warehouse Operations Lead"}
          style={{ ...inputStyle, marginBottom: "6px" }}
        />
        <div className="text-xs" style={{ color: "var(--color-text-disabled)", lineHeight: 1.5, marginBottom: "12px" }}>
          {mostRecentAppliedRole && !targetRoleDraft
            ? `Defaults to your most recent application's role (${mostRecentAppliedRole}) — type here to compare against something else.`
            : "Leave blank to let Coach infer the likely target from your résumé."}
        </div>

        <Pressable
          onClick={getReview}
          disabled={!canReview}
          className="text-xs" style={{
            width: "100%",
            background: canReview ? "var(--color-teal)" : "var(--color-bg-surface)",
            color: canReview ? "var(--color-bg-base)" : "var(--color-text-disabled)",
            border: "none", borderRadius: "10px", padding: "10px",
            letterSpacing: "1.5px", textTransform: "uppercase",
            fontWeight: 700, cursor: canReview ? "pointer" : "not-allowed",
            minHeight: "44px",
          }}
        >
          {reviewing ? "Reviewing…" : "Get Skill-Gap Review"}
        </Pressable>

        {errored && (
          <div className="text-sm" style={{ marginTop: "10px", color: "var(--color-red)" }}>
            Coach couldn't complete the review — try again.
          </div>
        )}

        {review && (
          <div className="text-base" style={{
            marginTop: "14px",
            background: "var(--color-bg-surface)",
            border: "1px solid var(--color-border-subtle)",
            borderRadius: "10px",
            padding: "12px 14px",
            lineHeight: 1.6,
            color: "var(--color-text-primary)",
            whiteSpace: "pre-wrap",
          }}>
            {review}
          </div>
        )}
      </div>
    </div>
  );
}
