"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";

import { byteCount, shardMarkdown } from "@/lib/markdown-sharding";
import { getMutableClassTableTemplate, type ClassTableFieldTemplate } from "@/lib/class-table-templates";
import {
  createOrSelectDistillationShardRun,
  reviewDistillationCandidate as reviewShardDistillationCandidateService,
  reviewDistillationCandidates as reviewShardDistillationCandidatesService,
  runDistillationShardStage as runDistillationShardStageService,
  type CreateDistillationShardRunInput,
  type CreateDistillationShardRunResult,
  type ReviewDistillationCandidateInput,
  type ReviewDistillationCandidateResult,
  type ReviewDistillationCandidatesInput,
  type ReviewDistillationCandidatesResult,
  type RunDistillationShardStageInput,
  type RunDistillationShardStageResult,
} from "@/lib/server/shard-distillation";
import {
  createClaimCommand,
  createEntityCommand,
  createRelationshipCommand,
  createSimpleCurationRecordCommand,
  deleteCurationRecordCommand,
  updateClaimCommand,
  updateEntityCommand,
  updateRelationshipCommand,
  updateSimpleCurationRecordCommand,
} from "@/lib/server/curation-commands";
import {
  createSupabaseClient,
  type ClassFieldLayout,
  type ClassTypeInsert,
  type DocumentInsert,
  type DocumentShelfFolderInsert,
  type DocumentShelfFolderItemInsert,
  type DocumentShardInsert,
  type KindInsert,
  type RecordSourceInsert,
  type ViewInsert,
} from "@/lib/supabase/client";

export type CreateAtlasEntityInput = {
  domainId: string;
  kindId?: string | null;
  label: string;
  statusId?: string | null;
  typeId: string;
};

export type CreateAtlasEntityResult = {
  error: string | null;
  ok: boolean;
};

export async function createAtlasEntity(
  input: CreateAtlasEntityInput,
): Promise<CreateAtlasEntityResult> {
  const domainId = input.domainId.trim();
  const kindId = input.kindId?.trim() || null;
  const label = input.label.trim();
  const typeId = input.typeId.trim();
  const statusId = input.statusId?.trim() || null;

  if (!domainId) {
    return entityActionError("Select a domain before creating a subject.");
  }

  if (!label) {
    return entityActionError("Subject label is required.");
  }

  if (!typeId) {
    return entityActionError("Subject type is required.");
  }

  let resolvedStatusId = statusId;

  if (!resolvedStatusId) {
    const defaultStatus = await defaultStatusIdForClassTable("entities", "canon");

    if (defaultStatus.error) {
      return entityActionError(defaultStatus.error);
    }

    resolvedStatusId = defaultStatus.statusId;
  }

  if (!resolvedStatusId) {
    return entityActionError("Subject creation needs the Canon status first.");
  }

  const result = await createEntityCommand({
    domainId,
    kindId,
    label,
    statusId: resolvedStatusId,
    typeId,
  });

  if (!result.ok) {
    return entityActionError(result.error ?? "Subject could not be created.");
  }

  revalidatePath("/atlas");

  return {
    error: null,
    ok: true,
  };
}

export type CreateAtlasDocumentInput = CreateLibraryDocumentInput;
export type CreateAtlasDocumentResult = CreateLibraryDocumentResult;
export type UpdateAtlasDocumentClassificationInput = UpdateLibraryDocumentClassificationInput;
export type UpdateAtlasDocumentClassificationResult = UpdateLibraryDocumentClassificationResult;
export type UpdateAtlasDocumentTitleInput = UpdateLibraryDocumentTitleInput;
export type UpdateAtlasDocumentTitleResult = UpdateLibraryDocumentTitleResult;
export type CreateAtlasDocumentShelfFolderInput = CreateDocumentShelfFolderInput;
export type CreateAtlasDocumentShelfFolderResult = DocumentShelfFolderActionResult;
export type MoveAtlasDocumentToShelfFolderInput = MoveDocumentToShelfFolderInput;
export type MoveAtlasDocumentToShelfFolderResult = DocumentShelfFolderActionResult;
export type UpdateAtlasDocumentShelfFolderInput = UpdateDocumentShelfFolderInput;
export type UpdateAtlasDocumentShelfFolderResult = DocumentShelfFolderActionResult;

export type CreateShardDistillationRunInput = CreateDistillationShardRunInput;
export type CreateShardDistillationRunResult = CreateDistillationShardRunResult;
export type RunShardDistillationStageInput = RunDistillationShardStageInput;
export type RunShardDistillationStageResult = RunDistillationShardStageResult;
export type ReviewShardDistillationCandidateInput = ReviewDistillationCandidateInput;
export type ReviewShardDistillationCandidateResult = ReviewDistillationCandidateResult;
export type ReviewShardDistillationCandidatesInput = ReviewDistillationCandidatesInput;
export type ReviewShardDistillationCandidatesResult = ReviewDistillationCandidatesResult;

export async function createAtlasDocument(
  input: CreateAtlasDocumentInput,
): Promise<CreateAtlasDocumentResult> {
  return await createLibraryDocument(input);
}

