import { generateText, Output } from "ai";
import { z } from "zod";

import {
  defaultAtlasDistillationModelId,
  type AtlasChatProviderOptions,
} from "@/lib/atlas-ai-models";

export const defaultClaimExtractionModel =
  process.env.ATLAS_CLAIM_EXTRACTION_MODEL ?? defaultAtlasDistillationModelId;
export const defaultEntityExtractionModel =
  process.env.ATLAS_ENTITY_EXTRACTION_MODEL ?? defaultClaimExtractionModel;
export const defaultInferredClaimExtractionModel =
  process.env.ATLAS_INFERRED_CLAIM_EXTRACTION_MODEL ?? defaultClaimExtractionModel;
export const defaultRelationshipExtractionModel =
  process.env.ATLAS_RELATIONSHIP_EXTRACTION_MODEL ?? defaultClaimExtractionModel;

export const claimCandidateRegistrySchema = z.object({
  claims: z.array(
    z.object({
      localId: z.string().min(1),
      statement: z.string().min(1),
      typeId: z.string().min(1),
      supportNote: z.string().nullable(),
    }),
  ),
  warnings: z.array(z.string()),
});

export type ClaimCandidateRegistry = z.infer<typeof claimCandidateRegistrySchema>;

export const entityCandidateRegistrySchema = z.object({
  entities: z.array(
    z.object({
      localId: z.string().min(1),
      label: z.string().min(1),
      typeId: z.string().min(1),
      aliases: z.array(z.string().min(1)),
      sourceClaimIds: z.array(z.string().min(1)),
      rationale: z.string().nullable(),
    }),
  ),
  claimTargets: z.array(
    z.object({
      claimId: z.string().min(1),
      entityLocalId: z.string().min(1),
    }),
  ),
  warnings: z.array(z.string()),
});

export type EntityCandidateRegistry = z.infer<typeof entityCandidateRegistrySchema>;

export const shardEntityDiscoveryRegistrySchema = z.object({
  entities: z.array(
    z.object({
      aliases: z.array(z.string().min(1)),
      existingEntityId: z.string().nullable(),
      label: z.string().min(1),
      localId: z.string().min(1),
      rationale: z.string().nullable(),
      typeId: z.string().min(1),
    }),
  ),
  warnings: z.array(z.string()),
});

export type ShardEntityDiscoveryRegistry = z.infer<typeof shardEntityDiscoveryRegistrySchema>;

export const inferredClaimCandidateRegistrySchema = z.object({
  claims: z.array(
    z.object({
      localId: z.string().min(1),
      statement: z.string().min(1),
      typeId: z.string().min(1),
      targetEntityLocalId: z.string().min(1),
      confidence: z.enum(["low", "medium", "high"]),
      rationale: z.string().nullable(),
    }),
  ),
  warnings: z.array(z.string()),
});

export type InferredClaimCandidateRegistry = z.infer<typeof inferredClaimCandidateRegistrySchema>;

export const shardClaimDiscoveryRegistrySchema = z.object({
  claims: z.array(
    z.object({
      confidence: z.enum(["low", "medium", "high"]).nullable(),
      existingClaimId: z.string().nullable(),
      localId: z.string().min(1),
      rationale: z.string().nullable(),
      sourceType: z.enum(["explicit", "inferred"]),
      statement: z.string().min(1),
      targetEntityIds: z.array(z.string().min(1)),
      typeId: z.string().min(1),
    }),
  ),
  warnings: z.array(z.string()),
});

export type ShardClaimDiscoveryRegistry = z.infer<typeof shardClaimDiscoveryRegistrySchema>;

export const relationshipCandidateRegistrySchema = z.object({
  relationships: z.array(
    z.object({
      localId: z.string().min(1),
      sourceEntityLocalId: z.string().min(1),
      targetEntityLocalId: z.string().min(1),
      typeId: z.string().min(1),
      claimIds: z.array(z.string().min(1)),
      rationale: z.string().nullable(),
    }),
  ),
  warnings: z.array(z.string()),
});

export type RelationshipCandidateRegistry = z.infer<typeof relationshipCandidateRegistrySchema>;

export const shardEntityRelationshipDiscoveryRegistrySchema = z.object({
  relationships: z.array(
    z.object({
      claimIds: z.array(z.string().min(1)),
      existingRelationshipId: z.string().nullable(),
      localId: z.string().min(1),
      rationale: z.string().nullable(),
      sourceEntityId: z.string().min(1),
      targetEntityId: z.string().min(1),
      typeId: z.string().min(1),
    }),
  ),
  warnings: z.array(z.string()),
});

