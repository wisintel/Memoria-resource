"use server";

import { revalidatePath } from "next/cache";
import type {
  CreateDomainInput,
  Domain,
  UpdateDomainInput,
} from "@/domain/domains";
import type {
  PreparedDocument,
  UpdateDocumentMetadataInput,
} from "@/domain/documents";
import type {
  CreateLexicalizationInput,
  LexicalizationDetail,
  UpdateLexicalizationInput,
} from "@/domain/lexicalizations";
import type {
  ClaimDetail,
  CreateClaimInput,
  UpdateClaimInput,
} from "@/domain/claims";
import type {
  CreateRelationshipInput,
  RelationshipDetail,
  UpdateRelationshipInput,
} from "@/domain/relationships";
import type {
  CreateSubjectInput,
  SubjectDetail,
  UpdateSubjectInput,
} from "@/domain/subjects";
import type {
  CreateTypeInput,
  TypeDetail,
  UpdateTypeInput,
} from "@/domain/types";
import { createClaim, updateClaim } from "@/services/claims";
import { archiveDomain, createDomain, updateDomain } from "@/services/domains";
import { updateDocumentMetadata } from "@/services/documents";
import {
  createLexicalization,
  deleteLexicalization,
  updateLexicalization,
} from "@/services/lexicalizations";
import {
  createRelationship,
  updateRelationship,
} from "@/services/relationships";
import type { CommandResult } from "@/services/result";
import {
  assignDocumentToShelfFolder,
  createDocumentShelfFolder,
  deleteDocumentShelfFolder,
  deleteShelfItem,
  updateDocumentShelfFolder,
} from "@/services/shelf";
import { createSubject, updateSubject } from "@/services/subjects";
import { createType, updateType } from "@/services/types";
import type { DocumentShelfFolder, ShelfClassKey } from "@/domain/shelf";

function revalidateWorkspaceSurfaces() {
  revalidatePath("/workshop");
}

export async function createDomainShellAction(
  input: CreateDomainInput
): Promise<CommandResult<Domain>> {
  const result = await createDomain(input);

  if (result.ok) {
    revalidateWorkspaceSurfaces();
  }

  return result;
}

export async function updateDomainShellAction(
  id: string,
  input: UpdateDomainInput
): Promise<CommandResult<Domain>> {
  const result = await updateDomain(id, input);

  if (result.ok) {
    revalidateWorkspaceSurfaces();
  }

  return result;
}

export async function archiveDomainShellAction(
  id: string
): Promise<CommandResult<Domain>> {
  const result = await archiveDomain(id);

  if (result.ok) {
    revalidateWorkspaceSurfaces();
  }

  return result;
}

export async function createSubjectShellAction(
  domainSlug: string,
  input: CreateSubjectInput
): Promise<CommandResult<SubjectDetail>> {
  const result = await createSubject(domainSlug, input);

  if (result.ok) {
    revalidateWorkspaceSurfaces();
  }

  return result;
}

export async function updateSubjectShellAction(
  id: string,
  input: UpdateSubjectInput
): Promise<CommandResult<SubjectDetail>> {
  const result = await updateSubject(id, input);

  if (result.ok) {
    revalidateWorkspaceSurfaces();
  }

  return result;
}

export async function createClaimShellAction(
  domainSlug: string,
  input: CreateClaimInput
): Promise<CommandResult<ClaimDetail>> {
  const result = await createClaim(domainSlug, input);

  if (result.ok) {
    revalidateWorkspaceSurfaces();
  }

  return result;
}

export async function updateClaimShellAction(
  id: string,
  domainSlug: string,
  input: UpdateClaimInput
): Promise<CommandResult<ClaimDetail>> {
  const result = await updateClaim(id, domainSlug, input);

  if (result.ok) {
    revalidateWorkspaceSurfaces();
  }

  return result;
}

export async function createRelationshipShellAction(
  domainSlug: string,
  input: CreateRelationshipInput
): Promise<CommandResult<RelationshipDetail>> {
  const result = await createRelationship(domainSlug, input);

  if (result.ok) {
    revalidateWorkspaceSurfaces();
  }

  return result;
}