export async function updateAtlasDocumentTitle(
  input: UpdateAtlasDocumentTitleInput,
): Promise<UpdateAtlasDocumentTitleResult> {
  return await updateLibraryDocumentTitle(input);
}

export async function updateAtlasDocumentClassification(
  input: UpdateAtlasDocumentClassificationInput,
): Promise<UpdateAtlasDocumentClassificationResult> {
  return await updateLibraryDocumentClassification(input);
}

export async function createAtlasDocumentShelfFolder(
  input: CreateAtlasDocumentShelfFolderInput,
): Promise<CreateAtlasDocumentShelfFolderResult> {
  return await createDocumentShelfFolder(input);
}

export async function moveAtlasDocumentToShelfFolder(
  input: MoveAtlasDocumentToShelfFolderInput,
): Promise<MoveAtlasDocumentToShelfFolderResult> {
  return await moveDocumentToShelfFolder(input);
}

export async function updateAtlasDocumentShelfFolder(
  input: UpdateAtlasDocumentShelfFolderInput,
): Promise<UpdateAtlasDocumentShelfFolderResult> {
  return await updateDocumentShelfFolder(input);
}

export async function createShardDistillationRun(
  input: CreateShardDistillationRunInput,
): Promise<CreateShardDistillationRunResult> {
  const result = await createOrSelectDistillationShardRun(input);

  if (result.ok) {
    revalidatePath("/atlas");
  }

  return result;
}

export async function runShardDistillationStage(
  input: RunShardDistillationStageInput,
): Promise<RunShardDistillationStageResult> {
  const result = await runDistillationShardStageService(input);

  if (result.ok) {
    revalidatePath("/atlas");
  }

  return result;
}

export async function reviewShardDistillationCandidate(
  input: ReviewShardDistillationCandidateInput,
): Promise<ReviewShardDistillationCandidateResult> {
  const result = await reviewShardDistillationCandidateService(input);

  if (result.ok) {
    revalidatePath("/atlas");
  }

  return result;
}

export async function reviewShardDistillationCandidates(
  input: ReviewShardDistillationCandidatesInput,
): Promise<ReviewShardDistillationCandidatesResult> {
  const result = await reviewShardDistillationCandidatesService(input);

  if (result.reviewedCount > 0) {
    revalidatePath("/atlas");
  }

  return result;
}

function entityActionError(error: string): CreateAtlasEntityResult {
  return {
    error,
    ok: false,
  };
}

const maxDocumentBytes = 8_000_000;
const shardInsertBatchSize = 100;

export type LibrarySourceType = "html" | "markdown";

export type CreateLibraryDocumentInput = {
  content: string;
  domainId: string;
  mimeType?: string | null;
  sourceFilename?: string;
  sourceType: LibrarySourceType;
  title: string;
};

export type CreateLibraryDocumentResult = {
  deduped: boolean;
  documentId: string | null;
  error: string | null;
  ok: boolean;
};

export type DeleteLibraryDocumentResult = {
  error: string | null;
  ok: boolean;
};

export type UpdateLibraryDocumentClassificationInput = {
  domainId?: string | null;
  documentId: string;
  kindId: string | null;
  typeId: string | null;
};

export type UpdateLibraryDocumentClassificationResult = {
  error: string | null;
  ok: boolean;
};

export type UpdateLibraryDocumentTitleInput = {
  documentId: string;
  title: string;
};

export type UpdateLibraryDocumentTitleResult = {
  error: string | null;
  ok: boolean;
};

export type CreateDocumentShelfFolderInput = {
  domainId: string;
  label: string;
};

export type MoveDocumentToShelfFolderInput = {
  documentId: string;
  domainId: string;
  folderId: string;
};

export type UpdateDocumentShelfFolderInput = {
  collapsed?: boolean;
  domainId: string;
  folderId: string;
  label?: string;
};

export type DocumentShelfFolderActionResult = {
  error: string | null;
  folderId: string | null;
  ok: boolean;
};

