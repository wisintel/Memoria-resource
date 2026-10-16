"use client";

import { FileText } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { headingAnchorId } from "@/lib/document-toc";
import type { DocumentRecord, DocumentShardRecord } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type HeadingProps = ComponentPropsWithoutRef<"h1"> & {
  node?: unknown;
};

function createMarkdownComponents(shardPosition: number): Components {
  const headingOccurrences = new Map<string, number>();
  const heading = (Tag: "h2" | "h3" | "h4" | "h5" | "h6", className: string) => {
    function MarkdownHeading({ node, children, ...props }: HeadingProps) {
      void node;
      const label = textFromReactNode(children);
      const baseAnchorId = headingAnchorId(shardPosition, label);
      const occurrence = (headingOccurrences.get(baseAnchorId) ?? 0) + 1;
      const anchorId = headingAnchorId(shardPosition, label, occurrence);

      headingOccurrences.set(baseAnchorId, occurrence);

      return (
        <Tag className={cn("scroll-mt-8 tracking-normal text-foreground", className)} id={anchorId} {...props}>
          {children}
        </Tag>
      );
    }

    MarkdownHeading.displayName = `MarkdownHeading${Tag.toUpperCase()}`;

    return MarkdownHeading;
  };

  return {
    a: ({ node, href, children, ...props }) => {
      void node;
      const external = typeof href === "string" && /^https?:\/\//.test(href);

      return (
        <a
          className="font-medium text-primary underline decoration-primary/35 underline-offset-4 transition-colors hover:text-primary/85 hover:decoration-primary/70"
          href={href}
          rel={external ? "noreferrer" : undefined}
          target={external ? "_blank" : undefined}
          {...props}
        >
          {children}
        </a>
      );
    },
    blockquote: ({ node, ...props }) => {
      void node;

      return (
        <blockquote
          className="my-6 border-l-2 border-primary/55 bg-muted/20 px-5 py-4 text-[0.95rem] leading-7 text-muted-foreground [&_p:last-child]:mb-0"
          {...props}
        />
      );
    },
    code: ({ node, className, ...props }) => {
      void node;

      return (
        <code
          className={cn(
            "rounded-md border border-border/70 bg-muted/45 px-1.5 py-0.5 font-mono text-[0.86em] text-foreground",
            className,
          )}
          {...props}
        />
      );
    },
    h1: heading("h2", "mt-11 border-b border-border/70 pb-3 text-3xl font-semibold leading-tight first:mt-0"),
    h2: heading("h3", "mt-10 text-2xl font-semibold leading-snug first:mt-0"),
    h3: heading("h4", "mt-8 text-xl font-semibold leading-snug first:mt-0"),
    h4: heading("h5", "mt-7 text-lg font-semibold leading-snug first:mt-0"),
    h5: heading("h6", "mt-6 text-base font-semibold leading-snug first:mt-0"),
    h6: heading("h6", "mt-6 font-mono text-xs font-semibold uppercase leading-snug tracking-[0.14em] text-muted-foreground first:mt-0"),
    hr: ({ node, ...props }) => {
      void node;

      return <hr className="my-9 border-border/80" {...props} />;
    },
    img: ({ node, alt, src, ...props }) => {
      void node;

      if (isUnavailableMarkdownImageSource(src)) {
        return null;
      }

      return (
        <span className="my-7 block overflow-hidden rounded-lg border border-border/70 bg-muted/20">
          <img alt={alt ?? ""} className="h-auto max-h-[70vh] w-full object-contain" src={src} {...props} />
          {alt ? <span className="block border-t border-border/70 px-3 py-2 text-xs text-muted-foreground">{alt}</span> : null}
        </span>
      );
    },
    li: ({ node, ...props }) => {
      void node;

      return <li className="pl-1 leading-7 marker:text-muted-foreground" {...props} />;
    },
    ol: ({ node, ...props }) => {
      void node;

      return <ol className="my-5 list-decimal space-y-2 pl-6 text-[0.98rem] text-foreground/90" {...props} />;
    },
    p: ({ node, ...props }) => {
      void node;

      return <p className="my-5 text-[0.98rem] leading-7 text-foreground/90" {...props} />;
    },
    pre: ({ node, ...props }) => {
      void node;

      return (
        <pre
          className="my-6 overflow-x-auto rounded-lg border border-border/80 bg-background/80 p-4 text-sm leading-6 shadow-inner shadow-black/20 [&_code]:border-0 [&_code]:bg-transparent [&_code]:p-0"
          {...props}
        />
      );
    },
    table: ({ node, ...props }) => {
      void node;

      return (
        <div className="my-7 overflow-x-auto rounded-lg border border-border/75 bg-background/45">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm" {...props} />
        </div>
      );
    },
    td: ({ node, ...props }) => {
      void node;

      return <td className="border-t border-border/70 px-4 py-3 align-top text-foreground/80" {...props} />;
    },
    th: ({ node, ...props }) => {
      void node;

      return (
        <th className="border-b border-border/80 bg-muted/25 px-4 py-3 align-bottom font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground" {...props} />
      );
    },
    ul: ({ node, ...props }) => {
      void node;

      return <ul className="my-5 list-disc space-y-2 pl-6 text-[0.98rem] text-foreground/90" {...props} />;
    },
  };
}

