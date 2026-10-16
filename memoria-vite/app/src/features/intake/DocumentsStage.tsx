import { FileText, FileUp } from "lucide-react";
import { useState, type DragEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import { titleFromFileName } from "@/lib/document-files";
import { cn } from "@/lib/utils";
import type {
  DocumentRecord,
  DocumentShardRecord,
  DocumentWorkbenchSnapshot
} from "../../types";

type DocumentsStageProps = {
  isBusy: boolean;
  onImportFile: (file: File) => Promise<boolean>;
  selectedDocumentId: string | null;
  workbench: DocumentWorkbenchSnapshot | null;
};

export function DocumentsStage({
  isBusy,
  onImportFile,
  selectedDocumentId,
  workbench
}: DocumentsStageProps) {
  const documents = workbench?.documents ?? [];
  const selectedDocument = documents.find((document) => document.id === selectedDocumentId) ?? null;
  const shards = selectedDocument ? workbench?.shardsByDocumentId[selectedDocument.id] ?? [] : [];
  const [dragDepth, setDragDepth] = useState(0);
  const [dropFeedback, setDropFeedback] = useState<{ kind: "error" | "notice"; text: string } | null>(null);
  const isDraggingFile = dragDepth > 0;

  function hasFiles(event: DragEvent<HTMLElement>) {
    return Array.from(event.dataTransfer.types).includes("Files");
  }

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    if (!hasFiles(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setDragDepth((current) => current + 1);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (!hasFiles(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = isBusy ? "none" : "copy";
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!hasFiles(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setDragDepth((current) => Math.max(0, current - 1));
  }

  async function handleDrop(event: DragEvent<HTMLDivElement>) {
    if (!hasFiles(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setDragDepth(0);
    setDropFeedback(null);

    const file = event.dataTransfer.files?.[0] ?? null;

    if (!file) {
      return;
    }

    if (isBusy) {
      setDropFeedback({ kind: "error", text: "Document import is already running." });
      return;
    }

    try {
      const deduped = await onImportFile(file);
      setDropFeedback({
        kind: "notice",
        text: deduped ? "Source already exists in this domain." : `Imported document: ${titleFromFileName(file.name)}`
      });
    } catch (error) {
      setDropFeedback({ kind: "error", text: error instanceof Error ? error.message : "Document could not be imported." });
    }
  }

  return (
    <div
      className="relative grid h-full min-h-0 w-full grid-rows-1 overflow-hidden bg-background pb-28"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={(event) => {
        void handleDrop(event);
      }}
    >
      <DocumentReader document={selectedDocument} isDraggingFile={isDraggingFile} isLoading={!workbench} shards={shards} />
      {isDraggingFile ? (
        <div className="pointer-events-none absolute inset-4 z-10 grid place-items-center rounded-lg border border-dashed border-primary/70 bg-background/80 backdrop-blur-sm">
          <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card/90 px-3 py-2 text-sm font-semibold text-foreground shadow-lg">
            <FileUp />
            <span>Drop to import document</span>
          </div>
        </div>
      ) : null}
      {dropFeedback ? (
        <p
          className={cn(
            "absolute right-6 bottom-5 z-20 m-0 max-w-md rounded-lg border border-border bg-card/95 px-3 py-2 text-xs font-medium leading-snug text-muted-foreground shadow-lg",
            dropFeedback.kind === "error" && "border-destructive/60 text-destructive"
          )}
        >
          {dropFeedback.text}
        </p>
      ) : null}
    </div>
  );
}

function DocumentReader({
  document,
  isDraggingFile,
  isLoading,
  shards
}: {
  document: DocumentRecord | null;
  isDraggingFile: boolean;
  isLoading: boolean;
  shards: DocumentShardRecord[];
}) {
  if (isLoading) {
    return <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center text-sm text-muted-foreground">Loading documents</div>;
  }

  if (!document) {
    return (
      <Empty className="h-full p-6 text-muted-foreground">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileText />
          </EmptyMedia>
          <EmptyTitle>No document selected</EmptyTitle>
          <EmptyDescription>Import a Markdown, HTML, or PDF file, then the reader will open here.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="document-reader">
      <article className={cn("document-reader-surface", isDraggingFile && "border-primary/70")}>
        <header className="document-reader-header">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{humanizeSourceType(document.source_type)}</Badge>
            <Badge variant="outline">{shards.length} {shards.length === 1 ? "shard" : "shards"}</Badge>
            <Badge variant="outline">{formatBytes(document.size_bytes)}</Badge>
          </div>
          <h1>{document.label}</h1>
          {document.source_filename ? <p>{document.source_filename}</p> : null}
        </header>
        {document.source_type === "html" ? (
          <iframe
            className="document-html-frame"
            sandbox=""
            srcDoc={combineShards(shards)}
            title={document.label}
          />
        ) : shards.length > 0 ? (
          <div className="document-markdown">
            {shards.map((shard) => (
              <section id={`shard-${shard.position}`} key={shard.id}>
                <div className="document-shard-label">Shard {shard.position + 1}</div>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{shard.body}</ReactMarkdown>
              </section>
            ))}
          </div>
        ) : (
          <p className="m-0 px-8 py-7 text-sm text-muted-foreground">This document has no readable shards yet.</p>
        )}
      </article>
    </div>
  );
}

function humanizeSourceType(sourceType: DocumentRecord["source_type"]) {
  return sourceType === "html" ? "HTML" : "Markdown";
}

function combineShards(shards: DocumentShardRecord[]) {
  return shards
    .slice()
    .sort((left, right) => left.position - right.position)
    .map((shard) => shard.body)
    .join("\n");
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
