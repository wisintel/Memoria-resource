import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../client";
import {
  classKeyForTypeCard,
  normalizeAssertionState,
  normalizeBundleStatus,
  normalizeEvidenceLinkRole,
  normalizeMapVisibility,
  normalizeSlug,
} from "./memoria-bundle-helpers";
import { seedRegistry } from "../registry-seed";
import {
  claimTargets,
  claims,
  classes,
  documents,
  domainMapNodes,
  domainMapRelationships,
  domainMaps,
  domains,
  evidence,
  evidenceLinks,
  lexicalizations,
  objectDomainMemberships,
  objects,
  relationships,
  statuses,
  subjects,
  types,
} from "../schema";

type BundleRecord = Record<string, unknown> & {
  id?: string;
};

type MemoriaBundle = {
  bundle_type: string;
  bundle_version: string;
  exported_at: string;
  domain: BundleRecord & {
    slug?: string;
    label?: string;
    description?: string;
    status?: string;
  };
  counts: Record<string, number>;
  type_cards: BundleRecord[];
  documents: BundleRecord[];
  subjects: BundleRecord[];
  lexicalizations: BundleRecord[];
  relationships: BundleRecord[];
  claims: Array<BundleRecord & { targets?: BundleRecord[] }>;
  evidence: BundleRecord[];
  evidence_links: BundleRecord[];
  views: Array<
    BundleRecord & {
      relationships?: BundleRecord[];
      subjects?: BundleRecord[];
    }
  >;
};

type ImportReport = {
  actual: Record<string, number>;
  domainId: string;
  expected: Record<string, number>;
};

const projectRoot = resolve(process.cwd(), "../..");
export const defaultBundlePath = resolve(
  projectRoot,
  "workbench/test-data/memoria-domain-bundle-draft.json"
);

function readBundle(path = defaultBundlePath): MemoriaBundle {
  return JSON.parse(readFileSync(path, "utf8")) as MemoriaBundle;
}

function asText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asDate(value: unknown) {
  const parsed = new Date(String(value ?? ""));
  return Number.isNaN(parsed.valueOf()) ? new Date() : parsed;
}

