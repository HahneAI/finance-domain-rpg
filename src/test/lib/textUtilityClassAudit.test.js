// Typography drift guard (docs/ux-animations-tasks.md's "Typography — Text
// Utility Class Rollout & Audit Map"). Every src/components/*.jsx + App.jsx
// file was swept 2026-08-10 to replace hardcoded inline `fontSize: "Npx"`
// (9-14px — non-numeric body/label text) with the .text-2xs/.text-xs/
// .text-sm/.text-base/.text-md classes in src/index.css. That sweep is only
// worth anything if new code can't silently reintroduce the raw literals it
// removed — this test scans every component file for that exact pattern and
// fails the moment a new one appears anywhere not on the explicit allowlist
// below, the same "read the real source, not a synthetic case" approach as
// cronLifecycleSelectColumns.test.js.
//
// The allowlist isn't a loophole — it's the fixed set of shared JS style
// objects (labelStyle/inputStyle/linkStyle/lS) that intentionally keep a raw
// px value as their single source of truth (same DRY precedent as ui.jsx's
// `lS`, reused across multiple JSX call sites in one file) instead of
// threading a className through every usage. Each entry pins an *exact
// count* per file, not just "some allowed" — so adding a stray tenth
// instance to a file that's allowlisted for nine still fails loudly.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const componentsDir = path.join(__dirname, "../../components");
const appJsxPath = path.join(__dirname, "../../App.jsx");

const RAW_FONT_SIZE = /fontSize:\s*["'](9|10|11|12|13|14)px["']/g;

// file (relative to src/components/, or "App.jsx") -> exact allowed count
const ALLOWLIST = {
  "ui.jsx": 1, // lS — shared label style object, reused across many files
  "NewJobSeasonEntry.jsx": 1, // labelStyle
  "InvestorRegister.jsx": 1, // linkStyle
  "ReemploymentTracker.jsx": 1, // inputStyle
  "RateUpdateModal.jsx": 1, // labelStyle
  "LoginScreen.jsx": 1, // linkBtnStyle
  "ConsentGateModal.jsx": 1, // linkStyle
  "ResumeReviewCard.jsx": 2, // labelStyle + inputStyle
};

function countRawFontSize(filePath) {
  const content = readFileSync(filePath, "utf8");
  return (content.match(RAW_FONT_SIZE) ?? []).length;
}

describe("text utility class audit — no new raw inline fontSize literals", () => {
  const componentFiles = readdirSync(componentsDir).filter(f => f.endsWith(".jsx"));

  it("has a non-empty file list to scan (sanity check against a vacuous pass)", () => {
    expect(componentFiles.length).toBeGreaterThan(20);
  });

  for (const file of componentFiles) {
    const allowed = ALLOWLIST[file] ?? 0;
    it(`${file} — ${allowed} raw fontSize literal(s) allowed, no more`, () => {
      const found = countRawFontSize(path.join(componentsDir, file));
      expect(found).toBe(allowed);
    });
  }

  it("App.jsx — 0 raw fontSize literals allowed", () => {
    const found = countRawFontSize(appJsxPath);
    expect(found).toBe(0);
  });
});
