import { WorkshopSurface } from "@/features/workshop/WorkshopSurface";
import { getPreparedDocument } from "@/services/documents";
import { getLabRunDetail, getLabRunStartOptions } from "@/services/lab-runs";
import {
  getWorkshopAdmissionPackages,
  getWorkshopBundleReview,
} from "@/services/workshop";

type WorkshopPageProps = {
  searchParams: Promise<{
    class?: string | string[];
    claim?: string | string[];
    domain?: string | string[];
    pkg?: string | string[];
    sel?: string | string[];
    step?: string | string[];
  }>;
};

function singleParam(value: string | string[] | undefined) {
  const param = Array.isArray(value) ? value[0] : value;
  const trimmed = param?.trim();

  return trimmed || undefined;
}

export default async function WorkshopPage({
  searchParams,
}: WorkshopPageProps) {
  const params = await searchParams;
  const domainSlug = singleParam(params.domain) ?? "";
  const selectedClass = singleParam(params.class);
  const selectedDocumentId =
    selectedClass === "document" ? (singleParam(params.sel) ?? null) : null;
  const selectedRunId =
    selectedClass === "run" ? (singleParam(params.sel) ?? null) : null;
  const selectedBundleId =
    selectedClass === "bundle" ? (singleParam(params.sel) ?? null) : null;
  const selectedStepId = singleParam(params.step) ?? null;
  const selectedPackage = singleParam(params.pkg) ?? null;
  const selectedClaimId = singleParam(params.claim) ?? null;
  const [
    preparedDocument,
    startOptions,
    selectedRun,
    admissionPackages,
    review,
  ] = await Promise.all([
    selectedDocumentId
      ? getPreparedDocument(selectedDocumentId, domainSlug)
      : null,
    selectedClass === "run" ? getLabRunStartOptions(domainSlug) : null,
    selectedRunId ? getLabRunDetail(domainSlug, selectedRunId) : null,
    shouldLoadGraphWorkspace(selectedClass) && domainSlug
      ? getWorkshopAdmissionPackages(domainSlug)
      : [],
    selectedBundleId
      ? getWorkshopBundleReview(domainSlug, selectedBundleId)
      : null,
  ]);

  return (
    <WorkshopSurface
      admissionPackages={admissionPackages}
      domainSlug={domainSlug}
      preparedDocument={preparedDocument}
      review={review}
      selectedBundleId={selectedBundleId}
      selectedClaimId={selectedClaimId}
      selectedClass={selectedClass ?? null}
      selectedDocumentId={selectedDocumentId}
      selectedPackage={selectedPackage}
      selectedRun={selectedRun}
      selectedRunId={selectedRunId}
      selectedStepId={selectedStepId}
      startOptions={startOptions}
    />
  );
}

function shouldLoadGraphWorkspace(selectedClass: string | undefined) {
  return (
    selectedClass === "subject" ||
    selectedClass === "relationship" ||
    selectedClass === "claim" ||
    selectedClass === "type" ||
    selectedClass === "domain_map"
  );
}
