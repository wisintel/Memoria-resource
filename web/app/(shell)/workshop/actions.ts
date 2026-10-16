"use server";

import { revalidatePath } from "next/cache";
import type {
  DocumentSourceType,
  PrepareDocumentActionState,
} from "@/domain/documents";
import type { WorkshopSubjectPackageDecision } from "@/domain/workshop";
import type { ExtractionRunSettings } from "@/services/extraction";
import {
  cancelExtractionRun,
  createExtractionRun,
  deleteExtractionRun,
} from "@/services/extraction";
import { prepareDocument } from "@/services/documents";
import {
  markWorkshopClaimAdmitted,
  markWorkshopClaimDeferred,
  markWorkshopClaimDuplicate,
  markWorkshopClaimProcessed,
  markWorkshopClaimRejected,
  markWorkshopClaimSplit,
  resolveWorkshopSubjectPackage,
} from "@/services/workshop";
import type { WorkshopClaimDecisionMetadata } from "@/services/workshop";
import { err, ok } from "@/services/result";

function revalidateWorkshop() {
  revalidatePath("/workshop");
}

function optionalText(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}

function requiredText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}

function sourceTypeFromFormData(value: FormDataEntryValue | null) {
  return value === "html" ? "html" : "markdown";
}

function contentFieldForSource(sourceType: DocumentSourceType) {
  return sourceType === "html" ? "html" : "markdown";
}

function contentLabelForSource(sourceType: DocumentSourceType) {
  return sourceType === "html" ? "HTML body" : "Markdown body";
}

export async function prepareDocumentAction(
  formData: FormData
): Promise<PrepareDocumentActionState> {
  const domainSlug = optionalText(formData.get("domainSlug")) ?? "";
  const label = requiredText(formData.get("label")).trim();
  const documentForm = requiredText(formData.get("documentForm")).trim();
  const sourceType = sourceTypeFromFormData(formData.get("sourceType"));
  const content = requiredText(formData.get(contentFieldForSource(sourceType)));

  if (!label) {
    return err("invalid_input", "Document label is required");
  }

  if (!content.trim()) {
    return err(
      "invalid_input",
      `${contentLabelForSource(sourceType)} is required`
    );
  }

  if (!documentForm) {
    return err("invalid_input", "Document form is required");
  }

  const result = await prepareDocument(domainSlug, {
    content,
    documentForm,
    documentTypeId: optionalText(formData.get("documentTypeId")),
    label,
    mimeType: optionalText(formData.get("mimeType")),
    sourceFilename: optionalText(formData.get("sourceFilename")),
    sourceType,
    sourceUrl: optionalText(formData.get("sourceUrl")),
  });

  if (!result.ok) {
    return result;
  }

  revalidateWorkshop();

  return ok({
    alreadyExists: result.data.alreadyExists,
    documentId: result.data.document.id,
    label: result.data.document.label,
    sourceUnitCount: result.data.sourceUnits.length,
  });
}

export async function createExtractionRunWorkshopAction(
  domainSlug: string,
  documentId: string,
  settings: ExtractionRunSettings = {}
) {
  const result = await createExtractionRun(domainSlug, documentId, settings);

  revalidateWorkshop();

  return result;
}

export async function cancelExtractionRunWorkshopAction(
  domainSlug: string,
  runId: string
) {
  const result = await cancelExtractionRun(domainSlug, runId);

  revalidateWorkshop();

  return result;
}

export async function deleteExtractionRunWorkshopAction(
  domainSlug: string,
  runId: string
) {
  const result = await deleteExtractionRun(domainSlug, runId);

  revalidateWorkshop();

  return result;
}

export async function resolveWorkshopSubjectPackageAction(
  domainSlug: string,
  bundleId: string,
  decision: WorkshopSubjectPackageDecision
) {
  const result = await resolveWorkshopSubjectPackage(
    domainSlug,
    bundleId,
    decision
  );

  revalidateWorkshop();

  return result;
}

export async function markWorkshopClaimProcessedAction(claimRowId: string) {
  const result = await markWorkshopClaimProcessed(claimRowId);

  revalidateWorkshop();

  return result;
}

export async function markWorkshopClaimAdmittedAction(
  claimRowId: string,
  resultRecordIds: string[] = []
) {
  const result = await markWorkshopClaimAdmitted(claimRowId, {
    resultClaimIds: resultRecordIds,
    resultRecordIds,
  });

  revalidateWorkshop();

  return result;
}

export async function markWorkshopClaimDeferredAction(claimRowId: string) {
  const result = await markWorkshopClaimDeferred(claimRowId);

  revalidateWorkshop();

  return result;
}

export async function markWorkshopClaimDuplicateAction(
  claimRowId: string,
  metadata: WorkshopClaimDecisionMetadata = {}
) {
  const result = await markWorkshopClaimDuplicate(claimRowId, metadata);

  revalidateWorkshop();

  return result;
}

export async function markWorkshopClaimRejectedAction(claimRowId: string) {
  const result = await markWorkshopClaimRejected(claimRowId);

  revalidateWorkshop();

  return result;
}

export async function markWorkshopClaimSplitAction(
  claimRowId: string,
  metadata: WorkshopClaimDecisionMetadata = {}
) {
  const result = await markWorkshopClaimSplit(claimRowId, metadata);

  revalidateWorkshop();

  return result;
}
