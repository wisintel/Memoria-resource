import { defineTool } from "eve/tools";
import { z } from "zod";

import { createSupabaseClient, type TableRow } from "../lib/supabase-client";
import { boundedLimit, rowString, rowStringArray } from "../lib/atlas-read-model";

const defaultPromotionThreshold = 5;

export default defineTool({
  description:
    "Score proposed Atlas entities for possible promotion to canon without changing records. Use this when reasoning about which entities are ready to promote.",
  inputSchema: z.object({
    domainId: z.string().min(1),
    limit: z.number().int().positive().optional(),
    threshold: z.number().int().positive().optional(),
  }),
  outputSchema: z.object({
    candidates: z.array(
      z.object({
        claimCount: z.number(),
        entityId: z.string(),
        label: z.string(),
        relationshipCount: z.number(),
        recommendation: z.enum(["eligible", "hold"]),
        statusId: z.string(),
        typeId: z.string(),
        weight: z.number(),
      }),
    ),
    domainId: z.string(),
    proposedEntityCount: z.number(),
    threshold: z.number(),
  }),
  async execute({ domainId, limit, threshold }) {
    const cleanDomainId = domainId.trim();
    const rowLimit = boundedLimit(limit);
    const weightThreshold = threshold ?? defaultPromotionThreshold;
    const supabase = createSupabaseClient();
    const { data: classes, error: classesError } = await supabase
      .from("classes")
      .select("id,table_name")
      .in("table_name", ["entities"]);

    if (classesError) {
      throw new Error(classesError.message);
    }

    const entityClassId =
      ((classes ?? []) as unknown as TableRow[]).find((row) => rowString(row, "table_name") === "entities")
        ?.[ "id" ];

    if (typeof entityClassId !== "string") {
      throw new Error("Entity class was not found.");
    }

    const { data: statuses, error: statusesError } = await supabase
      .from("statuses")
      .select("id,slug,label,class_id")
      .eq("class_id", entityClassId);

    if (statusesError) {
      throw new Error(statusesError.message);
    }

    const proposedStatusId =
      ((statuses ?? []) as unknown as TableRow[]).find(
        (row) => rowString(row, "slug") === "proposed" || rowString(row, "label").toLowerCase() === "proposed",
      )?.id ?? null;

    if (typeof proposedStatusId !== "string") {
      throw new Error("Entity proposed status was not found.");
    }

    const { data: entities, error: entitiesError } = await supabase
      .from("entities")
      .select("id,label,type_id,status_id")
      .eq("domain_id", cleanDomainId)
      .eq("status_id", proposedStatusId);

    if (entitiesError) {
      throw new Error(entitiesError.message);
    }

    const proposedEntities = ((entities ?? []) as unknown as TableRow[]).filter((row) => rowString(row, "id"));
    const entityIds = proposedEntities.map((row) => rowString(row, "id"));
    const [{ data: claims, error: claimsError }, { data: relationships, error: relationshipsError }] =
      await Promise.all([
        entityIds.length > 0
          ? supabase
              .from("claims")
              .select("id,target_entity_ids")
              .eq("domain_id", cleanDomainId)
              .overlaps("target_entity_ids", entityIds)
          : { data: [], error: null },
        entityIds.length > 0
          ? supabase
              .from("relationships")
              .select("id,source_class_id,source_record_id,target_class_id,target_record_id")
              .eq("domain_id", cleanDomainId)
              .or(`source_record_id.in.(${entityIds.join(",")}),target_record_id.in.(${entityIds.join(",")})`)
          : { data: [], error: null },
      ]);

    if (claimsError || relationshipsError) {
      throw new Error(claimsError?.message ?? relationshipsError?.message ?? "Promotion evidence could not be loaded.");
    }

    const claimCounts = new Map(entityIds.map((entityId) => [entityId, 0]));
    const relationshipCounts = new Map(entityIds.map((entityId) => [entityId, 0]));

    for (const claim of (claims ?? []) as unknown as TableRow[]) {
      for (const entityId of rowStringArray(claim, "target_entity_ids")) {
        if (claimCounts.has(entityId)) {
          claimCounts.set(entityId, (claimCounts.get(entityId) ?? 0) + 1);
        }
      }
    }

    for (const relationship of (relationships ?? []) as unknown as TableRow[]) {
      if (rowString(relationship, "source_class_id") === entityClassId) {
        const sourceId = rowString(relationship, "source_record_id");

        if (relationshipCounts.has(sourceId)) {
          relationshipCounts.set(sourceId, (relationshipCounts.get(sourceId) ?? 0) + 1);
        }
      }

      if (rowString(relationship, "target_class_id") === entityClassId) {
        const targetId = rowString(relationship, "target_record_id");

        if (relationshipCounts.has(targetId)) {
          relationshipCounts.set(targetId, (relationshipCounts.get(targetId) ?? 0) + 1);
        }
      }
    }

    const candidates = proposedEntities
      .map((entity) => {
        const entityId = rowString(entity, "id");
        const claimCount = claimCounts.get(entityId) ?? 0;
        const relationshipCount = relationshipCounts.get(entityId) ?? 0;
        const weight = claimCount + relationshipCount;

        return {
          claimCount,
          entityId,
          label: rowString(entity, "label"),
          relationshipCount,
          recommendation: weight >= weightThreshold ? "eligible" as const : "hold" as const,
          statusId: rowString(entity, "status_id"),
          typeId: rowString(entity, "type_id"),
          weight,
        };
      })
      .sort((left, right) => right.weight - left.weight || left.label.localeCompare(right.label))
      .slice(0, rowLimit);

    return {
      candidates,
      domainId: cleanDomainId,
      proposedEntityCount: proposedEntities.length,
      threshold: weightThreshold,
    };
  },
  toModelOutput(output) {
    return {
      type: "json",
      value: output,
    };
  },
});