export async function createLibraryDocument(
  input: CreateLibraryDocumentInput,
): Promise<CreateLibraryDocumentResult> {
  const domainId = input.domainId.trim();
  const content = input.content;
  const title = input.title.trim() || fallbackTitle(input.sourceFilename);
  const sizeBytes = byteCount(content);

  if (!domainId) {
    return documentActionError("Domain is required.");
  }

  if (!content.trim()) {
    return documentActionError(`${sourceTypeLabel(input.sourceType)} content is empty.`);
  }

  if (sizeBytes > maxDocumentBytes) {
    return documentActionError(`${sourceTypeLabel(input.sourceType)} is too large.`);
  }

  const supabase = createSupabaseClient();
  const contentHash = sha256Hex(content);
  const existing = await supabase
    .from("documents")
    .select("id")
    .eq("domain_id", domainId)
    .eq("content_hash", contentHash)
    .maybeSingle();

  if (existing.error) {
    return documentActionError(existing.error.message);
  }

  if (existing.data) {
    revalidatePath("/atlas");

    return {
      deduped: true,
      documentId: existing.data.id,
      error: null,
      ok: true,
    };
  }

  const shards = documentShardsForSource(input.sourceType, content);
  const now = Date.now();
  const insertPayload: DocumentInsert = {
    content_hash: contentHash,
    created_at: now,
    domain_id: domainId,
    error_message: null,
    extracted_by_tool_id: null,
    kind_id: null,
    label: title,
    mime_type: input.mimeType ?? mimeTypeForSource(input.sourceType),
    shard_count: 0,
    size_bytes: sizeBytes,
    source_filename: input.sourceFilename?.trim() || null,
    source_type: input.sourceType,
    source_url: null,
    status: "processing",
    title,
    type_id: null,
    updated_at: now,
  };
  const inserted = await supabase.from("documents").insert(insertPayload).select("id").single();

  if (inserted.error) {
    return documentActionError(inserted.error.message);
  }

  const documentId = inserted.data.id;

  try {
    for (let start = 0; start < shards.length; start += shardInsertBatchSize) {
      const batch: DocumentShardInsert[] = shards.slice(start, start + shardInsertBatchSize).map((shard) => ({
        body: shard.body,
        created_at: now,
        document_id: documentId,
        heading_path: shard.headingPath,
        position: shard.position,
        size_bytes: shard.sizeBytes,
        updated_at: now,
      }));
      const { error } = await supabase.from("document_shards").insert(batch);

      if (error) {
        throw new Error(error.message);
      }
    }

    const { error } = await supabase
      .from("documents")
      .update({
        shard_count: shards.length,
        status: "ready",
        updated_at: Date.now(),
      })
      .eq("id", documentId);

    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    await supabase
      .from("documents")
      .update({
        error_message: error instanceof Error ? error.message : String(error),
        status: "failed",
        updated_at: Date.now(),
      })
      .eq("id", documentId);

    return documentActionError(error instanceof Error ? error.message : String(error));
  }

  revalidatePath("/atlas");

  return {
    deduped: false,
    documentId,
    error: null,
    ok: true,
  };
}

export async function deleteLibraryDocument(documentId: string): Promise<DeleteLibraryDocumentResult> {
  const cleanDocumentId = documentId.trim();

  if (!cleanDocumentId) {
    return {
      error: "Document is required.",
      ok: false,
    };
  }

  const supabase = createSupabaseClient();
  const { error } = await supabase.from("documents").delete().eq("id", cleanDocumentId);

  if (error) {
    return {
      error: error.message,
      ok: false,
    };
  }

  revalidatePath("/atlas");

  return {
    error: null,
    ok: true,
  };
}

export async function updateLibraryDocumentClassification(
  input: UpdateLibraryDocumentClassificationInput,
): Promise<UpdateLibraryDocumentClassificationResult> {
  const documentId = input.documentId.trim();
  const domainId = input.domainId === undefined ? undefined : input.domainId?.trim();
  const typeId = input.typeId?.trim() || null;
  const kindId = input.kindId?.trim() || null;

  if (!documentId) {
    return {
      error: "Document is required.",
      ok: false,
    };
  }

  if (domainId !== undefined && !domainId) {
    return {
      error: "Domain is required.",
      ok: false,
    };
  }

  const updatePayload = {
    ...(domainId === undefined ? {} : { domain_id: domainId }),
    kind_id: kindId,
    type_id: typeId,
    updated_at: Date.now(),
  };
  const supabase = createSupabaseClient();
  const { error } = await supabase
    .from("documents")
    .update(updatePayload)
    .eq("id", documentId);

  if (error) {
    return {
      error: error.message,
      ok: false,
    };
  }

  revalidatePath("/atlas");

  return {
    error: null,
    ok: true,
  };
}

export async function updateLibraryDocumentTitle(
  input: UpdateLibraryDocumentTitleInput,
): Promise<UpdateLibraryDocumentTitleResult> {
  const documentId = input.documentId.trim();
  const title = input.title.trim();

  if (!documentId) {
    return {
      error: "Document is required.",
      ok: false,
    };
  }

  if (!title) {
    return {
      error: "Document label is required.",
      ok: false,
    };
  }

  const supabase = createSupabaseClient();
  const { error } = await supabase
    .from("documents")
    .update({
      title,
      updated_at: Date.now(),
    })
    .eq("id", documentId);

  if (error) {
    return {
      error: error.message,
      ok: false,
    };
  }

  revalidatePath("/atlas");

  return {
    error: null,
    ok: true,
  };
}

export async function createDocumentShelfFolder(
  input: CreateDocumentShelfFolderInput,
): Promise<DocumentShelfFolderActionResult> {
  const domainId = input.domainId.trim();
  const label = input.label.trim();

  if (!domainId) {
    return documentShelfFolderActionError("Domain is required.");
  }

  if (!label) {
    return documentShelfFolderActionError("Folder name is required.");
  }

  const supabase = createSupabaseClient();
  const { data: positionRow, error: positionError } = await supabase
    .from("document_shelf_folders")
    .select("position")
    .eq("domain_id", domainId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (positionError) {
    return documentShelfFolderActionError(positionError.message);
  }

  const now = Date.now();
  const insertPayload: DocumentShelfFolderInsert = {
    collapsed: false,
    created_at: now,
    domain_id: domainId,
    label,
    position: typeof positionRow?.position === "number" ? positionRow.position + 1 : 0,
    updated_at: now,
  };
  const { data, error } = await supabase
    .from("document_shelf_folders")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error) {
    return documentShelfFolderActionError(error.message);
  }

  revalidatePath("/atlas");

  return {
    error: null,
    folderId: data.id,
    ok: true,
  };
}

