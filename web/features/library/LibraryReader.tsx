import { Fragment, type ReactNode } from "react";
import type { ComponentPropsWithoutRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { PreparedDocument, SourceUnitRecord } from "@/domain/documents";
import { headingAnchorId } from "@/lib/documents/document-toc";
import { cleanMarkdownArtifacts } from "@/lib/documents/markdown-cleanup";
import { cn } from "@/lib/utils";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

type LibraryReaderProps = {
  prepared: PreparedDocument | null;
  selectedId: string | null;
};

type HeadingProps = ComponentPropsWithoutRef<"h1"> & {
  node?: unknown;
};

export function LibraryReader({ prepared, selectedId }: LibraryReaderProps) {
  if (!selectedId) {
    return (
      <ReaderEmpty
        title="Select a document"
        description="Choose a prepared document from the Library shelf. Shape the domain in Workshop before extraction."
      />
    );
  }

  if (!prepared) {
    return (
      <ReaderEmpty
        title="Document unavailable"
        description="The selected document was not found in this domain."
      />
    );
  }

  const { document, sourceUnits } = prepared;

  if (sourceUnits.length === 0) {
    return (
      <ReaderEmpty
        title="No readable body"
        description="This document has metadata but no prepared source units yet."
      />
    );
  }

  if (document.sourceType === "html") {
    return (
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardContent className="min-h-0 flex-1 p-0">
          <HtmlDocumentFrame
            html={combineSourceUnits(sourceUnits)}
            title={document.label}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <CardContent className="min-h-0 flex-1 p-0">
        <ScrollArea className="h-full min-h-0">
          <article className="w-full px-5 py-6 pb-56 lg:px-8">
            <div className="space-y-6">
              {sourceUnits.map((unit) => (
                <SourceUnit key={unit.id} unit={unit} />
              ))}
            </div>
          </article>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function HtmlDocumentFrame({ html, title }: { html: string; title: string }) {
  return (
    <div className="h-full min-h-0 w-full overflow-hidden bg-white">
      <iframe
        className="h-full min-h-0 w-full bg-white"
        referrerPolicy="no-referrer"
        sandbox=""
        srcDoc={html}
        title={title}
      />
    </div>
  );
}

function combineSourceUnits(sourceUnits: SourceUnitRecord[]) {
  return [...sourceUnits]
    .sort((left, right) => left.position - right.position)
    .map((unit) => unit.body)
    .join("");
}

function SourceUnit({ unit }: { unit: SourceUnitRecord }) {
  const headingPath = Array.isArray(unit.headingPath)
    ? unit.headingPath.filter(
        (entry): entry is string => typeof entry === "string"
      )
    : [];

  return (
    <section
      id={`source-unit-${unit.position}`}
      tabIndex={-1}
      className="scroll-mt-6 rounded-[var(--radius-md)] border bg-card p-5 font-serif shadow-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/25 lg:p-7"
    >
      <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="font-mono text-xs text-muted-foreground">
            Source Unit {unit.position + 1}
          </p>
          <p className="truncate text-sm text-muted-foreground">
            {headingPath.length > 0 ? headingPath.join(" / ") : "Root"}
          </p>
        </div>
        <Badge variant="outline">{formatBytes(unit.sizeBytes)}</Badge>
      </header>
      <div className="space-y-3">
        {renderMarkdownSource(unit.body, unit.position)}
      </div>
    </section>
  );
}

function renderMarkdownSource(body: string, sourceUnitPosition: number) {
  return (
    <ReactMarkdown
      components={createMarkdownComponents(sourceUnitPosition)}
      remarkPlugins={[remarkGfm]}
    >
      {preprocessMarkdown(body)}
    </ReactMarkdown>
  );
}

function createMarkdownComponents(sourceUnitPosition: number): Components {
  const headingOccurrences = new Map<string, number>();

  function heading(Tag: "h2" | "h3" | "h4" | "h5" | "h6", className: string) {
    function MarkdownHeading({ node, children, ...props }: HeadingProps) {
      void node;
      const label = textFromReactNode(children);
      const baseAnchorId = headingAnchorId(sourceUnitPosition, label);
      const occurrence = (headingOccurrences.get(baseAnchorId) ?? 0) + 1;
      const anchorId = headingAnchorId(sourceUnitPosition, label, occurrence);

      headingOccurrences.set(baseAnchorId, occurrence);

      return (
        <Tag
          className={cn(
            "scroll-mt-8 font-serif tracking-normal text-foreground",
            className
          )}
          id={anchorId}
          {...props}
        >
          {children}
        </Tag>
      );
    }

    MarkdownHeading.displayName = `MarkdownHeading${Tag.toUpperCase()}`;

    return MarkdownHeading;
  }

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
            className
          )}
          {...props}
        />
      );
    },
    h1: heading(
      "h2",
      "mt-11 border-b border-border/70 pb-3 text-3xl font-semibold leading-tight first:mt-0"
    ),
    h2: heading("h3", "mt-10 text-2xl font-semibold leading-snug first:mt-0"),
    h3: heading("h4", "mt-8 text-xl font-semibold leading-snug first:mt-0"),
    h4: heading("h5", "mt-7 text-lg font-semibold leading-snug first:mt-0"),
    h5: heading("h6", "mt-6 text-base font-semibold leading-snug first:mt-0"),
    h6: heading(
      "h6",
      "mt-6 font-mono text-xs font-semibold uppercase leading-snug tracking-[0.14em] text-muted-foreground first:mt-0"
    ),
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
          <img
            alt={alt ?? ""}
            className="h-auto max-h-[70vh] w-full object-contain"
            src={src}
            {...props}
          />
          {alt ? (
            <span className="block border-t border-border/70 px-3 py-2 font-mono text-xs text-muted-foreground">
              {alt}
            </span>
          ) : null}
        </span>
      );
    },
    li: ({ node, children, ...props }) => {
      void node;

      return (
        <li className="pl-1 leading-7 marker:text-muted-foreground" {...props}>
          {renderMarkdownBreaks(children)}
        </li>
      );
    },
    ol: ({ node, ...props }) => {
      void node;

      return (
        <ol
          className="my-5 list-decimal space-y-2 pl-6 text-[0.98rem] text-foreground/90"
          {...props}
        />
      );
    },
    p: ({ node, children, ...props }) => {
      void node;

      return (
        <p
          className="my-5 font-serif text-[0.98rem] leading-7 text-foreground/90"
          {...props}
        >
          {renderMarkdownBreaks(children)}
        </p>
      );
    },
    pre: ({ node, ...props }) => {
      void node;

      return (
        <pre
          className="my-6 overflow-x-auto rounded-lg border border-border/80 bg-background/80 p-4 font-mono text-sm leading-6 shadow-inner shadow-black/20 [&_code]:border-0 [&_code]:bg-transparent [&_code]:p-0"
          {...props}
        />
      );
    },
    table: ({ node, ...props }) => {
      void node;

      return (
        <div className="my-7 overflow-x-auto rounded-lg border border-border/75 bg-background/45">
          <table
            className="w-full min-w-[560px] border-collapse text-left text-sm"
            {...props}
          />
        </div>
      );
    },
    td: ({ node, children, ...props }) => {
      void node;

      return (
        <td
          className="border-t border-border/70 px-4 py-3 align-top leading-6 whitespace-normal text-foreground/80 break-words [overflow-wrap:anywhere]"
          {...props}
        >
          {renderMarkdownBreaks(children)}
        </td>
      );
    },
    th: ({ node, children, ...props }) => {
      void node;

      return (
        <th
          className="border-b border-border/80 bg-muted/25 px-4 py-3 align-bottom font-mono text-[11px] font-semibold tracking-[0.08em] whitespace-normal text-muted-foreground uppercase break-words [overflow-wrap:anywhere]"
          {...props}
        >
          {renderMarkdownBreaks(children)}
        </th>
      );
    },
    ul: ({ node, ...props }) => {
      void node;

      return (
        <ul
          className="my-5 list-disc space-y-2 pl-6 text-[0.98rem] text-foreground/90"
          {...props}
        />
      );
    },
  };
}

