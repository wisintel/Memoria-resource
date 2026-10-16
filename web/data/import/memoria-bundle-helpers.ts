const assertionStates = new Set([
  "candidate",
  "accepted",
  "rejected",
  "deferred",
  "superseded",
  "review_needed",
]);

const evidenceLinkRoles = new Set([
  "supports",
  "contradicts",
  "qualifies",
  "provenance",
]);

const mapVisibilities = new Set([
  "visible",
  "hidden",
  "collapsed",
  "metadata_only",
]);

export function normalizeSlug(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function classKeyForTypeCard(appliesTo: unknown) {
  const normalized = String(appliesTo ?? "").trim();

  if (normalized === "view_kind") {
    return "domain_map";
  }

  if (
    normalized === "claim" ||
    normalized === "document" ||
    normalized === "relationship" ||
    normalized === "subject"
  ) {
    return normalized;
  }

  throw new Error(`Unsupported type card scope: ${normalized}`);
}

export function normalizeBundleStatus(value: unknown, classKey: string) {
  const normalized = normalizeSlug(value);

  if (normalized === "canon" || normalized === "accepted") {
    return "active";
  }

  if (classKey === "document") {
    if (
      normalized === "ready" ||
      normalized === "processing" ||
      normalized === "failed" ||
      normalized === "archived"
    ) {
      return normalized;
    }

    return "ready";
  }

  if (normalized === "archived") {
    return "archived";
  }

  return "active";
}

export function normalizeAssertionState(value: unknown) {
  const normalized = normalizeSlug(value).replaceAll("-", "_");
  return assertionStates.has(normalized) ? normalized : "accepted";
}

export function normalizeEvidenceLinkRole(value: unknown) {
  const normalized = normalizeSlug(value);
  return evidenceLinkRoles.has(normalized) ? normalized : "provenance";
}

export function normalizeMapVisibility(value: unknown) {
  const normalized = normalizeSlug(value).replaceAll("-", "_");
  return mapVisibilities.has(normalized) ? normalized : "visible";
}
