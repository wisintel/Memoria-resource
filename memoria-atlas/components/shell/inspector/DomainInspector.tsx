"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import type { DomainOverview } from "@/domain/domains";
import {
  DocumentMetric,
  InspectorError,
} from "@/components/shell/inspector/shared";

type DomainOverviewState = {
  domainSlug: string;
  error: string | null;
  isLoading: boolean;
  overview: DomainOverview | null;
};

export function DomainInspector({ domainSlug }: { domainSlug: string }) {
  const [state, setState] = useState<DomainOverviewState>({
    domainSlug,
    error: null,
    isLoading: true,
    overview: null,
  });

  useEffect(() => {
    const controller = new AbortController();

    fetch(
      `/api/domains?slug=${encodeURIComponent(domainSlug)}&include=overview`,
      {
        signal: controller.signal,
      }
    )
      .then(async (response) => {
        const payload = (await response.json()) as {
          error?: string;
          overview?: DomainOverview;
        };

        if (!response.ok || !payload.overview) {
          throw new Error(
            payload.error ?? "Domain overview could not be loaded."
          );
        }

        return payload.overview;
      })
      .then((overview) => {
        setState({
          domainSlug,
          error: null,
          isLoading: false,
          overview,
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
              : "Domain overview could not be loaded.",
          isLoading: false,
          overview: null,
        });
      });

    return () => controller.abort();
  }, [domainSlug]);
  const isLoading = state.isLoading || state.domainSlug !== domainSlug;
  const overview = state.domainSlug === domainSlug ? state.overview : null;
  const error = state.domainSlug === domainSlug ? state.error : null;

  if (isLoading) {
    return <DomainOverviewSkeleton />;
  }

  if (overview) {
    return <DomainOverviewCard overview={overview} />;
  }

  return (
    <InspectorError
      title="Domain unavailable"
      message={error ?? "Domain overview could not be loaded."}
    />
  );
}

function DomainOverviewCard({ overview }: { overview: DomainOverview }) {
  const description = overview.domain.description?.trim();

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-heading text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
            Domain
          </p>
          <h2 className="mt-3 truncate font-heading text-xl font-semibold">
            {overview.domain.label}
          </h2>
        </div>
        {overview.status ? (
          <Badge variant="outline">{overview.status.label}</Badge>
        ) : null}
      </div>

      {description ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        {overview.inventory.map((item) => (
          <DocumentMetric
            key={item.key}
            label={item.label}
            value={item.count}
          />
        ))}
      </div>
    </section>
  );
}

function DomainOverviewSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-16 w-full" />
      <Separator />
      <div className="rounded-[var(--radius-md)] border border-border p-3">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-5 w-10 rounded-full" />
        </div>
        <div className="flex flex-col gap-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-5 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
