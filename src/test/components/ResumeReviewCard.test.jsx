// §2.E1 — Résumé / Career Document Center. v1 was paste-text only; v2 adds
// file upload. chatWithCoach, db.js persistence, and resumeFile.js extraction
// are all mocked so these tests never touch the network/DB/real pdf/docx
// parsing — same isolation pattern used across this session's Coach tests.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { ResumeReviewCard } from "../../components/ResumeReviewCard.jsx";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    chatWithCoach: vi.fn(),
    loadResumeProfile: vi.fn(),
    saveResumeProfile: vi.fn(),
    saveCoachChat: vi.fn(),
    uploadResumeFile: vi.fn(),
    getResumeFileUrl: vi.fn(),
    deleteResumeFile: vi.fn(),
    validateResumeFile: vi.fn(),
    extractResumeText: vi.fn(),
  },
}));
vi.mock("../../lib/claude.js", () => ({ chatWithCoach: mocks.chatWithCoach }));
vi.mock("../../lib/db.js", () => ({
  loadResumeProfile: mocks.loadResumeProfile,
  saveResumeProfile: mocks.saveResumeProfile,
  saveCoachChat: mocks.saveCoachChat,
  uploadResumeFile: mocks.uploadResumeFile,
  getResumeFileUrl: mocks.getResumeFileUrl,
  deleteResumeFile: mocks.deleteResumeFile,
}));
vi.mock("../../lib/resumeFile.js", () => ({
  validateResumeFile: mocks.validateResumeFile,
  extractResumeText: mocks.extractResumeText,
  formatFileSize: (bytes) => `${Math.round(bytes / 1024)} KB`,
}));

function chunkGenerator(chunks) {
  return async function* () {
    for (const c of chunks) yield c;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadResumeProfile.mockResolvedValue(null);
  mocks.saveResumeProfile.mockResolvedValue(true);
  mocks.saveCoachChat.mockResolvedValue("chat-id");
  mocks.validateResumeFile.mockReturnValue({ valid: true, error: null });
  mocks.uploadResumeFile.mockResolvedValue({ storagePath: "test-user-id/resume.pdf", error: null });
  mocks.getResumeFileUrl.mockResolvedValue("https://signed.example/resume.pdf");
  mocks.deleteResumeFile.mockResolvedValue(true);
});

