export function serializeListInput(value: string | null | undefined) {
  return JSON.stringify(parseListValue(value));
}

export function parseListValue(value: string | null | undefined) {
  if (!value) {
    return [];
  }

  const text = value.trim();

  if (!text) {
    return [];
  }

  try {
    const parsed = JSON.parse(text);

    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());
    }
  } catch {
    // Fall through to plain text splitting.
  }

  return text
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}
