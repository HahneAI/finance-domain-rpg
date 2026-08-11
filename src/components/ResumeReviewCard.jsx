import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, SH } from "./ui.jsx";
import { chatWithCoach } from "../lib/claude.js";
import { RESUME_REVIEW_SYSTEM_PROMPT } from "../lib/coachPrompts.js";
import {
  loadResumeProfile, saveResumeProfile, saveCoachChat,
  uploadResumeFile, getResumeFileUrl, deleteResumeFile,
} from "../lib/db.js";
import { validateResumeFile, extractResumeText, formatFileSize } from "../lib/resumeFile.js";

const labelStyle = {
  fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase",
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
 * §2.E1 — Résumé / Career Document Center. v1 (2026-07-25) was paste-text
 * only; v2 (2026-08-11) adds real file upload — any file type is accepted and
 * saved to the account as a persistent, retrievable asset (Supabase Storage,
 * migration 041), with best-effort client-side text extraction (PDF/DOCX/TXT
 * via `lib/resumeFile.js`) feeding the same analysis pipeline pasted text
 * always has. A file we can't extract text from is still saved — the user
 * just needs to paste text separately to get a review. Uploading a new file
 * overwrites the previous one (no versioning yet, per the v2 scoping note).
 *
 * A one-shot review, not a back-and-forth chat — matches the v1 phasing:
 * "a 'Resume' card... with a paste-text textarea + 'Get skill-gap review'
 * button." Target role defaults from the most recent logged application's
 * role (read-only reference into config.jobApplications — ReemploymentTracker
 * itself needs no changes for this) with a free-text override field.
 *
 * The review itself is saved as a coach_chats row (chat_type: 'resume_review',
 * migration 036) so it isn't lost — no history-browser UI for past reviews
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
  const [savedFile, setSavedFile] = useState(null); // { storagePath, originalFilename, mimeType, fileSizeBytes } | null
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [extractionNotice, setExtractionNotice] = useState("");
  const [fileActionBusy, setFileActionBusy] = useState(false);
  const fileInputRef = useRef(null);

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
      if (profile?.storagePath) {
        setSavedFile({
          storagePath: profile.storagePath,
          originalFilename: profile.originalFilename,
          mimeType: profile.mimeType,
          fileSizeBytes: profile.fileSizeBytes,
        });
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const effectiveTargetRole = (targetRoleDraft || savedTargetRole || mostRecentAppliedRole || "").trim();
  const canReview = resumeText.trim().length > 0 && !reviewing;

  const commitResumeText = () => {
    saveResumeProfile({ resumeText, targetRole: savedTargetRole });
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

    const { valid, error } = validateResumeFile(file);
    if (!valid) { setUploadError(error); return; }

    setUploadError("");
    setExtractionNotice("");
    setUploading(true);
    try {
      const { text, extractable, error: extractError } = await extractResumeText(file);
      const { storagePath, error: uploadErr } = await uploadResumeFile(file);
      if (uploadErr) {
        setUploadError("Couldn't save the file — try again.");
        return;
      }

      const nextResumeText = extractable && text ? text : resumeText;
      if (extractable && text) setResumeText(text);

      const fileMeta = {
        storagePath,
        originalFilename: file.name,
        mimeType: file.type || "",
        fileSizeBytes: file.size,
      };
      setSavedFile(fileMeta);
      saveResumeProfile({ resumeText: nextResumeText, targetRole: savedTargetRole, ...fileMeta });

      if (!extractable) {
        setExtractionNotice(extractError
          ? `Saved the file, but couldn't read its text (${extractError}) — paste your résumé text below to get a review.`
          : "Saved the file to your account — we can't automatically read text from this file type, so paste your résumé text below to get a review.");
      }
    } finally {
      setUploading(false);
    }
  };

  const handleViewFile = async () => {
    if (!savedFile?.storagePath) return;
    setFileActionBusy(true);
    try {
      const url = await getResumeFileUrl(savedFile.storagePath);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      else setUploadError("Couldn't open the file — try again.");
    } finally {
      setFileActionBusy(false);
    }
  };

  const handleRemoveFile = async () => {
    if (!savedFile?.storagePath) return;
    setFileActionBusy(true);
    try {
      await deleteResumeFile(savedFile.storagePath);
      setSavedFile(null);
      saveResumeProfile({
        resumeText, targetRole: savedTargetRole,
        storagePath: null, originalFilename: null, mimeType: null, fileSizeBytes: null,
      });
    } finally {
      setFileActionBusy(false);
    }
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
        <label style={labelStyle}>Upload a file</label>
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileChange}
          style={{ position: "absolute", width: "1px", height: "1px", overflow: "hidden", clip: "rect(0,0,0,0)" }}
          aria-label="Upload résumé file"
        />
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px", flexWrap: "wrap" }}>
          <Pressable
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="text-xs"
            style={{
              background: "var(--color-bg-surface)", color: "var(--color-text-primary)",
              border: "1px solid var(--color-border-subtle)", borderRadius: "10px",
              padding: "8px 14px", letterSpacing: "1px", textTransform: "uppercase",
              fontWeight: 700, cursor: uploading ? "not-allowed" : "pointer", minHeight: "40px",
            }}
          >
            {uploading ? "Uploading…" : savedFile ? "Replace File" : "Choose File"}
          </Pressable>

          {savedFile && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                {savedFile.originalFilename}
                {savedFile.fileSizeBytes != null && ` (${formatFileSize(savedFile.fileSizeBytes)})`}
              </span>
              <button
                type="button"
                onClick={handleViewFile}
                disabled={fileActionBusy}
                className="text-xs"
                style={{
                  background: "none", border: "none", color: "var(--color-teal)",
                  textDecoration: "underline", cursor: fileActionBusy ? "not-allowed" : "pointer", padding: 0,
                }}
              >
                View
              </button>
              <button
                type="button"
                onClick={handleRemoveFile}
                disabled={fileActionBusy}
                className="text-xs"
                style={{
                  background: "none", border: "none", color: "var(--color-red)",
                  textDecoration: "underline", cursor: fileActionBusy ? "not-allowed" : "pointer", padding: 0,
                }}
              >
                Remove
              </button>
            </div>
          )}
        </div>

        {uploadError && (
          <div className="text-sm" style={{ marginBottom: "12px", color: "var(--color-red)" }}>
            {uploadError}
          </div>
        )}
        {extractionNotice && (
          <div className="text-sm" style={{ marginBottom: "12px", color: "var(--color-warning)" }}>
            {extractionNotice}
          </div>
        )}

        <label style={labelStyle}>Or paste your résumé</label>
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
