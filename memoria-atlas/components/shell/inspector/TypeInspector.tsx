"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import type { TypeDetail } from "@/domain/types";
import {
  InspectorError,
  InspectorMetaRow,
} from "@/components/shell/inspector/shared";

type TypeDetailState = {
  domainSlug: string;
  error: string | null;
  isLoading: boolean;
  selectedId: string;
  type: TypeDetail | null;
};

export function TypeInspector({
  domainSlug,
  selectedId,
}: {
  domainSlug: string;
  selectedId: string;
}) {
  const [state, setState] = useState<TypeDetailState>({
    domainSlug,
    error: null,
    isLoading: true,
    selectedId,
    type: null,
  });

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/types/${selectedId}?domain=${encodeURIComponent(domainSlug)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          error?: string;
          type?: TypeDetail;
        };

        if (!response.ok || !payload.type) {
          throw new Error(payload.error ?? "Type could not be loaded.");
        }

        return payload.type;
      })
      .then((type) => {
        setState({
          domainSlug,
          error: null,
          isLoading: false,
          selectedId,
          type,
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
              : "Type could not be loaded.",
          isLoading: false,
          selectedId,
          type: null,
        });
      });

    return () => controller.abort();
  }, [domainSlug, selectedId]);

  const matchesCurrentRequest =
    state.domainSlug === domainSlug && state.selectedId === selectedId;
  const isLoading = state.isLoading || !matchesCurrentRequest;
  const type = matchesCurrentRequest ? state.type : null;
  const error = matchesCurrentRequest ? state.error : null;

  if (isLoading) {
    return <TypeInspectorSkeleton />;
  }

  if (type) {
    return <TypeInspectorCard type={type} />;
  }

  return (
    <InspectorError
      title="Type unavailable"
      message={error ?? "Type could not be loaded."}
    />
  );
}

function TypeInspectorCard({ type }: { type: TypeDetail }) {
  const description = type.description.trim();
  const captureGuidance = type.captureGuidance.trim();

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-heading text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
            Type
          </p>
          <h2 className="mt-3 truncate font-heading text-xl font-semibold">
            {type.label}
          </h2>
        </div>
        <Badge
          variant="outline"
          className="border-primary/40 bg-primary/10 text-primary"
        >
          {type.classLabel}
        </Badge>
      </div>
      <div className="grid gap-3 rounded-[var(--radius-md)] border border-border bg-card p-3">
        <InspectorMetaRow label="Class" value={type.classLabel} />
        <InspectorMetaRow label="Slug" value={type.slug} />
      </div>
      <div className="grid gap-2">
        <p className="font-mono text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Description
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {description || "No description."}
        </p>
      </div>
      <Separator />
      <div className="grid gap-2">
        <p className="font-mono text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Capture guidance
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {captureGuidance || "No capture guidance."}
        </p>
      </div>
    </section>
  );
}

function TypeInspectorSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-3 w-14" />
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-5 w-24 rounded-full" />
      <Skeleton className="h-20 w-full" />
      <Separator />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}
