import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import type { PreparedDocument } from "@/domain/documents";
import type { LabRunDetail, LabRunStartOptions } from "@/domain/runs";
import type {
  WorkshopBundleReview,
  WorkshopSubjectPackage,
} from "@/domain/workshop";
import { GraphWorkspace } from "@/features/workshop/GraphWorkspace";
import { WorkshopReviewPanel } from "./WorkshopReviewPanel";

type WorkshopSurfaceProps = {
  admissionPackages: WorkshopSubjectPackage[];
  preparedDocument: PreparedDocument | null;
  review: WorkshopBundleReview | null;
  selectedBundleId: string | null;
  selectedClaimId: string | null;
  selectedClass: string | null;
  selectedDocumentId: string | null;
  selectedPackage: string | null;
  selectedRun: LabRunDetail | null;
  selectedRunId: string | null;
  selectedStepId: string | null;
  startOptions: LabRunStartOptions | null;
};

export function WorkshopSurface({
  admissionPackages,
  preparedDocument,
  review,
  selectedBundleId,
  selectedClaimId,
  selectedClass,
  selectedDocumentId,
  selectedPackage,
  selectedRun,
  selectedRunId,
  selectedStepId,
  startOptions,
}: WorkshopSurfaceProps) {
  if (selectedClass === "bundle") {
    if (!review) {
      return (
        <Empty className="min-h-full rounded-none border-0">
          <EmptyHeader>
            <EmptyTitle>No bundle selected</EmptyTitle>
            <EmptyDescription>
              Select an extraction bundle to review subject packages.
              {selectedBundleId ? ` Selected bundle: ${selectedBundleId}` : ""}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }

    return (
      <WorkshopReviewPanel
        review={review}
        selectedClaimId={selectedClaimId}
        selectedPackage={selectedPackage}
      />
    );
  }

  return (
    <GraphWorkspace
      admissionPackages={admissionPackages}
      preparedDocument={preparedDocument}
      selectedClass={selectedClass}
      selectedDocumentId={selectedDocumentId}
      selectedRun={selectedRun}
      selectedRunId={selectedRunId}
      selectedStepId={selectedStepId}
      startOptions={startOptions}
    />
  );
}