export type ShardEntityRelationshipDiscoveryRegistry = z.infer<
  typeof shardEntityRelationshipDiscoveryRegistrySchema
>;

export const shardClaimRelationshipDiscoveryRegistrySchema = z.object({
  relationships: z.array(
    z.object({
      evidenceClaimIds: z.array(z.string().min(1)),
      existingRelationshipId: z.string().nullable(),
      localId: z.string().min(1),
      rationale: z.string().nullable(),
      sourceClaimId: z.string().min(1),
      targetClaimId: z.string().min(1),
      typeId: z.string().min(1),
    }),
  ),
  warnings: z.array(z.string()),
});

export type ShardClaimRelationshipDiscoveryRegistry = z.infer<
  typeof shardClaimRelationshipDiscoveryRegistrySchema
>;

type GenerateClaimCandidateRegistryInput = {
  claimTypes: Array<{
    id: string;
    label: string;
  }>;
  documentTitle?: string | null;
  model?: string;
  providerOptions?: AtlasChatProviderOptions;
  shardHeadingPath?: string[];
  shardPosition: number;
  shardText: string;
};

export async function generateClaimCandidateRegistry({
  claimTypes,
  documentTitle,
  model = defaultClaimExtractionModel,
  providerOptions,
  shardHeadingPath = [],
  shardPosition,
  shardText,
}: GenerateClaimCandidateRegistryInput): Promise<ClaimCandidateRegistry> {
  const { output } = await generateText({
    model,
    output: Output.object({
      schema: claimCandidateRegistrySchema,
    }),
    prompt: claimExtractionPrompt({
      claimTypes,
      documentTitle,
      shardHeadingPath,
      shardPosition,
      shardText,
    }),
    ...(providerOptions ? { providerOptions } : {}),
  });

  return output;
}

type GenerateEntityCandidateRegistryInput = {
  claims: Array<{
    id: string;
    text: string;
  }>;
  documentTitle?: string | null;
  entityTypes: Array<{
    id: string;
    label: string;
  }>;
  model?: string;
  providerOptions?: AtlasChatProviderOptions;
};

type GenerateShardEntityDiscoveryRegistryInput = {
  documentTitle?: string | null;
  entityTypes: Array<{
    id: string;
    label: string;
  }>;
  existingEntities: Array<{
    aliases: string[];
    id: string;
    label: string;
    status: string | null;
    typeId: string | null;
  }>;
  model?: string;
  providerOptions?: AtlasChatProviderOptions;
  shardHeadingPath?: string[];
  shardPosition: number;
  shardText: string;
};

export async function generateShardEntityDiscoveryRegistry({
  documentTitle,
  entityTypes,
  existingEntities,
  model = defaultEntityExtractionModel,
  providerOptions,
  shardHeadingPath = [],
  shardPosition,
  shardText,
}: GenerateShardEntityDiscoveryRegistryInput): Promise<ShardEntityDiscoveryRegistry> {
  const { output } = await generateText({
    model,
    output: Output.object({
      schema: shardEntityDiscoveryRegistrySchema,
    }),
    prompt: shardEntityDiscoveryPrompt({
      documentTitle,
      entityTypes,
      existingEntities,
      shardHeadingPath,
      shardPosition,
      shardText,
    }),
    ...(providerOptions ? { providerOptions } : {}),
  });

  return output;
}

export async function generateEntityCandidateRegistry({
  claims,
  documentTitle,
  entityTypes,
  model = defaultEntityExtractionModel,
  providerOptions,
}: GenerateEntityCandidateRegistryInput): Promise<EntityCandidateRegistry> {
  const { output } = await generateText({
    model,
    output: Output.object({
      schema: entityCandidateRegistrySchema,
    }),
    prompt: entityExtractionPrompt({
      claims,
      documentTitle,
      entityTypes,
    }),
    ...(providerOptions ? { providerOptions } : {}),
  });

  return output;
}

type GenerateShardClaimDiscoveryRegistryInput = {
  claimTypes: Array<{
    id: string;
    label: string;
  }>;
  documentTitle?: string | null;
  domainClaims: Array<{
    id: string;
    targetEntityIds: string[];
    text: string;
    typeId: string | null;
  }>;
  entities: Array<{
    aliases: string[];
    id: string;
    label: string;
    status: string | null;
    typeId: string | null;
  }>;
  model?: string;
  providerOptions?: AtlasChatProviderOptions;
  shardHeadingPath?: string[];
  shardPosition: number;
  shardText: string;
};

