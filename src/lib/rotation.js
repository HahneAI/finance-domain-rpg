const ROTATION_FALLBACKS = {
  "6-Day": "Long Week",
  "4-Day": "Short Week",
  "Week 2": "Long Week",
  "Week 1": "Short Week",
  "Long Week": "Long Week",
  "Short Week": "Short Week",
  Standard: "Standard",
};

function extractRotationParts(rotationSource) {
  if (!rotationSource) return { rotation: null, label: null };
  if (typeof rotationSource === "string") {
    return { rotation: rotationSource, label: null };
  }
  const rotation = rotationSource.rotation ?? rotationSource.weekRotation ?? null;
  return {
    rotation,
    label: rotationSource.rotationLabel ?? null,
  };
}

// Always renders the plain "Short Week" / "Long Week" name. The old admin-only
// "(4-Day)" / "(6-Day)" day-count suffix was a mislabeled day count and is gone.
// Second arg is accepted (and ignored) so existing `{ isAdmin }` call sites keep working.
export function formatRotationDisplay(rotationSource) {
  const { rotation, label } = extractRotationParts(rotationSource);
  return label || ROTATION_FALLBACKS[rotation] || rotation || "--";
}
