import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import type { PreparedDocument } from "@/domain/documents";
import type { LabRunDetail, LabRunStartOptions } from "@/domain/lab-runs";
import type {
  WorkshopBundleReview,
  WorkshopSubjectPackage,
} from "@/domain/workshop";
import { LibraryDocumentFileIntake } from "@/features/library/LibraryDocumentFileIntake";
import { LibraryReader } from "@/features/library/LibraryReader";
import { LabRunControlPanel } from "@/features/lab/LabRunControlPanel";
import { ObservatorySurface } from "@/features/observatory/ObservatorySurface";
import { WorkshopReviewPanel } from "./WorkshopReviewPanel";

type WorkshopSurfaceProps = {
  admissionPackages: WorkshopSubjectPackage[];
  domainSlug: string;
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
  domainSlug,
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
        domainSlug={domainSlug}
        review={review}
        selectedClaimId={selectedClaimId}
        selectedPackage={selectedPackage}
      />
    );
  }

  if (isGraphWorkspaceClass(selectedClass)) {
    return <ObservatorySurface admissionPackages={admissionPackages} />;
  }

  if (selectedClass === "run" && startOptions) {
    return (
      <section className="flex h-full min-h-0 flex-col overflow-hidden p-4 pb-[13rem]">
        <LabRunControlPanel
          key={selectedRun?.id ?? selectedRunId ?? "new-run"}
          domainSlug={domainSlug}
          selectedRun={selectedRun}
          selectedRunId={selectedRunId}
          selectedStepId={selectedStepId}
          startOptions={startOptions}
        />
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden p-4 pb-[13rem]">
      <LibraryDocumentFileIntake domainSlug={domainSlug} />
      <div className="flex min-h-0 flex-1">
        <LibraryReader
          prepared={preparedDocument}
          selectedId={selectedDocumentId}
        />
      </div>
    </section>
  );
}

function isGraphWorkspaceClass(selectedClass: string | null) {
  return (
    selectedClass === "subject" ||
    selectedClass === "relationship" ||
    selectedClass === "claim" ||
    selectedClass === "type" ||
    selectedClass === "domain_map"
  );
}
