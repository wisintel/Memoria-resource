export function containsPattern(query: string | null | undefined) {
  const normalized = query?.trim().replaceAll("%", "\\%").replaceAll("_", "\\_");

  return normalized ? `%${normalized}%` : "%";
}
