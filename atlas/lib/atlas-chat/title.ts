export const defaultAtlasChatTitle = "New chat";

const maxTitleLength = 56;

export function createAtlasChatFallbackTitle(message: string) {
  const compact = message
    .replace(/\s+/g, " ")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();

  if (!compact) {
    return defaultAtlasChatTitle;
  }

  if (compact.length <= maxTitleLength) {
    return compact;
  }

  return `${compact.slice(0, maxTitleLength - 1).trimEnd()}...`;
}
