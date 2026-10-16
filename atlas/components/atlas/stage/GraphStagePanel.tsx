"use client";

import {
  Background,
  BackgroundVariant,
  BaseEdge,
  ConnectionLineType,
  ControlButton,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getIncomers,
  getNodesBounds,
  getOutgoers,
  getStraightPath,
  useEdgesState,
  useInternalNode,
  useNodesState,
  useOnSelectionChange,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import dagre from "dagre";
import { ArrowDown, ArrowRight, ArrowUp, Check, CircleDot, Focus, Network, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import type { CSSProperties, DragEvent, MouseEvent, RefObject } from "react";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createGraphView,
  deleteGraphView,
  renameGraphView,
} from "@/app/atlas/actions";
import {
  buildReferenceOptions,
  type ReferenceOptions,
} from "@/components/atlas/inspector/ClassTableControls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { KnownClassTableName } from "@/lib/class-table-templates";
import type {
  ClassRecord,
  ClassTableSamples,
  RelationshipInsert,
  SelectedViewRecords,
  TableRow,
  ViewNodeInsert,
  ViewRelationshipInsert,
} from "@/lib/supabase/client";
import { createSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import styles from "./GraphStagePanel.module.css";

type GraphNodeKind = "entity" | "claim";
type GraphRecordTableName = Extract<KnownClassTableName, "claims" | "entities" | "relationships">;
type ViewEditMode = "create" | "rename" | null;

type FlowNodeData = {
  collapsedCount: number;
  kind: GraphNodeKind;
  kindLabel: string;
  label: string;
  recordClassId: string;
  recordId: string;
  tableName: Extract<GraphRecordTableName, "claims" | "entities">;
  viewNodeId: string;
};

type FlowEdgeData = {
  label: string;
  recordId: string;
  tableName: Extract<GraphRecordTableName, "relationships">;
  typeLabel: string;
  viewRelationshipId: string;
};

type ActiveGraphDrag = {
  recordId: string;
  tableName: Extract<GraphRecordTableName, "entities" | "relationships">;
};
export type { ActiveGraphDrag };

type GraphRecordSelection = {
  recordId: string;
  tableName: GraphRecordTableName;
};

type PendingNodePosition = {
  x: number;
  y: number;
};

type FlowNode = Node<FlowNodeData, "atlasGraph">;
type FlowEdge = Edge<FlowEdgeData, "atlasFloating">;
type GraphLayoutDirection = "LR" | "TB" | "BT";
type GraphLayoutUpdate = PendingNodePosition & {
  viewNodeId: string;
};
type RadialRelaxNodeState = {
  homeX: number;
  homeY: number;
  node: FlowNode;
  vx: number;
  vy: number;
  x: number;
  y: number;
};
type GraphStageGraph = {
  classTableNames: Map<string, string>;
  edges: FlowEdge[];
  nodes: FlowNode[];
  relationshipsById: Map<string, TableRow>;
};

const dagreNodeWidth = 190;
const dagreNodeHeight = 72;
const dagreRadialRingGap = 230;
const dagreRadialNodeGap = 118;
const radialRelaxIterations = 120;
const radialRelaxLinkDistance = 210;
const radialRelaxCollisionDistance = 130;
const flowNodeClassName =
  "relative grid min-w-[92px] max-w-[190px] justify-items-center gap-2 text-center font-sans text-[13px] font-[560] leading-[1.2] text-[color-mix(in_oklch,var(--foreground)_82%,var(--primary)_18%)] [text-shadow:0_0_12px_color-mix(in_oklch,var(--primary)_14%,transparent)]";
const flowNodeSelectedClassName =
  "text-foreground [text-shadow:0_0_10px_color-mix(in_oklch,var(--chart-2)_50%,transparent),0_0_28px_color-mix(in_oklch,var(--primary)_36%,transparent)]";
const flowNodeDotClassName =
  "size-[13px] rounded-full border-2 border-[color-mix(in_oklch,var(--primary)_78%,var(--foreground)_22%)] bg-[color-mix(in_oklch,var(--background)_88%,var(--primary)_12%)] shadow-[0_0_0_4px_color-mix(in_oklch,var(--primary)_12%,transparent),0_0_12px_color-mix(in_oklch,var(--primary)_34%,transparent),inset_0_0_6px_color-mix(in_oklch,var(--foreground)_38%,transparent)] transition-[background,border-color,box-shadow] duration-[140ms]";
const flowClaimNodeDotClassName = "border-[color-mix(in_oklch,var(--chart-2)_78%,transparent)]";
const flowNodeDotSelectedClassName =
  "border-[color-mix(in_oklch,var(--foreground)_74%,var(--primary)_26%)] bg-[color-mix(in_oklch,var(--primary)_74%,var(--foreground)_26%)] shadow-[0_0_0_7px_color-mix(in_oklch,var(--primary)_20%,transparent),0_0_22px_color-mix(in_oklch,var(--primary)_82%,transparent),0_0_44px_color-mix(in_oklch,var(--primary)_32%,transparent),inset_0_0_8px_color-mix(in_oklch,var(--foreground)_55%,transparent)]";
const flowHandleClassName = "size-7 rounded-full border-0 bg-transparent opacity-0";
const flowTargetHandleStyle: CSSProperties = {
  left: "50%",
  top: "6.5px",
  transform: "translate(-50%, -50%)",
  zIndex: 1,
};
const flowSourceHandleStyle: CSSProperties = {
  ...flowTargetHandleStyle,
  zIndex: 2,
};
const canvasStageClassName =
  "relative z-[1] h-full min-h-full overflow-hidden bg-background before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(100%_88%_at_50%_50%,transparent_62%,color-mix(in_oklch,var(--background)_52%,transparent)_100%)] before:opacity-70 before:content-['']";

function AtlasGraphNode({ data, selected }: NodeProps<FlowNode>) {
  return (
    <div
      className={cn(
        flowNodeClassName,
        selected && flowNodeSelectedClassName,
      )}
    >
      <Handle
        className={flowHandleClassName}
        position={Position.Top}
        style={flowTargetHandleStyle}
        type="target"
      />
      <Handle
        className={flowHandleClassName}
        position={Position.Top}
        style={flowSourceHandleStyle}
        type="source"
      />
      <span
        className={cn(
          flowNodeDotClassName,
          data.kind === "claim" && flowClaimNodeDotClassName,
          selected && flowNodeDotSelectedClassName,
        )}
        aria-hidden="true"
      />
      {data.collapsedCount > 0 ? (
        <span
          aria-label={`${data.collapsedCount} collapsed`}
          className="absolute top-[-10px] left-[calc(50%_+_7px)] grid min-w-[18px] place-items-center rounded-full border border-[color-mix(in_oklch,var(--primary)_50%,transparent)] bg-background/95 px-1.5 py-0.5 font-mono text-[10px] leading-none text-[color-mix(in_oklch,var(--primary)_78%,var(--foreground)_22%)] shadow-[0_0_12px_color-mix(in_oklch,var(--primary)_24%,transparent)]"
          title={`${data.collapsedCount} collapsed`}
        >
          {data.collapsedCount}
        </span>
      ) : null}
      <span className="max-w-[190px] [overflow-wrap:anywhere]">{data.label}</span>
    </div>
  );
}

const nodeTypes = {
  atlasGraph: AtlasGraphNode,
};

function AtlasFloatingEdge({
  id,
  interactionWidth,
  label,
  labelBgBorderRadius,
  labelBgPadding,
  labelBgStyle,
  labelShowBg,
  labelStyle,
  markerEnd,
  markerStart,
  source,
  sourceX,
  sourceY,
  style,
  target,
  targetX,
  targetY,
}: EdgeProps<FlowEdge>) {
  const sourceNode = useInternalNode<FlowNode>(source);
  const targetNode = useInternalNode<FlowNode>(target);
  const sourcePoint = nodeDotPoint(sourceNode) ?? { x: sourceX, y: sourceY };
  const targetPoint = nodeDotPoint(targetNode) ?? { x: targetX, y: targetY };
  const [edgePath, labelX, labelY] = getStraightPath({
    sourceX: sourcePoint.x,
    sourceY: sourcePoint.y,
    targetX: targetPoint.x,
    targetY: targetPoint.y,
  });

  return (
    <BaseEdge
      id={id}
      interactionWidth={interactionWidth}
      label={label}
      labelBgBorderRadius={labelBgBorderRadius}
      labelBgPadding={labelBgPadding}
      labelBgStyle={labelBgStyle}
      labelShowBg={labelShowBg}
      labelStyle={labelStyle}
      labelX={labelX}
      labelY={labelY}
      markerEnd={markerEnd}
      markerStart={markerStart}
      path={edgePath}
      style={style}
    />
  );
}

const edgeTypes = {
  atlasFloating: AtlasFloatingEdge,
};

export function GraphStagePanel({
  activeGraphDrag,
  activeGraphDragRef,
  classes,
  clearActiveGraphDrag,
  routePath,
  onRecordSelect,
  selectedDomainId,
  selectedViewId,
  selectedViewRecords,
  tableSamples,
}: {
  activeGraphDrag: ActiveGraphDrag | null;
  activeGraphDragRef: RefObject<ActiveGraphDrag | null>;
  classes: ClassRecord[];
  clearActiveGraphDrag: () => void;
  routePath: string;
  onRecordSelect: (selection: GraphRecordSelection | null) => void;
  selectedDomainId: string | null;
  selectedViewId: string | null;
  selectedViewRecords: SelectedViewRecords;
  tableSamples: ClassTableSamples;
}) {
  const graphNodeTypes = useMemo(() => nodeTypes, []);
  const referenceOptions = useMemo(() => buildReferenceOptions(tableSamples), [tableSamples]);
  const views = useMemo(() => rowsFor(tableSamples, "views"), [tableSamples]);
  const entityClassId =
    classes.find((classRecord) => classRecord.table_name === "entities")?.id ?? null;
  const relationshipClassId =
    classes.find((classRecord) => classRecord.table_name === "relationships")?.id ?? null;
  const relationshipTypeId = stringValue(
    rowsFor(tableSamples, "types").find((type) => {
      return (
        stringValue(type, "class_id") === relationshipClassId &&
        stringValue(type, "slug") === "related-to"
      );
    }) ?? {},
    "id",
  );
  const selectedView = views.find((view) => stringValue(view, "id") === selectedViewId) ?? null;
  const graph = useMemo(
    () =>
      buildGraph({
        classes,
        referenceOptions,
        selectedViewId,
        selectedViewRecords,
        tableSamples,
      }),
    [classes, referenceOptions, selectedViewId, selectedViewRecords, tableSamples],
  );

  return (
    <div className={canvasStageClassName}>
      <GraphStageSurface
        activeGraphDrag={activeGraphDrag}
        activeGraphDragRef={activeGraphDragRef}
        clearActiveGraphDrag={clearActiveGraphDrag}
        entityClassId={entityClassId}
        flowNodeTypes={graphNodeTypes}
        graph={graph}
        relationshipDefaults={{
          classId: relationshipClassId,
          kindId: null,
          typeId: relationshipTypeId || null,
        }}
        onSelectionChange={() => {
          onRecordSelect(null);
        }}
        routePath={routePath}
        selectedDomainId={selectedDomainId}
        selectedView={selectedView}
        selectedViewId={selectedViewId}
        onRecordSelect={onRecordSelect}
        views={views}
      />
    </div>
  );
}

function GraphStageSurface({
  activeGraphDrag,
  activeGraphDragRef,
  clearActiveGraphDrag,
  entityClassId,
  flowNodeTypes,
  graph,
  onSelectionChange,
  relationshipDefaults,
  routePath,
  selectedDomainId,
  selectedView,
  selectedViewId,
  onRecordSelect,
  views,
}: {
  activeGraphDrag: ActiveGraphDrag | null;
  activeGraphDragRef: RefObject<ActiveGraphDrag | null>;
  clearActiveGraphDrag: () => void;
  entityClassId: string | null;
  flowNodeTypes: typeof nodeTypes;
  graph: GraphStageGraph;
  onSelectionChange: () => void;
  relationshipDefaults: {
    classId: string | null;
    kindId: string | null;
    typeId: string | null;
  };
  routePath: string;
  selectedDomainId: string | null;
  selectedView: TableRow | null;
  selectedViewId: string | null;
  onRecordSelect: (selection: GraphRecordSelection | null) => void;
  views: TableRow[];
}) {
  const router = useRouter();
  const [pendingNodePositionState, setPendingNodePositionState] = useState<{
    positions: Record<string, PendingNodePosition>;
    viewId: string | null;
  }>(() => ({
    positions: {},
    viewId: selectedViewId,
  }));
  const [isSavingNodePositions, setIsSavingNodePositions] = useState(false);
  const pendingNodePositions =
    pendingNodePositionState.viewId === selectedViewId
      ? pendingNodePositionState.positions
      : {};
  const pendingNodePositionCount = Object.keys(pendingNodePositions).length;
  const markNodePositionsDirty = useCallback(
    (updates: GraphLayoutUpdate[]) => {
      setPendingNodePositionState((state) => {
        const positions = state.viewId === selectedViewId ? state.positions : {};

        return {
          positions: {
            ...positions,
            ...Object.fromEntries(
              updates.map((update) => [
                update.viewNodeId,
                {
                  x: update.x,
                  y: update.y,
                },
              ]),
            ),
          },
          viewId: selectedViewId,
        };
      });
    },
    [selectedViewId],
  );

  async function savePendingNodePositions() {
    const updates = Object.entries(pendingNodePositions);

    if (updates.length === 0 || isSavingNodePositions) {
      return;
    }

    setIsSavingNodePositions(true);

    try {
      const supabase = createSupabaseClient();
      const now = Date.now();

      await Promise.all(
        updates.map(async ([viewNodeId, position]) => {
          const { error } = await supabase
            .from("view_nodes")
            .update({
              updated_at: now,
              x: position.x,
              y: position.y,
            })
            .eq("id", viewNodeId);

          if (error) {
            throw new Error(error.message);
          }
        }),
      );

      setPendingNodePositionState({
        positions: {},
        viewId: selectedViewId,
      });
      router.refresh();
    } catch (error) {
      console.warn(
        "Graph node position save failed",
        error instanceof Error ? error.message : error,
      );
    } finally {
      setIsSavingNodePositions(false);
    }
  }

  return (
    <>
      <GraphViewToolbar
        isSavingNodePositions={isSavingNodePositions}
        onSelectionChange={onSelectionChange}
        onSaveNodePositions={() => {
          void savePendingNodePositions();
        }}
        pendingNodePositionCount={pendingNodePositionCount}
        routePath={routePath}
        selectedDomainId={selectedDomainId}
        selectedView={selectedView}
        selectedViewId={selectedViewId}
        views={views}
      />
      <div className="absolute inset-0 z-[1] h-full w-full">
        <ReactFlowProvider>
          <GraphCanvas
            activeGraphDrag={activeGraphDrag}
            activeGraphDragRef={activeGraphDragRef}
            clearActiveGraphDrag={clearActiveGraphDrag}
            entityClassId={entityClassId}
            flowNodeTypes={flowNodeTypes}
            graph={graph}
            onNodePositionsDirty={markNodePositionsDirty}
            relationshipDefaults={relationshipDefaults}
            selectedDomainId={selectedDomainId}
            selectedView={selectedView}
            selectedViewId={selectedViewId}
            onRecordSelect={onRecordSelect}
            views={views}
          />
        </ReactFlowProvider>
      </div>
    </>
  );
}

function GraphViewToolbar({
  isSavingNodePositions,
  onSelectionChange,
  onSaveNodePositions,
  pendingNodePositionCount,
  routePath,
  selectedDomainId,
  selectedView,
  selectedViewId,
  views,
}: {
  isSavingNodePositions: boolean;
  onSelectionChange: () => void;
  onSaveNodePositions: () => void;
  pendingNodePositionCount: number;
  routePath: string;
  selectedDomainId: string | null;
  selectedView: TableRow | null;
  selectedViewId: string | null;
  views: TableRow[];
}) {
  const router = useRouter();
  const [editMode, setEditMode] = useState<ViewEditMode>(null);
  const [draftName, setDraftName] = useState("");
  const [pendingDelete, setPendingDelete] = useState(false);
  const [isPending, startTransition] = useTransition();
  const canCreate = Boolean(selectedDomainId);
  const canEditSelected = Boolean(selectedDomainId && selectedViewId);

  function selectView(viewId: string) {
    if (!selectedDomainId) {
      return;
    }

    onSelectionChange();
    resetEditor();
    router.push(graphRoute(selectedDomainId, viewId, routePath));
  }

  function beginCreate() {
    setPendingDelete(false);
    setEditMode("create");
    setDraftName("");
  }

  function beginRename() {
    if (!selectedView) {
      return;
    }

    setPendingDelete(false);
    setEditMode("rename");
    setDraftName(stringValue(selectedView, "label"));
  }

  function resetEditor() {
    setEditMode(null);
    setDraftName("");
    setPendingDelete(false);
  }

  function saveView() {
    if (!selectedDomainId) {
      return;
    }

    const trimmedName = draftName.trim();

    if (!trimmedName) {
      return;
    }

    const formData = new FormData();
    formData.set("label", trimmedName);

    if (editMode === "create") {
      formData.set("domain_id", selectedDomainId);
    } else if (selectedViewId) {
      formData.set("view_id", selectedViewId);
    } else {
      return;
    }

    startTransition(async () => {
      const result =
        editMode === "create"
          ? await createGraphView(formData)
          : await renameGraphView(formData);

      if (result.error) {
        return;
      }

      resetEditor();
      onSelectionChange();

      if (result.viewId) {
        router.push(graphRoute(selectedDomainId, result.viewId, routePath));
      } else {
        router.refresh();
      }
    });
  }

  function deleteSelectedView() {
    if (!selectedDomainId || !selectedViewId) {
      return;
    }

    if (!pendingDelete) {
      setPendingDelete(true);
      return;
    }

    const formData = new FormData();
    formData.set("view_id", selectedViewId);

    startTransition(async () => {
      const result = await deleteGraphView(formData);

      if (result.error) {
        return;
      }

      resetEditor();
      onSelectionChange();
      router.push(graphRoute(selectedDomainId, null, routePath));
    });
  }

  return (
    <div className="absolute top-4 left-1/2 z-40 flex min-h-10 w-[min(398px,calc(100%_-_112px))] -translate-x-1/2 flex-wrap items-center gap-1 rounded-lg border border-border bg-background/95 p-1.5 shadow-lg backdrop-blur max-[700px]:right-3 max-[700px]:left-3 max-[700px]:w-auto max-[700px]:max-w-none max-[700px]:translate-x-0">
      <Select
        value={selectedViewId ?? ""}
        onValueChange={(viewId) => {
          if (viewId !== null) {
            selectView(viewId);
          }
        }}
      >
        <SelectTrigger
          aria-label="View"
          className="min-w-0 flex-1 justify-between sm:max-w-52 sm:min-w-36"
          disabled={!selectedDomainId || views.length === 0}
          size="sm"
        >
          <SelectValue className="min-w-0" placeholder="View">
            {(value: string | null) => {
              const view = views.find((candidate) => stringValue(candidate, "id") === value);
              const label = view ? stringValue(view, "label") : "View";

              return (
                <>
                  <span className="shrink-0 text-xs font-medium text-muted-foreground uppercase">
                    View
                  </span>
                  <span className="min-w-0 truncate">{label}</span>
                </>
              );
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {views.map((view) => {
              const viewId = stringValue(view, "id");

              return (
                <SelectItem key={viewId} value={viewId}>
                  {stringValue(view, "label")}
                </SelectItem>
              );
            })}
          </SelectGroup>
        </SelectContent>
      </Select>

      <div className="ml-auto flex gap-1 border-l border-border pl-1">
        <Button
          aria-label="Save graph layout"
          disabled={pendingNodePositionCount === 0 || isSavingNodePositions}
          onClick={onSaveNodePositions}
          size="icon"
          type="button"
          variant={pendingNodePositionCount > 0 ? "default" : "ghost"}
        >
          <Save />
        </Button>
        <Button
          aria-label="Create view"
          aria-pressed={editMode === "create"}
          className={cn(editMode === "create" && "bg-muted text-foreground")}
          disabled={!canCreate || isPending}
          onClick={beginCreate}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Plus />
        </Button>
        <Button
          aria-label="Rename view"
          aria-pressed={editMode === "rename"}
          className={cn(editMode === "rename" && "bg-muted text-foreground")}
          disabled={!canEditSelected || isPending}
          onClick={beginRename}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Pencil />
        </Button>
        <Button
          aria-label="Delete view"
          aria-pressed={pendingDelete}
          disabled={!canEditSelected || isPending}
          onClick={deleteSelectedView}
          size="icon"
          type="button"
          variant={pendingDelete ? "destructive" : "ghost"}
        >
          <Trash2 />
        </Button>
      </div>

      {editMode ? (
        <div className="grid flex-[0_0_100%] grid-cols-[minmax(0,1fr)_2rem_2rem] gap-1">
          <Input
            aria-label="View name"
            autoFocus
            onChange={(event) => {
              setDraftName(event.currentTarget.value);
              setPendingDelete(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                saveView();
              }
            }}
            placeholder="View name"
            value={draftName}
          />
          <Button disabled={isPending} onClick={saveView} size="icon" type="button">
            <Check />
          </Button>
          <Button disabled={isPending} onClick={resetEditor} size="icon" type="button" variant="secondary">
            <X />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function GraphCanvas({
  activeGraphDrag,
  activeGraphDragRef,
  clearActiveGraphDrag,
  entityClassId,
  flowNodeTypes,
  graph,
  onNodePositionsDirty,
  relationshipDefaults,
  selectedDomainId,
  selectedView,
  selectedViewId,
  onRecordSelect,
  views,
}: {
  activeGraphDrag: ActiveGraphDrag | null;
  activeGraphDragRef: RefObject<ActiveGraphDrag | null>;
  clearActiveGraphDrag: () => void;
  entityClassId: string | null;
  flowNodeTypes: typeof nodeTypes;
  graph: GraphStageGraph;
  onNodePositionsDirty: (updates: GraphLayoutUpdate[]) => void;
  relationshipDefaults: {
    classId: string | null;
    kindId: string | null;
    typeId: string | null;
  };
  selectedDomainId: string | null;
  selectedView: TableRow | null;
  selectedViewId: string | null;
  onRecordSelect: (selection: GraphRecordSelection | null) => void;
  views: TableRow[];
}) {
  const router = useRouter();
  const {
    fitBounds,
    screenToFlowPosition,
  } = useReactFlow<FlowNode, FlowEdge>();
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>(graph.edges);
  const [isPlacing, setIsPlacing] = useState(false);
  const [isCreatingRelationship, setIsCreatingRelationship] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [collapsedAnchorIds, setCollapsedAnchorIds] = useState<Set<string>>(() => new Set());
  const collapsedGraph = useMemo(() => {
    const nodeIds = new Set(nodes.map((node) => node.id));
    const validAnchorIds = new Set(
      [...collapsedAnchorIds].filter((anchorId) => nodeIds.has(anchorId)),
    );

    return collapseClassificationGraphForAnchors(nodes, edges, validAnchorIds);
  }, [collapsedAnchorIds, edges, nodes]);
  const visibleNodes = useMemo(
    () => collapsedGraph.nodes.filter((node) => !node.hidden),
    [collapsedGraph.nodes],
  );
  const visibleEdges = useMemo(
    () => collapsedGraph.edges.filter((edge) => !edge.hidden),
    [collapsedGraph.edges],
  );
  const selectedNode = visibleNodes.find((node) => node.selected) ?? null;
  const selectedEdge = visibleEdges.find((edge) => edge.selected) ?? null;
  const selectedEdgeNodes = selectedEdge
    ? visibleNodes.filter((node) => node.id === selectedEdge.source || node.id === selectedEdge.target)
    : [];

  useEffect(() => {
    setNodes(graph.nodes);
  }, [graph.nodes, setNodes]);

  useEffect(() => {
    setEdges(graph.edges);
  }, [graph.edges, setEdges]);

  const focusNodes = useCallback(
    (nodesToFocus: FlowNode[]) => {
      const visibleNodesToFocus = nodesToFocus.filter((node) => !node.hidden);

      if (visibleNodesToFocus.length === 0) {
        return;
      }

      fitBounds(getNodesBounds(visibleNodesToFocus), {
        duration: 280,
        padding: visibleNodesToFocus.length === 1 ? 0.75 : 0.32,
      });
    },
    [fitBounds],
  );

  const focusSelectedNode = useCallback(() => {
    if (selectedNode) {
      focusNodes([selectedNode]);
    } else if (selectedEdgeNodes.length > 0) {
      focusNodes(selectedEdgeNodes);
    }
  }, [focusNodes, selectedEdgeNodes, selectedNode]);

  const focusSelectedNeighborhood = useCallback(() => {
    if (!selectedNode) {
      return;
    }

    const neighborhoodNodeIds = new Set<string>([
      selectedNode.id,
      ...getIncomers(selectedNode, visibleNodes, visibleEdges).map((node) => node.id),
      ...getOutgoers(selectedNode, visibleNodes, visibleEdges).map((node) => node.id),
    ]);

    focusNodes(
      visibleNodes.filter((node) => neighborhoodNodeIds.has(node.id)),
    );
  }, [focusNodes, selectedNode, visibleEdges, visibleNodes]);

  const applyLayoutedNodes = useCallback(
    (layoutedNodes: FlowNode[]) => {
      const positionByNodeId = new Map(
        layoutedNodes.map((node) => [node.id, node.position] as const),
      );

      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          const position = positionByNodeId.get(node.id);

          return position
            ? {
                ...node,
                position,
              }
            : node;
        }),
      );
      onNodePositionsDirty(
        layoutedNodes.map((node) => ({
          viewNodeId: node.data.viewNodeId,
          x: node.position.x,
          y: node.position.y,
        })),
      );
      focusNodes(layoutedNodes);
    },
    [focusNodes, onNodePositionsDirty, setNodes],
  );

  const autoArrangeVisibleGraph = useCallback((direction: GraphLayoutDirection) => {
    if (visibleNodes.length === 0) {
      return;
    }

    applyLayoutedNodes(layoutGraphWithDagre(visibleNodes, visibleEdges, direction));
  }, [applyLayoutedNodes, visibleEdges, visibleNodes]);

  const autoArrangeVisibleGraphRadial = useCallback(() => {
    if (visibleNodes.length === 0) {
      return;
    }

    applyLayoutedNodes(layoutGraphWithDagreRadial(visibleNodes, visibleEdges));
  }, [applyLayoutedNodes, visibleEdges, visibleNodes]);

  useOnSelectionChange({
    onChange: ({ edges: selectedEdges, nodes: selectedNodes }) => {
      const nextSelectedNode = selectedNodes[0] as FlowNode | undefined;
      const nextSelectedEdge = selectedEdges[0] as FlowEdge | undefined;

      if (nextSelectedNode) {
        onRecordSelect({
          recordId: nextSelectedNode.data.recordId,
          tableName: nextSelectedNode.data.tableName,
        });
        return;
      }

      if (nextSelectedEdge) {
        onRecordSelect({
          recordId: nextSelectedEdge.data?.recordId ?? nextSelectedEdge.id,
          tableName: "relationships",
        });
        return;
      }

      onRecordSelect(null);
    },
  });

  const addGraphRecordAtPoint = useCallback(
    async (graphDrag: ActiveGraphDrag, clientX: number, clientY: number) => {
      if (!selectedViewId || !entityClassId || isPlacing) {
        clearActiveGraphDrag();
        return;
      }

      const position = screenToFlowPosition({
        x: clientX,
        y: clientY,
      });
      const now = Date.now();

      setIsPlacing(true);

      try {
        const supabase = createSupabaseClient();

        if (graphDrag.tableName === "entities") {
          const insertPayload: ViewNodeInsert = {
            created_at: now,
            pinned: false,
            record_class_id: entityClassId,
            record_id: graphDrag.recordId,
            updated_at: now,
            view_id: selectedViewId,
            visibility: "visible",
            x: position.x,
            y: position.y,
          };
          const { error } = await supabase.from("view_nodes").upsert(insertPayload, {
            onConflict: "view_id,record_class_id,record_id",
          });

          if (error) {
            console.warn("Graph entity placement failed", error.message);
            clearActiveGraphDrag();
            return;
          }

          onRecordSelect({ recordId: graphDrag.recordId, tableName: "entities" });
          clearActiveGraphDrag();
          router.refresh();
          return;
        }

        const relationship = graph.relationshipsById.get(graphDrag.recordId);

        if (!relationship) {
          clearActiveGraphDrag();
          return;
        }

        const sourceNode = viewNodeInsertForRelationshipEndpoint({
          graph,
          now,
          position: {
            x: position.x - 120,
            y: position.y,
          },
          relationship,
          side: "source",
          viewId: selectedViewId,
        });
        const targetNode = viewNodeInsertForRelationshipEndpoint({
          graph,
          now,
          position: {
            x: position.x + 120,
            y: position.y,
          },
          relationship,
          side: "target",
          viewId: selectedViewId,
        });
        const nodeInserts = [sourceNode, targetNode].filter(
          (nodeInsert): nodeInsert is ViewNodeInsert => Boolean(nodeInsert),
        );

        if (nodeInserts.length > 0) {
          const { error } = await supabase.from("view_nodes").upsert(nodeInserts, {
            onConflict: "view_id,record_class_id,record_id",
          });

          if (error) {
            console.warn("Graph relationship endpoint placement failed", error.message);
            clearActiveGraphDrag();
            return;
          }
        }

        const viewRelationshipInsert: ViewRelationshipInsert = {
          created_at: now,
          relationship_id: graphDrag.recordId,
          updated_at: now,
          view_id: selectedViewId,
          visibility: "visible",
        };
        const { error } = await supabase.from("view_relationships").upsert(viewRelationshipInsert, {
          onConflict: "view_id,relationship_id",
        });

        if (error) {
          console.warn("Graph relationship placement failed", error.message);
          clearActiveGraphDrag();
          return;
        }

        onRecordSelect(null);
        clearActiveGraphDrag();
        router.refresh();
      } finally {
        setIsPlacing(false);
      }
    },
    [
      clearActiveGraphDrag,
      entityClassId,
      graph,
      isPlacing,
      onRecordSelect,
      router,
      screenToFlowPosition,
      selectedViewId,
    ],
  );

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (selectedViewId && activeGraphDragRef.current !== null) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();

    const graphDrag = activeGraphDragRef.current;

    clearActiveGraphDrag();

    if (graphDrag !== null) {
      void addGraphRecordAtPoint(graphDrag, event.clientX, event.clientY);
    }
  }

  function handleMouseUp(event: MouseEvent<HTMLDivElement>) {
    const graphDrag = activeGraphDragRef.current;

    if (graphDrag === null) {
      return;
    }

    clearActiveGraphDrag();
    void addGraphRecordAtPoint(graphDrag, event.clientX, event.clientY);
  }

  async function connectNodes(connection: Connection) {
    if (
      !selectedDomainId ||
      !selectedViewId ||
      !relationshipDefaults.typeId ||
      isCreatingRelationship ||
      !connection.source ||
      !connection.target ||
      connection.source === connection.target
    ) {
      return;
    }

    const sourceNode = nodes.find((node) => node.id === connection.source);
    const targetNode = nodes.find((node) => node.id === connection.target);

    if (
      !sourceNode ||
      !targetNode ||
      sourceNode.data.tableName !== "entities" ||
      targetNode.data.tableName !== "entities"
    ) {
      return;
    }

    setIsCreatingRelationship(true);

    try {
      const supabase = createSupabaseClient();
      let existingRelationshipQuery = supabase
        .from("relationships")
        .select("id")
        .eq("domain_id", selectedDomainId)
        .eq("type_id", relationshipDefaults.typeId)
        .eq("source_class_id", sourceNode.data.recordClassId)
        .eq("source_record_id", sourceNode.data.recordId)
        .eq("target_class_id", targetNode.data.recordClassId)
        .eq("target_record_id", targetNode.data.recordId)
        .limit(1);

      existingRelationshipQuery = relationshipDefaults.kindId
        ? existingRelationshipQuery.eq("kind_id", relationshipDefaults.kindId)
        : existingRelationshipQuery.is("kind_id", null);
      const { data: existingRelationships, error: existingRelationshipError } =
        await existingRelationshipQuery;

      if (existingRelationshipError) {
        console.warn("Graph relationship lookup failed", existingRelationshipError.message);
        return;
      }

      let relationshipId = existingRelationships?.[0]?.id ?? null;

      if (!relationshipId) {
        const now = Date.now();
        const relationshipInsert: RelationshipInsert = {
          created_at: now,
          domain_id: selectedDomainId,
          kind_id: relationshipDefaults.kindId,
          source_class_id: sourceNode.data.recordClassId,
          source_record_id: sourceNode.data.recordId,
          status_id: null,
          target_class_id: targetNode.data.recordClassId,
          target_record_id: targetNode.data.recordId,
          type_id: relationshipDefaults.typeId,
          updated_at: now,
        };
        const { data: relationship, error: relationshipError } = await supabase
          .from("relationships")
          .insert(relationshipInsert)
          .select("id")
          .single();

        if (relationshipError) {
          console.warn("Graph relationship creation failed", relationshipError.message);
          return;
        }

        relationshipId = relationship.id;
      }

      const now = Date.now();
      const viewRelationshipInsert: ViewRelationshipInsert = {
        created_at: now,
        relationship_id: relationshipId,
        updated_at: now,
        view_id: selectedViewId,
        visibility: "visible",
      };
      const { error: viewRelationshipError } = await supabase
        .from("view_relationships")
        .upsert(viewRelationshipInsert, {
          onConflict: "view_id,relationship_id",
        });

      if (viewRelationshipError) {
        console.warn("Graph view relationship creation failed", viewRelationshipError.message);
        return;
      }

      onRecordSelect(null);
      router.refresh();
    } finally {
      setIsCreatingRelationship(false);
    }
  }

  async function removeEdgesFromView(edgesToRemove: FlowEdge[]) {
    const viewRelationshipIds = edgesToRemove
      .map((edge) => edge.data?.viewRelationshipId)
      .filter((viewRelationshipId): viewRelationshipId is string => Boolean(viewRelationshipId));

    if (viewRelationshipIds.length === 0) {
      return null;
    }

    const { error } = await createSupabaseClient()
      .from("view_relationships")
      .delete()
      .in("id", viewRelationshipIds);

    return error?.message ?? null;
  }

  async function removeNodesFromView(nodesToRemove: FlowNode[]) {
    if (isRemoving) {
      return;
    }

    const viewNodeIds = nodesToRemove
      .map((node) => node.data.viewNodeId)
      .filter((viewNodeId): viewNodeId is string => Boolean(viewNodeId));
    const nodeIds = new Set(nodesToRemove.map((node) => node.id));
    const touchingEdges = edges.filter((edge) => nodeIds.has(edge.source) || nodeIds.has(edge.target));

    if (viewNodeIds.length === 0) {
      return;
    }

    setIsRemoving(true);

    try {
      const edgeRemovalError = await removeEdgesFromView(touchingEdges);

      if (edgeRemovalError) {
        console.warn("Graph edge removal failed", edgeRemovalError);
        return;
      }

      const { error } = await createSupabaseClient()
        .from("view_nodes")
        .delete()
        .in("id", viewNodeIds);

      if (error) {
        console.warn("Graph node removal failed", error.message);
        return;
      }

      onRecordSelect(null);
      router.refresh();
    } finally {
      setIsRemoving(false);
    }
  }

  async function removeSelectedEdgesFromView(edgesToRemove: FlowEdge[]) {
    if (isRemoving) {
      return;
    }

    setIsRemoving(true);

    try {
      const edgeRemovalError = await removeEdgesFromView(edgesToRemove);

      if (edgeRemovalError) {
        console.warn("Graph edge removal failed", edgeRemovalError);
        return;
      }

      onRecordSelect(null);
      router.refresh();
    } finally {
      setIsRemoving(false);
    }
  }

  return (
    <div
      className="h-full w-full"
      onDragOverCapture={handleDragOver}
      onDropCapture={handleDrop}
      onMouseUpCapture={handleMouseUp}
    >
      <ReactFlow
        className={cn(
          "relative z-[1] h-full w-full bg-transparent",
          styles.graphFlow,
          activeGraphDrag && styles.graphFlowDragging,
        )}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        deleteKeyCode={["Backspace", "Delete"]}
        edges={collapsedGraph.edges}
        edgeTypes={edgeTypes}
        edgesFocusable
        edgesReconnectable={false}
        fitView
        fitViewOptions={{ maxZoom: 1.05, padding: 0.25 }}
        connectionLineType={ConnectionLineType.Straight}
        maxZoom={2.4}
        minZoom={0.18}
        nodeTypes={flowNodeTypes}
        nodes={collapsedGraph.nodes}
        nodesConnectable
        nodesDraggable
        nodesFocusable
        onConnect={(connection) => {
          void connectNodes(connection);
        }}
        onEdgesChange={onEdgesChange}
        onEdgesDelete={(deletedEdges) => {
          void removeSelectedEdgesFromView(deletedEdges);
        }}
        onNodesChange={onNodesChange}
        onNodesDelete={(deletedNodes) => {
          void removeNodesFromView(deletedNodes);
        }}
        onNodeDragStop={(_, node) => {
          onNodePositionsDirty([
            {
              viewNodeId: node.data.viewNodeId,
              x: node.position.x,
              y: node.position.y,
            },
          ]);
        }}
        onEdgeClick={(event, edge) => {
          event.stopPropagation();
          onRecordSelect({
            recordId: edge.data?.recordId ?? edge.id,
            tableName: "relationships",
          });
        }}
        onNodeClick={(event, node) => {
          event.stopPropagation();
          onRecordSelect({
            recordId: node.data.recordId,
            tableName: node.data.tableName,
          });
        }}
        onNodeDoubleClick={(event, node) => {
          event.stopPropagation();
          setCollapsedAnchorIds((anchorIds) => {
            const nextAnchorIds = new Set(anchorIds);

            if (nextAnchorIds.has(node.id)) {
              nextAnchorIds.delete(node.id);
            } else {
              nextAnchorIds.add(node.id);
            }

            return nextAnchorIds;
          });
        }}
        onPaneClick={(event) => {
          const graphDrag = activeGraphDragRef.current;

          if (graphDrag !== null) {
            void addGraphRecordAtPoint(graphDrag, event.clientX, event.clientY);
            return;
          }

          onRecordSelect(null);
        }}
        panOnDrag
        panOnScroll={false}
        proOptions={{ hideAttribution: true }}
        selectionOnDrag
        zoomOnScroll
      >
        <Background
          color="color-mix(in oklch, var(--primary) 8%, transparent)"
          gap={46}
          lineWidth={1}
          variant={BackgroundVariant.Lines}
        />
        <Controls className={styles.graphControls} position="top-right" showInteractive={false}>
          <ControlButton
            aria-label="Auto arrange left to right"
            disabled={visibleNodes.length === 0}
            onClick={() => {
              autoArrangeVisibleGraph("LR");
            }}
            title="Auto arrange left to right"
            type="button"
          >
            <ArrowRight />
          </ControlButton>
          <ControlButton
            aria-label="Auto arrange top to bottom"
            disabled={visibleNodes.length === 0}
            onClick={() => {
              autoArrangeVisibleGraph("TB");
            }}
            title="Auto arrange top to bottom"
            type="button"
          >
            <ArrowDown />
          </ControlButton>
          <ControlButton
            aria-label="Auto arrange bottom to top"
            disabled={visibleNodes.length === 0}
            onClick={() => {
              autoArrangeVisibleGraph("BT");
            }}
            title="Auto arrange bottom to top"
            type="button"
          >
            <ArrowUp />
          </ControlButton>
          <ControlButton
            aria-label="Auto arrange radial from Dagre ranks"
            disabled={visibleNodes.length === 0}
            onClick={autoArrangeVisibleGraphRadial}
            title="Auto arrange radial from Dagre ranks"
            type="button"
          >
            <CircleDot />
          </ControlButton>
          <ControlButton
            aria-label="Focus selection"
            disabled={!selectedNode && selectedEdgeNodes.length === 0}
            onClick={focusSelectedNode}
            title="Focus selection"
            type="button"
          >
            <Focus />
          </ControlButton>
          <ControlButton
            aria-label="Focus neighborhood"
            disabled={!selectedNode}
            onClick={focusSelectedNeighborhood}
            title="Focus neighborhood"
            type="button"
          >
            <Network />
          </ControlButton>
        </Controls>
      </ReactFlow>

      {graph.nodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 z-[2] grid place-items-center">
          <p className="m-0 max-w-[min(320px,calc(100%_-_48px))] text-center text-[13px] leading-[1.4] text-muted-foreground">
            {canvasHint({ selectedDomainId, selectedView, views })}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function buildGraph({
  classes,
  referenceOptions,
  selectedViewId,
  selectedViewRecords,
  tableSamples,
}: {
  classes: ClassRecord[];
  referenceOptions: ReferenceOptions;
  selectedViewId: string | null;
  selectedViewRecords: SelectedViewRecords;
  tableSamples: ClassTableSamples;
}) {
  const kindLabels = new Map(rowsFor(tableSamples, "kinds").map((kind) => [stringValue(kind, "id"), stringValue(kind, "label")]));
  const typeLabels = new Map(rowsFor(tableSamples, "types").map((type) => [stringValue(type, "id"), stringValue(type, "label")]));
  const classTableNames = new Map(classes.map((classRecord) => [classRecord.id, classRecord.table_name]));
  const relationshipsById = new Map(
    [
      ...(referenceOptions.relationships ?? []).map((option) => [option.value, option.row] as const),
      ...selectedViewRecords.relationships.map((relationship) => [stringValue(relationship, "id"), relationship] as const),
    ].filter(([relationshipId]) => Boolean(relationshipId)),
  );
  const viewNodes = selectedViewId
    ? selectedViewRecords.viewNodes.filter((viewNode) => stringValue(viewNode, "view_id") === selectedViewId)
    : [];
  const viewRelationships = selectedViewId
    ? selectedViewRecords.viewRelationships.filter(
        (viewRelationship) => stringValue(viewRelationship, "view_id") === selectedViewId,
      )
    : [];
  const selectedRowsByRecordKey = new Map(
    [
      ...selectedViewRecords.entities.map((row) => [`entities:${stringValue(row, "id")}`, row] as const),
      ...selectedViewRecords.claims.map((row) => [`claims:${stringValue(row, "id")}`, row] as const),
    ].filter(([recordKey]) => !recordKey.endsWith(":")),
  );
  const nodes: FlowNode[] = [];
  const nodeIds = new Set<string>();

  viewNodes.forEach((viewNode, index) => {
    const recordClassId = stringValue(viewNode, "record_class_id");
    const recordId = stringValue(viewNode, "record_id");
    const tableName = classTableNames.get(recordClassId);

    if (tableName !== "entities" && tableName !== "claims") {
      return;
    }

    const row =
      selectedRowsByRecordKey.get(`${tableName}:${recordId}`) ??
      referenceOptions[tableName]?.find((option) => option.value === recordId)?.row;

    if (!row) {
      return;
    }

    const nodeId = graphNodeId(tableName, recordId);
    const fallbackPosition = nodePosition(index, viewNodes.length, tableName === "claims" ? 360 : 0, 0);

    nodeIds.add(nodeId);
    nodes.push({
      id: nodeId,
      position: {
        x: numberValue(viewNode, "x") ?? fallbackPosition.x,
        y: numberValue(viewNode, "y") ?? fallbackPosition.y,
      },
      type: "atlasGraph",
      data: {
        collapsedCount: 0,
        kind: tableName === "claims" ? "claim" : "entity",
        kindLabel: kindLabels.get(stringValue(row, "kind_id")) ?? (tableName === "claims" ? "Claim" : "Subject"),
        label: stringValue(row, "label") || stringValue(row, "claim_text") || recordId,
        recordClassId,
        recordId,
        tableName,
        viewNodeId: stringValue(viewNode, "id"),
      },
    });
  });

  const edges: FlowEdge[] = [];

  viewRelationships.forEach((viewRelationship) => {
    const relationshipId = stringValue(viewRelationship, "relationship_id");
    const relationship = relationshipsById.get(relationshipId);

    if (!relationship) {
      return;
    }

    const sourceTable = classTableNames.get(stringValue(relationship, "source_class_id"));
    const targetTable = classTableNames.get(stringValue(relationship, "target_class_id"));

    if (!sourceTable || !targetTable) {
      return;
    }

    const source = graphNodeId(sourceTable, stringValue(relationship, "source_record_id"));
    const target = graphNodeId(targetTable, stringValue(relationship, "target_record_id"));

    if (!nodeIds.has(source) || !nodeIds.has(target)) {
      return;
    }

    const typeLabel = typeLabels.get(stringValue(relationship, "type_id")) ?? stringValue(relationship, "label");

    edges.push({
      animated: false,
      id: stringValue(viewRelationship, "id") || relationshipId,
      source,
      target,
      type: "atlasFloating",
      label: typeLabel,
      data: {
        label: stringValue(relationship, "label"),
        recordId: relationshipId,
        tableName: "relationships",
        typeLabel,
        viewRelationshipId: stringValue(viewRelationship, "id"),
      },
    });
  });

  return {
    classTableNames,
    edges,
    nodes,
    relationshipsById,
  };
}

function layoutGraphWithDagre(
  nodes: FlowNode[],
  edges: FlowEdge[],
  direction: GraphLayoutDirection,
) {
  const graph = new dagre.graphlib.Graph();

  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    marginx: 32,
    marginy: 32,
    nodesep: 54,
    rankdir: direction,
    ranksep: 112,
  });

  nodes.forEach((node) => {
    graph.setNode(node.id, {
      height: node.measured?.height ?? node.height ?? dagreNodeHeight,
      width: node.measured?.width ?? node.width ?? dagreNodeWidth,
    });
  });

  edges.forEach((edge) => {
    graph.setEdge(edge.source, edge.target);
  });

  dagre.layout(graph);

  return nodes.map((node) => {
    const layoutNode = graph.node(node.id);
    const width = node.measured?.width ?? node.width ?? dagreNodeWidth;
    const height = node.measured?.height ?? node.height ?? dagreNodeHeight;

    return {
      ...node,
      position: {
        x: layoutNode.x - width / 2,
        y: layoutNode.y - height / 2,
      },
    };
  });
}

function layoutGraphWithDagreRadial(nodes: FlowNode[], edges: FlowEdge[]) {
  const graph = new dagre.graphlib.Graph();

  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    marginx: 32,
    marginy: 32,
    nodesep: 54,
    rankdir: "TB",
    ranksep: 112,
  });

  nodes.forEach((node) => {
    graph.setNode(node.id, {
      height: node.measured?.height ?? node.height ?? dagreNodeHeight,
      width: node.measured?.width ?? node.width ?? dagreNodeWidth,
    });
  });

  edges.forEach((edge) => {
    graph.setEdge(edge.source, edge.target);
  });

  dagre.layout(graph);

  const layoutRows = nodes
    .flatMap((node) => {
      const layout = graph.node(node.id);

      return layout ? [{ node, layout }] : [];
    })
    .sort((a, b) => {
      if (Math.abs(a.layout.y - b.layout.y) > 1) {
        return a.layout.y - b.layout.y;
      }

      return a.layout.x - b.layout.x;
    })
    .reverse();
  const centerRow = layoutRows[0];
  const layoutOrderByNodeId = new Map(
    layoutRows.map((row, index) => [row.node.id, index] as const),
  );
  const visibleNodeIds = new Set(nodes.map((node) => node.id));
  const childrenByParentId = new Map<string, Set<string>>();
  const positionByNodeId = new Map<string, PendingNodePosition>();

  edges.forEach((edge) => {
    if (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target)) {
      return;
    }

    const childIds = childrenByParentId.get(edge.target) ?? new Set<string>();

    childIds.add(edge.source);
    childrenByParentId.set(edge.target, childIds);
  });

  function sortedChildren(parentId: string) {
    return [...(childrenByParentId.get(parentId) ?? [])].sort(
      (a, b) => (layoutOrderByNodeId.get(a) ?? 0) - (layoutOrderByNodeId.get(b) ?? 0),
    );
  }

  function subtreeSize(nodeId: string, seenNodeIds = new Set<string>()): number {
    if (seenNodeIds.has(nodeId)) {
      return 0;
    }

    const nextSeenNodeIds = new Set(seenNodeIds);

    nextSeenNodeIds.add(nodeId);

    return (
      1 +
      sortedChildren(nodeId).reduce(
        (total, childId) => total + subtreeSize(childId, nextSeenNodeIds),
        0,
      )
    );
  }

  function placeNode(
    node: FlowNode,
    depth: number,
    startAngle: number,
    endAngle: number,
    seenNodeIds = new Set<string>(),
  ) {
    if (positionByNodeId.has(node.id) || seenNodeIds.has(node.id)) {
      return;
    }

    const width = node.measured?.width ?? node.width ?? dagreNodeWidth;
    const height = node.measured?.height ?? node.height ?? dagreNodeHeight;
    const angle = startAngle + (endAngle - startAngle) / 2;
    const radius = depth === 0 ? 0 : dagreRadialRingGap * depth;

    positionByNodeId.set(node.id, {
      x: Math.cos(angle) * radius - width / 2,
      y: Math.sin(angle) * radius - height / 2,
    });

    const nextSeenNodeIds = new Set(seenNodeIds);

    nextSeenNodeIds.add(node.id);

    const childIds = sortedChildren(node.id).filter((childId) => !positionByNodeId.has(childId));
    const totalChildSize = childIds.reduce(
      (total, childId) => total + subtreeSize(childId, nextSeenNodeIds),
      0,
    );
    let currentAngle = startAngle;

    childIds.forEach((childId, index) => {
      const child = nodes.find((candidate) => candidate.id === childId);

      if (!child || totalChildSize === 0) {
        return;
      }

      const childSpan =
        index === childIds.length - 1
          ? endAngle - currentAngle
          : ((endAngle - startAngle) * subtreeSize(childId, nextSeenNodeIds)) / totalChildSize;
      const childEndAngle = currentAngle + childSpan;

      placeNode(child, depth + 1, currentAngle, childEndAngle, nextSeenNodeIds);
      currentAngle = childEndAngle;
    });
  }

  if (centerRow) {
    placeNode(centerRow.node, 0, -Math.PI / 2, Math.PI * 1.5);
  }

  const fallbackRows = layoutRows.filter((row) => !positionByNodeId.has(row.node.id));
  const fallbackRadius = Math.max(
    dagreRadialRingGap,
    (fallbackRows.length * dagreRadialNodeGap) / (2 * Math.PI),
  );

  fallbackRows.forEach((row, index) => {
    const width = row.node.measured?.width ?? row.node.width ?? dagreNodeWidth;
    const height = row.node.measured?.height ?? row.node.height ?? dagreNodeHeight;
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / Math.max(1, fallbackRows.length);

    positionByNodeId.set(row.node.id, {
      x: Math.cos(angle) * fallbackRadius - width / 2,
      y: Math.sin(angle) * fallbackRadius - height / 2,
    });
  });

  const seededNodes = nodes.map((node) => ({
    ...node,
    position: positionByNodeId.get(node.id) ?? node.position,
  }));

  return relaxRadialLayout(seededNodes, edges, centerRow?.node.id ?? null);
}

function relaxRadialLayout(
  nodes: FlowNode[],
  edges: FlowEdge[],
  centerNodeId: string | null,
) {
  const nodeStateById = new Map<string, RadialRelaxNodeState>(
    nodes.map((node) => {
      const state: RadialRelaxNodeState = {
        homeX: node.position.x,
        homeY: node.position.y,
        node,
        vx: 0,
        vy: 0,
        x: node.position.x,
        y: node.position.y,
      };

      return [node.id, state];
    }),
  );
  const links = edges
    .filter((edge) => nodeStateById.has(edge.source) && nodeStateById.has(edge.target))
    .map((edge) => ({
      source: edge.source,
      target: edge.target,
    }));

  for (let iteration = 0; iteration < radialRelaxIterations; iteration += 1) {
    const alpha = 1 - iteration / radialRelaxIterations;

    links.forEach((link) => {
      const source = nodeStateById.get(link.source);
      const target = nodeStateById.get(link.target);

      if (!source || !target) {
        return;
      }

      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const distance = Math.hypot(dx, dy) || 1;
      const force = ((distance - radialRelaxLinkDistance) / distance) * 0.012 * alpha;
      const fx = dx * force;
      const fy = dy * force;

      if (source.node.id !== centerNodeId) {
        source.vx += fx;
        source.vy += fy;
      }

      if (target.node.id !== centerNodeId) {
        target.vx -= fx;
        target.vy -= fy;
      }
    });

    const states = [...nodeStateById.values()];

    for (let i = 0; i < states.length; i += 1) {
      for (let j = i + 1; j < states.length; j += 1) {
        const a = states[i];
        const b = states[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy) || 1;

        if (distance >= radialRelaxCollisionDistance) {
          continue;
        }

        const force = ((radialRelaxCollisionDistance - distance) / distance) * 0.018 * alpha;
        const fx = dx * force;
        const fy = dy * force;

        if (a.node.id !== centerNodeId) {
          a.vx -= fx;
          a.vy -= fy;
        }

        if (b.node.id !== centerNodeId) {
          b.vx += fx;
          b.vy += fy;
        }
      }
    }

    nodeStateById.forEach((state) => {
      if (state.node.id === centerNodeId) {
        state.x = state.homeX;
        state.y = state.homeY;
        state.vx = 0;
        state.vy = 0;
        return;
      }

      state.vx += (state.homeX - state.x) * 0.025 * alpha;
      state.vy += (state.homeY - state.y) * 0.025 * alpha;
      state.vx *= 0.72;
      state.vy *= 0.72;
      state.x += state.vx;
      state.y += state.vy;
    });
  }

  return nodes.map((node) => {
    const state = nodeStateById.get(node.id);

    return state
      ? {
          ...node,
          position: {
            x: state.x,
            y: state.y,
          },
        }
      : node;
  });
}

function collapseClassificationGraphForAnchors(
  nodes: FlowNode[],
  edges: FlowEdge[],
  collapsedAnchorIds: Set<string>,
) {
  if (collapsedAnchorIds.size === 0) {
    return {
      edges: edges.map((edge) => ({
        ...edge,
        hidden: false,
      })),
      nodes: nodes.map((node) => ({
        ...node,
        hidden: false,
        data: {
          ...node.data,
          collapsedCount: 0,
        },
      })),
    };
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  const incomingNodeIdsByTargetId = new Map<string, string[]>();

  edges.forEach((edge) => {
    if (
      !nodeIds.has(edge.source) ||
      !nodeIds.has(edge.target) ||
      !isClassificationCollapseEdge(edge)
    ) {
      return;
    }

    const incomingNodeIds = incomingNodeIdsByTargetId.get(edge.target) ?? [];

    incomingNodeIds.push(edge.source);
    incomingNodeIdsByTargetId.set(edge.target, incomingNodeIds);
  });

  const collapsedNodeIdsByAnchorId = new Map<string, Set<string>>();
  const hiddenNodeIds = new Set<string>();

  collapsedAnchorIds.forEach((anchorId) => {
    if (!nodeIds.has(anchorId)) {
      return;
    }

    const collapsedNodeIds = upstreamClassificationNodeIdsForAnchor(
      anchorId,
      incomingNodeIdsByTargetId,
    );

    collapsedNodeIdsByAnchorId.set(anchorId, collapsedNodeIds);
  });

  const nestedCollapsedAnchorIds = new Set<string>();

  collapsedNodeIdsByAnchorId.forEach((collapsedNodeIds) => {
    collapsedNodeIds.forEach((nodeId) => {
      if (collapsedAnchorIds.has(nodeId)) {
        nestedCollapsedAnchorIds.add(nodeId);
      }
    });
  });

  collapsedNodeIdsByAnchorId.forEach((collapsedNodeIds, anchorId) => {
    if (nestedCollapsedAnchorIds.has(anchorId)) {
      hiddenNodeIds.add(anchorId);
    }

    collapsedNodeIds.forEach((nodeId) => {
      if (!collapsedAnchorIds.has(nodeId) || nestedCollapsedAnchorIds.has(nodeId)) {
        hiddenNodeIds.add(nodeId);
      }
    });
  });

  const nextNodes = nodes.map((node) => ({
      ...node,
      hidden: hiddenNodeIds.has(node.id),
      data: {
        ...node.data,
        collapsedCount: collapsedNodeIdsByAnchorId.get(node.id)?.size ?? 0,
      },
    }));
  const nextEdges = edges.map((edge) => ({
    ...edge,
    hidden: hiddenNodeIds.has(edge.source) || hiddenNodeIds.has(edge.target),
  }));

  return {
    edges: nextEdges,
    nodes: nextNodes,
  };
}

function upstreamClassificationNodeIdsForAnchor(
  anchorId: string,
  incomingNodeIdsByTargetId: Map<string, string[]>,
) {
  const upstreamNodeIds = new Set<string>();
  const pendingNodeIds = [...(incomingNodeIdsByTargetId.get(anchorId) ?? [])];

  while (pendingNodeIds.length > 0) {
    const nodeId = pendingNodeIds.shift();

    if (!nodeId || nodeId === anchorId || upstreamNodeIds.has(nodeId)) {
      continue;
    }

    upstreamNodeIds.add(nodeId);
    pendingNodeIds.push(...(incomingNodeIdsByTargetId.get(nodeId) ?? []));
  }

  return upstreamNodeIds;
}

function isInstanceOfEdge(edge: FlowEdge) {
  const typeLabel = normalizeRelationshipLabel(
    edge.data?.typeLabel ?? String(edge.label ?? ""),
  );

  return typeLabel === "instanceof" || typeLabel === "instance";
}

function isSubtypeOfEdge(edge: FlowEdge) {
  const typeLabel = normalizeRelationshipLabel(
    edge.data?.typeLabel ?? String(edge.label ?? ""),
  );

  return typeLabel === "subtypeof" || typeLabel === "subtype";
}

function isClassificationCollapseEdge(edge: FlowEdge) {
  return isInstanceOfEdge(edge) || isSubtypeOfEdge(edge);
}

function normalizeRelationshipLabel(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function nodeDotPoint(node: ReturnType<typeof useInternalNode<FlowNode>> | undefined) {
  if (!node) {
    return null;
  }

  const width = node.measured.width ?? node.width ?? node.initialWidth;

  if (!width) {
    return null;
  }

  return {
    x: node.internals.positionAbsolute.x + width / 2,
    y: node.internals.positionAbsolute.y + 6.5,
  };
}

function viewNodeInsertForRelationshipEndpoint({
  graph,
  now,
  position,
  relationship,
  side,
  viewId,
}: {
  graph: {
    classTableNames: Map<string, string>;
  };
  now: number;
  position: {
    x: number;
    y: number;
  };
  relationship: TableRow;
  side: "source" | "target";
  viewId: string;
}): ViewNodeInsert | null {
  const classId = stringValue(relationship, `${side}_class_id`);
  const recordId = stringValue(relationship, `${side}_record_id`);
  const tableName = graph.classTableNames.get(classId);

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
    visibility: "visible",
    x: position.x,
    y: position.y,
  } satisfies ViewNodeInsert;
}

function rowsFor(tableSamples: ClassTableSamples, tableName: KnownClassTableName) {
  return tableSamples[tableName]?.rows ?? [];
}

function graphNodeId(tableName: string, recordId: string) {
  if (tableName === "entities") {
    return `entity:${recordId}`;
  }

  if (tableName === "claims") {
    return `claim:${recordId}`;
  }

  return `${tableName}:${recordId}`;
}

function nodePosition(index: number, total: number, offsetX: number, offsetY: number) {
  const columns = Math.max(1, Math.ceil(Math.sqrt(total)));
  const row = Math.floor(index / columns);
  const column = index % columns;

  return {
    x: offsetX + column * 190,
    y: offsetY + row * 132,
  };
}

function canvasHint({
  selectedDomainId,
  selectedView,
  views,
}: {
  selectedDomainId: string | null;
  selectedView: TableRow | null;
  views: TableRow[];
}) {
  if (!selectedDomainId) {
    return "Select a domain.";
  }

  if (!selectedView && views.length === 0) {
    return "Create a view.";
  }

  if (!selectedView) {
    return "Select a view.";
  }

  return "No nodes in this view.";
}

function graphRoute(domainId: string, viewId: string | null, routePath = "/atlas") {
  const params = new URLSearchParams({ domain: domainId });

  if (viewId) {
    params.set("view", viewId);
  }

  return `${routePath}?${params.toString()}`;
}

function stringValue(row: TableRow, fieldName: string) {
  const value = row[fieldName];

  return typeof value === "string" ? value : "";
}

function numberValue(row: TableRow, fieldName: string) {
  const value = row[fieldName];

  return typeof value === "number" ? value : null;
}