function asObject(value: unknown) {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function metadata(bundle: MemoriaBundle, original: BundleRecord) {
  return {
    import: {
      bundle_type: bundle.bundle_type,
      bundle_version: bundle.bundle_version,
      exported_at: bundle.exported_at,
      original_id: original.id ?? null,
    },
    original,
  };
}

export async function importMemoriaBundle(path = defaultBundlePath) {
  await seedRegistry();

  const bundle = readBundle(path);

  return db.transaction(async (tx): Promise<ImportReport> => {
    const classRows = await tx.select().from(classes);
    const statusRows = await tx.select().from(statuses);
    const classIdByKey = new Map(classRows.map((row) => [row.key, row.id]));
    const classKeyById = new Map(classRows.map((row) => [row.id, row.key]));
    const statusIdByClassAndKey = new Map<string, string>();

    for (const statusRow of statusRows) {
      const classKey = classKeyById.get(statusRow.classId);

      if (classKey) {
        statusIdByClassAndKey.set(
          `${classKey}:${statusRow.key}`,
          statusRow.id
        );
      }
    }

    function requiredClassId(classKey: string) {
      const classId = classIdByKey.get(classKey);

      if (!classId) {
        throw new Error(`Missing class seed: ${classKey}`);
      }

      return classId;
    }

    function statusId(classKey: string, value: unknown) {
      const key = normalizeBundleStatus(value, classKey);
      const id = statusIdByClassAndKey.get(`${classKey}:${key}`);

      if (!id) {
        throw new Error(`Missing status seed: ${classKey}:${key}`);
      }

      return id;
    }

    async function createObject(classKey: string) {
      const [objectRow] = await tx
        .insert(objects)
        .values({ classId: requiredClassId(classKey) })
        .returning({ id: objects.id });

      if (!objectRow) {
        throw new Error(`Object insert failed for ${classKey}`);
      }

      return objectRow.id;
    }

    async function addMembership(objectId: string, domainId: string) {
      await tx
        .insert(objectDomainMemberships)
        .values({ domainId, objectId })
        .onConflictDoNothing();
    }

    const [existingDomain] = await tx
      .select()
      .from(domains)
      .where(eq(domains.slug, asText(bundle.domain.slug, "memoria")))
      .limit(1);

    let domainId = existingDomain?.id ?? null;

    if (!domainId) {
      domainId = await createObject("domain");
      await tx.insert(domains).values({
        id: domainId,
        slug: asText(bundle.domain.slug, "memoria"),
        label: asText(bundle.domain.label, "Memoria"),
        description: asText(bundle.domain.description),
        statusId: statusId("domain", bundle.domain.status),
        metadata: metadata(bundle, bundle.domain),
      });
    } else {
      await tx
        .update(domains)
        .set({
          label: asText(bundle.domain.label, "Memoria"),
          description: asText(bundle.domain.description),
          statusId: statusId("domain", bundle.domain.status),
          metadata: metadata(bundle, bundle.domain),
        })
        .where(eq(domains.id, domainId));
    }

    const existingMembership = await tx
      .select({ objectId: objectDomainMemberships.objectId })
      .from(objectDomainMemberships)
      .where(eq(objectDomainMemberships.domainId, domainId))
      .limit(1);

    if (existingMembership.length > 0) {
      throw new Error(
        "Memoria domain already has semantic object memberships; aborting import"
      );
    }

    const typeIdByOriginalId = new Map<string, string>();
    const typeIdByClassAndSlug = new Map<string, string>();
    const objectIdByOriginalId = new Map<string, string>();
    const evidenceIdByOriginalId = new Map<string, string>();

    function rememberObject(original: BundleRecord, objectId: string) {
      if (original.id) {
        objectIdByOriginalId.set(original.id, objectId);
      }
    }

    function requiredOriginalObjectId(originalId: unknown, label: string) {
      const objectId =
        typeof originalId === "string"
          ? objectIdByOriginalId.get(originalId)
          : null;

      if (!objectId) {
        throw new Error(`Missing object crosswalk for ${label}: ${originalId}`);
      }

      return objectId;
    }

    function requiredTypeId(classKey: string, value: unknown) {
      const slug = normalizeSlug(value);
      const typeId = typeIdByClassAndSlug.get(`${classKey}:${slug}`);

      if (!typeId) {
        throw new Error(`Missing type crosswalk for ${classKey}:${slug}`);
      }

      return typeId;
    }

    for (const typeCard of bundle.type_cards) {
      const classKey = classKeyForTypeCard(typeCard.applies_to);
      const slug = normalizeSlug(typeCard.slug ?? typeCard.label);
      const [typeRow] = await tx
        .insert(types)
        .values({
          classId: requiredClassId(classKey),
          domainId,
          slug,
          label: asText(typeCard.label, slug),
          description: asText(typeCard.description),
          statusId: statusId("type", typeCard.status),
          metadata: {
            behavior: asObject(typeCard.behavior_json),
            fields: asObject(typeCard.fields_json),
            ...metadata(bundle, typeCard),
          },
        })
        .returning({ id: types.id });

      if (!typeRow) {
        throw new Error("Type insert failed");
      }

      if (typeCard.id) {
        typeIdByOriginalId.set(typeCard.id, typeRow.id);
      }

      typeIdByClassAndSlug.set(`${classKey}:${slug}`, typeRow.id);
    }

    for (const document of bundle.documents) {
      const objectId = await createObject("document");
      rememberObject(document, objectId);
      await addMembership(objectId, domainId);

      const documentTypeId =
        typeof document.document_type_id === "string"
          ? typeIdByOriginalId.get(document.document_type_id)
          : undefined;

      await tx.insert(documents).values({
        id: objectId,
        label: asText(document.label, "Untitled document"),
        documentTypeId:
          documentTypeId ?? requiredTypeId("document", document.source_type),
        sourceType: asText(document.source_type, "markdown"),
        statusId: statusId("document", document.status),
        preparationState: asText(document.extraction_stage, "not_started"),
        contentSha256: asText(document.content_sha256),
        bodySha256: asText(document.body_sha256),
        sizeBytes: asNumber(document.size_bytes),
        documentForm: asText(
          document.document_form,
          asText(document.intake_profile, asText(document.source_type, "document"))
        ),
        structuralNotes:
          typeof document.structural_notes === "string"
            ? document.structural_notes
            : null,
        sourceFilename:
          typeof document.source_filename === "string"
            ? document.source_filename
            : null,
        sourceUrl:
          typeof document.source_url === "string" ? document.source_url : null,
        mimeType:
          typeof document.mime_type === "string" ? document.mime_type : null,
        shardCount: asNumber(document.shard_count),
        source: typeof document.source === "string" ? document.source : null,
        metadata: metadata(bundle, document),
        createdAt: asDate(document.created),
        updatedAt: asDate(document.updated),
      });
    }

    for (const subject of bundle.subjects) {
      const objectId = await createObject("subject");
      rememberObject(subject, objectId);
      await addMembership(objectId, domainId);

      await tx.insert(subjects).values({
        id: objectId,
        canonicalLabel: asText(subject.label, "Untitled subject"),
        subjectTypeId: requiredTypeId("subject", subject.type),
        description: asText(subject.description),
        statusId: statusId("subject", subject.status),
        source: typeof subject.source === "string" ? subject.source : null,
        metadata: metadata(bundle, subject),
        createdAt: asDate(subject.created),
        updatedAt: asDate(subject.updated),
      });
    }

    for (const relationship of bundle.relationships) {
      const objectId = await createObject("relationship");
      rememberObject(relationship, objectId);
      await addMembership(objectId, domainId);

      await tx.insert(relationships).values({
        id: objectId,
        sourceObjectId: requiredOriginalObjectId(
          relationship.source_id,
          "relationship source"
        ),
        targetObjectId: requiredOriginalObjectId(
          relationship.target_id,
          "relationship target"
        ),
        relationshipTypeId: requiredTypeId("relationship", relationship.type),
        statusId: statusId("relationship", relationship.status),
        assertionState: normalizeAssertionState(relationship.assertion_state) as
          | "candidate"
          | "accepted"
          | "rejected"
          | "deferred"
          | "superseded"
          | "review_needed",
        label: asText(relationship.label),
        source:
          typeof relationship.source === "string" ? relationship.source : null,
        metadata: metadata(bundle, relationship),
        createdAt: asDate(relationship.created),
        updatedAt: asDate(relationship.updated),
      });
    }

    for (const claim of bundle.claims) {
      const objectId = await createObject("claim");
      rememberObject(claim, objectId);
      await addMembership(objectId, domainId);

      await tx.insert(claims).values({
        id: objectId,
        claimText: asText(claim.claim_text),
        claimTypeId: requiredTypeId("claim", claim.type),
        statusId: statusId("claim", claim.status),
        assertionState: normalizeAssertionState(claim.assertion_state) as
          | "candidate"
          | "accepted"
          | "rejected"
          | "deferred"
          | "superseded"
          | "review_needed",
        source: typeof claim.source === "string" ? claim.source : null,
        metadata: metadata(bundle, claim),
        createdAt: asDate(claim.created),
        updatedAt: asDate(claim.updated),
      });

      for (const target of claim.targets ?? []) {
        await tx.insert(claimTargets).values({
          claimId: objectId,
          targetObjectId: requiredOriginalObjectId(
            target.target_id,
            "claim target"
          ),
          targetRole: asText(target.target_role, "about"),
          position: asNumber(target.position),
          createdAt: asDate(target.created),
          updatedAt: asDate(target.updated),
        });
      }
    }

    for (const lexicalization of bundle.lexicalizations) {
      await tx.insert(lexicalizations).values({
        objectId: requiredOriginalObjectId(
          lexicalization.target_id,
          "lexicalization target"
        ),
        lexicalType: asText(lexicalization.lexical_type, "alias"),
        value: asText(lexicalization.value),
        normalizedValue: asText(
          lexicalization.normalized_value,
          normalizeSlug(lexicalization.value)
        ),
        language: asText(lexicalization.language, "en"),
        domainId,
        statusId: statusId("lexicalization", lexicalization.status),
        metadata: metadata(bundle, lexicalization),
        createdAt: asDate(lexicalization.created),
        updatedAt: asDate(lexicalization.updated),
      });
    }

    for (const evidenceRecord of bundle.evidence) {
      const [evidenceRow] = await tx
        .insert(evidence)
        .values({
          evidenceKind: asText(evidenceRecord.evidence_kind, "import_record"),
          sourceKind: asText(evidenceRecord.source_kind, "json_bundle"),
          locator: asObject(evidenceRecord.locator_json),
          summary: asText(evidenceRecord.summary),
          excerpt: asText(evidenceRecord.excerpt),
          statusId: statusId("evidence", evidenceRecord.status),
          metadata: metadata(bundle, evidenceRecord),
          createdAt: asDate(evidenceRecord.created),
          updatedAt: asDate(evidenceRecord.updated),
        })
        .returning({ id: evidence.id });

      if (!evidenceRow) {
        throw new Error("Evidence insert failed");
      }

      if (evidenceRecord.id) {
        evidenceIdByOriginalId.set(evidenceRecord.id, evidenceRow.id);
      }
    }

    for (const evidenceLink of bundle.evidence_links) {
      const evidenceId =
        typeof evidenceLink.evidence_id === "string"
          ? evidenceIdByOriginalId.get(evidenceLink.evidence_id)
          : null;

      if (!evidenceId) {
        throw new Error(
          `Missing evidence crosswalk for link: ${evidenceLink.id}`
        );
      }

      await tx.insert(evidenceLinks).values({
        evidenceId,
        targetObjectId: requiredOriginalObjectId(
          evidenceLink.target_id,
          "evidence link target"
        ),
        linkRole: normalizeEvidenceLinkRole(evidenceLink.link_role) as
          | "supports"
          | "contradicts"
          | "qualifies"
          | "provenance",
        createdAt: asDate(evidenceLink.created),
        updatedAt: asDate(evidenceLink.updated),
      });
    }

    for (const view of bundle.views) {
      const objectId = await createObject("domain_map");
      rememberObject(view, objectId);
      await addMembership(objectId, domainId);

      await tx.insert(domainMaps).values({
        id: objectId,
        slug: asText(view.slug, `domain-map-${objectId}`),
        label: asText(view.label, "Domain Map"),
        mapKindTypeId: requiredTypeId("domain_map", view.view_kind),
        statusId: statusId("domain_map", view.status),
        metadata: metadata(bundle, view),
        createdAt: asDate(view.created),
        updatedAt: asDate(view.updated),
      });

      for (const node of view.subjects ?? []) {
        await tx.insert(domainMapNodes).values({
          domainMapId: objectId,
          objectId: requiredOriginalObjectId(
            node.subject_id,
            "domain map subject"
          ),
          visibility: normalizeMapVisibility(node.visibility) as
            | "visible"
            | "hidden"
            | "collapsed"
            | "metadata_only",
          position: asObject(node.position_json),
          createdAt: asDate(view.created),
          updatedAt: asDate(view.updated),
        });
      }

      for (const mapRelationship of view.relationships ?? []) {
        await tx.insert(domainMapRelationships).values({
          domainMapId: objectId,
          relationshipId: requiredOriginalObjectId(
            mapRelationship.relationship_id,
            "domain map relationship"
          ),
          visibility: normalizeMapVisibility(mapRelationship.visibility) as
            | "visible"
            | "hidden"
            | "collapsed"
            | "metadata_only",
          createdAt: asDate(view.created),
          updatedAt: asDate(view.updated),
        });
      }
    }

    return {
      domainId,
      expected: bundle.counts,
      actual: {
        claims: bundle.claims.length,
        documents: bundle.documents.length,
        domain_maps: bundle.views.length,
        evidence: bundle.evidence.length,
        evidence_links: bundle.evidence_links.length,
        lexicalizations: bundle.lexicalizations.length,
        relationships: bundle.relationships.length,
        subjects: bundle.subjects.length,
        type_cards: bundle.type_cards.length,
      },
    };
  });
}
