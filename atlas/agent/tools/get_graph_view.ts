import { defineTool } from "eve/tools";
import { z } from "zod";

import { createSupabaseClient, type TableRow } from "../lib/supabase-client";
import { labelFor, referenceLookups, rowString, rowTitle } from "../lib/atlas-read-model";

export default defineTool({
  description: "Read an Atlas graph view with visible nodes and relationships, including labels and relationship types.",
  inputSchema: z.object({
    viewId: z.string().min(1),
  }),
  async execute({ viewId }) {
    const supabase = createSupabaseClient();
    const viewResult = await supabase
      .from("views")
      .select("id,domain_id,slug,label,view_kind,status_id")
      .eq("id", viewId)
      .maybeSingle();

    if (viewResult.error) {
      throw new Error(viewResult.error.message);
    }

    if (!viewResult.data) {
      return { view: null };
    }

    const domainId = viewResult.data.domain_id;
    const refs = await referenceLookups(domainId);
    const [nodesResult, viewRelationshipsResult] = await Promise.all([
      supabase
        .from("view_nodes")
        .select("id,record_class_id,record_id,visibility,x,y,pinned")
        .eq("view_id", viewId),
      supabase
        .from("view_relationships")
        .select("id,relationship_id,visibility")
        .eq("view_id", viewId),
    ]);
    const firstError = nodesResult.error?.message ?? viewRelationshipsResult.error?.message ?? null;

    if (firstError) {
      throw new Error(firstError);
    }

    const nodes = (nodesResult.data ?? []) as unknown as TableRow[];
    const entityNodeIds = nodes
      .filter((row) => labelFor(refs.classTableNames, row.record_class_id) === "entities")
      .map((row) => rowString(row, "record_id"));
    const relationshipIds = ((viewRelationshipsResult.data ?? []) as unknown as TableRow[])
      .map((row) => rowString(row, "relationship_id"))
      .filter(Boolean);
    const [entitiesResult, relationshipsResult] = await Promise.all([
      entityNodeIds.length
        ? supabase.from("entities").select("id,label,slug,type_id,kind_id,status_id").in("id", entityNodeIds)
        : Promise.resolve({ data: [], error: null }),
      relationshipIds.length
        ? supabase
            .from("relationships")
            .select("id,type_id,kind_id,status_id,source_class_id,source_record_id,target_class_id,target_record_id,label")
            .in("id", relationshipIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    const secondError = entitiesResult.error?.message ?? relationshipsResult.error?.message ?? null;

    if (secondError) {
      throw new Error(secondError);
    }

    const entityLookup = new Map(
      ((entitiesResult.data ?? []) as unknown as TableRow[]).map((row) => [rowString(row, "id"), row]),
    );
    const relationshipRows = (relationshipsResult.data ?? []) as unknown as TableRow[];

    return {
      nodes: nodes.map((row) => {
        const recordId = rowString(row, "record_id");
        const entity = entityLookup.get(recordId);

        return {
          class: labelFor(refs.classLabels, row.record_class_id),
          id: rowString(row, "id"),
          kind: entity ? labelFor(refs.kindLabels, entity.kind_id) : "",
          label: entity ? rowTitle(entity) : recordId,
          pinned: row.pinned,
          recordId,
          status: entity ? labelFor(refs.statusLabels, entity.status_id) : "",
          type: entity ? labelFor(refs.typeLabels, entity.type_id) : "",
          visibility: rowString(row, "visibility"),
        };
      }),
      relationships: relationshipRows.map((row) => ({
        id: rowString(row, "id"),
        label: rowString(row, "label"),
        sourceClass: labelFor(refs.classLabels, row.source_class_id),
        sourceRecordId: rowString(row, "source_record_id"),
        targetClass: labelFor(refs.classLabels, row.target_class_id),
        targetRecordId: rowString(row, "target_record_id"),
        type: labelFor(refs.typeLabels, row.type_id),
      })),
      view: viewResult.data,
    };
  },
});
