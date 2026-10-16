import { generateText, Output } from "ai";
import { config as loadEnv } from "dotenv";
import { z } from "zod";

import {
  defaultAtlasDistillationModelId,
  providerOptionsForAtlasChatModel,
  findAtlasChatModelOption,
  defaultAtlasChatEffort,
} from "../lib/atlas-ai-models";
import { createSupabaseClient } from "../lib/supabase/client";

loadEnv({ path: ".env.local" });

const repairSchema = z.object({
  relationships: z.array(
    z.object({
      localId: z.string().min(1),
      type: z.enum(["supports", "contradicts"]),
    }),
  ),
});

const domainId = process.argv[2];

if (!domainId) {
  throw new Error("Usage: tsx tools/repair-claim-relationship-types.ts <domain-id>");
}

async function main() {
  const supabase = createSupabaseClient();
  const modelOption = findAtlasChatModelOption(defaultAtlasDistillationModelId);
  const model = modelOption?.id ?? defaultAtlasDistillationModelId;
  const providerOptions = modelOption
    ? providerOptionsForAtlasChatModel(modelOption, defaultAtlasChatEffort)
    : undefined;

  const { data: classes, error: classError } = await supabase
    .from("classes")
    .select("id,table_name");

  if (classError) {
    throw new Error(classError.message);
  }

  const claimClassId = classes?.find((classRecord) => classRecord.table_name === "claims")?.id;
  const relationshipClassId = classes?.find((classRecord) => classRecord.table_name === "relationships")?.id;

  if (!claimClassId || !relationshipClassId) {
    throw new Error("Required classes were not found.");
  }

  const { data: typeRows, error: typeError } = await supabase
    .from("types")
    .select("id,label,slug")
    .eq("class_id", relationshipClassId)
    .in("slug", ["supports", "contradicts"]);

  if (typeError) {
    throw new Error(typeError.message);
  }

  const supportsTypeId = typeRows?.find((typeRow) => typeRow.slug === "supports")?.id;
  const contradictsTypeId = typeRows?.find((typeRow) => typeRow.slug === "contradicts")?.id;

  if (!supportsTypeId || !contradictsTypeId) {
    throw new Error("Supports and Contradicts relationship types are required.");
  }

  const { data: relationships, error: relationshipError } = await supabase
    .from("relationships")
    .select("id,label,type_id,source_record_id,target_record_id")
    .eq("domain_id", domainId)
    .eq("source_class_id", claimClassId)
    .eq("target_class_id", claimClassId);

  if (relationshipError) {
    throw new Error(relationshipError.message);
  }

  if (!relationships || relationships.length === 0) {
    console.log("No claim relationships found.");
    return;
  }

  const claimIds = Array.from(
    new Set(
      relationships.flatMap((relationship) => [
        relationship.source_record_id,
        relationship.target_record_id,
      ]),
    ),
  );
  const { data: claims, error: claimError } = await supabase
    .from("claims")
    .select("id,claim_text")
    .in("id", claimIds);

  if (claimError) {
    throw new Error(claimError.message);
  }

  const claimTextById = new Map((claims ?? []).map((claim) => [claim.id, claim.claim_text]));
  const localIdByRelationshipId = new Map(
    relationships.map((relationship, index) => [relationship.id, `relationship_${index + 1}`]),
  );
  const relationshipByLocalId = new Map(
    relationships.map((relationship) => [localIdByRelationshipId.get(relationship.id) ?? relationship.id, relationship]),
  );
  const relationshipList = relationships
    .map((relationship) => {
      const sourceClaim = claimTextById.get(relationship.source_record_id) ?? relationship.source_record_id;
      const targetClaim = claimTextById.get(relationship.target_record_id) ?? relationship.target_record_id;
      const localId = localIdByRelationshipId.get(relationship.id) ?? relationship.id;

      return [
        `Local ID: ${localId}`,
        `Current label: ${relationship.label}`,
        `Source claim: ${sourceClaim}`,
        `Target claim: ${targetClaim}`,
      ].join("\n");
    })
    .join("\n\n---\n\n");

  const { output } = await generateText({
    model,
    output: Output.object({
      schema: repairSchema,
    }),
    prompt: `Classify every claim-to-claim relationship as exactly one of:
- supports
- contradicts

Use supports when the source claim makes the target claim more credible, supplies evidence for it, explains it, narrows it, or is a necessary premise for it.
Use contradicts when the source claim conflicts with the target claim, makes it less credible, or states an incompatible fact.

You must return exactly one classification for every Local ID below. Do not omit any Local ID. Do not use any other type.

Relationships:
${relationshipList}`,
    ...(providerOptions ? { providerOptions } : {}),
  });

  const relationshipLocalIds = new Set(relationshipByLocalId.keys());
  const classifications = new Map(output.relationships.map((relationship) => [relationship.localId, relationship]));
  const missingIds = [...relationshipLocalIds].filter((id) => !classifications.has(id));
  const extraIds = [...classifications.keys()].filter((id) => !relationshipLocalIds.has(id));

  if (missingIds.length > 0 || extraIds.length > 0) {
    throw new Error(`Classification mismatch. Missing: ${missingIds.join(", ") || "none"}. Extra: ${extraIds.join(", ") || "none"}.`);
  }

  let updatedCount = 0;

  for (const [localId, relationship] of relationshipByLocalId) {
    const classification = classifications.get(localId);

    if (!classification) {
      continue;
    }

    const typeId = classification.type === "contradicts" ? contradictsTypeId : supportsTypeId;

    const { error: updateError } = await supabase
      .from("relationships")
      .update({
        type_id: typeId,
        updated_at: Date.now(),
      })
      .eq("id", relationship.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    updatedCount += 1;
  }

  console.log(JSON.stringify({
    contradictsTypeId,
    relationshipCount: relationships.length,
    supportsTypeId,
    updatedCount,
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
