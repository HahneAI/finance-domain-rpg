/**
 * §2.E1 v2 — client-side résumé file handling: size validation and best-effort
 * text extraction for the analysis pipeline. Any file type can still be
 * uploaded and saved to the account (see uploadResumeFile in db.js) — this
 * module only decides whether we can turn a given file into plain text for
 * Coach's skill-gap review, not whether it's allowed to be saved.
 *
 * pdfjs-dist and mammoth are dynamically imported so a user who only ever
 * pastes text (or uploads a .txt file) never pays for either library's
 * bundle weight.
 */

// Generous but bounded — real résumés are well under 1MB; this just guards
// against someone picking a huge, unrelated file by mistake.
export const RESUME_MAX_FILE_BYTES = 10 * 1024 * 1024;

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function extensionOf(filename = "") {
  const m = /\.([a-z0-9]+)$/i.exec(filename);
  return m ? m[1].toLowerCase() : "";
}

/** Size-only check — any file type is allowed to be saved to the account. */
export function validateResumeFile(file) {
  if (!file) return { valid: false, error: "No file selected." };
  if (file.size > RESUME_MAX_FILE_BYTES) {
    const maxMb = RESUME_MAX_FILE_BYTES / (1024 * 1024);
    return { valid: false, error: `That file is too large — max ${maxMb}MB.` };
  }
  return { valid: true, error: null };
}

async function extractPdfText(file) {
  const pdfjsLib = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pageTexts = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pageTexts.push(content.items.map((item) => item.str).join(" "));
  }
  return pageTexts.join("\n\n").trim();
}

async function extractDocxText(file) {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return (result.value ?? "").trim();
}

/**
 * Best-effort text extraction for the résumé analysis pipeline. Returns
 * { text, extractable, error }. `extractable: false` (with `error: null`)
 * means the file type just isn't one we parse — not a failure, the caller
 * should fall back to "paste your résumé text" while still keeping the
 * uploaded file itself saved to the account. `error` is only set when a
 * recognized format failed to parse (corrupt/password-protected PDF, etc).
 */
export async function extractResumeText(file) {
  const ext = extensionOf(file.name);
  const type = file.type || "";

  try {
    if (type === "application/pdf" || ext === "pdf") {
      return { text: await extractPdfText(file), extractable: true, error: null };
    }
    if (type === DOCX_MIME || ext === "docx") {
      return { text: await extractDocxText(file), extractable: true, error: null };
    }
    if (type.startsWith("text/") || ext === "txt") {
      return { text: (await file.text()).trim(), extractable: true, error: null };
    }
  } catch (err) {
    return { text: "", extractable: false, error: err?.message ?? "Couldn't read text from this file." };
  }
  return { text: "", extractable: false, error: null };
}

/** "1.2 MB" / "480 KB" — used for the saved-file badge in ResumeReviewCard. */
export function formatFileSize(bytes) {
  if (bytes == null || Number.isNaN(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
