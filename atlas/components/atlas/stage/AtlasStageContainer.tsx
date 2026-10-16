"use client";

import { createAtlasDocument } from "@/app/atlas/actions";
import { FileUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { DocumentIntakeActions } from "@/components/atlas/composer/MemoriaComposer";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DocumentReader } from "./DocumentReader";
import { DistillationStagePanel } from "./DistillationStagePanel";
import {
  GraphStagePanel,
  type ActiveGraphDrag,
} from "./GraphStagePanel";
import type {
  ClassRecord,
  ClassTableSamples,
  DocumentRecord,
  DocumentShardRecord,
  SelectedViewRecords,
} from "@/lib/supabase/client";
import type { DragEvent, ReactNode, RefObject } from "react";
import { cn } from "@/lib/utils";

import { AtlasStageHero } from "./AtlasStageHero";

type AtlasStageContainerProps = {
  activeGraphDrag: ActiveGraphDrag | null;
  activeGraphDragRef: RefObject<ActiveGraphDrag | null>;
  activeModeId: string;
  classes: ClassRecord[];
  clearActiveGraphDrag: () => void;
  documents: DocumentRecord[];
  documentIntakeActionsRef: RefObject<DocumentIntakeActions | null>;
  onDistillationDocumentSelect: (documentId: string) => void;
  onDocumentSelect: (documentId: string) => void;
  onGraphRecordSelect: (selection: { recordId: string; tableName: string } | null) => void;
  selectedDistillationDocumentId: string | null;
  selectedDocumentId: string | null;
  selectedDomainId: string | null;
  selectedViewId: string | null;
  selectedViewRecords: SelectedViewRecords;
  shardsByDocumentId: Record<string, DocumentShardRecord[]>;
  tableSamples: ClassTableSamples;
};

const canvasStageClassName =
  "relative z-[1] h-full min-h-full overflow-hidden bg-background before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(100%_88%_at_50%_50%,transparent_62%,color-mix(in_oklch,var(--background)_52%,transparent)_100%)] before:opacity-70 before:content-['']";
const documentCanvasStageClassName = "pb-[180px]";

export function AtlasStageContainer({
  activeGraphDrag,
  activeGraphDragRef,
  activeModeId,
  classes,
  clearActiveGraphDrag,
  documents,
  documentIntakeActionsRef,
  onDistillationDocumentSelect,
  onDocumentSelect,
  onGraphRecordSelect,
  selectedDistillationDocumentId,
  selectedDocumentId,
  selectedDomainId,
  selectedViewId,
  selectedViewRecords,
  shardsByDocumentId,
  tableSamples,
}: AtlasStageContainerProps) {
  const router = useRouter();
  const [dropActive, setDropActive] = useState(false);
  const [dropFeedback, setDropFeedback] = useState<{ kind: "error" | "notice"; message: string } | null>(null);
  const [isImportingDrop, startDropImportTransition] = useTransition();

  if (activeModeId === "atlas") {
    return <AtlasStageHero />;
  }

  if (activeModeId === "graph") {
    return (
      <GraphStagePanel
        activeGraphDrag={activeGraphDrag}
        activeGraphDragRef={activeGraphDragRef}
        classes={classes}
        clearActiveGraphDrag={clearActiveGraphDrag}
        routePath="/atlas"
        onRecordSelect={onGraphRecordSelect}
        selectedDomainId={selectedDomainId}
        selectedViewId={selectedViewId}
        selectedViewRecords={selectedViewRecords}
        tableSamples={tableSamples}
      />
    );
  }

  const selectedDocument = documents.find((document) => document.id === selectedDocumentId) ?? null;

  function handleDocumentDragOver(event: DragEvent<HTMLDivElement>) {
    if (!hasFiles(event) || activeModeId !== "documents") {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDropActive(true);
  }

  function handleDocumentDragLeave(event: DragEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget;

    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }

    setDropActive(false);
  }

  function handleDocumentDrop(event: DragEvent<HTMLDivElement>) {
    if (activeModeId !== "documents") {
      return;
    }

    event.preventDefault();
    setDropActive(false);

    const files = Array.from(event.dataTransfer.files).filter(isImportableDocumentFile);

    if (!selectedDomainId) {
      setDropFeedback({ kind: "error", message: "Select a domain before importing source material." });
      return;
    }

    if (files.length === 0) {
      setDropFeedback({ kind: "error", message: "Only Markdown and HTML files can be imported." });
      return;
    }

    startDropImportTransition(() => {
      void importDroppedDocuments(files, selectedDomainId);
    });
  }

  async function importDroppedDocuments(files: File[], domainId: string) {
    let importedCount = 0;
    let dedupedCount = 0;

    try {
      for (const file of files) {
        const sourceType = isHtmlDocumentFile(file) ? "html" : "markdown";
        const title = titleFromFileName(file.name);
        const result = await createAtlasDocument({
          content: await file.text(),
          domainId,
          mimeType: file.type || mimeTypeForSource(sourceType),
          sourceFilename: file.name,
          sourceType,
          title,
        });

        if (!result.ok) {
          setDropFeedback({ kind: "error", message: result.error ?? "Document could not be imported." });
          return;
        }

        if (result.deduped) {
          dedupedCount += 1;
        } else {
          importedCount += 1;
        }
      }

      setDropFeedback({
        kind: "notice",
        message:
          dedupedCount > 0 && importedCount === 0
            ? "Source already exists in this domain."
            : importedCount === 1
            ? "Imported 1 document."
            : `Imported ${importedCount} documents.`,
      });
      router.refresh();
    } catch (error) {
      setDropFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Document could not be imported.",
      });
    }
  }

  if (activeModeId === "distillation") {
    return (
      <DistillationStagePanel
        document={selectedDocument}
        documents={documents}
        onDocumentChange={onDistillationDocumentSelect}
        selectedDocumentId={selectedDistillationDocumentId}
        shards={selectedDocument ? (shardsByDocumentId[selectedDocument.id] ?? []) : []}
      />
    );
  }

  return (
    <div
      className={cn(canvasStageClassName, documentCanvasStageClassName)}
      onDragLeave={handleDocumentDragLeave}
      onDragOver={handleDocumentDragOver}
      onDrop={handleDocumentDrop}
    >
      <DocumentLibraryToolbar
        documents={documents}
        intakeActionsRef={documentIntakeActionsRef}
        onDocumentSelect={onDocumentSelect}
        selectedDocumentId={selectedDocument?.id ?? null}
      />
      <div className="h-full max-h-full">
        <DocumentReader
          document={selectedDocument}
          emptyDescription="Select a document from the shelf."
          shards={selectedDocument ? (shardsByDocumentId[selectedDocument.id] ?? []) : []}
        />
      </div>
      {dropActive || isImportingDrop ? (
        <div className="pointer-events-none absolute inset-0 z-50 grid place-items-center bg-background/70 backdrop-blur-sm">
          <div className="flex min-w-64 flex-col items-center gap-3 rounded-lg border border-primary/35 bg-card/95 px-5 py-4 text-center shadow-xl">
            <FileUp aria-hidden={true} className="size-6 text-primary" />
            <p className="text-sm font-medium">
              {isImportingDrop ? "Importing source" : "Drop Markdown or HTML files"}
            </p>
          </div>
        </div>
      ) : null}
      {dropFeedback ? (
        <div
          className={cn(
            "absolute right-5 bottom-48 z-50 max-w-sm rounded-md border bg-popover px-3 py-2 text-sm shadow-lg",
            dropFeedback.kind === "error"
              ? "border-destructive/30 text-destructive"
              : "border-primary/30 text-foreground",
          )}
        >
          {dropFeedback.message}
        </div>
      ) : null}
    </div>
  );
}