export async function generateShardClaimDiscoveryRegistry({
  claimTypes,
  documentTitle,
  domainClaims,
  entities,
  model = defaultClaimExtractionModel,
  providerOptions,
  shardHeadingPath = [],
  shardPosition,
  shardText,
}: GenerateShardClaimDiscoveryRegistryInput): Promise<ShardClaimDiscoveryRegistry> {
  const { output } = await generateText({
    model,
    output: Output.object({
      schema: shardClaimDiscoveryRegistrySchema,
    }),
    prompt: shardClaimDiscoveryPrompt({
      claimTypes,
      documentTitle,
      domainClaims,
      entities,
      shardHeadingPath,
      shardPosition,
      shardText,
    }),
    ...(providerOptions ? { providerOptions } : {}),
  });

  return output;
}

type GenerateInferredClaimCandidateRegistryInput = {
  claimTypes: Array<{
    id: string;
    label: string;
  }>;
  documentTitle?: string | null;
  entities: Array<{
    aliases: string[];
    id: string;
    label: string;
  }>;
  existingClaims: Array<{
    id: string;
    text: string;
  }>;
  model?: string;
  providerOptions?: AtlasChatProviderOptions;
  shardHeadingPath?: string[];
  shardPosition: number;
  shardText: string;
};

export async function generateInferredClaimCandidateRegistry({
  claimTypes,
  documentTitle,
  entities,
  existingClaims,
  model = defaultInferredClaimExtractionModel,
  providerOptions,
  shardHeadingPath = [],
  shardPosition,
  shardText,
}: GenerateInferredClaimCandidateRegistryInput): Promise<InferredClaimCandidateRegistry> {
  const { output } = await generateText({
    model,
    output: Output.object({
      schema: inferredClaimCandidateRegistrySchema,
    }),
    prompt: inferredClaimExtractionPrompt({
      claimTypes,
      documentTitle,
      entities,
      existingClaims,
      shardHeadingPath,
      shardPosition,
      shardText,
    }),
    ...(providerOptions ? { providerOptions } : {}),
  });

  return output;
}

type GenerateRelationshipCandidateRegistryInput = {
  claims: Array<{
    id: string;
    targetEntityLocalId: string | null;
    text: string;
    typeId: string | null;
  }>;
  documentTitle?: string | null;
  entities: Array<{
    aliases: string[];
    id: string;
    label: string;
    typeId: string | null;
  }>;
  model?: string;
  providerOptions?: AtlasChatProviderOptions;
  relationshipTypes: Array<{
    id: string;
    label: string;
    slug?: string;
  }>;
};

type GenerateShardEntityRelationshipDiscoveryRegistryInput = {
  claims: Array<{
    id: string;
    targetEntityIds: string[];
    text: string;
    typeId: string | null;
  }>;
  documentTitle?: string | null;
  entities: Array<{
    aliases: string[];
    id: string;
    label: string;
    status: string | null;
    typeId: string | null;
  }>;
  existingRelationships: Array<{
    id: string;
    sourceRecordId: string;
    targetRecordId: string;
    typeId: string;
  }>;
  model?: string;
  providerOptions?: AtlasChatProviderOptions;
  relationshipTypes: Array<{
    id: string;
    label: string;
    slug?: string;
  }>;
  shardHeadingPath?: string[];
  shardPosition: number;
  shardText: string;
};

export async function generateRelationshipCandidateRegistry({
  claims,
  documentTitle,
  entities,
  model = defaultRelationshipExtractionModel,
  providerOptions,
  relationshipTypes,
}: GenerateRelationshipCandidateRegistryInput): Promise<RelationshipCandidateRegistry> {
  const { output } = await generateText({
    model,
    output: Output.object({
      schema: relationshipCandidateRegistrySchema,
    }),
    prompt: relationshipExtractionPrompt({
      claims,
      documentTitle,
      entities,
      relationshipTypes,
    }),
    ...(providerOptions ? { providerOptions } : {}),
  });

  return output;
}

export async function generateShardEntityRelationshipDiscoveryRegistry({
  claims,
  documentTitle,
  entities,
  existingRelationships,
  model = defaultRelationshipExtractionModel,
  providerOptions,
  relationshipTypes,
  shardHeadingPath = [],
  shardPosition,
  shardText,
}: GenerateShardEntityRelationshipDiscoveryRegistryInput): Promise<ShardEntityRelationshipDiscoveryRegistry> {
  const { output } = await generateText({
    model,
    output: Output.object({
      schema: shardEntityRelationshipDiscoveryRegistrySchema,
    }),
    prompt: shardEntityRelationshipDiscoveryPrompt({
      claims,
      documentTitle,
      entities,
      existingRelationships,
      relationshipTypes,
      shardHeadingPath,
      shardPosition,
      shardText,
    }),
    ...(providerOptions ? { providerOptions } : {}),
  });

  return output;
}

