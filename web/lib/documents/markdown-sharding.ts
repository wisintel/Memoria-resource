export type MarkdownShard = {
  body: string;
  headingPath: string[];
  position: number;
  sizeBytes: number;
};

const targetBodyBytes = 118 * 1024;
const minimumChunkBytes = 32 * 1024;
const headingPattern = /^(#{1,6})(?:\s|$)/;
const encoder = new TextEncoder();

export function byteCount(text: string) {
  return encoder.encode(text).length;
}

function rawLines(text: string) {
  return text === "" ? [] : text.split(/(?<=\n)/);
}

function headingLevel(line: string) {
  const match = headingPattern.exec(line.trim());

  return match ? match[1].length : null;
}

function headingText(line: string, level: number) {
  return line
    .trim()
    .slice(level)
    .trim()
    .replace(/\s+#+\s*$/, "");
}

function splitLongBody(body: string) {
  if (byteCount(body) <= targetBodyBytes) {
    return [body];
  }

  const pieces: string[] = [];
  let start = 0;
  let bytes = 0;
  let index = 0;

  while (index < body.length) {
    const codePoint = body.codePointAt(index) ?? 0;
    const unitLength = codePoint > 0xffff ? 2 : 1;
    const codePointBytes =
      codePoint <= 0x7f
        ? 1
        : codePoint <= 0x7ff
          ? 2
          : codePoint <= 0xffff
            ? 3
            : 4;

    if (
      bytes + codePointBytes > targetBodyBytes &&
      bytes >= minimumChunkBytes
    ) {
      pieces.push(body.slice(start, index));
      start = index;
      bytes = 0;
    }

    bytes += codePointBytes;
    index += unitLength;
  }

  if (start < body.length) {
    pieces.push(body.slice(start));
  }

  return pieces;
}

function commonHeadingPath(left: string[], right: string[]) {
  const limit = Math.min(left.length, right.length);
  const common: string[] = [];

  for (let index = 0; index < limit; index += 1) {
    if (left[index] !== right[index]) {
      break;
    }

    common.push(left[index]);
  }

  return common;
}

function mergeSmallShards(shards: Omit<MarkdownShard, "position">[]) {
  const merged: Omit<MarkdownShard, "position">[] = [];

  for (const shard of shards) {
    const previous = merged.at(-1);

    if (!previous) {
      merged.push(shard);
      continue;
    }

    const combinedBody = previous.body + shard.body;
    const combinedBytes = byteCount(combinedBody);

    if (combinedBytes <= targetBodyBytes) {
      previous.body = combinedBody;
      previous.headingPath = commonHeadingPath(
        previous.headingPath,
        shard.headingPath
      );
      previous.sizeBytes = combinedBytes;
      continue;
    }

    merged.push(shard);
  }

  return merged;
}

export function shardMarkdown(markdown: string): MarkdownShard[] {
  const lines = rawLines(markdown);
  const shards: Omit<MarkdownShard, "position">[] = [];
  const headingStack: Array<{ level: number; text: string }> = [];
  let currentLines: string[] = [];
  let currentPath: string[] = [];
  let inFence = false;

  const flush = () => {
    const body = currentLines.join("");

    if (!body) {
      return;
    }

    for (const piece of splitLongBody(body)) {
      shards.push({
        body: piece,
        headingPath: currentPath,
        sizeBytes: byteCount(piece),
      });
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (inFence) {
      currentLines.push(line);

      if (trimmed.startsWith("```")) {
        inFence = false;
      }

      continue;
    }

    if (trimmed.startsWith("```")) {
      inFence = true;
      currentLines.push(line);
      continue;
    }

    const level = headingLevel(line);

    if (level === null) {
      currentLines.push(line);
      continue;
    }

    flush();

    while (
      headingStack.length > 0 &&
      headingStack[headingStack.length - 1].level >= level
    ) {
      headingStack.pop();
    }

    headingStack.push({ level, text: headingText(line, level) });
    currentPath = headingStack.map((entry) => entry.text);
    currentLines = [line];
  }

  flush();

  return mergeSmallShards(shards).map((shard, position) => ({
    ...shard,
    position,
  }));
}