function hasFiles(event: DragEvent<HTMLDivElement>) {
  return Array.from(event.dataTransfer.types).includes("Files");
}

function isImportableDocumentFile(file: File) {
  return isMarkdownDocumentFile(file) || isHtmlDocumentFile(file);
}

function isMarkdownDocumentFile(file: File) {
  return /\.(md|markdown)$/i.test(file.name) || file.type === "text/markdown";
}

function isHtmlDocumentFile(file: File) {
  return /\.(html|htm)$/i.test(file.name) || file.type === "text/html";
}

function mimeTypeForSource(sourceType: "html" | "markdown") {
  return sourceType === "html" ? "text/html" : "text/markdown";
}

function titleFromFileName(fileName: string) {
  return fileName.replace(/\.[^.]+$/i, "").replaceAll(/[-_]+/g, " ").trim() || "Untitled document";
}

function DocumentLibraryToolbar({
  documents,
  intakeActionsRef,
  onDocumentSelect,
  selectedDocumentId,
}: {
  documents: DocumentRecord[];
  intakeActionsRef: RefObject<DocumentIntakeActions | null>;
  onDocumentSelect: (documentId: string) => void;
  selectedDocumentId: string | null;
}) {
  return (
    <div className="absolute top-4 left-1/2 z-40 flex min-h-10 w-[min(398px,calc(100%_-_112px))] -translate-x-1/2 flex-wrap items-center gap-1 rounded-lg border border-border bg-background/95 p-1.5 shadow-lg backdrop-blur max-[700px]:right-3 max-[700px]:left-3 max-[700px]:w-auto max-[700px]:max-w-none max-[700px]:translate-x-0">
      <Select
        value={selectedDocumentId ?? ""}
        onValueChange={(documentId) => {
          if (documentId) {
            onDocumentSelect(documentId);
          }
        }}
      >
        <SelectTrigger
          aria-label="Document"
          className="min-w-0 flex-1 justify-between sm:max-w-52 sm:min-w-36"
          disabled={documents.length === 0}
          size="sm"
        >
          <SelectValue className="min-w-0" placeholder="Document">
            {(value: string | null) => {
              const document = documents.find((candidate) => candidate.id === value);
              const label = document?.label ?? "Document";

              return (
                <>
                  <span className="shrink-0 text-xs font-medium text-muted-foreground uppercase">
                    Document
                  </span>
                  <span className="min-w-0 truncate">{label}</span>
                </>
              );
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {documents.map((document) => (
              <SelectItem key={document.id} value={document.id}>
                {document.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      <div className="ml-auto flex gap-1 border-l border-border pl-1">
        <DocumentToolbarButton label="Upload document" onClick={() => intakeActionsRef.current?.upload()}>
          <FileUp aria-hidden={true} />
        </DocumentToolbarButton>
      </div>
    </div>
  );
}

function DocumentToolbarButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  const button = (
    <Button aria-label={label} onClick={onClick} size="icon" type="button" variant="ghost">
      {children}
    </Button>
  );

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
