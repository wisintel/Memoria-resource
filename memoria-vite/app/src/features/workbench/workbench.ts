import type { SelectedDetails } from "@/features/inspector/Inspector";
import { defaultEdgeColor, edgeDisplayLabel, itemColor } from "@/lib/semantic-display";
import type {
  GraphEdgeRecord,
  GraphSnapshot,
  GraphView,
  SelectedRecord,
  ViewEdgeRecord,
  ViewItemRecord
} from "../../types";

export type WorkbenchScratchState = {
  edgeIds: string[];
  items: Record<string, { x: number; y: number }>;
};

export function isWorkbenchView(view: GraphView | null) {
  return view?.label.trim().toLowerCase() === "workbench";
}

function workbenchViewItemId(itemId: string) {
  return `workbench-item-${itemId}`;
}

export function itemIdFromWorkbenchViewItemId(viewItemId: string) {
  return viewItemId.startsWith("workbench-item-") ? viewItemId.slice("workbench-item-".length) : null;
}

export function applyWorkbenchScratch(snapshot: GraphSnapshot, scratch: WorkbenchScratchState): GraphSnapshot {
  if (!isWorkbenchView(snapshot.activeView)) {
    return snapshot;
  }

  const viewId = snapshot.activeView?.id ?? "workbench";
  const viewItems: ViewItemRecord[] = Object.entries(scratch.items)
    .map(([itemId, position]) => {
      const item = snapshot.items.find((candidate) => candidate.id === itemId);

      if (!item) {
        return null;
      }

      const viewItem: ViewItemRecord = {
        ...item,
        item_id: item.id,
        view_created: item.updated,
        view_id: viewId,
        view_item_id: workbenchViewItemId(item.id),
        view_updated: item.updated,
        visibility: "visible" as const,
        x: position.x,
        y: position.y
      };

      return viewItem;
    })
    .filter((item): item is ViewItemRecord => item !== null);
  const placedItemIds = new Set(viewItems.map((item) => item.item_id));
  const viewEdges: ViewEdgeRecord[] = scratch.edgeIds
    .map((edgeId) => snapshot.edges.find((edge) => edge.id === edgeId))
    .filter((edge): edge is GraphEdgeRecord =>
      Boolean(edge && placedItemIds.has(edge.source_id) && placedItemIds.has(edge.target_id))
    )
    .map((edge) => ({
      ...edge,
      edge_id: edge.id,
      view_created: edge.updated,
      view_edge_id: `workbench-edge-${edge.id}`,
      view_id: viewId,
      view_updated: edge.updated,
      visibility: "visible" as const
    }));

  return {
    ...snapshot,
    viewEdges,
    viewItems
  };
}

export function selectedRecord(snapshot: GraphSnapshot | null, selected: SelectedRecord): SelectedDetails {
  if (!snapshot || !selected) {
    return null;
  }

  if (selected.kind === "item") {
    const viewItem = snapshot.viewItems.find((item) => item.item_id === selected.id);
    const item = snapshot.items.find((candidate) => candidate.id === selected.id);
    const relatedClaims = snapshot.items.filter((candidate) => candidate.item_table === "claims" && candidate.target_id === selected.id);
    const relatedEdges = snapshot.edges.filter((candidate) => candidate.source_id === selected.id || candidate.target_id === selected.id);

    if (!item) {
      return null;
    }

    const relatedTargets =
      item.item_table === "claims" && item.target_id
        ? snapshot.items.filter((candidate) => candidate.id === item.target_id)
        : [];

    return {
      claimText: item.claim_text,
      color: itemColor(item.item_table),
      domainId: item.domain_id,
      id: item.id,
      itemTable: item.item_table,
      kind: "item",
      relatedClaims,
      relatedEdges,
      relatedTargets,
      record: { item, viewItem: viewItem ?? null },
      source: item.source,
      summary: item.claim_text ?? item.source,
      title: item.label,
      typeLabel: item.type
    };
  }

  const viewEdge = snapshot.viewEdges.find((edge) => edge.edge_id === selected.id);
  const edge = snapshot.edges.find((candidate) => candidate.id === selected.id);

  if (!edge) {
    return null;
  }

  return {
    color: defaultEdgeColor,
    domainId: edge.domain_id,
    id: edge.id,
    itemTable: "edges",
    kind: "edge",
    record: { edge, viewEdge: viewEdge ?? null },
    source: edge.source,
    sourceLabel: edge.source_label ?? edge.source_id,
    summary: edge.source,
    targetLabel: edge.target_label ?? edge.target_id,
    title: edgeDisplayLabel(edge),
    typeLabel: edge.type
  };
}

export function summarizeSelectedDetails(details: NonNullable<SelectedDetails>) {
  if (details.kind === "edge") {
    return {
      domain_id: details.domainId,
      id: details.id,
      item_table: "edges",
      kind: "edge",
      label: details.record.edge.label,
      source_id: details.record.edge.source_id,
      source_label: details.sourceLabel,
      target_id: details.record.edge.target_id,
      target_label: details.targetLabel,
      type: details.typeLabel
    };
  }

  return {
    domain_id: details.domainId,
    id: details.id,
    item_table: details.itemTable,
    kind: "item",
    label: details.title,
    placed_in_view: Boolean(details.record.viewItem),
    type: details.typeLabel
  };
}