type GenerateShardClaimRelationshipDiscoveryRegistryInput = {
  claims: Array<{
    id: string;
    targetEntityIds: string[];
    text: string;
    typeId: string | null;
  }>;
  documentTitle?: string | null;
  existingRelationships: Array<{
    id: string;
    sourceRecordId: string;
    targetRecordId: string;
    typeId: string;
  }>;
  model?: string;
  providerOptions?: AtlasChatProviderOptions;
  relationshipTypes: Array<{
    id: string;
    label: string;
  }>;
  shardHeadingPath?: string[];
  shardPosition: number;
  shardText: string;
};

export async function generateShardClaimRelationshipDiscoveryRegistry({
  claims,
  documentTitle,
  existingRelationships,
  model = defaultRelationshipExtractionModel,
  providerOptions,
  relationshipTypes,
  shardHeadingPath = [],
  shardPosition,
  shardText,
}: GenerateShardClaimRelationshipDiscoveryRegistryInput): Promise<ShardClaimRelationshipDiscoveryRegistry> {
  const { output } = await generateText({
    model,
    output: Output.object({
      schema: shardClaimRelationshipDiscoveryRegistrySchema,
    }),
    prompt: shardClaimRelationshipDiscoveryPrompt({
      claims,
      documentTitle,
      existingRelationships,
      relationshipTypes,
      shardHeadingPath,
      shardPosition,
      shardText,
    }),
    ...(providerOptions ? { providerOptions } : {}),
  });

  return output;
}

function shardEntityDiscoveryPrompt({
  documentTitle,
  entityTypes,
  existingEntities,
  shardHeadingPath,
  shardPosition,
  shardText,
}: {
  documentTitle?: string | null;
  entityTypes: Array<{
    id: string;
    label: string;
  }>;
  existingEntities: Array<{
    aliases: string[];
    id: string;
    label: string;
    status: string | null;
    typeId: string | null;
  }>;
  shardHeadingPath: string[];
  shardPosition: number;
  shardText: string;
}) {
  const headingContext =
    shardHeadingPath.length > 0 ? shardHeadingPath.join(" > ") : "No heading context";
  const typeList = entityTypes
    .map((type) => `- ${type.id}: ${type.label}`)
    .join("\n");
  const existingEntityList = existingEntities
    .map((entity) => {
      const aliases = entity.aliases.length > 0 ? ` aliases: ${entity.aliases.join(", ")}` : "";
      const status = entity.status ? ` status: ${entity.status}` : "";
      const typeId = entity.typeId ? ` typeId: ${entity.typeId}` : "";

      return `- ${entity.id}: ${entity.label}${typeId}${status}${aliases}`;
    })
    .join("\n");

  return `Identify anything in this shard that can be considered an entity for the selected domain.

Return entity candidates that are directly mentioned or strongly implied by the shard text. Compare them against the existing domain entities and set existingEntityId when the candidate appears to refer to an existing entity. Do not invent entities from general knowledge outside the shard.

Rules:
- Use only the entity type IDs listed below.
- Assign exactly one entity type ID to every candidate.
- Merge repeated mentions in the shard into one candidate.
- Prefer durable entities that could collect future claims and relationships.
- Include aliases, abbreviations, and spelling variants found in or strongly supported by the shard.
- Set existingEntityId to an existing entity ID when the candidate is a duplicate or close match.
- Set existingEntityId to null when the candidate should become a new domain entity if approved.
- Use stable local IDs such as entity_1, entity_2, entity_3.
- Do not write descriptive summaries of entities. Descriptive facts should become atomic claims in the claims stage.
- Set rationale to null for straightforward new entities. Use rationale only as a terse matching note when existingEntityId is set or when disambiguation is necessary.

Document title: ${documentTitle?.trim() || "Untitled document"}
Shard position: ${shardPosition}
Shard heading path: ${headingContext}

Entity type IDs:
${typeList}

Existing domain entities:
${existingEntityList || "No existing domain entities loaded."}

Shard text:
${shardText}`;
}

