// §18.E1 — Résumé Review v1 (paste-text, no upload). chatWithCoach and the
// db.js persistence functions are mocked so these tests never touch the
// network/DB — same isolation pattern used across this session's Coach tests.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { ResumeReviewCard } from "../../components/ResumeReviewCard.jsx";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    chatWithCoach: vi.fn(),
    loadResumeProfile: vi.fn(),
    saveResumeProfile: vi.fn(),
    saveCoachChat: vi.fn(),
  },
}));
vi.mock("../../lib/claude.js", () => ({ chatWithCoach: mocks.chatWithCoach }));
vi.mock("../../lib/db.js", () => ({
  loadResumeProfile: mocks.loadResumeProfile,
  saveResumeProfile: mocks.saveResumeProfile,
  saveCoachChat: mocks.saveCoachChat,
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
});
