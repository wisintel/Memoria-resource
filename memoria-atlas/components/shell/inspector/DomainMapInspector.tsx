"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import type { DomainMapSnapshot } from "@/domain/domain-maps";
import { InspectorError } from "@/components/shell/inspector/shared";

type DomainMapDetailState = {
  domainSlug: string;
  error: string | null;
  isLoading: boolean;
  selectedId: string;
  snapshot: DomainMapSnapshot | null;
};

export function DomainMapInspector({
  domainSlug,
  selectedId,
}: {
  domainSlug: string;
  selectedId: string;
}) {
  const [state, setState] = useState<DomainMapDetailState>({
    domainSlug,
    error: null,
    isLoading: true,
    selectedId,
    snapshot: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ domain: domainSlug, map: selectedId });

    fetch(`/api/domain-maps?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          error?: string;
          snapshot?: DomainMapSnapshot;
        };

        if (!response.ok || !payload.snapshot) {
          throw new Error(payload.error ?? "Domain Map could not be loaded.");
        }

        if (payload.snapshot.activeMap?.id !== selectedId) {
          throw new Error("Domain Map could not be found in this domain.");
        }

        return payload.snapshot;
      })
      .then((snapshot) => {
        setState({
          domainSlug,
          error: null,
          isLoading: false,
          selectedId,
          snapshot,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          domainSlug,
          error:
            error instanceof Error
              ? error.message
              : "Domain Map could not be loaded.",
          isLoading: false,
          selectedId,
          snapshot: null,
        });
      });

    return () => controller.abort();
  }, [domainSlug, selectedId]);

  const matchesCurrentRequest =
    state.domainSlug === domainSlug && state.selectedId === selectedId;
  const isLoading = state.isLoading || !matchesCurrentRequest;
  const snapshot = matchesCurrentRequest ? state.snapshot : null;
  const error = matchesCurrentRequest ? state.error : null;

  if (isLoading) {
    return <DomainMapInspectorSkeleton />;
  }

  if (snapshot?.activeMap) {
    return <DomainMapInspectorCard snapshot={snapshot} />;
  }

  return (
    <InspectorError
      title="Domain Map unavailable"
      message={error ?? "Domain Map could not be loaded."}
    />
  );
}

function DomainMapInspectorCard({ snapshot }: { snapshot: DomainMapSnapshot }) {
  const map = snapshot.activeMap;

  if (!map) {
    return null;
  }

  const intent = map.description?.trim() ?? "";

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-heading text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
            Domain Map
          </p>
          <h2 className="mt-3 truncate font-heading text-xl font-semibold">
            {map.label}
          </h2>
        </div>
        {map.statusLabel ? (
          <Badge
            variant="outline"
            className="border-primary/40 bg-primary/10 text-primary"
          >
            {map.statusLabel}
          </Badge>
        ) : null}
      </div>

      {map.mapKindLabel ? (
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{map.mapKindLabel}</Badge>
        </div>
      ) : null}

      {intent ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {intent}
        </p>
      ) : (
        <p className="text-sm leading-relaxed text-muted-foreground">
          No map intent.
        </p>
      )}

      <Separator />

      <div className="grid grid-cols-2 gap-2">
        <DomainMapMetric label="Nodes" value={snapshot.nodes.length} />
        <DomainMapMetric label="Edges" value={snapshot.relationships.length} />
      </div>
    </section>
  );
}

function DomainMapMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-card px-3 py-2 shadow-sm">
      <div className="font-mono text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-1 font-heading text-lg font-semibold tabular-nums">
        {value}
      </div>
    </div>
  );
}

function DomainMapInspectorSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-5 w-24 rounded-full" />
      <Skeleton className="h-16 w-full" />
      <Separator />
      <div className="grid grid-cols-3 gap-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
      <div className="rounded-[var(--radius-md)] border border-border p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-5 w-8 rounded-full" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-5 w-28 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      </div>
    </div>
  );
}
