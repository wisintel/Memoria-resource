"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { RelationshipDetail } from "@/domain/relationships";
import { InspectorError } from "@/components/shell/inspector/shared";

type RelationshipDetailState = {
  domainSlug: string;
  error: string | null;
  isLoading: boolean;
  relationship: RelationshipDetail | null;
  selectedId: string;
};

export function RelationshipInspector({
  domainSlug,
  selectedId,
}: {
  domainSlug: string;
  selectedId: string;
}) {
  const [state, setState] = useState<RelationshipDetailState>({
    domainSlug,
    error: null,
    isLoading: true,
    relationship: null,
    selectedId,
  });

  useEffect(() => {
    const controller = new AbortController();

    fetch(
      `/api/relationships/${selectedId}?domain=${encodeURIComponent(domainSlug)}`,
      {
        signal: controller.signal,
      }
    )
      .then(async (response) => {
        const payload = (await response.json()) as {
          error?: string;
          relationship?: RelationshipDetail;
        };

        if (!response.ok || !payload.relationship) {
          throw new Error(payload.error ?? "Relationship could not be loaded.");
        }

        return payload.relationship;
      })
      .then((relationship) => {
        setState({
          domainSlug,
          error: null,
          isLoading: false,
          relationship,
          selectedId,
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
              : "Relationship could not be loaded.",
          isLoading: false,
          relationship: null,
          selectedId,
        });
      });

    return () => controller.abort();
  }, [domainSlug, selectedId]);

  const matchesCurrentRequest =
    state.domainSlug === domainSlug && state.selectedId === selectedId;
  const isLoading = state.isLoading || !matchesCurrentRequest;
  const relationship = matchesCurrentRequest ? state.relationship : null;
  const error = matchesCurrentRequest ? state.error : null;

  if (isLoading) {
    return <RelationshipInspectorSkeleton />;
  }

  if (relationship) {
    return <RelationshipInspectorCard relationship={relationship} />;
  }

  return (
    <InspectorError
      title="Relationship unavailable"
      message={error ?? "Relationship could not be loaded."}
    />
  );
}

function RelationshipInspectorCard({
  relationship,
}: {
  relationship: RelationshipDetail;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-heading text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
            Relationship
          </p>
          <h2 className="mt-3 truncate font-heading text-xl font-semibold">
            {relationship.displayTitle}
          </h2>
        </div>
      </div>
      <div className="rounded-[var(--radius-md)] border border-border bg-card p-3 shadow-sm">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 text-sm">
          <span className="truncate font-medium">
            {relationship.source.label}
          </span>
          <span className="text-primary">{"->"}</span>
          <span className="truncate text-right font-medium">
            {relationship.target.label}
          </span>
        </div>
      </div>
    </section>
  );
}

function RelationshipInspectorSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}
