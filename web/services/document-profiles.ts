import { eq } from "drizzle-orm";

import { db } from "@/data/client";
import { documentProfiles } from "@/data/schema";
import {
  upsertDocumentProfileInput,
  type DocumentProfilePayload,
  type DocumentProfileView,
  type UpsertDocumentProfileInput,
} from "@/domain/document-profiles";
import { err, ok } from "@/services/result";
import type { CommandResult } from "@/services/result";

type DocumentProfileRow = typeof documentProfiles.$inferSelect;

function toView(row: DocumentProfileRow): DocumentProfileView {
  const payload = (row.profile ?? {}) as Partial<DocumentProfilePayload>;

  return {
    documentId: row.documentId,
    inspectionStatus: row.inspectionStatus,
    confidence: row.confidence,
    documentShape: row.documentShape,
    sourceForm: row.sourceForm,
    summary: row.summary,
    errorSummary: row.errorSummary,
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : row.updatedAt
          ? new Date(row.updatedAt).toISOString()
          : null,
    captureProfileHint: payload.captureProfileHint ?? null,
    domainHint: payload.domainHint ?? null,
    structureFlags: payload.structureFlags ?? [],
    handlingFlags: payload.handlingFlags ?? [],
    ambiguityNotes: payload.ambiguityNotes ?? [],
  };
}

export async function getDocumentProfile(
  documentId: string
): Promise<DocumentProfileView | null> {
  const [row] = await db
    .select()
    .from(documentProfiles)
    .where(eq(documentProfiles.documentId, documentId))
    .limit(1);

  return row ? toView(row) : null;
}

// Persist an inspection result. One profile per Document (unique document_id),
// so re-inspecting updates in place. Guidance, not canonical memory.
export async function upsertDocumentProfile(
  documentId: string,
  input: UpsertDocumentProfileInput
): Promise<CommandResult<DocumentProfileView>> {
  const parsed = upsertDocumentProfileInput.safeParse(input);

  if (!parsed.success) {
    return err(
      "invalid_input",
      "Document profile input is invalid",
      parsed.error.flatten()
    );
  }

  const value = parsed.data;
  const payload: DocumentProfilePayload = {
    captureProfileHint: value.captureProfileHint ?? null,
    domainHint: value.domainHint ?? null,
    structureFlags: value.structureFlags,
    handlingFlags: value.handlingFlags,
    ambiguityNotes: value.ambiguityNotes,
  };

  const columns = {
    inspectionStatus: value.inspectionStatus,
    confidence: value.confidence,
    documentShape: value.documentShape ?? null,
    sourceForm: value.sourceForm ?? null,
    summary: value.summary ?? null,
    profile: payload,
    errorSummary: value.errorSummary ?? null,
  };

  const [row] = await db
    .insert(documentProfiles)
    .values({ documentId, ...columns })
    .onConflictDoUpdate({
      target: documentProfiles.documentId,
      set: columns,
    })
    .returning();

  return ok(toView(row));
}