function shardClaimDiscoveryPrompt({
  claimTypes,
  documentTitle,
  domainClaims,
  entities,
  shardHeadingPath,
  shardPosition,
  shardText,
}: {
  claimTypes: Array<{
    id: string;
    label: string;
  }>;
  documentTitle?: string | null;
  domainClaims: Array<{
    id: string;
    targetEntityIds: string[];
    text: string;
    typeId: string | null;
  }>;
  entities: Array<{
    aliases: string[];
    id: string;
    label: string;
    status: string | null;
    typeId: string | null;
  }>;
  shardHeadingPath: string[];
  shardPosition: number;
  shardText: string;
}) {
  const headingContext =
    shardHeadingPath.length > 0 ? shardHeadingPath.join(" > ") : "No heading context";
  const typeList = claimTypes
    .map((type) => `- ${type.id}: ${type.label}`)
    .join("\n");
  const entityList = entities
    .map((entity) => {
      const aliases = entity.aliases.length > 0 ? ` aliases: ${entity.aliases.join(", ")}` : "";
      const status = entity.status ? ` status: ${entity.status}` : "";
      const type = entity.typeId ? ` typeId: ${entity.typeId}` : "";

      return `- ${entity.id}: ${entity.label}${type}${status}${aliases}`;
    })
    .join("\n");
  const claimList = domainClaims
    .map((claim) => {
      const type = claim.typeId ? ` typeId: ${claim.typeId}` : "";
      const targets = claim.targetEntityIds.length > 0 ? ` targets: ${claim.targetEntityIds.join(", ")}` : "";

      return `- ${claim.id}:${type}${targets} ${claim.text}`;
    })
    .join("\n");

  return `Find new explicit and inferred claim candidates from this shard about any existing domain entity.

Use the full domain entity list as the set of allowed target entities. Use the full domain claim list to avoid duplicates.

Rules:
- Return claims only when at least one targetEntityIds value is from the entity list below.
- Use only the claim type IDs listed below.
- sourceType must be explicit when directly supported by shard text, inferred when it reasonably follows from shard text.
- Do not repeat or paraphrase an existing domain claim. Set existingClaimId only when the shard supports an existing claim already in the domain.
- Each new statement must be atomic and declarative: usually one subject, one predicate, and one object or complement.
- Split compound source sentences into separate claims when they contain multiple properties, classifications, locations, dates, measurements, examples, comparisons, memberships, composition facts, or cause/effect facts.
- If one sentence says where something is and what it contains, return separate location and containment claims.
- If one sentence gives multiple properties of one subject, return one claim per property.
- Do not combine multiple entities or multiple facts into one claim unless the relationship among those entities is itself the single fact.
- Avoid broad summary statements, encyclopedia-style descriptions, and "and also" claims.
- Prefer short subject-verb-object statements. Keep units, dates, and quantities attached only to the one fact they qualify.
- targetEntityIds should include the entity or entities the atomic claim is directly about.
- Use high confidence only for direct explicit claims; inferred claims should usually be medium or low.
- Include a rationale for inferred claims and for duplicate/existing-claim matches.
- Use stable local IDs such as claim_1, claim_2, claim_3.

Document title: ${documentTitle?.trim() || "Untitled document"}
Shard position: ${shardPosition}
Shard heading path: ${headingContext}

Claim type IDs:
${typeList}

Domain entities:
${entityList || "No domain entities loaded."}

Existing domain claims:
${claimList || "No domain claims loaded."}

Shard text:
${shardText}`;
}

function claimExtractionPrompt({
  claimTypes,
  documentTitle,
  shardHeadingPath,
  shardPosition,
  shardText,
}: {
  claimTypes: Array<{
    id: string;
    label: string;
  }>;
  documentTitle?: string | null;
  shardHeadingPath: string[];
  shardPosition: number;
  shardText: string;
}) {
  const headingContext =
    shardHeadingPath.length > 0 ? shardHeadingPath.join(" > ") : "No heading context";
  const typeList = claimTypes
    .map((type) => `- ${type.id}: ${type.label}`)
    .join("\n");

  return `Extract explicit factual claim candidates from this document shard and assign each claim the most likely claim type.

Return only claims directly supported by the provided shard text. Claims should be atomic, declarative statements that could later be linked to entities. Do not extract section titles, labels, vague topic summaries, inferred claims, or unsupported implications.

Atomicity rules:
- Each claim must express exactly one fact: usually one subject, one predicate, and one object or complement.
- Split compound sentences into separate claims when they contain conjunctions, lists, examples, comparisons, measurements, locations, dates, classifications, membership, composition, or cause/effect.
- If one sentence says where something is and what it contains, return separate location and containment claims.
- If one sentence gives multiple properties of one subject, return one claim per property.
- If one sentence uses an example such as "like Pluto", return the general claim and the example classification as separate claims when both are directly supported.
- Prefer short subject-verb-object statements. Keep units and quantities attached to the one measurement they describe.
- Do not combine multiple entities or multiple facts into one claim.
- Use only the claim type IDs listed below.
- Assign exactly one claim type ID to every claim.
- Include a short support note only when table headers, abbreviations, or local context are needed to explain how the claim was read from the shard. Otherwise return null.

Use stable local IDs such as claim_1, claim_2, claim_3.

Document title: ${documentTitle?.trim() || "Untitled document"}
Shard position: ${shardPosition}
Shard heading path: ${headingContext}

Claim type IDs:
${typeList}

Shard text:
${shardText}`;
}

