// Red one-line message under a field that just tried to cross a goal limit
// (TODO §31, warden F184). Rendered only after a blocked attempt — the limit is
// never advertised before then. role="alert" so screen readers hear the "no".
export function GoalLimitNote({ error }) {
  if (!error) return null;
  return (
    <div role="alert" data-testid="goal-limit-note" className="text-xs" style={{ color: "var(--color-red)", marginTop: "6px", lineHeight: 1.45 }}>
      {error.message}
    </div>
  );
}