export async function updateDocumentShelfFolder(
  input: UpdateDocumentShelfFolderInput,
): Promise<DocumentShelfFolderActionResult> {
  const domainId = input.domainId.trim();
  const folderId = input.folderId.trim();
  const label = input.label?.trim();
  const updatePayload: Partial<DocumentShelfFolderInsert> = {
    updated_at: Date.now(),
  };

  if (!domainId) {
    return documentShelfFolderActionError("Domain is required.");
  }

  if (!folderId) {
    return documentShelfFolderActionError("Folder is required.");
  }

  if (input.label !== undefined) {
    if (!label) {
      return documentShelfFolderActionError("Folder name is required.");
    }

    updatePayload.label = label;
  }

  if (input.collapsed !== undefined) {
    updatePayload.collapsed = input.collapsed;
  }

  const supabase = createSupabaseClient();
  const { error } = await supabase
    .from("document_shelf_folders")
    .update(updatePayload)
    .eq("id", folderId)
    .eq("domain_id", domainId);

  if (error) {
    return documentShelfFolderActionError(error.message);
  }

  revalidatePath("/atlas");

  return {
    error: null,
    folderId,
    ok: true,
  };
}

export async function moveDocumentToShelfFolder(
  input: MoveDocumentToShelfFolderInput,
): Promise<DocumentShelfFolderActionResult> {
  const documentId = input.documentId.trim();
  const domainId = input.domainId.trim();
  const folderId = input.folderId.trim();

  if (!domainId) {
    return documentShelfFolderActionError("Domain is required.");
  }

  if (!folderId) {
    return documentShelfFolderActionError("Folder is required.");
  }

  if (!documentId) {
    return documentShelfFolderActionError("Document is required.");
  }

  const supabase = createSupabaseClient();
  const [folderResult, documentResult, positionResult] = await Promise.all([
    supabase
      .from("document_shelf_folders")
      .select("id")
      .eq("id", folderId)
      .eq("domain_id", domainId)
      .maybeSingle(),
    supabase
      .from("documents")
      .select("id")
      .eq("id", documentId)
      .eq("domain_id", domainId)
      .maybeSingle(),
    supabase
      .from("document_shelf_folder_items")
      .select("position")
      .eq("folder_id", folderId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (folderResult.error) {
    return documentShelfFolderActionError(folderResult.error.message);
  }

  if (documentResult.error) {
    return documentShelfFolderActionError(documentResult.error.message);
  }

  if (positionResult.error) {
    return documentShelfFolderActionError(positionResult.error.message);
  }

  if (!folderResult.data) {
    return documentShelfFolderActionError("Folder not found.");
  }

  if (!documentResult.data) {
    return documentShelfFolderActionError("Document not found.");
  }

  const now = Date.now();
  const insertPayload: DocumentShelfFolderItemInsert = {
    created_at: now,
    document_id: documentId,
    domain_id: domainId,
    folder_id: folderId,
    position: typeof positionResult.data?.position === "number" ? positionResult.data.position + 1 : 0,
    updated_at: now,
  };
  const deleteResult = await supabase
    .from("document_shelf_folder_items")
    .delete()
    .eq("document_id", documentId);

  if (deleteResult.error) {
    return documentShelfFolderActionError(deleteResult.error.message);
  }

  const { error } = await supabase.from("document_shelf_folder_items").insert(insertPayload);

  if (error) {
    return documentShelfFolderActionError(error.message);
  }

  revalidatePath("/atlas");

  return {
    error: null,
    folderId,
    ok: true,
  };
}

function documentShelfFolderActionError(error: string): DocumentShelfFolderActionResult {
  return {
    error,
    folderId: null,
    ok: false,
  };
}

function documentActionError(error: string): CreateLibraryDocumentResult {
  return {
    deduped: false,
    documentId: null,
    error,
    ok: false,
  };
}

function fallbackTitle(filename: string | undefined) {
  if (filename) {
    return filename.replace(/\.[^.]+$/i, "").replaceAll(/[-_]+/g, " ").trim() || "Untitled document";
  }

  return "Untitled document";
}

function mimeTypeForSource(sourceType: LibrarySourceType) {
  if (sourceType === "html") {
    return "text/html";
  }

  if (sourceType === "markdown") {
    return "text/markdown";
  }

  return null;
}

function sourceTypeLabel(sourceType: LibrarySourceType) {
  if (sourceType === "html") {
    return "HTML";
  }

  return "Markdown";
}

function documentShardsForSource(sourceType: LibrarySourceType, content: string) {
  if (sourceType === "html") {
    return [
      {
        body: content,
        headingPath: [],
        position: 0,
        sizeBytes: byteCount(content),
      },
    ];
  }

  return shardMarkdown(content);
}

function sha256Hex(input: string | Uint8Array) {
  return typeof input === "string" ? createHash("sha256").update(input, "utf8").digest("hex") : createHash("sha256").update(input).digest("hex");
}


type MutationPayloadResult =
  | {
      error: string;
    }
  | {
      payload: Record<string, string | null>;
    };

export type ClassTableRowMutationState = {
  error: string | null;
  ok: boolean;
};

export type SaveClassFieldLayoutResult = {
  error: string | null;
  ok: boolean;
};

export async function saveClassFieldLayout(
  tableName: string,
  layout: ClassFieldLayout,
): Promise<SaveClassFieldLayoutResult> {
  const cleanTableName = tableName.trim();

  if (!cleanTableName) {
    return {
      error: "Class table is required.",
      ok: false,
    };
  }

  const fieldLayout = sanitizeFieldLayout(layout);
  const supabase = createSupabaseClient();
  const { error } = await supabase
    .from("classes")
    .update({
      field_layout: fieldLayout,
      updated_at: Date.now(),
    })
    .eq("table_name", cleanTableName);

  if (error) {
    return {
      error: error.message,
      ok: false,
    };
  }

  revalidatePath("/atlas");

  return {
    error: null,
    ok: true,
  };
}

export async function createClassTableRow(
  _previousState: ClassTableRowMutationState,
  formData: FormData,
): Promise<ClassTableRowMutationState> {
  const template = readMutableTemplate(formData);

  if (!template) {
    return mutationError("This class table is not editable yet.");
  }

  const payloadResult = buildMutationPayload(template.createFields ?? [], formData);

  if ("error" in payloadResult) {
    return mutationError(payloadResult.error);
  }

  const now = Date.now();
  const error = await insertMutableRow(template.tableName, payloadResult.payload, now);

  if (error !== null) {
    return mutationError(error);
  }

  revalidatePath("/atlas");

  return {
    error: null,
    ok: true,
  };
}

export async function updateClassTableRow(
  _previousState: ClassTableRowMutationState,
  formData: FormData,
): Promise<ClassTableRowMutationState> {
  const template = readMutableTemplate(formData);
  const id = String(formData.get("id") ?? "").trim();

  if (!template) {
    return mutationError("This class table is not editable yet.");
  }

  if (!id) {
    return mutationError("Row id is required.");
  }

  const payloadResult = buildMutationPayload(template.editFields ?? [], formData);

  if ("error" in payloadResult) {
    return mutationError(payloadResult.error);
  }

  const error = await updateMutableRow(template.tableName, id, payloadResult.payload, Date.now());

  if (error !== null) {
    return mutationError(error);
  }

  revalidatePath("/atlas");

  return {
    error: null,
    ok: true,
  };
}

export async function deleteClassTableRow(
  _previousState: ClassTableRowMutationState,
  formData: FormData,
): Promise<ClassTableRowMutationState> {
  const template = readMutableTemplate(formData);
  const id = String(formData.get("id") ?? "").trim();

  if (!template || !template.deleteEnabled) {
    return mutationError("This class table does not allow deletes yet.");
  }

  if (!id) {
    return mutationError("Row id is required.");
  }

  const error = await deleteMutableRow(template.tableName, id);

  if (error !== null) {
    return mutationError(error);
  }

  revalidatePath("/atlas");

  return {
    error: null,
    ok: true,
  };
}

function readMutableTemplate(formData: FormData) {
  const tableName = String(formData.get("table_name") ?? "").trim();

  return tableName ? getMutableClassTableTemplate(tableName) : null;
}

function buildMutationPayload(
  fields: readonly ClassTableFieldTemplate[],
  formData: FormData,
): MutationPayloadResult {
  const payload: Record<string, string | null> = {};

  for (const field of fields) {
    if (field.multiple) {
      const normalizedValue = uniqueStringArray(
        formData.getAll(field.name).map((item) => String(item).trim()),
      ).join(",");

      if (field.required && !normalizedValue) {
        return {
          error: `${field.label} is required.`,
        };
      }

      payload[field.name] = cleanNullableValue(normalizedValue);
      continue;
    }

    const normalizedValue = String(formData.get(field.name) ?? "").trim();

    if (field.required && !normalizedValue) {
      return {
        error: `${field.label} is required.`,
      };
    }

    payload[field.name] = normalizedValue || null;
  }

  return {
    payload,
  };
}

function mutationError(error: string): ClassTableRowMutationState {
  return {
    error,
    ok: false,
  };
}

async function defaultStatusIdForClassTable(tableName: string, statusSlug: string) {
  const supabase = createSupabaseClient();
  const { data: classRecord, error: classError } = await supabase
    .from("classes")
    .select("id")
    .eq("table_name", tableName)
    .maybeSingle();

  if (classError) {
    return {
      error: classError.message,
      statusId: null,
    };
  }

  if (!classRecord?.id) {
    return {
      error: null,
      statusId: null,
    };
  }

  const { data: statusRecord, error: statusError } = await supabase
    .from("statuses")
    .select("id")
    .eq("class_id", classRecord.id)
    .eq("slug", statusSlug)
    .maybeSingle();

  return {
    error: statusError?.message ?? null,
    statusId: statusRecord?.id ?? null,
  };
}

async function insertMutableRow(
  tableName: string,
  payload: Record<string, string | null>,
  now: number,
) {
  const supabase = createSupabaseClient();

  switch (tableName) {
    case "domains": {
      const result = await createSimpleCurationRecordCommand({
        coreEntityId: payload.core_entity_id ?? null,
        domainTypeId: payload.domain_type_id ?? null,
        label: textPayloadValue(payload, "label"),
        now,
        statusId: payload.status_id ?? null,
        tableName: "domains",
      });

      return result.error;
    }
    case "claims": {
      const domainId = textPayloadValue(payload, "domain_id");
      const fallbackSource = payload.source_document_id
        ? null
        : await processingSourceDocumentForDomain(domainId);

      if (fallbackSource?.error) {
        return fallbackSource.error;
      }

      const result = await createClaimCommand({
        claimText: textPayloadValue(payload, "claim_text"),
        domainId,
        kindId: textPayloadValue(payload, "kind_id"),
        now,
        sourceDocumentId: payload.source_document_id ?? fallbackSource?.documentId ?? null,
        statusId: payload.status_id ?? null,
        targetEntityIds: listPayloadValue(payload, "target_entity_ids"),
        typeId: textPayloadValue(payload, "type_id"),
      });

      return result.error;
    }
    case "entities": {
      const domainId = textPayloadValue(payload, "domain_id");
      let statusId = payload.status_id ?? null;

      if (!statusId) {
        const defaultStatus = await defaultStatusIdForClassTable("entities", "canon");

        if (defaultStatus.error) {
          return defaultStatus.error;
        }

        statusId = defaultStatus.statusId;
      }

      if (!statusId) {
        return "Subject creation needs the Canon status first.";
      }

      const fallbackSource = await processingSourceDocumentForDomain(domainId);

      if (fallbackSource?.error) {
        return fallbackSource.error;
      }

      const result = await createEntityCommand({
        description: payload.description ?? null,
        domainId,
        kindId: textPayloadValue(payload, "kind_id"),
        label: textPayloadValue(payload, "label"),
        now,
        statusId,
        typeId: textPayloadValue(payload, "type_id"),
      });

      if (result.error) {
        return result.error;
      }

      if (result.id && fallbackSource?.documentId && fallbackSource.shardId) {
        return await createManualRecordSource({
          documentId: fallbackSource.documentId,
          domainId,
          now,
          recordId: result.id,
          shardId: fallbackSource.shardId,
          tableName,
        });
      }

      return null;
    }
    case "entity_aliases": {
      const result = await createSimpleCurationRecordCommand({
        alias: textPayloadValue(payload, "alias"),
        domainId: textPayloadValue(payload, "domain_id"),
        entityId: textPayloadValue(payload, "entity_id"),
        now,
        sourceDocumentId: payload.source_document_id ?? null,
        statusId: payload.status_id ?? null,
        tableName: "entity_aliases",
      });

      return result.error;
    }
    case "relationships": {
      const result = await createRelationshipCommand({
        domainId: textPayloadValue(payload, "domain_id"),
        kindId: textPayloadValue(payload, "kind_id"),
        now,
        sourceClassId: textPayloadValue(payload, "source_class_id"),
        sourceRecordId: textPayloadValue(payload, "source_record_id"),
        statusId: payload.status_id ?? null,
        targetClassId: textPayloadValue(payload, "target_class_id"),
        targetRecordId: textPayloadValue(payload, "target_record_id"),
        typeId: textPayloadValue(payload, "type_id"),
      });

      return result.error;
    }
    case "kinds": {
      const insertPayload: KindInsert = {
        created_at: now,
        label: textPayloadValue(payload, "label"),
        slug: slugPayloadValue(payload),
        status_id: payload.status_id ?? null,
        type_id: textPayloadValue(payload, "type_id"),
        updated_at: now,
      };
      const { error } = await supabase.from("kinds").insert(insertPayload);

      return error?.message ?? null;
    }
    case "statuses": {
      const result = await createSimpleCurationRecordCommand({
        classId: textPayloadValue(payload, "class_id"),
        label: textPayloadValue(payload, "label"),
        now,
        tableName: "statuses",
      });

      return result.error;
    }
    case "types": {
      const insertPayload: ClassTypeInsert = {
        class_id: textPayloadValue(payload, "class_id"),
        created_at: now,
        domain_id: payload.domain_id ?? null,
        label: textPayloadValue(payload, "label"),
        slug: slugPayloadValue(payload),
        status_id: payload.status_id ?? null,
        updated_at: now,
      };
      const { error } = await supabase.from("types").insert(insertPayload);

      return error?.message ?? null;
    }
    default:
      return "This class table is not editable yet.";
  }
}

async function updateMutableRow(
  tableName: string,
  id: string,
  payload: Record<string, string | null>,
  now: number,
) {
  const supabase = createSupabaseClient();

  switch (tableName) {
    case "domains": {
      const result = await updateSimpleCurationRecordCommand({
        coreEntityId: payload.core_entity_id ?? null,
        domainTypeId: payload.domain_type_id ?? null,
        id,
        label: textPayloadValue(payload, "label"),
        now,
        statusId: payload.status_id ?? null,
        tableName: "domains",
      });

      return result.error;
    }
    case "claims": {
      const result = await updateClaimCommand({
        claimText: textPayloadValue(payload, "claim_text"),
        domainId: textPayloadValue(payload, "domain_id"),
        id,
        kindId: textPayloadValue(payload, "kind_id"),
        now,
        sourceDocumentId: payload.source_document_id ?? null,
        statusId: payload.status_id ?? null,
        targetEntityIds: listPayloadValue(payload, "target_entity_ids"),
        typeId: textPayloadValue(payload, "type_id"),
      });

      return result.error;
    }
    case "entities": {
      const result = await updateEntityCommand({
        description: payload.description ?? null,
        domainId: textPayloadValue(payload, "domain_id"),
        id,
        kindId: textPayloadValue(payload, "kind_id"),
        label: textPayloadValue(payload, "label"),
        now,
        statusId: payload.status_id ?? null,
        typeId: textPayloadValue(payload, "type_id"),
      });

      return result.error;
    }
    case "entity_aliases": {
      const result = await updateSimpleCurationRecordCommand({
        alias: textPayloadValue(payload, "alias"),
        domainId: textPayloadValue(payload, "domain_id"),
        entityId: textPayloadValue(payload, "entity_id"),
        id,
        now,
        sourceDocumentId: payload.source_document_id ?? null,
        statusId: payload.status_id ?? null,
        tableName: "entity_aliases",
      });

      return result.error;
    }
    case "relationships": {
      const result = await updateRelationshipCommand({
        domainId: textPayloadValue(payload, "domain_id"),
        id,
        kindId: textPayloadValue(payload, "kind_id"),
        now,
        sourceClassId: textPayloadValue(payload, "source_class_id"),
        sourceRecordId: textPayloadValue(payload, "source_record_id"),
        statusId: payload.status_id ?? null,
        targetClassId: textPayloadValue(payload, "target_class_id"),
        targetRecordId: textPayloadValue(payload, "target_record_id"),
        typeId: textPayloadValue(payload, "type_id"),
      });

      return result.error;
    }
    case "documents": {
      const { error } = await supabase
        .from("documents")
        .update({
          domain_id: textPayloadValue(payload, "domain_id"),
          kind_id: payload.kind_id ?? null,
          label: textPayloadValue(payload, "label"),
          status: documentStatusPayloadValue(payload),
          type_id: payload.type_id ?? null,
          updated_at: now,
        })
        .eq("id", id);

      return error?.message ?? null;
    }
    case "kinds": {
      const { error } = await supabase
        .from("kinds")
        .update({
          label: textPayloadValue(payload, "label"),
          slug: slugPayloadValue(payload),
          status_id: payload.status_id ?? null,
          type_id: textPayloadValue(payload, "type_id"),
          updated_at: now,
        })
        .eq("id", id);

      return error?.message ?? null;
    }
    case "statuses": {
      const result = await updateSimpleCurationRecordCommand({
        classId: textPayloadValue(payload, "class_id"),
        id,
        label: textPayloadValue(payload, "label"),
        now,
        tableName: "statuses",
      });

      return result.error;
    }
    case "types": {
      const { error } = await supabase
        .from("types")
        .update({
          class_id: textPayloadValue(payload, "class_id"),
          domain_id: payload.domain_id ?? null,
          label: textPayloadValue(payload, "label"),
          slug: slugPayloadValue(payload),
          status_id: payload.status_id ?? null,
          updated_at: now,
        })
        .eq("id", id);

      return error?.message ?? null;
    }
    default:
      return "This class table is not editable yet.";
  }
}

async function deleteMutableRow(tableName: string, id: string) {
  const supabase = createSupabaseClient();

  switch (tableName) {
    case "domains": {
      const { error } = await supabase.from("domains").delete().eq("id", id);

      return error?.message ?? null;
    }
    case "claims": {
      const result = await deleteCurationRecordCommand("claims", id);

      return result.error;
    }
    case "entities": {
      const result = await deleteCurationRecordCommand("entities", id);

      return result.error;
    }
    case "entity_aliases": {
      const { error } = await supabase.from("entity_aliases").delete().eq("id", id);

      return error?.message ?? null;
    }
    case "relationships": {
      const result = await deleteCurationRecordCommand("relationships", id);

      return result.error;
    }
    case "documents": {
      const result = await deleteLibraryDocument(id);

      return result.error;
    }
    case "kinds": {
      const { error } = await supabase.from("kinds").delete().eq("id", id);

      return error?.message ?? null;
    }
    case "statuses": {
      const { error } = await supabase.from("statuses").delete().eq("id", id);

      return error?.message ?? null;
    }
    case "types": {
      const { error } = await supabase.from("types").delete().eq("id", id);

      return error?.message ?? null;
    }
    default:
      return "This class table does not allow deletes yet.";
  }
}

async function processingSourceDocumentForDomain(domainId: string): Promise<{
  documentId: string | null;
  error: string | null;
  shardId: string | null;
} | null> {
  if (!domainId) {
    return null;
  }

  const supabase = createSupabaseClient();
  const { data: sourceTypes, error: typeError } = await supabase
    .from("types")
    .select("id,label")
    .or(`domain_id.is.null,domain_id.eq.${domainId}`)
    .ilike("label", "Source");

  if (typeError) {
    return {
      documentId: null,
      error: typeError.message,
      shardId: null,
    };
  }

  const sourceTypeIds = [...new Set((sourceTypes ?? []).map((type) => type.id).filter(Boolean))];

  if (sourceTypeIds.length === 0) {
    return null;
  }

  const { data: documents, error: documentError } = await supabase
    .from("documents")
    .select("id")
    .eq("domain_id", domainId)
    .eq("status", "processing")
    .in("type_id", sourceTypeIds)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (documentError) {
    return {
      documentId: null,
      error: documentError.message,
      shardId: null,
    };
  }

  const documentId = documents?.[0]?.id ?? null;

  if (!documentId) {
    return null;
  }

  const { data: shard, error: shardError } = await supabase
    .from("document_shards")
    .select("id")
    .eq("document_id", documentId)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (shardError) {
    return {
      documentId,
      error: shardError.message,
      shardId: null,
    };
  }

  return {
    documentId,
    error: null,
    shardId: shard?.id ?? null,
  };
}

async function createManualRecordSource({
  documentId,
  domainId,
  now,
  recordId,
  shardId,
  tableName,
}: {
  documentId: string;
  domainId: string;
  now: number;
  recordId: string;
  shardId: string;
  tableName: string;
}) {
  const supabase = createSupabaseClient();
  const { data: classRecord, error: classError } = await supabase
    .from("classes")
    .select("id")
    .eq("table_name", tableName)
    .maybeSingle();

  if (classError) {
    return classError.message;
  }

  if (!classRecord?.id) {
    return `Class ${tableName} was not found.`;
  }

  const insertPayload: RecordSourceInsert = {
    candidate_id: null,
    created_at: now,
    document_id: documentId,
    domain_id: domainId,
    evidence_kind: "reviewed_from",
    metadata: {
      created_manually: true,
    },
    shard_id: shardId,
    source_class_id: classRecord.id,
    source_record_id: recordId,
    updated_at: now,
  };
  const { error } = await supabase.from("record_sources").insert(insertPayload);

  return error?.message ?? null;
}

function textPayloadValue(payload: Record<string, string | null>, fieldName: string) {
  return payload[fieldName] ?? "";
}

function documentStatusPayloadValue(payload: Record<string, string | null>) {
  const status = payload.status;

  return status === "ready" ||
    status === "processing" ||
    status === "failed" ||
    status === "extracted"
    ? status
    : "ready";
}

function slugPayloadValue(payload: Record<string, string | null>) {
  return slugify(textPayloadValue(payload, "label"));
}

function listPayloadValue(payload: Record<string, string | null>, fieldName: string) {
  return uniqueStringArray((payload[fieldName] ?? "").split(",").map((item) => item.trim()));
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sanitizeFieldLayout(layout: ClassFieldLayout): Required<ClassFieldLayout> {
  return {
    columnOrder: uniqueStringArray(layout.columnOrder),
    hiddenColumnIds: uniqueStringArray(layout.hiddenColumnIds),
  };
}

function uniqueStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function cleanNullableValue(value: string) {
  const trimmedValue = value.trim();

  return trimmedValue || null;
}


export type GraphViewMutationResult = {
  error: string | null;
  viewId: string | null;
};

export async function createGraphView(formData: FormData): Promise<GraphViewMutationResult> {
  const domainId = String(formData.get("domain_id") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();

  if (!domainId) {
    return { error: "Select a domain before creating a view.", viewId: null };
  }

  if (!label) {
    return { error: "View name is required.", viewId: null };
  }

  const now = Date.now();
  const insertPayload: ViewInsert = {
    created_at: now,
    domain_id: domainId,
    label,
    status_id: null,
    updated_at: now,
    view_kind: "semantic",
  };
  const { data, error } = await createSupabaseClient()
    .from("views")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error) {
    return { error: error.message, viewId: null };
  }

  revalidatePath("/atlas");

  return { error: null, viewId: data.id };
}

export async function renameGraphView(formData: FormData): Promise<GraphViewMutationResult> {
  const viewId = String(formData.get("view_id") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();

  if (!viewId) {
    return { error: "Select a view before renaming it.", viewId: null };
  }

  if (!label) {
    return { error: "View name is required.", viewId: null };
  }

  const { error } = await createSupabaseClient()
    .from("views")
    .update({
      label,
      updated_at: Date.now(),
    })
    .eq("id", viewId);

  if (error) {
    return { error: error.message, viewId: null };
  }

  revalidatePath("/atlas");

  return { error: null, viewId };
}

export async function deleteGraphView(formData: FormData): Promise<GraphViewMutationResult> {
  const viewId = String(formData.get("view_id") ?? "").trim();

  if (!viewId) {
    return { error: "Select a view before deleting it.", viewId: null };
  }

  const { error } = await createSupabaseClient().from("views").delete().eq("id", viewId);

  if (error) {
    return { error: error.message, viewId: null };
  }

  revalidatePath("/atlas");

  return { error: null, viewId: null };
}