function shardEntityRelationshipDiscoveryPrompt({
  claims,
  documentTitle,
  entities,
  existingRelationships,
  relationshipTypes,
  shardHeadingPath,
  shardPosition,
  shardText,
}: {
  claims: Array<{
    id: string;
    targetEntityIds: string[];
    text: string;
    typeId: string | null;
  }>;
  documentTitle?: string | null;
  entities: Array<{
    aliases: string[];
    id: string;
    label: string;
    status: string | null;
    typeId: string | null;
  }>;
  existingRelationships: Array<{
    id: string;
    sourceRecordId: string;
    targetRecordId: string;
    typeId: string;
  }>;
  relationshipTypes: Array<{
    id: string;
    label: string;
  }>;
  shardHeadingPath: string[];
  shardPosition: number;
  shardText: string;
}) {
  const headingContext =
    shardHeadingPath.length > 0 ? shardHeadingPath.join(" > ") : "No heading context";
  const entityList = entities
    .map((entity) => {
      const aliases = entity.aliases.length > 0 ? ` aliases: ${entity.aliases.join(", ")}` : "";
      const status = entity.status ? ` status: ${entity.status}` : "";
      const type = entity.typeId ? ` typeId: ${entity.typeId}` : "";

      return `- ${entity.id}: ${entity.label}${type}${status}${aliases}`;
    })
    .join("\n");
  const claimList = claims
    .map((claim) => {
      const type = claim.typeId ? ` typeId: ${claim.typeId}` : "";
      const targets = claim.targetEntityIds.length > 0 ? ` targets: ${claim.targetEntityIds.join(", ")}` : "";

      return `- ${claim.id}:${type}${targets} ${claim.text}`;
    })
    .join("\n");
  const relationshipTypeList = relationshipTypes
    .map((type) => `- ${type.id}: ${type.label}`)
    .join("\n");
  const existingRelationshipList = existingRelationships
    .map(
      (relationship) =>
        `- ${relationship.id}: ${relationship.sourceRecordId} -> ${relationship.targetRecordId} typeId: ${relationship.typeId}`,
    )
    .join("\n");

  return `Identify new relationships between existing domain entities that are supported by this shard.

Use the shard text, domain entities, and relevant domain claims as evidence. Return only relationships between entity IDs from the entity list.

Rules:
- Each relationship must connect two different entity IDs.
- Use only the relationship type IDs listed below.
- claimIds must include claim IDs that support or imply the relationship when such claims are listed.
- Set existingRelationshipId only when the relationship already exists in the existing relationship list.
- Do not repeat an existing relationship. Return it only when this shard adds evidence for that existing link.
- Do not invent relationships from general knowledge outside the shard and provided claims.
- Prefer fewer, stronger relationships over broad weak associations.
- Treat broad domain membership as implicit, not as a Part Of relationship. Do not create Part Of links from ordinary entities to the domain's core entity just because they belong to the domain, product family, ecosystem, or topic area.
- Use Part Of only for an explicit structural hierarchy, containment, component/subsystem relationship, organizational membership, or named collection membership that is directly supported by the shard or claims.
- Do not use Part Of as a fallback for loose association, relevance, capability ownership, topical grouping, or "this is about the domain" context.
- Use stable local IDs such as entity_relationship_1, entity_relationship_2.
- Include a short rationale when the relationship is inferred.

Document title: ${documentTitle?.trim() || "Untitled document"}
Shard position: ${shardPosition}
Shard heading path: ${headingContext}

Entities:
${entityList || "No domain entities loaded."}

Claims:
${claimList || "No domain claims loaded."}

Existing relationships:
${existingRelationshipList || "No existing relationships loaded."}

Relationship type IDs:
${relationshipTypeList}

Shard text:
${shardText}`;
}

