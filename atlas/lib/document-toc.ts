export type TocSourceShard = {
  body?: string;
  heading_path: string[];
  position: number;
};

export type TocEntry = {
  anchorId: string;
  depth: number;
  label: string;
  shardPosition: number;
};

const MAX_TOC_DEPTH = 2;
const MAX_TOC_LABEL_LENGTH = 96;
const headingPattern = /^(#{1,6})(?:\s|$)/;
const bookOutlinePattern = /^(preface|chapter\s+\d+\b|appendix\b|glossary\b|index\b|references\b|bibliography\b)/i;

export function stripInlineMarkdown(label: string) {
  return label.replace(/[*`]/g, "").replace(/\s+/g, " ").trim();
}

function markdownHeadings(body: string | undefined) {
  if (!body) {
    return [];
  }

  const headings: Array<{ label: string; level: number }> = [];
  let inFence = false;

  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      inFence = !inFence;
      continue;
    }

    if (inFence) {
      continue;
    }

    const match = headingPattern.exec(trimmed);

    if (!match) {
      continue;
    }

    const level = match[1].length;
    const label = trimmed.slice(level).trim().replace(/\s+#+\s*$/, "");

    headings.push({ label, level });
  }

  return headings;
}

function slugifyHeading(value: string) {
  return stripInlineMarkdown(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function isUsefulTocLabel(label: string) {
  const normalized = stripInlineMarkdown(label);

  if (!normalized || normalized.length > MAX_TOC_LABEL_LENGTH) {
    return false;
  }

  if (/[=<>±≈]/.test(normalized)) {
    return false;
  }

  if (/^learning objectives?$/i.test(normalized)) {
    return false;
  }

  if (/^\d+\.\s+learn\b/i.test(normalized)) {
    return false;
  }

  if (/^example\s+\d+/i.test(normalized)) {
    return false;
  }

  const letters = normalized.match(/[a-z]/gi)?.length ?? 0;
  const digits = normalized.match(/\d/g)?.length ?? 0;

  if (letters === 0) {
    return false;
  }

  if (digits > letters && /[+\-*/()]/.test(normalized)) {
    return false;
  }

  return true;
}

function isBookOutlineLabel(label: string) {
  return bookOutlinePattern.test(stripInlineMarkdown(label));
}

export function headingAnchorId(shardPosition: number, label: string, occurrence = 1) {
  const slug = slugifyHeading(label);
  const baseAnchorId = `heading-${shardPosition}${slug ? `-${slug}` : ""}`;

  return occurrence > 1 ? `${baseAnchorId}-${occurrence}` : baseAnchorId;
}

export function deriveToc(shards: readonly TocSourceShard[]): TocEntry[] {
  if (!shards.some((shard) => shard.heading_path.length > 0 || markdownHeadings(shard.body).length > 0)) {
    return [];
  }

  const ordered = [...shards].sort((a, b) => a.position - b.position);
  const headingCandidates = ordered.flatMap((shard) => {
    const bodyHeadings = markdownHeadings(shard.body);

    if (bodyHeadings.length > 0) {
      const headingOccurrences = new Map<string, number>();

      return bodyHeadings.map((heading) => {
        const baseAnchorId = headingAnchorId(shard.position, heading.label);
        const occurrence = (headingOccurrences.get(baseAnchorId) ?? 0) + 1;

        headingOccurrences.set(baseAnchorId, occurrence);

        return {
          anchorId: headingAnchorId(shard.position, heading.label, occurrence),
          ...heading,
          position: shard.position,
        };
      });
    }

    const fallbackLabel = shard.heading_path[shard.heading_path.length - 1];

    if (!fallbackLabel) {
      return [];
    }

    return [
      {
        anchorId: `shard-${shard.position}`,
        label: fallbackLabel,
        level: shard.heading_path.length,
        position: shard.position,
      },
    ];
  });

  if (headingCandidates.length === 0) {
    return [];
  }

  const visibleHeadingLevels = [...new Set(headingCandidates.map((candidate) => candidate.level))]
    .sort((a, b) => a - b)
    .slice(0, MAX_TOC_DEPTH);
  const entries: TocEntry[] = [];
  const headingStack: Array<{ label: string; level: number }> = [];

  for (const heading of headingCandidates) {
    while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= heading.level) {
      headingStack.pop();
    }

    headingStack.push(heading);

    const depth = visibleHeadingLevels.indexOf(heading.level);

    if (depth < 0 || depth >= MAX_TOC_DEPTH) {
      continue;
    }

    const label = stripInlineMarkdown(heading.label);

    if (!isUsefulTocLabel(label)) {
      continue;
    }

    entries.push({
      anchorId: heading.anchorId,
      depth,
      label: label || "Untitled section",
      shardPosition: heading.position,
    });
  }

  const bookEntries = entries.filter((entry) => isBookOutlineLabel(entry.label));
  const chapterCount = bookEntries.filter((entry) => /^chapter\s+\d+\b/i.test(entry.label)).length;

  if (chapterCount > 1) {
    return bookEntries.map((entry) => ({ ...entry, depth: 0 }));
  }

  return entries;
}
