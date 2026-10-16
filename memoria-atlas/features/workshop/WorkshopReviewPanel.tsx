"use client";

import { useMemo } from "react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { WorkshopBundleReview } from "@/domain/workshop";
import { WorkshopClaimWorkspace } from "./WorkshopClaimWorkspace";

type WorkshopReviewPanelProps = {
  review: WorkshopBundleReview;
  selectedClaimId: string | null;
  selectedPackage: string | null;
};

export function WorkshopReviewPanel({
  review,
  selectedClaimId,
  selectedPackage,
}: WorkshopReviewPanelProps) {
  const visiblePackages = useMemo(
    () =>
      selectedPackage
        ? review.packages.filter(
            (pkg) => pkg.normalizedSubject === selectedPackage
          )
        : [],
    [review.packages, selectedPackage]
  );
  const activePackage = visiblePackages[0] ?? null;

  return (
    <section className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_minmax(18rem,1fr)] gap-3 overflow-hidden p-4 pb-48">
      <div className="min-h-0 overflow-auto pr-1">
        {!selectedPackage ? (
          <Card className="rounded-[var(--radius)]" size="sm">
            <CardHeader>
              <CardTitle className="font-heading text-base">
                Select a claim group
              </CardTitle>
              <CardDescription>
                Claim groups are listed in the Workshop shelf.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : visiblePackages.length === 0 ? (
          <Card className="rounded-[var(--radius)]" size="sm">
            <CardHeader>
              <CardTitle className="font-heading text-base">
                Package unavailable
              </CardTitle>
              <CardDescription>
                The selected subject package was not found in this bundle.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}
      </div>
      <WorkshopClaimWorkspace
        packages={review.packages}
        selectedClaimId={selectedClaimId}
        selectedPackage={activePackage}
      />
    </section>
  );
}
