import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, postgresClient } from "@/data/client";
import {
  classes,
  documents,
  extractionBundles,
  extractionClaimProvenance,
  extractionClaims,
  objects,
  pipelineRuns,
  pipelineRunSteps,
  recordProvenance,
  sourceUnits,
  types,
  workshopClaimDecisions,
} from "@/data/schema";
import type { CommandResult } from "@/services/result";
import * as claimsService from "@/services/claims";
import * as domainsService from "@/services/domains";
import * as relationshipsService from "@/services/relationships";
import * as subjectsService from "@/services/subjects";
import * as typesService from "@/services/types";
import * as workshopService from "@/services/workshop";

const missingId = "00000000-0000-4000-8000-000000000000";

function expectOk<T>(result: CommandResult<T>) {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.data;
}

function expectError<T>(result: CommandResult<T>, code: string) {
  expect(result.ok).toBe(false);

  if (result.ok) {
    throw new Error("Expected command to fail.");
  }

  expect(result.error.code).toBe(code);

  return result.error;
}

function testSlug(prefix: string) {
  return `${prefix}-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

async function resetTestData() {
  await db.execute(sql`
    delete from document_profiles;
    delete from shelf_folder_items;
    delete from shelf_folders;
    delete from domain_map_relationships;
    delete from domain_map_nodes;
    delete from domain_maps;
    delete from evidence_links;
    delete from evidence;
    delete from workshop_claim_decisions;
    delete from workshop_package_decisions;
    delete from record_provenance;
    delete from extraction_claim_inferred_from;
    delete from extraction_claim_provenance;
    delete from extraction_claim_mentions;
    delete from extraction_claims;
    delete from extraction_bundles;
    delete from pipeline_run_steps;
    delete from pipeline_runs;
    delete from source_units;
    delete from documents;
    delete from claim_targets;
    delete from claims;
    delete from relationships;
    delete from subjects;
    delete from lexicalizations;
    delete from object_domain_memberships;
    delete from types where domain_id is not null;
    delete from domains;
    delete from objects;
    alter sequence if exists claims_review_number_seq restart with 1;
  `);
}

async function createTestDomain() {
  const slug = testSlug("svc");
  const domain = expectOk(
    await domainsService.createDomain({
      label: `Service Test ${slug}`,
      slug,
    })
  );

  return domain;
}

async function getClassId(classKey: string) {
  const [row] = await db
    .select({ id: classes.id })
    .from(classes)
    .where(sql`${classes.key} = ${classKey}`)
    .limit(1);

  if (!row) {
    throw new Error(`Class not found: ${classKey}`);
  }

  return row.id;
}

async function getTypeId(classKey: string, slug: string) {
  const [row] = await db
    .select({ id: types.id })
    .from(types)
    .innerJoin(classes, sql`${classes.id} = ${types.classId}`)
    .where(sql`${classes.key} = ${classKey} and ${types.slug} = ${slug}`)
    .limit(1);

  if (!row) {
    throw new Error(`Type not found: ${classKey}/${slug}`);
  }

  return row.id;
}

async function createSubject(domainSlug: string, label: string) {
  const subjectTypeId = await getTypeId("subject", "concept");

  return expectOk(
    await subjectsService.createSubject(domainSlug, {
      canonicalLabel: label,
      description: `${label} description`,
      subjectTypeId,
    })
  );
}

async function createClaim(domainSlug: string, subjectId: string, text: string) {
  const claimTypeId = await getTypeId("claim", "taxonomic");

  return expectOk(
    await claimsService.createClaim(domainSlug, {
      claimText: text,
      claimTypeId,
      modality: "empirical",
      targetSubjectId: subjectId,
    })
  );
}

async function createRelationship(
  domainSlug: string,
  sourceSubjectId: string,
  targetSubjectId: string
) {
  const relationshipTypeId = await getTypeId("relationship", "structural");

  return expectOk(
    await relationshipsService.createRelationship(domainSlug, {
      relationshipTypeId,
      sourceSubjectId,
      targetSubjectId,
    })
  );
}

async function getClaimStatusKey(claimId: string) {
  const [row] = await db.execute<{ statusKey: string | null }>(sql`
    select statuses.key as "statusKey"
    from claims
    left join statuses on statuses.id = claims.status_id
    where claims.id = ${claimId}
    limit 1
  `);

  return row?.statusKey ?? null;
}

async function seedExtractedClaim(domainId: string) {
  const documentClassId = await getClassId("document");
  const bundleClassId = await getClassId("bundle");

  const [documentObject] = await db
    .insert(objects)
    .values({ classId: documentClassId })
    .returning({ id: objects.id });

  await db.insert(documents).values({
    id: documentObject.id,
    label: "Seed Document",
    documentForm: "markdown",
    sourceType: "markdown",
    contentSha256: "seed-content",
    bodySha256: "seed-body",
    sizeBytes: 128,
  });

  const [sourceUnit] = await db
    .insert(sourceUnits)
    .values({
      documentId: documentObject.id,
      position: 0,
      body: "Earth orbits the Sun.",
      contentSha256: "seed-source-unit",
      sizeBytes: 22,
    })
    .returning({ id: sourceUnits.id });

  const [run] = await db
    .insert(pipelineRuns)
    .values({
      domainId,
      documentId: documentObject.id,
      status: "completed",
      currentStep: "modality_classification",
    })
    .returning({ id: pipelineRuns.id });

  const [step] = await db
    .insert(pipelineRunSteps)
    .values({
      runId: run.id,
      step: "explicit_pass",
      stepOrder: 0,
      status: "completed",
    })
    .returning({ id: pipelineRunSteps.id });

  const [bundleObject] = await db
    .insert(objects)
    .values({ classId: bundleClassId })
    .returning({ id: objects.id });

  await db.insert(extractionBundles).values({
    id: bundleObject.id,
    domainId,
    runId: run.id,
    documentId: documentObject.id,
    label: "Seed Bundle",
    status: "needs_review",
  });

  const [claimRow] = await db
    .insert(extractionClaims)
    .values({
      bundleId: bundleObject.id,
      runStepId: step.id,
      claimId: "claim-1",
      text: "Earth orbits the Sun.",
      kind: "structural",
      modality: "empirical",
      assertion: "explicit",
    })
    .returning({ id: extractionClaims.id });

  await db.insert(extractionClaimProvenance).values({
    claimRowId: claimRow.id,
    sourceUnitId: sourceUnit.id,
    shardId: "seed-shard",
    locator: { position: 0 },
    quote: "Earth orbits the Sun.",
    position: 0,
  });

  return {
    claimRowId: claimRow.id,
    runId: run.id,
    sourceUnitId: sourceUnit.id,
  };
}

beforeEach(async () => {
  await resetTestData();
});

afterAll(async () => {
  await postgresClient.end({ timeout: 5 });
});

describe("service write paths used by the Memoria MCP server", () => {
  it("creates a subject and reads it back", async () => {
    const domain = await createTestDomain();
    const subjectTypeId = await getTypeId("subject", "concept");

    const created = expectOk(
      await subjectsService.createSubject(domain.slug, {
        canonicalLabel: "Orbital Mechanics",
        description: "The mechanics of orbital motion.",
        subjectTypeId,
      })
    );
    const detail = await subjectsService.getSubjectDetail(
      created.id,
      domain.slug
    );

    expect(detail).toMatchObject({
      id: created.id,
      canonicalLabel: "Orbital Mechanics",
      description: "The mechanics of orbital motion.",
      subjectTypeId,
    });
  });

  it("returns a typed error when create_subject receives an invalid type identity", async () => {
    const domain = await createTestDomain();

    const error = expectError(
      await subjectsService.createSubject(domain.slug, {
        canonicalLabel: "Invalid Subject",
        subjectTypeId: randomUUID(),
      }),
      "invalid_input"
    );

    expect(error.details).toHaveProperty("subjectTypeId");
  });

  it("updates a subject", async () => {
    const domain = await createTestDomain();
    const subject = await createSubject(domain.slug, "Mars");

    const updated = expectOk(
      await subjectsService.updateSubject(subject.id, {
        canonicalLabel: "Mars Planet",
        description: "The fourth planet from the Sun.",
      })
    );

    expect(updated).toMatchObject({
      id: subject.id,
      canonicalLabel: "Mars Planet",
      description: "The fourth planet from the Sun.",
    });
  });

  it("returns a typed error when update_subject targets a missing UUID", async () => {
    const error = expectError(
      await subjectsService.updateSubject(missingId, {
        canonicalLabel: "Missing Subject",
      }),
      "not_found"
    );

    expect(error.details).toEqual({ id: missingId });
  });

  it("creates, reads, and archives a claim", async () => {
    const domain = await createTestDomain();
    const subject = await createSubject(domain.slug, "Earth");

    const claim = await createClaim(
      domain.slug,
      subject.id,
      "Earth is a planet."
    );
    const detail = await claimsService.getClaimDetail(claim.id, domain.slug);

    expect(detail).toMatchObject({
      id: claim.id,
      claimText: "Earth is a planet.",
      modality: "empirical",
    });
    expect(detail?.targets).toHaveLength(1);
    expect(detail?.targets[0]?.targetObjectId).toBe(subject.id);

    const archived = expectOk(
      await claimsService.archiveClaim(claim.id, domain.slug)
    );

    expect(archived.id).toBe(claim.id);
    expect(await getClaimStatusKey(claim.id)).toBe("archived");
  });

  it("returns a typed error when create_claim receives an invalid target identity", async () => {
    const domain = await createTestDomain();
    const claimTypeId = await getTypeId("claim", "taxonomic");

    const error = expectError(
      await claimsService.createClaim(domain.slug, {
        claimText: "A missing target should not be admitted.",
        claimTypeId,
        targetSubjectId: randomUUID(),
      }),
      "invalid_input"
    );

    expect(error.details).toHaveProperty("targetSubjectIds");
  });

  it("updates a claim", async () => {
    const domain = await createTestDomain();
    const earth = await createSubject(domain.slug, "Earth");
    const sun = await createSubject(domain.slug, "Sun");
    const claim = await createClaim(
      domain.slug,
      earth.id,
      "Earth is near the Sun."
    );

    const updated = expectOk(
      await claimsService.updateClaim(claim.id, domain.slug, {
        claimText: "Earth orbits the Sun.",
        targetSubjectId: sun.id,
        modality: "reported",
      })
    );

    expect(updated).toMatchObject({
      id: claim.id,
      claimText: "Earth orbits the Sun.",
      modality: "reported",
    });
    expect(updated.targets.map((target) => target.targetObjectId)).toEqual([
      sun.id,
    ]);
  });

  it("returns a typed error when update_claim targets a missing UUID", async () => {
    const domain = await createTestDomain();

    const error = expectError(
      await claimsService.updateClaim(missingId, domain.slug, {
        claimText: "Missing claim",
      }),
      "not_found"
    );

    expect(error.details).toEqual({ id: missingId });
  });

  it("creates and updates a relationship", async () => {
    const domain = await createTestDomain();
    const earth = await createSubject(domain.slug, "Earth");
    const moon = await createSubject(domain.slug, "Moon");
    const sun = await createSubject(domain.slug, "Sun");
    const relationship = await createRelationship(domain.slug, moon.id, earth.id);

    const updated = expectOk(
      await relationshipsService.updateRelationship(
        relationship.id,
        domain.slug,
        {
          sourceSubjectId: earth.id,
          targetSubjectId: sun.id,
        }
      )
    );
    const detail = await relationshipsService.getRelationshipDetail(
      relationship.id,
      domain.slug
    );

    expect(updated).toMatchObject({
      id: relationship.id,
      source: { id: earth.id },
      target: { id: sun.id },
    });
    expect(detail).toMatchObject({
      id: relationship.id,
      source: { id: earth.id },
      target: { id: sun.id },
    });
  });

  it("returns typed errors for relationship identity misses", async () => {
    const domain = await createTestDomain();
    const earth = await createSubject(domain.slug, "Earth");
    const relationshipTypeId = await getTypeId("relationship", "structural");

    const createError = expectError(
      await relationshipsService.createRelationship(domain.slug, {
        relationshipTypeId,
        sourceSubjectId: earth.id,
        targetSubjectId: randomUUID(),
      }),
      "invalid_input"
    );

    expect(createError.details).toHaveProperty("targetSubjectId");

    const updateError = expectError(
      await relationshipsService.updateRelationship(missingId, domain.slug, {
        sourceSubjectId: earth.id,
      }),
      "not_found"
    );

    expect(updateError.details).toEqual({ id: missingId });
  });

  it("creates and updates a domain-scoped type", async () => {
    const domain = await createTestDomain();

    const created = expectOk(
      await typesService.createType(domain.slug, {
        classKey: "subject",
        label: "Probe",
        slug: "probe",
        description: "Spacecraft subject type.",
        captureGuidance: "Use for spacecraft.",
      })
    );
    const updated = expectOk(
      await typesService.updateType(created.id, domain.slug, {
        label: "Space Probe",
        slug: "space-probe",
        captureGuidance: "Use for robotic spacecraft.",
      })
    );
    const detail = await typesService.getTypeDetail(created.id, domain.slug);

    expect(updated).toMatchObject({
      id: created.id,
      label: "Space Probe",
      slug: "space-probe",
      captureGuidance: "Use for robotic spacecraft.",
    });
    expect(detail).toMatchObject(updated);
  });

  it("returns typed errors for type slug collisions", async () => {
    const domain = await createTestDomain();

    const first = expectOk(
      await typesService.createType(domain.slug, {
        classKey: "subject",
        label: "Instrument",
        slug: "instrument",
      })
    );
    const createError = expectError(
      await typesService.createType(domain.slug, {
        classKey: "subject",
        label: "Duplicate Instrument",
        slug: first.slug,
      }),
      "slug_taken"
    );

    expect(createError.details).toEqual({ slug: first.slug });

    const second = expectOk(
      await typesService.createType(domain.slug, {
        classKey: "subject",
        label: "Observatory",
        slug: "observatory",
      })
    );
    const updateError = expectError(
      await typesService.updateType(second.id, domain.slug, {
        slug: first.slug,
      }),
      "slug_taken"
    );

    expect(updateError.details).toEqual({ slug: first.slug });
  });

  it("admits an extracted claim as a canonical claim with provenance", async () => {
    const domain = await createTestDomain();
    const earth = await createSubject(domain.slug, "Earth");
    const { claimRowId, runId, sourceUnitId } = await seedExtractedClaim(
      domain.id
    );

    const admitted = expectOk(
      await workshopService.admitExtractedClaimAsClaim({
        claimRowId,
        domainSlug: domain.slug,
        targetSubjectIds: [earth.id],
      })
    );
    const claim = await claimsService.getClaimDetail(
      admitted.canonicalClaimId,
      domain.slug
    );
    const [decision] = await db
      .select({
        outcome: workshopClaimDecisions.outcome,
        resultMetadata: workshopClaimDecisions.resultMetadata,
      })
      .from(workshopClaimDecisions)
      .where(sql`${workshopClaimDecisions.claimRowId} = ${claimRowId}`)
      .limit(1);
    const [provenance] = await db
      .select({
        runId: recordProvenance.runId,
        sourceUnitId: recordProvenance.sourceUnitId,
      })
      .from(recordProvenance)
      .where(sql`${recordProvenance.recordId} = ${admitted.canonicalClaimId}`)
      .limit(1);

    expect(admitted).toMatchObject({
      claimRowId,
      created: true,
      outcome: "admitted",
    });
    expect(claim).toMatchObject({
      id: admitted.canonicalClaimId,
      claimText: "Earth orbits the Sun.",
      modality: "empirical",
    });
    expect(claim?.targets.map((target) => target.targetObjectId)).toEqual([
      earth.id,
    ]);
    expect(decision).toMatchObject({
      outcome: "admitted",
      resultMetadata: {
        resultClaimIds: [admitted.canonicalClaimId],
        resultRecordIds: [admitted.canonicalClaimId],
      },
    });
    expect(provenance).toEqual({ runId, sourceUnitId });
  });

  it("returns a typed error when admit_extracted_claim_as_claim has no targets", async () => {
    const domain = await createTestDomain();

    const error = expectError(
      await workshopService.admitExtractedClaimAsClaim({
        claimRowId: randomUUID(),
        domainSlug: domain.slug,
        targetSubjectIds: [],
      }),
      "invalid_input"
    );

    expect(error.message).toBe("At least one target subject is required");
  });
});