export async function updateRelationshipShellAction(
  id: string,
  domainSlug: string,
  input: UpdateRelationshipInput
): Promise<CommandResult<RelationshipDetail>> {
  const result = await updateRelationship(id, domainSlug, input);

  if (result.ok) {
    revalidateWorkspaceSurfaces();
  }

  return result;
}

export async function createTypeShellAction(
  domainSlug: string,
  input: CreateTypeInput
): Promise<CommandResult<TypeDetail>> {
  const result = await createType(domainSlug, input);

  if (result.ok) {
    revalidateWorkspaceSurfaces();
  }

  return result;
}

export async function updateTypeShellAction(
  id: string,
  domainSlug: string,
  input: UpdateTypeInput
): Promise<CommandResult<TypeDetail>> {
  const result = await updateType(id, domainSlug, input);

  if (result.ok) {
    revalidateWorkspaceSurfaces();
  }

  return result;
}

export async function deleteShelfItemShellAction(
  domainSlug: string,
  classKey: ShelfClassKey,
  id: string
): Promise<CommandResult<{ classKey: ShelfClassKey; id: string }>> {
  const result = await deleteShelfItem(domainSlug, classKey, id);

  if (result.ok) {
    revalidateWorkspaceSurfaces();
  }

  return result;
}

export async function createDocumentShelfFolderShellAction(
  domainSlug: string,
  input: { label: string; selectedDocumentId?: string | null }
): Promise<CommandResult<DocumentShelfFolder>> {
  const result = await createDocumentShelfFolder(domainSlug, input);

  if (result.ok) {
    revalidateWorkspaceSurfaces();
  }

  return result;
}

export async function updateDocumentShelfFolderShellAction(
  domainSlug: string,
  folderId: string,
  input: { collapsed?: boolean; label?: string }
): Promise<CommandResult<DocumentShelfFolder>> {
  const result = await updateDocumentShelfFolder(domainSlug, folderId, input);

  if (result.ok) {
    revalidateWorkspaceSurfaces();
  }

  return result;
}

export async function deleteDocumentShelfFolderShellAction(
  domainSlug: string,
  folderId: string
): Promise<CommandResult<{ id: string }>> {
  const result = await deleteDocumentShelfFolder(domainSlug, folderId);

  if (result.ok) {
    revalidateWorkspaceSurfaces();
  }

  return result;
}

export async function assignDocumentToShelfFolderShellAction(
  domainSlug: string,
  input: { documentId: string; folderId: string }
): Promise<
  CommandResult<{ folderId: string; itemId: string; position: number }>
> {
  const result = await assignDocumentToShelfFolder(domainSlug, input);

  if (result.ok) {
    revalidateWorkspaceSurfaces();
  }

  return result;
}

export async function updateDocumentMetadataShellAction(
  id: string,
  domainSlug: string,
  input: UpdateDocumentMetadataInput
): Promise<CommandResult<PreparedDocument>> {
  const result = await updateDocumentMetadata(id, domainSlug, input);

  if (result.ok) {
    revalidateWorkspaceSurfaces();
  }

  return result;
}

export async function createLexicalizationShellAction(
  domainSlug: string,
  input: CreateLexicalizationInput
): Promise<CommandResult<LexicalizationDetail>> {
  const result = await createLexicalization(domainSlug, input);

  if (result.ok) {
    revalidateWorkspaceSurfaces();
  }

  return result;
}

export async function updateLexicalizationShellAction(
  id: string,
  domainSlug: string,
  input: UpdateLexicalizationInput
): Promise<CommandResult<LexicalizationDetail>> {
  const result = await updateLexicalization(id, domainSlug, input);

  if (result.ok) {
    revalidateWorkspaceSurfaces();
  }

  return result;
}

export async function deleteLexicalizationShellAction(
  id: string,
  domainSlug: string
): Promise<CommandResult<{ id: string }>> {
  const result = await deleteLexicalization(id, domainSlug);

  if (result.ok) {
    revalidateWorkspaceSurfaces();
  }

  return result;
}
