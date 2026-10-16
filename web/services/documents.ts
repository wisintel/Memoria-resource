import { createHash } from "node:crypto";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/data/client";
import {
  classes,
  documents,
  objectDomainMemberships,
  sourceUnits,
  types,
} from "@/data/schema";
import {
  createCanonicalObject,
  getDomainMemberObject,
} from "@/data/queries/canonical-objects";
import {
  getClassByKey,
  getDefaultStatusForClass,
} from "@/data/queries/registry";
import {
  type DocumentSourceType,
  type DocumentFormOptions,
  prepareDocumentInput,
  type PrepareDocumentInput,
  type PreparedDocument,
  updateDocumentMetadataInput,
  type UpdateDocumentMetadataInput,
} from "@/domain/documents";
import {
  byteCount,
  shardMarkdown,
  type MarkdownShard,
} from "@/lib/documents/markdown-sharding";
import { cleanMarkdownArtifacts } from "@/lib/documents/markdown-cleanup";
import { deriveToc } from "@/lib/documents/document-toc";
import { getDomainBySlug } from "@/services/domains";
import { err, ok } from "@/services/result";
import type { CommandResult } from "@/services/result";
import { containsPattern } from "@/services/search-patterns";
import {
  assignDocumentToShelfFolder,
  loadDocumentShelfFolders,
  removeDocumentFromShelfFolders,
} from "@/services/shelf";

