const ROTATION_FALLBACKS = {
  "6-Day": "Long Week",
  "4-Day": "Short Week",
  "Week 2": "Long Week",
  "Week 1": "Short Week",
  "Long Week": "Long Week",
  "Short Week": "Short Week",
  Standard: "Standard",
};

const ADMIN_ROTATION_TAGS = {
  "Long Week": "6-Day",
  "Short Week": "4-Day",
  "6-Day": "6-Day",
  "4-Day": "4-Day",
  "Week 2": "6-Day",
  "Week 1": "4-Day",
  Standard: "Standard",
};

function extractRotationParts(rotationSource) {
  if (!rotationSource) return { rotation: null, label: null, adminTag: null };
  if (typeof rotationSource === "string") {
    return { rotation: rotationSource, label: null, adminTag: null };
  }
  const rotation = rotationSource.rotation ?? rotationSource.weekRotation ?? null;
  return {
    rotation,
    label: rotationSource.rotationLabel ?? null,
    adminTag: rotationSource.adminRotationTag ?? null,
  };
}

export function formatRotationDisplay(rotationSource, { isAdmin } = {}) {
  const { rotation, label, adminTag } = extractRotationParts(rotationSource);
  const base = label || ROTATION_FALLBACKS[rotation] || rotation || "--";
  if (!isAdmin) return base;
  const adminLabel = ADMIN_ROTATION_TAGS[adminTag] || ADMIN_ROTATION_TAGS[rotation] || adminTag || rotation;
  if (!adminLabel || adminLabel === base) return base;
  return `${base} (${adminLabel})`;
}