function textFromReactNode(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(textFromReactNode).join("");
  }

  if (typeof node === "object" && node && "props" in node) {
    const props = (node as { props?: { children?: ReactNode } }).props;

    if (props?.children) {
      return textFromReactNode(props.children);
    }
  }

  return "";
}

function renderMarkdownBreaks(node: ReactNode): ReactNode {
  if (typeof node === "string" || typeof node === "number") {
    const parts = String(node).split(/(<br\s*\/?>|&lt;\s*br\s*\/?\s*&gt;)/i);

    if (parts.length === 1) {
      return node;
    }

    return parts
      .filter((part) => part.length > 0)
      .map((part, index) =>
        /^(<br\s*\/?>|&lt;\s*br\s*\/?\s*&gt;)$/i.test(part) ? (
          <br key={index} />
        ) : (
          <Fragment key={index}>{part}</Fragment>
        )
      );
  }

  if (Array.isArray(node)) {
    return node.map((child, index) => (
      <Fragment key={index}>{renderMarkdownBreaks(child)}</Fragment>
    ));
  }

  return node;
}

function preprocessMarkdown(markdown: string) {
  return stripUnavailableMarkdownImages(cleanMarkdownArtifacts(markdown))
    .replace(/\s*\(cid:\d+\)\s*/g, " · ")
    .replace(/\s+·\s*$/gm, "");
}

function stripUnavailableMarkdownImages(markdown: string) {
  return markdown.replace(
    /!\[[^\]\n]*\]\(([^)\n]+)\)/g,
    (match, rawSource: string) => {
      const source = rawSource.trim().split(/\s+/)[0]?.replace(/^<|>$/g, "");

      return isUnavailableMarkdownImageSource(source) ? "" : match;
    }
  );
}

function isUnavailableMarkdownImageSource(source: unknown) {
  if (typeof source !== "string" || source.trim() === "") {
    return true;
  }

  const trimmedSource = source.trim();

  return !/^(https?:|data:|blob:|\/)/i.test(trimmedSource);
}

function ReaderEmpty({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <Empty className="min-h-96 flex-1 border bg-card">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
