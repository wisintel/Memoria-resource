import { defineTool } from "eve/tools";
import { z } from "zod";

import { createSupabaseClient, type TableRow } from "../lib/supabase-client";
import { classIdForTable, referenceLookups, rowString } from "../lib/atlas-read-model";

const graphRecordTables = ["claims", "entities", "relationships"] as const;
const visibilityValues = ["visible", "hidden", "collapsed", "metadata_only"] as const;
type ViewNodePlacement = {
  created_at: number;
  pinned: boolean;
  record_class_id: string;
  record_id: string;
  updated_at: number;
  view_id: string;
  visibility: (typeof visibilityValues)[number];
  x: number;
  y: number;
};

const addRecordToViewSchema = z.object({
  recordId: z.string().min(1),
  tableName: z.enum(graphRecordTables),
  viewId: z.string().min(1),
  visibility: z.enum(visibilityValues).optional(),
  x: z.number().optional(),
  y: z.number().optional(),
});

export default defineTool({
  description:
    "Add an existing Atlas entity, claim, or relationship to a graph view. Relationship placement also adds visible source and target endpoint nodes when supported by the graph.",
  inputSchema: addRecordToViewSchema,
  outputSchema: z.object({
    error: z.string().nullable(),
    ok: z.boolean(),
    recordId: z.string(),
    tableName: z.enum(graphRecordTables),
    viewId: z.string(),
  }),
  async execute({ recordId, tableName, viewId, visibility = "visible", x = 0, y = 0 }) {
    const supabase = createSupabaseClient();
    const cleanRecordId = recordId.trim();
    const cleanViewId = viewId.trim();
    const now = Date.now();

    try {
      if (tableName === "relationships") {
        const viewResult = await supabase
          .from("views")
          .select("id,domain_id")
          .eq("id", cleanViewId)
          .maybeSingle();

        if (viewResult.error) {
          return failed(viewResult.error.message, cleanRecordId, tableName, cleanViewId);
        }

        if (!viewResult.data) {
          return failed("View was not found.", cleanRecordId, tableName, cleanViewId);
        }

        const relationshipResult = await supabase
          .from("relationships")
          .select("id,domain_id,source_class_id,source_record_id,target_class_id,target_record_id")
          .eq("id", cleanRecordId)
          .maybeSingle();

        if (relationshipResult.error) {
          return failed(relationshipResult.error.message, cleanRecordId, tableName, cleanViewId);
        }

        if (!relationshipResult.data) {
          return failed("Relationship was not found.", cleanRecordId, tableName, cleanViewId);
        }

        if (relationshipResult.data.domain_id !== viewResult.data.domain_id) {
          return failed("Relationship and view belong to different domains.", cleanRecordId, tableName, cleanViewId);
        }

        const refs = await referenceLookups(viewResult.data.domain_id);
        const relationship = relationshipResult.data as unknown as TableRow;
        const endpointNodes = [
          viewNodeInsertForRelationshipEndpoint({
            classTableNames: refs.classTableNames,
            now,
            position: { x: x - 120, y },
            relationship,
            side: "source",
            viewId: cleanViewId,
            visibility,
          }),
          viewNodeInsertForRelationshipEndpoint({
            classTableNames: refs.classTableNames,
            now,
            position: { x: x + 120, y },
            relationship,
            side: "target",
            viewId: cleanViewId,
            visibility,
          }),
        ].filter((node): node is ViewNodePlacement => Boolean(node));

        if (endpointNodes.length > 0) {
          const { error } = await supabase.from("view_nodes").upsert(endpointNodes, {
            onConflict: "view_id,record_class_id,record_id",
          });

          if (error) {
            return failed(error.message, cleanRecordId, tableName, cleanViewId);
          }
        }

        const { error } = await supabase.from("view_relationships").upsert(
          {
            created_at: now,
            relationship_id: cleanRecordId,
            updated_at: now,
            view_id: cleanViewId,
            visibility,
          },
          {
            onConflict: "view_id,relationship_id",
          },
        );

        if (error) {
          return failed(error.message, cleanRecordId, tableName, cleanViewId);
        }

        return succeeded(cleanRecordId, tableName, cleanViewId);
      }

      const recordClassId = await classIdForTable(tableName);

      if (!recordClassId) {
        return failed(`Class was not found for ${tableName}.`, cleanRecordId, tableName, cleanViewId);
      }

      const { error } = await supabase.from("view_nodes").upsert(
        {
          created_at: now,
          pinned: false,
          record_class_id: recordClassId,
          record_id: cleanRecordId,
          updated_at: now,
          view_id: cleanViewId,
          visibility,
          x,
          y,
        },
        {
          onConflict: "view_id,record_class_id,record_id",
        },
      );

      if (error) {
        return failed(error.message, cleanRecordId, tableName, cleanViewId);
      }

      return succeeded(cleanRecordId, tableName, cleanViewId);
    } catch (error) {
      return failed(error instanceof Error ? error.message : String(error), cleanRecordId, tableName, cleanViewId);
    }
  },
  toModelOutput(output) {
    return {
      type: "json",
      value: output,
    };
  },
});

function viewNodeInsertForRelationshipEndpoint({
  classTableNames,
  now,
  position,
  relationship,
  side,
  viewId,
  visibility,
}: {
  classTableNames: Map<string, string>;
  now: number;
  position: {
    x: number;
    y: number;
  };
  relationship: TableRow;
  side: "source" | "target";
  viewId: string;
  visibility: (typeof visibilityValues)[number];
}): ViewNodePlacement | null {
  const classId = rowString(relationship, `${side}_class_id`);
  const recordId = rowString(relationship, `${side}_record_id`);
  const tableName = classTableNames.get(classId);

  if ((tableName !== "entities" && tableName !== "claims") || !recordId) {
    return null;
  }

  return {
    created_at: now,
    pinned: false,
    record_class_id: classId,
    record_id: recordId,
    updated_at: now,
    view_id: viewId,
    visibility,
    x: position.x,
    y: position.y,
  };
}

function failed(
  error: string,
  recordId: string,
  tableName: (typeof graphRecordTables)[number],
  viewId: string,
) {
  return {
    error,
    ok: false,
    recordId,
    tableName,
    viewId,
  };
}

function succeeded(recordId: string, tableName: (typeof graphRecordTables)[number], viewId: string) {
  return {
    error: null,
    ok: true,
    recordId,
    tableName,
    viewId,
  };
}
