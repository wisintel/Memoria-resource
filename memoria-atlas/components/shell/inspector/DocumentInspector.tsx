"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PreparedDocument, SourceUnitRecord } from "@/domain/documents";
import {
  DocumentMetric,
  formatDate,
  InspectorError,
  InspectorMetaRow,
  shortHash,
} from "@/components/shell/inspector/shared";

type DocumentDetailState = {
  document: PreparedDocument | null;
  domainSlug: string;
  error: string | null;
  isLoading: boolean;
  selectedId: string;
};

export function DocumentInspector({
  domainSlug,
  selectedId,
}: {
  domainSlug: string;
  selectedId: string;
}) {
  const [state, setState] = useState<DocumentDetailState>({
    document: null,
    domainSlug,
    error: null,
    isLoading: true,
    selectedId,
  });

  useEffect(() => {
    const controller = new AbortController();

    fetch(
      `/api/documents/${selectedId}?domain=${encodeURIComponent(domainSlug)}`,
      {
        signal: controller.signal,
      }
    )
      .then(async (response) => {
        const payload = (await response.json()) as {
          document?: PreparedDocument;
          error?: string;
        };

        if (!response.ok || !payload.document) {
          throw new Error(payload.error ?? "Document could not be loaded.");
        }

        return payload.document;
      })
      .then((document) => {
        setState({
          document,
          domainSlug,
          error: null,
          isLoading: false,
          selectedId,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          document: null,
          domainSlug,
          error:
            error instanceof Error
              ? error.message
              : "Document could not be loaded.",
          isLoading: false,
          selectedId,
        });
      });

    return () => controller.abort();
  }, [domainSlug, selectedId]);

  const matchesCurrentRequest =
    state.domainSlug === domainSlug && state.selectedId === selectedId;
  const isLoading = state.isLoading || !matchesCurrentRequest;
  const document = matchesCurrentRequest ? state.document : null;
  const error = matchesCurrentRequest ? state.error : null;

  if (isLoading) {
    return <DocumentInspectorSkeleton />;
  }

  if (document) {
    return <DocumentInspectorCard prepared={document} />;
  }

  return (
    <InspectorError
      title="Document unavailable"
      message={error ?? "Document could not be loaded."}
    />
  );
}

function DocumentInspectorCard({ prepared }: { prepared: PreparedDocument }) {
  const { document, sourceUnits, toc } = prepared;
  const sourceLabel =
    document.sourceFilename ?? document.sourceUrl ?? "Prepared Markdown source";
  const unitBodyLength = sourceUnits.reduce(
    (total, unit) => total + unit.body.length,
    0
  );

  return (
    <section className="flex min-h-0 flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-heading text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
            Document
          </p>
          <h2 className="mt-3 truncate font-heading text-xl font-semibold">
            {document.label}
          </h2>
        </div>
        <Badge
          variant="outline"
          className="border-primary/40 bg-primary/10 text-primary"
        >
          {document.preparationState}
        </Badge>
      </div>

      <p className="text-sm leading-relaxed text-muted-foreground">
        {sourceLabel}
      </p>

      {document.errorMessage ? (
        <p className="rounded-[var(--radius-md)] border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {document.errorMessage}
        </p>
      ) : null}

      <Separator />

      <div className="grid grid-cols-2 gap-2">
        <DocumentMetric label="Source Units" value={sourceUnits.length} />
        <DocumentMetric label="Size" value={formatBytes(document.sizeBytes)} />
        <DocumentMetric label="Body" value={formatBytes(unitBodyLength)} />
        <DocumentMetric label="Format" value={document.sourceType} />
      </div>

      <DocumentMetadata prepared={prepared} />

      <DocumentOutline entries={toc} sourceUnits={sourceUnits} />
    </section>
  );
}

function DocumentMetadata({ prepared }: { prepared: PreparedDocument }) {
  const { document } = prepared;

  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-card p-3 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold">Metadata</h3>
      <div className="grid gap-3">
        <InspectorMetaRow
          label="Source"
          value={document.sourceFilename ?? document.sourceUrl ?? "n/a"}
        />
        <InspectorMetaRow label="MIME" value={document.mimeType ?? "n/a"} />
        <InspectorMetaRow
          label="Content"
          value={shortHash(document.contentSha256)}
        />
        <InspectorMetaRow label="Body" value={shortHash(document.bodySha256)} />
        <InspectorMetaRow
          label="Updated"
          value={formatDate(document.updatedAt)}
        />
      </div>
    </div>
  );
}

function DocumentOutline({
  entries,
  sourceUnits,
}: {
  entries: PreparedDocument["toc"];
  sourceUnits: SourceUnitRecord[];
}) {
  const defaultTab = entries.length ? "outline" : "units";

  return (
    <section className="flex h-[32rem] min-h-0 flex-col overflow-hidden rounded-[var(--radius-md)] border border-border bg-card p-3 shadow-sm">
      <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Navigation</h3>
        <Badge variant="secondary">{sourceUnits.length}</Badge>
      </div>
      <Tabs
        defaultValue={defaultTab}
        className="min-h-0 flex-1 overflow-hidden"
      >
        <TabsList className="grid w-full shrink-0 grid-cols-2 rounded-[var(--radius-sm)]">
          <TabsTrigger
            value="outline"
            className="min-w-0 gap-1 rounded-[calc(var(--radius-sm)-2px)] px-1 text-xs"
          >
            Outline
          </TabsTrigger>
          <TabsTrigger
            value="units"
            className="min-w-0 gap-1 rounded-[calc(var(--radius-sm)-2px)] px-1 text-xs"
          >
            Units
          </TabsTrigger>
        </TabsList>
        <TabsContent
          value="outline"
          className="mt-3 min-h-0 flex-1 overflow-hidden"
        >
          <ScrollArea className="h-full">
            {entries.length > 0 ? (
              <nav aria-label="Document outline" className="space-y-1 pr-2">
                {entries.map((entry) => (
                  <a
                    key={entry.anchorId}
                    href={`#${entry.anchorId}`}
                    className="block rounded-[var(--radius-sm)] px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    style={{ paddingLeft: `${0.5 + entry.depth * 0.75}rem` }}
                  >
                    {entry.label}
                  </a>
                ))}
              </nav>
            ) : (
              <p className="p-2 text-sm text-muted-foreground">
                No headings were detected.
              </p>
            )}
          </ScrollArea>
        </TabsContent>
        <TabsContent
          value="units"
          className="mt-3 min-h-0 flex-1 overflow-hidden"
        >
          <ScrollArea className="h-full">
            <nav aria-label="Source units" className="space-y-1 pr-2">
              {sourceUnits.map((unit) => (
                <a
                  key={unit.id}
                  href={`#source-unit-${unit.position}`}
                  className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] px-2 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <span>Unit {unit.position + 1}</span>
                  <span>{formatBytes(unit.sizeBytes)}</span>
                </a>
              ))}
            </nav>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </section>
  );
}

function DocumentInspectorSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-5 w-28 rounded-full" />
      <Skeleton className="h-12 w-full" />
      <Separator />
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
      <div className="rounded-[var(--radius-md)] border border-border p-3">
        <Skeleton className="mb-3 h-4 w-20" />
        <div className="grid gap-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </div>
    </div>
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