function shardClaimRelationshipDiscoveryPrompt({
  claims,
  documentTitle,
  existingRelationships,
  relationshipTypes,
  shardHeadingPath,
  shardPosition,
  shardText,
}: {
  claims: Array<{
    id: string;
    targetEntityIds: string[];
    text: string;
    typeId: string | null;
  }>;
  documentTitle?: string | null;
  existingRelationships: Array<{
    id: string;
    sourceRecordId: string;
    targetRecordId: string;
    typeId: string;
  }>;
  relationshipTypes: Array<{
    id: string;
    label: string;
  }>;
  shardHeadingPath: string[];
  shardPosition: number;
  shardText: string;
}) {
  const headingContext =
    shardHeadingPath.length > 0 ? shardHeadingPath.join(" > ") : "No heading context";
  const claimList = claims
    .map((claim) => {
      const type = claim.typeId ? ` typeId: ${claim.typeId}` : "";
      const targets = claim.targetEntityIds.length > 0 ? ` targets: ${claim.targetEntityIds.join(", ")}` : "";

      return `- ${claim.id}:${type}${targets} ${claim.text}`;
    })
    .join("\n");
  const relationshipTypeList = relationshipTypes
    .map((type) => `- ${type.id}: ${type.label}`)
    .join("\n");
  const existingRelationshipList = existingRelationships
    .map(
      (relationship) =>
        `- ${relationship.id}: ${relationship.sourceRecordId} -> ${relationship.targetRecordId} typeId: ${relationship.typeId}`,
    )
    .join("\n");

  return `Identify claim-to-claim relationships across the domain claim list.

This is triggered by the current shard, but it may compare any domain claims. Return only direct logical support or contradiction relationships.

Rules:
- Each relationship must connect two different claim IDs.
- Use only the relationship type IDs listed below.
- The only allowed relationship meanings are Supports and Contradicts.
- Do not return Related To, Causes, Precedes, Depends On, Clarifies, Qualifies, or any loose topical association for claim-to-claim relationships.
- Supports means the source claim makes the target claim more credible, supplies evidence for it, explains it, or is a necessary premise for it.
- Contradicts means the source claim makes the target claim less credible, conflicts with it, or states an incompatible fact.
- evidenceClaimIds should include the source and target claim IDs and any additional claims that support the link.
- Set existingRelationshipId only when the relationship already exists in the existing relationship list.
- Do not repeat an existing relationship. Return it only when the current shard supports that existing link.
- Do not invent links from general knowledge outside the claim list and current shard context.
- Prefer precise high-value supports or contradictions over loose topical association.
- If a pair is merely about a similar topic, omit it.
- Use stable local IDs such as claim_relationship_1, claim_relationship_2.
- Include a short rationale for why the relationship holds.

Document title: ${documentTitle?.trim() || "Untitled document"}
Shard position: ${shardPosition}
Shard heading path: ${headingContext}

Domain claims:
${claimList || "No domain claims loaded."}

Existing claim relationships:
${existingRelationshipList || "No existing claim relationships loaded."}

Relationship type IDs:
${relationshipTypeList}

Current shard text:
${shardText}`;
}

function relationshipExtractionPrompt({
  claims,
  documentTitle,
  entities,
  relationshipTypes,
}: {
  claims: Array<{
    id: string;
    targetEntityLocalId: string | null;
    text: string;
    typeId: string | null;
  }>;
  documentTitle?: string | null;
  entities: Array<{
    aliases: string[];
    id: string;
    label: string;
    typeId: string | null;
  }>;
  relationshipTypes: Array<{
    id: string;
    label: string;
  }>;
}) {
  const entityList = entities
    .map((entity) => {
      const aliases = entity.aliases.length > 0 ? ` aliases: ${entity.aliases.join(", ")}` : "";
      const type = entity.typeId ? ` typeId: ${entity.typeId}` : "";

      return `- ${entity.id}: ${entity.label}${type}${aliases}`;
    })
    .join("\n");
  const claimList = claims
    .map((claim) => {
      const target = claim.targetEntityLocalId ? ` targetEntityLocalId: ${claim.targetEntityLocalId}` : "";
      const type = claim.typeId ? ` typeId: ${claim.typeId}` : "";

      return `- ${claim.id}:${target}${type} ${claim.text}`;
    })
    .join("\n");
  const typeList = relationshipTypes
    .map((type) => `- ${type.id}: ${type.label}`)
    .join("\n");

  return `Identify candidate relationships between the provided entity candidates.

Use the full claim registry as evidence. Return only relationships between entity local IDs from the provided entity list.

Rules:
- Each relationship must connect exactly two different entities.
- Use only the relationship type IDs listed below.
- Assign exactly one relationship type ID to every relationship.
- claimIds must list the claim IDs that support or imply the relationship.
- Do not invent relationships from general knowledge outside the provided claims.
- Prefer fewer, stronger relationships over broad weak associations.
- Treat broad domain membership as implicit, not as a Part Of relationship. Do not create Part Of links from ordinary entities to the domain's core entity just because they belong to the domain, product family, ecosystem, or topic area.
- Use Part Of only for an explicit structural hierarchy, containment, component/subsystem relationship, organizational membership, or named collection membership that is directly supported by the claims.
- Do not use Part Of as a fallback for loose association, relevance, capability ownership, topical grouping, or "this is about the domain" context.
- Do not create duplicate source/target/type relationships.
- Use stable local IDs such as relationship_1, relationship_2, relationship_3.
- Include a short rationale when the relationship is inferred across multiple claims. Otherwise return null.

Document title: ${documentTitle?.trim() || "Untitled document"}

Entities:
${entityList}

Claims:
${claimList}

Relationship type IDs:
${typeList}`;
}