function validationError(details: unknown) {
  return err("invalid_input", "Document input is invalid", details);
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeUploadedContent(value: string) {
  return value.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

function nullableText(value: string | undefined) {
  const normalized = value?.trim();

  return normalized ? normalized : null;
}

function stripYamlFrontMatter(markdown: string) {
  const match = /^(?:---)[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(markdown);

  if (!match) {
    return {
      body: markdown,
      frontMatter: null,
    };
  }

  return {
    body: markdown.slice(match[0].length),
    frontMatter: match[1],
  };
}

async function getDocumentType(documentTypeId: string, domainId: string) {
  const [documentType] = await db
    .select({ id: types.id })
    .from(types)
    .innerJoin(classes, eq(classes.id, types.classId))
    .where(
      and(
        eq(types.id, documentTypeId),
        eq(classes.key, "document"),
        or(eq(types.domainId, domainId), isNull(types.domainId))
      )
    )
    .limit(1);

  return documentType ?? null;
}

type PreparedSourceUnit = {
  body: string;
  headingPath: string[];
  locator: Record<string, unknown>;
  position: number;
  sizeBytes: number;
  unitType: string;
};

export type DocumentListItem = {
  id: string;
  label: string;
  preparationState: string;
  shardCount: number | null;
  sizeBytes: number | null;
  sourceFilename: string | null;
  sourceType: string;
  updatedAt: Date;
};

function sourceUnitValues(documentId: string, units: PreparedSourceUnit[]) {
  return units.map((unit) => ({
    body: unit.body,
    contentSha256: sha256(unit.body),
    documentId,
    headingPath: unit.headingPath,
    locator: unit.locator,
    position: unit.position,
    sizeBytes: unit.sizeBytes,
    unitType: unit.unitType,
  }));
}

function sourceUnitsForMarkdown(markdown: string): PreparedSourceUnit[] {
  return shardMarkdown(markdown).map((shard: MarkdownShard) => ({
    body: shard.body,
    headingPath: shard.headingPath,
    locator: {
      kind: "markdown_heading_path",
      position: shard.position,
    },
    position: shard.position,
    sizeBytes: shard.sizeBytes,
    unitType: "markdown_shard",
  }));
}

function sourceUnitsForHtml(html: string): PreparedSourceUnit[] {
  return [
    {
      body: html,
      headingPath: [],
      locator: {
        kind: "html_document",
        position: 0,
      },
      position: 0,
      sizeBytes: byteCount(html),
      unitType: "html_document",
    },
  ];
}

function mimeTypeForSource(sourceType: DocumentSourceType) {
  return sourceType === "html" ? "text/html" : "text/markdown";
}

function preparedBodyForSource(
  sourceType: DocumentSourceType,
  content: string
) {
  if (sourceType === "html") {
    return {
      body: content,
      preparationStrategy: "html-single-source-unit",
      units: sourceUnitsForHtml(content),
    };
  }

  const stripped = stripYamlFrontMatter(content);
  const body = cleanMarkdownArtifacts(stripped.body);

  return {
    body,
    frontMatter: stripped.frontMatter,
    preparationStrategy: stripped.frontMatter
      ? "markdown-frontmatter-stripped"
      : "verbatim",
    units: sourceUnitsForMarkdown(body),
  };
}

function inferStructuralNotes(sourceType: DocumentSourceType, body: string) {
  const notes: string[] = [sourceType];

  if (sourceType === "html") {
    if (/<h[1-6]\b/i.test(body)) {
      notes.push("has headings");
    }

    if (/<table\b/i.test(body)) {
      notes.push("has tables");
    }

    if (/<(?:ul|ol)\b/i.test(body)) {
      notes.push("has lists");
    }

    if (/<img\b/i.test(body)) {
      notes.push("has images");
    }

    if (/<a\b/i.test(body)) {
      notes.push("has links");
    }

    if (/<(?:pre|code)\b/i.test(body)) {
      notes.push("has code blocks");
    }

    const hasStyles = /<style\b[\s\S]*?<\/style>/i.test(body);
    const hasScripts = /<script\b[\s\S]*?<\/script>/i.test(body);

    if (hasStyles) {
      notes.push("html contains style blocks");
    }

    if (hasScripts) {
      notes.push("html contains script blocks");
    }

    if (hasStyles || hasScripts) {
      notes.push("extraction should ignore CSS and script content");
    }

    return notes.join("; ");
  }

  if (/^#{1,6}\s+\S/m.test(body)) {
    notes.push("has headings");
  }

  if (/^\|.+\|\s*\n\|[\s:-]+\|/m.test(body)) {
    notes.push("has tables");
  }

  if (/^\s*(?:[-*+]\s+|\d+\.\s+)/m.test(body)) {
    notes.push("has lists");
  }

  if (/!\[[^\]\n]*\]\([^)]+\)/.test(body)) {
    notes.push("has images");
  }

  if (/\[[^\]\n]+\]\([^)]+\)/.test(body)) {
    notes.push("has links");
  }

  if (/```|~~~/.test(body)) {
    notes.push("has code blocks");
  }

  return notes.join("; ");
}

function reassembledBody(units: PreparedSourceUnit[]) {
  return units
    .toSorted((left, right) => left.position - right.position)
    .map((unit) => unit.body)
    .join("");
}

function documentMetadata(input: {
  conversion?: Record<string, unknown>;
  frontMatter?: string | null;
  preparationStrategy: string;
  sourceUnitCount: number;
}) {
  return {
    ...(input.conversion ? { conversion: input.conversion } : {}),
    ...(input.frontMatter
      ? {
          frontMatter: {
            format: "yaml",
            raw: input.frontMatter,
          },
        }
      : {}),
    preparation: {
      strippedFrontMatter: Boolean(input.frontMatter),
      sourceUnitCount: input.sourceUnitCount,
      strategy: input.preparationStrategy,
    },
  };
}

async function findDuplicateDocument(input: {
  contentSha256: string;
  domainId: string;
}) {
  const [existing] = await db
    .select({ id: documents.id })
    .from(documents)
    .innerJoin(
      objectDomainMemberships,
      eq(objectDomainMemberships.objectId, documents.id)
    )
    .where(
      and(
        eq(documents.contentSha256, input.contentSha256),
        eq(objectDomainMemberships.domainId, input.domainId),
        eq(objectDomainMemberships.membershipState, "member")
      )
    )
    .limit(1);

  return existing?.id ?? null;
}

async function loadPreparedDocument(
  documentId: string,
  alreadyExists = false
): Promise<PreparedDocument | null> {
  const [document] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);

  if (!document) {
    return null;
  }

  const units = await db
    .select()
    .from(sourceUnits)
    .where(eq(sourceUnits.documentId, documentId))
    .orderBy(sourceUnits.position);

  return {
    alreadyExists,
    document,
    sourceUnits: units,
    toc: deriveToc(
      units.map((unit) => ({
        body: unit.body,
        headingPath: Array.isArray(unit.headingPath)
          ? unit.headingPath.filter(
              (entry): entry is string => typeof entry === "string"
            )
          : [],
        position: unit.position,
      }))
    ),
  };
}

export async function prepareDocument(
  domainSlug: string,
  input: PrepareDocumentInput
): Promise<CommandResult<PreparedDocument>> {
  const parsed = prepareDocumentInput.safeParse(input);

  if (!parsed.success) {
    return validationError(parsed.error.flatten());
  }

  const [domain, documentClass] = await Promise.all([
    getDomainBySlug(domainSlug),
    getClassByKey("document"),
  ]);

  if (!domain) {
    return err("not_found", "Domain was not found", { domainSlug });
  }

  if (!documentClass) {
    return err(
      "registry_missing",
      "Document class is missing from the registry"
    );
  }

  const documentTypeId = parsed.data.documentTypeId;

  if (documentTypeId) {
    const documentType = await getDocumentType(documentTypeId, domain.id);

    if (!documentType) {
      return err("invalid_input", "Document type is invalid", {
        documentTypeId,
      });
    }
  }

  if (parsed.data.documentId) {
    const existingDocument = await getDomainMemberObject({
      classKey: "document",
      domainSlug,
      objectId: parsed.data.documentId,
    });

    if (!existingDocument) {
      return err("not_found", "Document was not found", {
        id: parsed.data.documentId,
      });
    }
  }

  const status = await getDefaultStatusForClass(documentClass.id);
  const content = normalizeUploadedContent(parsed.data.content);
  const contentSha256 = sha256(content);

  if (!parsed.data.documentId) {
    const duplicateId = await findDuplicateDocument({
      contentSha256,
      domainId: domain.id,
    });

    if (duplicateId) {
      const duplicate = await loadPreparedDocument(duplicateId, true);

      if (duplicate) {
        return ok(duplicate);
      }
    }
  }

  const preparedBody = preparedBodyForSource(parsed.data.sourceType, content);
  const preparedUnits = preparedBody.units;
  const bodySha256 = sha256(reassembledBody(preparedUnits));
  const sizeBytes = byteCount(preparedBody.body);
  const metadata = documentMetadata({
    frontMatter: preparedBody.frontMatter,
    preparationStrategy: preparedBody.preparationStrategy,
    sourceUnitCount: preparedUnits.length,
  });
  const structuralNotes = inferStructuralNotes(
    parsed.data.sourceType,
    preparedBody.body
  );

  if (parsed.data.documentId) {
    const documentId = parsed.data.documentId;

    await db.transaction(async (tx) => {
      await tx
        .update(documents)
        .set({
          bodySha256,
          contentSha256,
          description: parsed.data.description ?? "",
          ...(documentTypeId !== undefined ? { documentTypeId } : {}),
          documentForm: parsed.data.documentForm,
          errorMessage: null,
          label: parsed.data.label,
          metadata,
          mimeType:
            nullableText(parsed.data.mimeType) ??
            mimeTypeForSource(parsed.data.sourceType),
          preparationState: "prepared",
          shardCount: preparedUnits.length,
          sizeBytes,
          sourceFilename: nullableText(parsed.data.sourceFilename),
          sourceType: parsed.data.sourceType,
          sourceUrl: nullableText(parsed.data.sourceUrl),
          statusId: status?.id ?? null,
          structuralNotes,
        })
        .where(eq(documents.id, documentId));

      await tx
        .delete(sourceUnits)
        .where(eq(sourceUnits.documentId, documentId));

      const values = sourceUnitValues(documentId, preparedUnits);

      if (values.length > 0) {
        await tx.insert(sourceUnits).values(values);
      }
    });

    const prepared = await loadPreparedDocument(documentId);

    if (!prepared) {
      return err("not_found", "Prepared document was not found", {
        id: documentId,
      });
    }

    return ok(prepared);
  }

  const created = await createCanonicalObject({
    classId: documentClass.id,
    domainId: domain.id,
    insertRecord: async (objectTx, objectId) => {
      await objectTx.insert(documents).values({
        id: objectId,
        bodySha256,
        contentSha256,
        description: parsed.data.description ?? "",
        documentTypeId: documentTypeId ?? null,
        documentForm: parsed.data.documentForm,
        errorMessage: null,
        label: parsed.data.label,
        metadata,
        mimeType:
          nullableText(parsed.data.mimeType) ??
          mimeTypeForSource(parsed.data.sourceType),
        preparationState: "prepared",
        shardCount: preparedUnits.length,
        sizeBytes,
        sourceFilename: nullableText(parsed.data.sourceFilename),
        sourceType: parsed.data.sourceType,
        sourceUrl: nullableText(parsed.data.sourceUrl),
        statusId: status?.id ?? null,
        structuralNotes,
      });

      const values = sourceUnitValues(objectId, preparedUnits);

      if (values.length > 0) {
        await objectTx.insert(sourceUnits).values(values);
      }
    },
  });

  const prepared = await loadPreparedDocument(created.id);

  if (!prepared) {
    return err("not_found", "Prepared document was not found", {
      id: created.id,
    });
  }

  return ok(prepared);
}

export async function getPreparedDocument(
  id: string,
  domainSlug?: string
): Promise<PreparedDocument | null> {
  if (domainSlug) {
    const membership = await getDomainMemberObject({
      classKey: "document",
      domainSlug,
      objectId: id,
    });

    if (!membership) {
      return null;
    }
  }

  return loadPreparedDocument(id);
}

export async function listDocuments({
  domainId,
  limit,
  query,
}: {
  domainId: string;
  limit: number;
  query?: string | null;
}): Promise<DocumentListItem[]> {
  const pattern = containsPattern(query);

  return db.execute<DocumentListItem>(sql`
    select
      documents.id,
      documents.label,
      documents.source_type as "sourceType",
      documents.preparation_state as "preparationState",
      documents.source_filename as "sourceFilename",
      documents.shard_count as "shardCount",
      documents.size_bytes as "sizeBytes",
      documents.updated_at as "updatedAt"
    from documents
    join object_domain_memberships memberships
      on memberships.object_id = documents.id
    where memberships.domain_id = ${domainId}
      and memberships.membership_state = 'member'
      and (
        ${!query?.trim()}
        or documents.label ilike ${pattern}
        or documents.source_filename ilike ${pattern}
      )
    order by documents.updated_at desc, documents.id
    limit ${limit}
  `);
}

export async function updateDocumentMetadata(
  id: string,
  domainSlug: string,
  input: UpdateDocumentMetadataInput
): Promise<CommandResult<PreparedDocument>> {
  const parsed = updateDocumentMetadataInput.safeParse(input);

  if (!parsed.success) {
    return validationError(parsed.error.flatten());
  }

  const [domain, existingDocument] = await Promise.all([
    getDomainBySlug(domainSlug),
    getDomainMemberObject({
      classKey: "document",
      domainSlug,
      objectId: id,
    }),
  ]);

  if (!domain) {
    return err("not_found", "Domain was not found", { domainSlug });
  }

  if (!existingDocument) {
    return err("not_found", "Document was not found", { id });
  }

  const documentTypeId = parsed.data.documentTypeId ?? null;

  if (documentTypeId) {
    const documentType = await getDocumentType(documentTypeId, domain.id);

    if (!documentType) {
      return err("invalid_input", "Document type is invalid", {
        documentTypeId,
      });
    }
  }

  if (parsed.data.folderId) {
    const folders = await loadDocumentShelfFolders(domainSlug);
    const folderExists = folders.folders.some(
      (folder) => folder.id === parsed.data.folderId
    );

    if (!folderExists) {
      return err("invalid_input", "Folder is invalid", {
        folderId: parsed.data.folderId,
      });
    }
  }

  await db
    .update(documents)
    .set({
      documentTypeId,
      label: parsed.data.label,
    })
    .where(eq(documents.id, id));

  if (parsed.data.folderId !== undefined) {
    const folderResult = parsed.data.folderId
      ? await assignDocumentToShelfFolder(domainSlug, {
          documentId: id,
          folderId: parsed.data.folderId,
        })
      : await removeDocumentFromShelfFolders(domainSlug, id);

    if (!folderResult.ok) {
      return err(folderResult.error.code, folderResult.error.message, {
        documentId: id,
        folderId: parsed.data.folderId,
      });
    }
  }

  const prepared = await loadPreparedDocument(id);

  if (!prepared) {
    return err("not_found", "Document was not found", { id });
  }

  return ok(prepared);
}

export async function getDocumentFormOptions(
  domainSlug: string
): Promise<DocumentFormOptions> {
  const [domain, documentClass] = await Promise.all([
    getDomainBySlug(domainSlug),
    getClassByKey("document"),
  ]);

  if (!documentClass) {
    return { types: [] };
  }

  const typeConditions = [isNull(types.domainId)];

  if (domain) {
    typeConditions.push(eq(types.domainId, domain.id));
  }

  const typeRows = await db
    .select({
      id: types.id,
      label: types.label,
    })
    .from(types)
    .where(and(eq(types.classId, documentClass.id), or(...typeConditions)))
    .orderBy(types.label);

  return {
    types: typeRows,
  };
}
