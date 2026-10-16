import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

function loadLocalEnv() {
  const envPath = resolve(process.cwd(), ".env.local");

  if (!existsSync(envPath)) {
    return;
  }

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex);
    let value = trimmed.slice(separatorIndex + 1);

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] ??= value;
  }
}

function textResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function errorResult(error: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text:
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : JSON.stringify(error, null, 2),
      },
    ],
    isError: true,
  };
}

function registerJsonTool<TInput extends z.ZodObject<z.ZodRawShape>>(
  server: McpServer,
  name: string,
  description: string,
  schema: TInput,
  execute: (input: z.infer<TInput>) => Promise<unknown> | unknown
) {
  server.registerTool(
    name,
    {
      description,
      inputSchema: schema.shape,
    },
    async (input) => {
      try {
        return textResult(await execute(input as z.infer<TInput>));
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}

async function main() {
  loadLocalEnv();

  const [
    { createClaimInput, updateClaimInput },
    { upsertDocumentProfileInput },
    { createRelationshipInput, updateRelationshipInput },
    { createSubjectInput, updateSubjectInput },
    { createTypeInput, updateTypeInput },
    agentContext,
    claimsService,
    documentProfileService,
    relationshipsService,
    subjectsService,
    typesService,
    workshopService,
    wipeTool,
  ] = await Promise.all([
    import("../domain/claims"),
    import("../domain/document-profiles"),
    import("../domain/relationships"),
    import("../domain/subjects"),
    import("../domain/types"),
    import("../services/agent-context"),
    import("../services/claims"),
    import("../services/document-profiles"),
    import("../services/relationships"),
    import("../services/subjects"),
    import("../services/types"),
    import("../services/workshop"),
    import("./wipe-user-data"),
  ]);

  const server = new McpServer({
    name: "project-memoria",
    version: "0.1.0",
  });

  registerJsonTool(
    server,
    "get_domain_context",
    "Read a compact overview of one Project Memoria domain.",
    z.object({
      domainId: z.string().uuid().optional(),
      domainSlug: z.string().min(1).optional(),
      limit: z.number().int().positive().optional(),
    }),
    agentContext.getAgentDomainContext
  );

  registerJsonTool(
    server,
    "list_documents",
    "List Project Memoria documents in a domain by label or source filename.",
    z.object({
      domainId: z.string().uuid().optional(),
      domainSlug: z.string().min(1).optional(),
      limit: z.number().int().positive().optional(),
      query: z.string().optional(),
    }),
    agentContext.listAgentDocuments
  );

  registerJsonTool(
    server,
    "get_document_context",
    "Read one Project Memoria document with metadata, table of contents, and prepared source units.",
    z.object({
      documentId: z.string().uuid(),
      domainSlug: z.string().min(1).optional(),
      sourceUnitLimit: z.number().int().positive().optional(),
    }),
    agentContext.getAgentDocumentContext
  );

  registerJsonTool(
    server,
    "get_extraction_context",
    "Read extraction context for a document: identification fields and active domain context.",
    z.object({
      documentId: z.string().uuid(),
      domainId: z.string().uuid().optional(),
      domainSlug: z.string().min(1).optional(),
    }),
    agentContext.getAgentExtractionContext
  );

  registerJsonTool(
    server,
    "get_selected_record_context",
    "Read the selected Project Memoria record by class key and record id.",
    z.object({
      classKey: z.enum([
        "bundle",
        "claim",
        "document",
        "domain_map",
        "relationship",
        "subject",
        "type",
      ]),
      domainSlug: z.string().min(1).optional(),
      packageId: z.string().min(1).optional(),
      recordId: z.string().uuid(),
    }),
    agentContext.getAgentSelectedRecordContext
  );

  registerJsonTool(
    server,
    "get_domain_map_context",
    "Read one Project Memoria Domain Map with visible nodes, relationships, and relationship type options.",
    z.object({
      domainMapId: z.string().uuid(),
      domainSlug: z.string().min(1).optional(),
    }),
    agentContext.getAgentDomainMapContext
  );

  registerJsonTool(
    server,
    "search_subjects",
    "Search Project Memoria subjects in a domain by label or description.",
    z.object({
      domainId: z.string().uuid().optional(),
      domainSlug: z.string().min(1).optional(),
      limit: z.number().int().positive().optional(),
      query: z.string().optional(),
    }),
    agentContext.searchAgentSubjects
  );

  registerJsonTool(
    server,
    "get_low_weight_subjects",
    "Surface active subjects whose deterministic weight is at or below a threshold. Read-only review aid; does not archive or modify records.",
    z.object({
      domainId: z.string().uuid().optional(),
      domainSlug: z.string().min(1).optional(),
      includeNamedAnchors: z.boolean().optional(),
      limit: z.number().int().positive().optional(),
      maxWeight: z.number().int().nonnegative().optional(),
      subjectTypeSlug: z.string().trim().min(1).optional(),
    }),
    agentContext.getAgentLowWeightSubjects
  );

  registerJsonTool(
    server,
    "search_claims",
    "Search Project Memoria claims in a domain by claim text, optionally constrained to one target object. Results include UUID ids and CL-xxxxx review ids.",
    z.object({
      domainId: z.string().uuid().optional(),
      domainSlug: z.string().min(1).optional(),
      limit: z.number().int().positive().optional(),
      query: z.string().optional(),
      targetObjectId: z.string().uuid().optional(),
    }),
    agentContext.searchAgentClaims
  );

  registerJsonTool(
    server,
    "get_claim_text_lengths",
    "Read active canonical claims with deterministic word and character counts, ordered longest first for atomicity review.",
    z.object({
      domainId: z.string().uuid().optional(),
      domainSlug: z.string().min(1).optional(),
      limit: z.number().int().positive().optional(),
      minCharacters: z.number().int().nonnegative().optional(),
      minWords: z.number().int().nonnegative().optional(),
      targetObjectId: z.string().uuid().optional(),
    }),
    agentContext.getAgentClaimTextLengths
  );

  registerJsonTool(
    server,
    "get_admission_claim_groups",
    "List extracted claim groups waiting for admission review in one Project Memoria domain.",
    z.object({
      domainSlug: z.string().min(1),
    }),
    ({ domainSlug }) => workshopService.getWorkshopAdmissionPackages(domainSlug)
  );

  registerJsonTool(
    server,
    "admit_extracted_claim_as_claim",
    "Create or reuse one canonical claim from an extracted claim row, attach target subjects, preserve provenance, and mark the extracted row admitted.",
    z.object({
      claimRowId: z.string().uuid(),
      claimText: z.string().trim().min(1).optional(),
      claimTypeSlug: z.string().trim().min(1).optional(),
      domainSlug: z.string().min(1),
      modality: z
        .enum(["empirical", "normative", "projection", "reported", "rhetorical"])
        .optional(),
      targetSubjectIds: z.array(z.string().uuid()).min(1),
    }),
    workshopService.admitExtractedClaimAsClaim
  );

  registerJsonTool(
    server,
    "mark_extracted_claim_processed",
    "Legacy escape hatch: mark one extracted claim row processed without creating a canonical record. Prefer duplicate, split, rejected, or deferred when that outcome is known.",
    z.object({
      claimRowId: z.string().uuid(),
    }),
    ({ claimRowId }) => workshopService.markWorkshopClaimProcessed(claimRowId)
  );

  registerJsonTool(
    server,
    "mark_extracted_claim_deferred",
    "Mark one extracted claim row deferred so it moves into the deferred claim group.",
    z.object({
      claimRowId: z.string().uuid(),
    }),
    ({ claimRowId }) => workshopService.markWorkshopClaimDeferred(claimRowId)
  );

  const decisionReferenceInput = z.object({
    claimRowId: z.string().uuid(),
    note: z.string().trim().optional(),
    resultClaimIds: z.array(z.string().uuid()).optional(),
    resultRecordIds: z.array(z.string().uuid()).optional(),
    resultRelationshipIds: z.array(z.string().uuid()).optional(),
  });

  registerJsonTool(
    server,
    "mark_extracted_claim_duplicate",
    "Mark one extracted claim row duplicate, optionally pointing at the canonical claim or record that already covers it.",
    decisionReferenceInput,
    ({ claimRowId, ...metadata }) =>
      workshopService.markWorkshopClaimDuplicate(claimRowId, metadata)
  );

  registerJsonTool(
    server,
    "mark_extracted_claim_rejected",
    "Mark one extracted claim row rejected because it should not enter canon.",
    z.object({
      claimRowId: z.string().uuid(),
      note: z.string().trim().optional(),
    }),
    ({ claimRowId, note }) =>
      workshopService.markWorkshopClaimRejected(claimRowId, { note })
  );

  registerJsonTool(
    server,
    "mark_extracted_claim_split",
    "Mark one extracted claim row split, optionally pointing at the canonical claims, records, or relationships created from it.",
    decisionReferenceInput,
    ({ claimRowId, ...metadata }) =>
      workshopService.markWorkshopClaimSplit(claimRowId, metadata)
  );

  registerJsonTool(
    server,
    "apply_admission_plan",
    "Apply a reviewed admission plan: create or reuse subjects and relationships; admit extracted claims; and mark extracted rows admitted, duplicate, split, rejected, or deferred.",
    workshopService.applyAdmissionPlanInput,
    workshopService.applyAdmissionPlan
  );

  registerJsonTool(
    server,
    "create_subject",
    "Create one canonical Project Memoria subject in a domain.",
    createSubjectInput.extend({
      domainSlug: z.string().min(1),
    }),
    ({ domainSlug, ...input }) =>
      subjectsService.createSubject(domainSlug, input)
  );

  registerJsonTool(
    server,
    "update_subject",
    "Update one canonical Project Memoria subject.",
    updateSubjectInput.extend({
      id: z.string().uuid(),
    }),
    ({ id, ...input }) => subjectsService.updateSubject(id, input)
  );

  registerJsonTool(
    server,
    "create_claim",
    "Create one canonical Project Memoria claim in a domain. Use targetSubjectId for the primary subject and targetSubjectIds when the claim points at additional subjects. Use sourceClaimId when atomizing an existing canon claim so the new claim inherits source provenance and records derivation metadata.",
    createClaimInput.extend({
      domainSlug: z.string().min(1),
    }),
    ({ domainSlug, ...input }) => claimsService.createClaim(domainSlug, input)
  );

  registerJsonTool(
    server,
    "update_claim",
    "Update one canonical Project Memoria claim in a domain. Use targetSubjectId for the primary subject and targetSubjectIds to replace the claim's full ordered target set.",
    updateClaimInput.extend({
      domainSlug: z.string().min(1),
      id: z.string().uuid(),
    }),
    ({ domainSlug, id, ...input }) =>
      claimsService.updateClaim(id, domainSlug, input)
  );

  registerJsonTool(
    server,
    "archive_claim",
    "Archive one canonical Project Memoria claim in a domain.",
    z.object({
      domainSlug: z.string().min(1),
      id: z.string().uuid(),
    }),
    ({ domainSlug, id }) => claimsService.archiveClaim(id, domainSlug)
  );

  registerJsonTool(
    server,
    "create_relationship",
    "Create one canonical Project Memoria subject-to-subject relationship in a domain.",
    createRelationshipInput.extend({
      domainSlug: z.string().min(1),
    }),
    ({ domainSlug, ...input }) =>
      relationshipsService.createRelationship(domainSlug, input)
  );

  registerJsonTool(
    server,
    "update_relationship",
    "Update one canonical Project Memoria subject-to-subject relationship in a domain.",
    updateRelationshipInput.extend({
      domainSlug: z.string().min(1),
      id: z.string().uuid(),
    }),
    ({ domainSlug, id, ...input }) =>
      relationshipsService.updateRelationship(id, domainSlug, input)
  );

  registerJsonTool(
    server,
    "create_type",
    "Create one domain-scoped Subject, Claim, or Relationship Type.",
    createTypeInput.extend({
      domainSlug: z.string().min(1),
    }),
    ({ domainSlug, ...input }) => typesService.createType(domainSlug, input)
  );

  registerJsonTool(
    server,
    "update_type",
    "Update one domain-scoped Subject, Claim, or Relationship Type.",
    updateTypeInput.extend({
      domainSlug: z.string().min(1),
      id: z.string().uuid(),
    }),
    ({ domainSlug, id, ...input }) =>
      typesService.updateType(id, domainSlug, input)
  );

  registerJsonTool(
    server,
    "save_document_profile",
    "Persist a Document Profile produced by document inspection.",
    upsertDocumentProfileInput.extend({
      documentId: z.string().uuid(),
    }),
    ({ documentId, ...input }) =>
      documentProfileService.upsertDocumentProfile(documentId, input)
  );

  registerJsonTool(
    server,
    "wipe_user_data",
    "Delete user-created records and restore foundation seed data. Requires exact confirmation.",
    z.object({
      confirm: z.literal("WIPE USER DATA"),
    }),
    async () => ({
      ok: true,
      deleted: await wipeTool.wipeUserData({ closeSharedClient: false }),
    })
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