function entityExtractionPrompt({
  claims,
  documentTitle,
  entityTypes,
}: {
  claims: Array<{
    id: string;
    text: string;
  }>;
  documentTitle?: string | null;
  entityTypes: Array<{
    id: string;
    label: string;
  }>;
}) {
  const typeList = entityTypes
    .map((type) => `- ${type.id}: ${type.label}`)
    .join("\n");
  const claimList = claims
    .map((claim) => `- ${claim.id}: ${claim.text}`)
    .join("\n");

  return `Identify the likely primary target entity for each claim in this claim registry.

Create a candidate entity registry from those primary targets. Use only the entity type IDs listed below. Every returned entity must have the most likely entity type ID from the provided list.

Rules:
- Assign exactly one primary target entity to every claim when a reasonable target can be identified.
- The primary target is the entity the claim is mostly about, not every entity mentioned in the claim.
- Merge repeated references to the same durable entity into one entity candidate.
- Prefer concrete named entities over broad categories when the claim is about a named entity.
- Use broad conceptual entities only when the claim is primarily about a concept, class, system, place, event, property, or measurement.
- Do not invent entities that are not supported by the claim texts.
- Use stable local IDs such as entity_1, entity_2, entity_3.
- Put alternate names, abbreviations, and spelling variants in aliases.
- sourceClaimIds must list the claim IDs that support the entity candidate.
- claimTargets must map claim IDs to returned entity local IDs.

Document title: ${documentTitle?.trim() || "Untitled document"}

Entity type IDs:
${typeList}

Claims:
${claimList}`;
}

function inferredClaimExtractionPrompt({
  claimTypes,
  documentTitle,
  entities,
  existingClaims,
  shardHeadingPath,
  shardPosition,
  shardText,
}: {
  claimTypes: Array<{
    id: string;
    label: string;
  }>;
  documentTitle?: string | null;
  entities: Array<{
    aliases: string[];
    id: string;
    label: string;
  }>;
  existingClaims: Array<{
    id: string;
    text: string;
  }>;
  shardHeadingPath: string[];
  shardPosition: number;
  shardText: string;
}) {
  const headingContext =
    shardHeadingPath.length > 0 ? shardHeadingPath.join(" > ") : "No heading context";
  const entityList = entities
    .map((entity) => {
      const aliases = entity.aliases.length > 0 ? ` aliases: ${entity.aliases.join(", ")}` : "";

      return `- ${entity.id}: ${entity.label}${aliases}`;
    })
    .join("\n");
  const claimList = existingClaims
    .map((claim) => `- ${claim.id}: ${claim.text}`)
    .join("\n");
  const typeList = claimTypes
    .map((type) => `- ${type.id}: ${type.label}`)
    .join("\n");

  return `Extract inferred factual claim candidates from this document shard for the provided entity list and assign each claim the most likely claim type.

These are not explicit claims. They should be reasonable inferences that follow from the shard text and the existing explicit claim registry.

Rules:
- Return only inferred claims about one of the provided entity local IDs.
- Each inferred claim must express exactly one fact: usually one subject, one predicate, and one object or complement.
- Split compound inferences into separate claims when they contain multiple properties, classifications, locations, dates, measurements, comparisons, memberships, composition facts, or cause/effect facts.
- Do not combine multiple entities or multiple facts into one inferred claim unless the relationship among those entities is itself the single fact.
- Do not repeat or paraphrase an existing explicit claim.
- Do not invent facts from general knowledge outside the document.
- Prefer useful bridge claims, classifications, memberships, properties, comparisons, and implications that would help build a knowledge graph.
- Assign exactly one targetEntityLocalId from the provided entity list.
- Use only the claim type IDs listed below.
- Assign exactly one claim type ID to every inferred claim.
- Use high confidence only when the inference is very direct. Use medium for reasonable but indirect inferences. Use low for weak but plausible inferences.
- Include a short rationale explaining why the inference follows. Do not quote the source text.
- Use stable local IDs such as inferred_claim_1, inferred_claim_2, inferred_claim_3.

Document title: ${documentTitle?.trim() || "Untitled document"}
Shard position: ${shardPosition}
Shard heading path: ${headingContext}

Entities:
${entityList}

Existing explicit claims:
${claimList}

Claim type IDs:
${typeList}

Shard text:
${shardText}`;
}
