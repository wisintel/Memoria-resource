import { z } from "zod";

export const documentProfileStatusValues = [
  "ready",
  "inspection_failed",
] as const;

export const documentProfileConfidenceValues = [
  "high",
  "medium",
  "low",
  "unknown",
] as const;

// The inspection output contract. Maps to the document_profiles table: the
// scalar/status fields become columns, the hint/flag lists become the `profile`
// jsonb payload.
export const upsertDocumentProfileInput = z.object({
  inspectionStatus: z.enum(documentProfileStatusValues),
  confidence: z.enum(documentProfileConfidenceValues),
  documentShape: z.string().trim().min(1).nullable().optional(),
  sourceForm: z.string().trim().min(1).nullable().optional(),
  summary: z.string().trim().min(1).nullable().optional(),
  captureProfileHint: z.string().trim().min(1).nullable().optional(),
  domainHint: z.string().trim().min(1).nullable().optional(),
  structureFlags: z.array(z.string().trim().min(1)).default([]),
  handlingFlags: z.array(z.string().trim().min(1)).default([]),
  ambiguityNotes: z.array(z.string().trim().min(1)).default([]),
  errorSummary: z.string().trim().min(1).nullable().optional(),
});

export type UpsertDocumentProfileInput = z.infer<
  typeof upsertDocumentProfileInput
>;

export type DocumentProfilePayload = {
  captureProfileHint: string | null;
  domainHint: string | null;
  structureFlags: string[];
  handlingFlags: string[];
  ambiguityNotes: string[];
};

export type DocumentProfileView = DocumentProfilePayload & {
  documentId: string;
  inspectionStatus: (typeof documentProfileStatusValues)[number];
  confidence: (typeof documentProfileConfidenceValues)[number];
  documentShape: string | null;
  sourceForm: string | null;
  summary: string | null;
  errorSummary: string | null;
  updatedAt: string | null;
};
