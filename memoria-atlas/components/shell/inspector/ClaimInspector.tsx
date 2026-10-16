"use client";

import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ButtonGroup } from "@/components/ui/button-group";
import { FieldError } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import type { ClaimDetail } from "@/domain/claims";
import {
  AddClaimTargetDialog,
  RelatedEmpty,
  RelatedToolbarButton,
} from "@/components/shell/inspector/related";
import { InspectorError } from "@/components/shell/inspector/shared";

type ClaimDetailState = {
  claim: ClaimDetail | null;
  domainSlug: string;
  error: string | null;
  isLoading: boolean;
  selectedId: string;
};

export function ClaimInspector({
  domainSlug,
  selectedId,
}: {
  domainSlug: string;
  selectedId: string;
}) {
  const [state, setState] = useState<ClaimDetailState>({
    claim: null,
    domainSlug,
    error: null,
    isLoading: true,
    selectedId,
  });
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    fetch(
      `/api/claims/${selectedId}?domain=${encodeURIComponent(domainSlug)}`,
      {
        signal: controller.signal,
      }
    )
      .then(async (response) => {
        const payload = (await response.json()) as {
          claim?: ClaimDetail;
          error?: string;
        };

        if (!response.ok || !payload.claim) {
          throw new Error(payload.error ?? "Claim could not be loaded.");
        }

        return payload.claim;
      })
      .then((claim) => {
        setState({
          claim,
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
          claim: null,
          domainSlug,
          error:
            error instanceof Error
              ? error.message
              : "Claim could not be loaded.",
          isLoading: false,
          selectedId,
        });
      });

    return () => controller.abort();
  }, [domainSlug, refreshKey, selectedId]);

  const matchesCurrentRequest =
    state.domainSlug === domainSlug && state.selectedId === selectedId;
  const isLoading = state.isLoading || !matchesCurrentRequest;
  const claim = matchesCurrentRequest ? state.claim : null;
  const error = matchesCurrentRequest ? state.error : null;

  if (isLoading) {
    return <ClaimInspectorSkeleton />;
  }

  if (claim) {
    return (
      <ClaimInspectorCard
        claim={claim}
        domainSlug={domainSlug}
        onRelatedChange={() => setRefreshKey((current) => current + 1)}
      />
    );
  }

  return (
    <InspectorError
      title="Claim unavailable"
      message={error ?? "Claim could not be loaded."}
    />
  );
}

function ClaimInspectorCard({
  claim,
  domainSlug,
  onRelatedChange,
}: {
  claim: ClaimDetail;
  domainSlug: string;
  onRelatedChange: () => void;
}) {
  const claimText = claim.claimText.trim();

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-heading text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
            {claim.reviewId}
          </p>
          <h2 className="mt-3 truncate font-heading text-xl font-semibold">
            {claim.displayTitle}
          </h2>
        </div>
      </div>
      {claimText ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {claimText}
        </p>
      ) : (
        <p className="text-sm leading-relaxed text-muted-foreground">
          No claim text.
        </p>
      )}
      <Separator />
      <ClaimRelatedPanel
        claim={claim}
        domainSlug={domainSlug}
        onChange={onRelatedChange}
      />
    </section>
  );
}

function ClaimRelatedPanel({
  claim,
  domainSlug,
  onChange,
}: {
  claim: ClaimDetail;
  domainSlug: string;
  onChange: () => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-md)] border border-border bg-card p-3 shadow-sm">
      <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Related</h3>
        <ButtonGroup>
          <RelatedToolbarButton
            label="Add target"
            onClick={() => {
              setError(null);
              setDialogOpen(true);
            }}
          >
            <Plus />
          </RelatedToolbarButton>
        </ButtonGroup>
      </div>
      {error ? <FieldError className="mb-2">{error}</FieldError> : null}
      <div className="rounded-[var(--radius-sm)] border border-border bg-background/60">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center border-b border-border px-2 py-1.5 font-mono text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          <span>Targets</span>
          <Badge variant="secondary" className="px-1 tabular-nums">
            {claim.targets.length}
          </Badge>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {claim.targets.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {claim.targets.map((target) => (
                <li key={target.id}>
                  <div className="rounded-[var(--radius-sm)] border border-border bg-background/60 p-2">
                    <p className="truncate text-sm font-medium">
                      {target.label}
                    </p>
                    <p className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                      {target.targetRole}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <RelatedEmpty
              title="No targets"
              description="No subjects are targeted by this claim yet."
            />
          )}
        </div>
      </div>
      <AddClaimTargetDialog
        claim={claim}
        domainSlug={domainSlug}
        onClose={() => setDialogOpen(false)}
        onDone={() => {
          setDialogOpen(false);
          window.dispatchEvent(new Event("memoria:shelf-refresh"));
          onChange();
        }}
        onError={setError}
        open={dialogOpen}
      />
    </section>
  );
}

function ClaimInspectorSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-5 w-24 rounded-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
