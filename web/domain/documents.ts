import { z } from "zod";
import type { documents, sourceUnits } from "@/data/schema";
import type { TocEntry } from "@/lib/documents/document-toc";

export const documentSourceTypes = ["markdown", "html"] as const;

export const prepareDocumentInput = z.object({
  content: z.string(),
  description: z.string().trim().optional(),
  documentId: z.string().uuid().optional(),
  documentForm: z.string().trim().min(1).max(240),
  documentTypeId: z.string().uuid().optional(),
  label: z.string().trim().min(1).max(240),
  mimeType: z.string().trim().max(160).optional(),
  sourceFilename: z.string().trim().max(500).optional(),
  sourceType: z.enum(documentSourceTypes),
  sourceUrl: z.string().trim().max(1000).optional(),
});

export type DocumentSourceType = (typeof documentSourceTypes)[number];
export type PrepareDocumentInput = z.infer<typeof prepareDocumentInput>;
export const updateDocumentMetadataInput = z.object({
  documentTypeId: z.string().uuid().nullable().optional(),
  folderId: z.string().uuid().nullable().optional(),
  label: z.string().trim().min(1).max(240),
});

export type UpdateDocumentMetadataInput = z.infer<
  typeof updateDocumentMetadataInput
>;

export type DocumentRecord = typeof documents.$inferSelect;
export type SourceUnitRecord = typeof sourceUnits.$inferSelect;

export type DocumentTypeOption = {
  id: string;
  label: string;
};

export type DocumentFormOptions = {
  types: DocumentTypeOption[];
};

export type PreparedDocumentActionData = {
  alreadyExists: boolean;
  documentId: string;
  label: string;
  sourceUnitCount: number;
};

export type PrepareDocumentActionState =
  | { ok: true; data: PreparedDocumentActionData | null }
  | {
      ok: false;
      error: {
        code: string;
        details?: unknown;
        message: string;
      };
    };

export type PreparedDocument = {
  alreadyExists: boolean;
  document: DocumentRecord;
  sourceUnits: SourceUnitRecord[];
  toc: TocEntry[];
};