describe("ResumeReviewCard", () => {
  it("renders nothing until the initial profile load settles", () => {
    mocks.loadResumeProfile.mockReturnValue(new Promise(() => {})); // never resolves
    const { container } = render(<ResumeReviewCard config={{}} />);
    expect(container.firstChild).toBeNull();
  });

  it("pre-fills from an existing saved profile", async () => {
    mocks.loadResumeProfile.mockResolvedValue({ resumeText: "Warehouse lead, 5 years...", targetRole: "Ops Manager" });
    render(<ResumeReviewCard config={{}} />);
    expect(await screen.findByDisplayValue("Warehouse lead, 5 years...")).toBeTruthy();
    expect(screen.getByDisplayValue("Ops Manager")).toBeTruthy();
  });

  it("defaults the target-role placeholder to the most recent job application's role", async () => {
    const config = {
      jobApplications: [
        { id: "a1", company: "Old Co", role: "Stocker", status: "rejected", dateApplied: "2026-05-01" },
        { id: "a2", company: "Acme Logistics", role: "Warehouse Lead", status: "interview", dateApplied: "2026-06-20" },
      ],
    };
    render(<ResumeReviewCard config={config} />);
    const input = await screen.findByPlaceholderText("Warehouse Lead");
    expect(input).toBeTruthy();
  });

  it("disables the review button until résumé text is entered", async () => {
    render(<ResumeReviewCard config={{}} />);
    const button = await screen.findByText("Get Skill-Gap Review");
    expect(button.closest("button")).toBeDisabled();

    fireEvent.change(await screen.findByPlaceholderText("Paste your résumé text here…"), { target: { value: "Some resume text" } });
    expect(button.closest("button")).not.toBeDisabled();
  });

  it("streams the review, then saves the profile and a coach_chats row", async () => {
    mocks.chatWithCoach.mockImplementation(chunkGenerator(["Strong on ops, ", "light on metrics."]));
    render(<ResumeReviewCard config={{}} />);

    fireEvent.change(await screen.findByPlaceholderText("Paste your résumé text here…"), { target: { value: "Warehouse lead, 5 years." } });
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Warehouse Operations Lead/), { target: { value: "Operations Manager" } });
    fireEvent.click(screen.getByText("Get Skill-Gap Review"));

    await waitFor(() => expect(screen.getByText("Strong on ops, light on metrics.")).toBeTruthy());

    const [messages, systemPrompt, contextBlock, model] = mocks.chatWithCoach.mock.calls[0];
    expect(messages).toEqual([{ role: "user", content: "Please review my resume against the target role." }]);
    expect(systemPrompt).toMatch(/Résumé Review mode/);
    expect(contextBlock).toContain("Warehouse lead, 5 years.");
    expect(contextBlock).toContain("Target role: Operations Manager");
    expect(model).toBe("sonnet");

    await waitFor(() => expect(mocks.saveResumeProfile).toHaveBeenCalledWith(
      expect.objectContaining({ resumeText: "Warehouse lead, 5 years.", targetRole: "Operations Manager" })
    ));
    await waitFor(() => expect(mocks.saveCoachChat).toHaveBeenCalledWith(
      expect.objectContaining({ chatType: "resume_review", title: "Résumé review — Operations Manager" })
    ));
  });

  it("shows an error state when the review call fails", async () => {
    mocks.chatWithCoach.mockImplementation(() => { throw new Error("network down"); });
    render(<ResumeReviewCard config={{}} />);

    fireEvent.change(await screen.findByPlaceholderText("Paste your résumé text here…"), { target: { value: "Some resume text" } });
    fireEvent.click(screen.getByText("Get Skill-Gap Review"));

    await waitFor(() => expect(screen.getByText("Coach couldn't complete the review — try again.")).toBeTruthy());
    expect(mocks.saveCoachChat).not.toHaveBeenCalled();
  });

  describe("v2 — file upload", () => {
    it("shows a pre-existing saved file from the loaded profile", async () => {
      mocks.loadResumeProfile.mockResolvedValue({
        resumeText: "Warehouse lead...", targetRole: "",
        storagePath: "test-user-id/resume.pdf", originalFilename: "resume.pdf",
        mimeType: "application/pdf", fileSizeBytes: 204800,
      });
      render(<ResumeReviewCard config={{}} />);
      expect(await screen.findByText(/resume\.pdf/)).toBeTruthy();
      expect(screen.getByText("View")).toBeTruthy();
      expect(screen.getByText("Remove")).toBeTruthy();
    });

    it("uploads a file, pre-fills extracted text, and saves the file metadata", async () => {
      mocks.extractResumeText.mockResolvedValue({ text: "Extracted résumé text.", extractable: true, error: null });
      render(<ResumeReviewCard config={{}} />);

      const fileInput = await screen.findByLabelText("Upload résumé file");
      const file = new File(["dummy"], "resume.pdf", { type: "application/pdf" });
      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => expect(mocks.uploadResumeFile).toHaveBeenCalledWith(file));
      await waitFor(() => expect(screen.getByDisplayValue("Extracted résumé text.")).toBeTruthy());
      await waitFor(() => expect(mocks.saveResumeProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          resumeText: "Extracted résumé text.",
          storagePath: "test-user-id/resume.pdf",
          originalFilename: "resume.pdf",
          mimeType: "application/pdf",
        })
      ));
      expect(await screen.findByText(/resume\.pdf/)).toBeTruthy();
    });

    it("saves the file but shows a notice when its text can't be extracted", async () => {
      mocks.extractResumeText.mockResolvedValue({ text: "", extractable: false, error: null });
      render(<ResumeReviewCard config={{}} />);

      const fileInput = await screen.findByLabelText("Upload résumé file");
      const file = new File(["dummy"], "photo.jpg", { type: "image/jpeg" });
      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => expect(mocks.uploadResumeFile).toHaveBeenCalled());
      expect(await screen.findByText(/can't automatically read text from this file type/)).toBeTruthy();
      expect(await screen.findByText(/photo\.jpg/)).toBeTruthy();
    });

    it("shows a validation error and never uploads when the file is rejected client-side", async () => {
      mocks.validateResumeFile.mockReturnValue({ valid: false, error: "That file is too large — max 10MB." });
      render(<ResumeReviewCard config={{}} />);

      const fileInput = await screen.findByLabelText("Upload résumé file");
      const file = new File(["dummy"], "huge.pdf", { type: "application/pdf" });
      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(await screen.findByText("That file is too large — max 10MB.")).toBeTruthy();
      expect(mocks.uploadResumeFile).not.toHaveBeenCalled();
    });

    it("opens a signed URL when View is clicked", async () => {
      const openSpy = vi.spyOn(window, "open").mockImplementation(() => {});
      mocks.loadResumeProfile.mockResolvedValue({
        resumeText: "", targetRole: "",
        storagePath: "test-user-id/resume.pdf", originalFilename: "resume.pdf",
        mimeType: "application/pdf", fileSizeBytes: 204800,
      });
      render(<ResumeReviewCard config={{}} />);

      fireEvent.click(await screen.findByText("View"));
      await waitFor(() => expect(mocks.getResumeFileUrl).toHaveBeenCalledWith("test-user-id/resume.pdf"));
      await waitFor(() => expect(openSpy).toHaveBeenCalledWith("https://signed.example/resume.pdf", "_blank", "noopener,noreferrer"));
      openSpy.mockRestore();
    });

    it("removes the saved file and clears its metadata when Remove is clicked", async () => {
      mocks.loadResumeProfile.mockResolvedValue({
        resumeText: "Warehouse lead...", targetRole: "",
        storagePath: "test-user-id/resume.pdf", originalFilename: "resume.pdf",
        mimeType: "application/pdf", fileSizeBytes: 204800,
      });
      render(<ResumeReviewCard config={{}} />);

      fireEvent.click(await screen.findByText("Remove"));

      await waitFor(() => expect(mocks.deleteResumeFile).toHaveBeenCalledWith("test-user-id/resume.pdf"));
      await waitFor(() => expect(mocks.saveResumeProfile).toHaveBeenCalledWith(
        expect.objectContaining({ storagePath: null, originalFilename: null, mimeType: null, fileSizeBytes: null })
      ));
      await waitFor(() => expect(screen.queryByText(/resume\.pdf/)).toBeNull());
    });
  });
});