type DocumentReaderProps = {
  document: DocumentRecord | null;
  emptyDescription?: string;
  onActiveShardChange?: (shardId: string | null) => void;
  shards: DocumentShardRecord[];
};

export function DocumentReader({
  document,
  emptyDescription = "Select a document, then the reader will open here.",
  onActiveShardChange,
  shards,
}: DocumentReaderProps) {
  const shardContainerRef = useRef<HTMLDivElement | null>(null);
  const pendingAnchorRef = useRef<string | null>(null);
  const [activeShardPosition, setActiveShardPosition] = useState(0);
  const renderedShardPositions = useMemo(
    () => visibleShardWindow(activeShardPosition, shards.length),
    [activeShardPosition, shards.length],
  );
  const isHtmlDocument = document?.source_type === "html";

  useEffect(() => {
    if (!document || shards.length === 0) {
      onActiveShardChange?.(null);
      setActiveShardPosition(0);
      return;
    }

    onActiveShardChange?.(shards[0]?.id ?? null);
    setActiveShardPosition(0);
  }, [document?.id, onActiveShardChange, shards]);

  useEffect(() => {
    if (!document || shards.length === 0) {
      return;
    }

    const prepareHashAnchor = () => {
      const anchorId = decodeURIComponent(window.location.hash.slice(1));
      const shardPosition = shardPositionFromAnchorId(anchorId);

      if (shardPosition === null || !shards.some((shard) => shard.position === shardPosition)) {
        return;
      }

      pendingAnchorRef.current = anchorId;
      setActiveShardPosition(shardPosition);

      const targetShard = shards.find((shard) => shard.position === shardPosition);
      onActiveShardChange?.(targetShard?.id ?? null);
    };

    prepareHashAnchor();
    window.addEventListener("hashchange", prepareHashAnchor);

    return () => window.removeEventListener("hashchange", prepareHashAnchor);
  }, [document?.id, onActiveShardChange, shards]);

  useEffect(() => {
    const anchorId = pendingAnchorRef.current;

    if (!anchorId) {
      return;
    }

    window.requestAnimationFrame(() => {
      const anchorElement = window.document.getElementById(anchorId);

      if (!anchorElement) {
        return;
      }

      anchorElement.scrollIntoView({ block: "start" });
      pendingAnchorRef.current = null;
    });
  }, [renderedShardPositions]);

  useEffect(() => {
    const shardContainer = shardContainerRef.current;

    if (!document || !shardContainer || shards.length === 0) {
      return;
    }

    const visibleHeights = new Map<string, number>();
    const selectMostVisibleShard = () => {
      let activeShardId: string | null = null;
      let activeShardHeight = 0;

      for (const [shardId, visibleHeight] of visibleHeights) {
        if (visibleHeight > activeShardHeight) {
          activeShardId = shardId;
          activeShardHeight = visibleHeight;
        }
      }

      const nextShardId = activeShardId ?? shards[0]?.id ?? null;

      onActiveShardChange?.(nextShardId);

      if (nextShardId) {
        const nextShard = shards.find((shard) => shard.id === nextShardId);

        if (nextShard) {
          setActiveShardPosition(nextShard.position);
        }
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const shardId = entry.target.getAttribute("data-shard-id");
          if (!shardId) continue;

          visibleHeights.set(shardId, entry.isIntersecting ? entry.intersectionRect.height : 0);
        }

        selectMostVisibleShard();
      },
      {
        threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
      },
    );

    const shardElements = shardContainer.querySelectorAll<HTMLElement>("[data-shard-id]");
    shardElements.forEach((element) => observer.observe(element));

    return () => observer.disconnect();
  }, [document, onActiveShardChange, shards]);

  if (!document) {
    return (
      <div className="flex min-h-full items-center justify-center px-8">
        <div className="max-w-md text-center">
          <FileText className="mx-auto mb-5 size-10 text-primary/80" />
          <h1 className="text-xl font-semibold">No document selected</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{emptyDescription}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 p-6 max-shell:p-3">
      <section className="min-h-0 w-full overflow-hidden rounded-lg border border-border bg-card/35 shadow-2xl shadow-black/20 backdrop-blur">
        <ScrollArea className="h-full w-full">
          <article className="px-8 py-8 max-shell:px-5">
            <div className={cn("mx-auto", isHtmlDocument ? "max-w-6xl" : "max-w-4xl")}>
              <header className="mb-8">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <Badge className="font-mono uppercase tracking-[0.12em]" variant="outline">
                    {humanizeSourceType(document.source_type)}
                  </Badge>
                  <Badge className="font-mono tabular-nums" variant="secondary">
                    {shards.length} {shards.length === 1 ? "shard" : "shards"}
                  </Badge>
                </div>
                <h1 className="max-w-3xl text-3xl font-semibold leading-tight tracking-normal text-foreground">
                  {document.title}
                </h1>
                {document.source_filename ? (
                  <p className="mt-3 max-w-2xl truncate font-mono text-xs text-muted-foreground">
                    {document.source_filename}
                  </p>
                ) : null}
                <Separator className="mt-6 bg-border/80" />
              </header>
              {shards.length > 0 && isHtmlDocument ? (
                <HtmlDocumentFrame html={combineHtmlShards(shards)} title={document.title} />
              ) : shards.length > 0 ? (
                <div className="prose prose-invert max-w-none space-y-10" ref={shardContainerRef}>
                  {shards.map((shard) => (
                    <section
                      className="scroll-mt-8"
                      data-shard-id={shard.id}
                      id={`shard-${shard.position}`}
                      key={shard.id}
                    >
                      <div className="mb-5 flex items-center gap-3">
                        <div className="h-px flex-1 bg-border/55" />
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Shard {shard.position + 1}
                        </span>
                      </div>
                      {renderedShardPositions.has(shard.position) ? (
                        <ReactMarkdown components={createMarkdownComponents(shard.position)} remarkPlugins={[remarkGfm]}>
                          {preprocessMarkdown(shard.body)}
                        </ReactMarkdown>
                      ) : (
                        <ShardPlaceholder shard={shard} />
                      )}
                    </section>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">This document has no readable shards yet.</p>
              )}
            </div>
          </article>
        </ScrollArea>
      </section>
    </div>
  );
}

export function humanizeSourceType(sourceType: DocumentRecord["source_type"]) {
  if (sourceType === "paste") {
    return "Pasted text";
  }

  if (sourceType === "markdown") {
    return "Markdown";
  }

  if (sourceType === "pdf") {
    return "PDF";
  }

  if (sourceType === "converted_file") {
    return "Converted file";
  }

  if (sourceType === "url") {
    return "Web page";
  }

  return "HTML";
}

function preprocessMarkdown(markdown: string) {
  return stripUnavailableMarkdownImages(markdown).replace(/\s*\(cid:\d+\)\s*/g, " · ").replace(/\s+·\s*$/gm, "");
}

function stripUnavailableMarkdownImages(markdown: string) {
  return markdown.replace(/!\[[^\]\n]*\]\(([^)\n]+)\)/g, (match, rawSource: string) => {
    const source = rawSource.trim().split(/\s+/)[0]?.replace(/^<|>$/g, "");

    return isUnavailableMarkdownImageSource(source) ? "" : match;
  });
}

function isUnavailableMarkdownImageSource(source: unknown) {
  if (typeof source !== "string" || source.trim() === "") {
    return true;
  }

  const trimmedSource = source.trim();

  return !/^(https?:|data:|blob:|\/)/i.test(trimmedSource);
}

function HtmlDocumentFrame({ html, title }: { html: string; title: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/80 bg-white shadow-inner shadow-black/20">
      <iframe
        className="h-[min(76vh,900px)] min-h-[560px] w-full bg-white"
        referrerPolicy="no-referrer"
        sandbox=""
        srcDoc={html}
        title={title}
      />
    </div>
  );
}

function combineHtmlShards(shards: DocumentShardRecord[]) {
  return [...shards]
    .sort((left, right) => left.position - right.position)
    .map((shard) => shard.body)
    .join("");
}

function ShardPlaceholder({ shard }: { shard: DocumentShardRecord }) {
  return (
    <div
      className="flex min-h-[22rem] items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/10 px-5 py-12 text-center"
      style={{ minHeight: estimatedShardHeight(shard) }}
    >
      <div>
        <p className="font-mono text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Shard paused
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Scroll near this section to render it.
        </p>
      </div>
    </div>
  );
}

function visibleShardWindow(activePosition: number, shardCount: number) {
  const positions = new Set<number>();
  const before = 1;
  const after = 2;
  const start = Math.max(0, activePosition - before);
  const end = Math.min(shardCount - 1, activePosition + after);

  for (let position = start; position <= end; position += 1) {
    positions.add(position);
  }

  return positions;
}

function estimatedShardHeight(shard: DocumentShardRecord) {
  const estimatedLines = Math.max(14, Math.ceil(shard.size_bytes / 90));

  return Math.min(1800, Math.max(360, estimatedLines * 18));
}

function shardPositionFromAnchorId(anchorId: string) {
  const match = /^(?:heading|shard)-(\d+)(?:-|$)/.exec(anchorId);

  if (!match) {
    return null;
  }

  const position = Number(match[1]);

  return Number.isInteger(position) ? position : null;
}

function textFromReactNode(value: ReactNode): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(textFromReactNode).join("");
  }

  if (value && typeof value === "object" && "props" in value) {
    const props = value.props as { children?: ReactNode };

    return textFromReactNode(props.children);
  }

  return "";
}
