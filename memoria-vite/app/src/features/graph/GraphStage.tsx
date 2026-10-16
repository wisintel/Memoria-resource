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
  getNodesBounds,
  useEdgesState,
  useInternalNode,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps
} from "@xyflow/react";
import type { ELK as ElkLayoutEngine, ElkExtendedEdge, ElkNode } from "elkjs/lib/elk-api";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  CircleDot,
  Focus,
  Network,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  Trash2,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { placeEdge, placeItem, removeViewEdge, removeViewItem } from "../../api";
import type {
  GraphSnapshot,
  GraphView,
  SelectedRecord,
  ViewEdgeRecord,
  ViewItemRecord
} from "../../types";

type FlowItemData = {
  itemId: string;
  itemTable: string;
  label: string;
  role: string;
  summary: string | null;
  typeLabel: string;
  viewItemId: string;
};

type FlowEdgeData = {
  edgeId: string;
  label: string;
  typeLabel: string;
  viewEdgeId: string;
};

type FlowItem = Node<FlowItemData, "graphItem">;
type FlowEdge = Edge<FlowEdgeData, "centered">;
type GraphLayoutDirection = "LR" | "TB" | "BT";
type GraphLayoutMode = GraphLayoutDirection | "RADIAL";
type ElkLayoutProfile = {
  layoutOptions: Record<string, string>;
  mode: GraphLayoutMode;
};

type GraphStageProps = {
  activeView: GraphView | null;
  dirtyCount: number;
  draggingRecord: SelectedRecord;
  isBusy: boolean;
  isWorkbench: boolean;
  itemCount: number;
  snapshot: GraphSnapshot;
  views: GraphView[];
  onClearDrag: () => void;
  onClearWorkbench: () => Promise<void>;
  onCreateView: (input: { copyFromActive?: boolean; label: string }) => Promise<void>;
  onDeleteView: (id: string) => Promise<void>;
  onRenameView: (id: string, input: { label: string }) => Promise<void>;
  onSaveLayout: () => Promise<void>;
  onPositionDraft: (viewItemId: string, position: { x: number; y: number }) => void;
  onRemoveWorkbenchEdges: (edgeIds: string[]) => void;
  onRemoveWorkbenchItems: (itemIds: string[]) => void;
  onConnectItems: (sourceId: string, targetId: string) => void;
  onSelect: (selection: SelectedRecord) => void;
  onSnapshot: (snapshot: GraphSnapshot) => void;
  onViewChange: (id: string) => void;
  onWorkbenchPlaceEdge: (edgeId: string) => void;
  onWorkbenchPlaceItem: (itemId: string, position: { x: number; y: number }) => void;
};

const NO_DOMAIN_ID = "__no_domain__";
const NO_VIEW_ID = "__no_view__";
const defaultItemWidth = 190;
const defaultItemHeight = 72;
const graphNodeDotCenterY = 6.5;
const edgeLabelBgStyle = {
  fill: "color-mix(in oklch, var(--card) 90%, transparent)",
  stroke: "var(--border)",
  strokeWidth: 1
} as const;
const edgeLabelStyle = {
  fill: "var(--muted-foreground)",
  fontSize: 11,
  fontWeight: 560
} as const;
let elkPromise: Promise<ElkLayoutEngine> | null = null;

export function GraphStage(props: GraphStageProps) {
  return (
    <ReactFlowProvider>
      <GraphStageCanvas {...props} />
    </ReactFlowProvider>
  );
}

function GraphItem({ data, selected }: NodeProps<FlowItem>) {
  return (
    <div className={`graph-node ${selected ? "is-selected" : ""}`}>
      <Handle className="node-handle node-handle-target" position={Position.Top} type="target" />
      <Handle className="node-handle node-handle-source" position={Position.Top} type="source" />
      <span className="graph-node-dot" />
      <span className="graph-node-label">{data.label}</span>
    </div>
  );
}

const nodeTypes = { graphItem: GraphItem };

function CenteredGraphEdge(props: EdgeProps<FlowEdge>) {
  const {
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
    selected,
    style
  } = props;
  const sourceNode = useInternalNode<FlowItem>(props.source);
  const targetNode = useInternalNode<FlowItem>(props.target);
  const sourceWidth = sourceNode?.measured.width ?? sourceNode?.width ?? defaultItemWidth;
  const targetWidth = targetNode?.measured.width ?? targetNode?.width ?? defaultItemWidth;
  const sourceX = sourceNode ? sourceNode.internals.positionAbsolute.x + sourceWidth / 2 : props.sourceX;
  const sourceY = sourceNode ? sourceNode.internals.positionAbsolute.y + graphNodeDotCenterY : props.sourceY;
  const targetX = targetNode ? targetNode.internals.positionAbsolute.x + targetWidth / 2 : props.targetX;
  const targetY = targetNode ? targetNode.internals.positionAbsolute.y + graphNodeDotCenterY : props.targetY;
  const path = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;

  return (
    <BaseEdge
      id={id}
      className={selected ? "selected" : undefined}
      interactionWidth={interactionWidth}
      label={label}
      labelBgBorderRadius={labelBgBorderRadius}
      labelBgPadding={labelBgPadding}
      labelBgStyle={labelBgStyle}
      labelShowBg={labelShowBg}
      labelStyle={labelStyle}
      labelX={(sourceX + targetX) / 2}
      labelY={(sourceY + targetY) / 2}
      markerEnd={markerEnd}
      markerStart={markerStart}
      path={path}
      style={style}
    />
  );
}

const edgeTypes = { centered: CenteredGraphEdge };

function StageToolbar({
  activeView,
  canArrange,
  dirtyCount,
  isBusy,
  itemCount,
  views,
  onAutoArrange,
  onAutoArrangeRadial,
  onClearWorkbench,
  onCreateView,
  onDeleteView,
  onRenameView,
  onSaveLayout,
  onViewChange
}: {
  activeView: GraphView | null;
  canArrange: boolean;
  dirtyCount: number;
  isBusy: boolean;
  itemCount: number;
  views: GraphView[];
  onAutoArrange: (direction: GraphLayoutDirection) => void;
  onAutoArrangeRadial: () => void;
  onClearWorkbench: () => Promise<void>;
  onCreateView: (input: { copyFromActive?: boolean; label: string }) => Promise<void>;
  onDeleteView: (id: string) => Promise<void>;
  onRenameView: (id: string, input: { label: string }) => Promise<void>;
  onSaveLayout: () => Promise<void>;
  onViewChange: (id: string) => void;
}) {
  const [editMode, setEditMode] = useState<"create" | "rename" | null>(null);
  const [draftName, setDraftName] = useState("");
  const [pendingDelete, setPendingDelete] = useState(false);
  const [copyWorkbenchOnCreate, setCopyWorkbenchOnCreate] = useState(false);
  const [viewError, setViewError] = useState<string | null>(null);
  const activeViewId = activeView?.id ?? "";
  const isWorkbench = Boolean(activeView && activeView.label.trim().toLowerCase() === "workbench");
  const canEditSelected = Boolean(activeView && !isWorkbench);
  const canSaveLayout = dirtyCount > 0 || (isWorkbench && itemCount > 0);

  function beginCreateView() {
    setDraftName("");
    setPendingDelete(false);
    setCopyWorkbenchOnCreate(false);
    setViewError(null);
    setEditMode("create");
  }

  function beginRenameView() {
    if (!activeView) {
      return;
    }

    setDraftName(activeView.label);
    setPendingDelete(false);
    setCopyWorkbenchOnCreate(false);
    setViewError(null);
    setEditMode("rename");
  }

  function resetEditor() {
    setDraftName("");
    setEditMode(null);
    setPendingDelete(false);
    setCopyWorkbenchOnCreate(false);
    setViewError(null);
  }

  function saveLayoutOrPrompt() {
    if (isWorkbench) {
      setDraftName("");
      setPendingDelete(false);
      setCopyWorkbenchOnCreate(true);
      setViewError("Name this view to save the Workbench layout.");
      setEditMode("create");
      return;
    }

    void onSaveLayout();
  }

  async function saveViewDraft() {
    const label = draftName.trim();

    if (!label) {
      setViewError("View name is required.");
      return;
    }

    try {
      if (editMode === "create") {
        await onCreateView({ copyFromActive: copyWorkbenchOnCreate, label });
      } else if (activeView) {
        await onRenameView(activeView.id, { label });
      }

      resetEditor();
    } catch (error) {
      setViewError(error instanceof Error ? error.message : "View could not be saved.");
    }
  }

  async function deleteSelectedView() {
    if (!activeView) {
      return;
    }

    if (views.length <= 1) {
      setPendingDelete(false);
      setEditMode(null);
      setViewError("The last view in this scope cannot be deleted.");
      return;
    }

    if (!pendingDelete) {
      setPendingDelete(true);
      setEditMode(null);
      setViewError(`Click delete again to remove "${activeView.label}".`);
      return;
    }

    try {
      await onDeleteView(activeView.id);
      resetEditor();
    } catch (error) {
      setViewError(error instanceof Error ? error.message : "View could not be deleted.");
    }
  }

  return (
    <div className="absolute left-1/2 top-4 z-20 flex w-full max-w-3xl -translate-x-1/2 items-start justify-center gap-2 px-12">
      <div
        aria-label="Layout controls"
        className="flex w-max shrink-0 gap-1 rounded-lg border border-sidebar-border bg-card/90 p-1 shadow-lg backdrop-blur-md"
      >
        <Button
          aria-label="Auto arrange left to right"
          className="size-8 rounded-md border border-sidebar-border bg-background/60 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-primary"
          disabled={!canArrange}
          onClick={() => onAutoArrange("LR")}
          size="icon-sm"
          title="Auto arrange left to right"
          type="button"
          variant="ghost"
        >
          <ArrowRight />
        </Button>
        <Button
          aria-label="Auto arrange top to bottom"
          className="size-8 rounded-md border border-sidebar-border bg-background/60 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-primary"
          disabled={!canArrange}
          onClick={() => onAutoArrange("TB")}
          size="icon-sm"
          title="Auto arrange top to bottom"
          type="button"
          variant="ghost"
        >
          <ArrowDown />
        </Button>
        <Button
          aria-label="Auto arrange bottom to top"
          className="size-8 rounded-md border border-sidebar-border bg-background/60 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-primary"
          disabled={!canArrange}
          onClick={() => onAutoArrange("BT")}
          size="icon-sm"
          title="Auto arrange bottom to top"
          type="button"
          variant="ghost"
        >
          <ArrowUp />
        </Button>
        <Button
          aria-label="Auto arrange radial"
          className="size-8 rounded-md border border-sidebar-border bg-background/60 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-primary"
          disabled={!canArrange}
          onClick={onAutoArrangeRadial}
          size="icon-sm"
          title="Auto arrange radial"
          type="button"
          variant="ghost"
        >
          <CircleDot />
        </Button>
      </div>
      <div className="flex min-h-11 flex-1 flex-wrap items-center gap-2 rounded-lg border border-sidebar-border bg-card/90 p-1.5 shadow-lg backdrop-blur-md">
        <Select
          disabled={views.length === 0 || isBusy}
          onValueChange={(viewId) => {
            if (viewId === NO_VIEW_ID) {
              return;
            }

            resetEditor();
            onViewChange(viewId);
          }}
          value={activeViewId || NO_VIEW_ID}
        >
          <SelectTrigger
            aria-label="View"
            className="h-8 min-w-44 justify-start gap-2 rounded-md border-sidebar-border bg-background/60 px-2"
          >
            <span className="text-xs font-bold uppercase text-muted-foreground">View</span>
            <SelectValue placeholder="View" />
          </SelectTrigger>
          <SelectContent align="start" position="popper" className="min-w-52">
            <SelectGroup>
              {views.length === 0 ? (
                <SelectItem disabled value={NO_VIEW_ID}>
                  View
                </SelectItem>
              ) : null}
              {views.map((view) => (
                <SelectItem key={view.id} value={view.id}>
                  {view.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">{itemCount} placed</span>
        <div className="flex-1" />
        <div className="my-1 h-6 w-px bg-sidebar-border" />
        <Button
          aria-label="Save graph layout"
          className="size-8 rounded-md border border-sidebar-border"
          variant={canSaveLayout ? "default" : "ghost"}
          disabled={!canSaveLayout || isBusy}
          onClick={saveLayoutOrPrompt}
          size="icon-sm"
          type="button"
        >
          <Save />
        </Button>
        {isWorkbench ? (
          <Button
            aria-label="Clear Workbench"
            className="size-8 rounded-md border border-sidebar-border text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-primary"
            disabled={itemCount === 0 || isBusy}
            onClick={() => {
              void onClearWorkbench();
            }}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <RefreshCcw />
          </Button>
        ) : null}
        <Button
          aria-label="Create view"
          className="size-8 rounded-md border border-sidebar-border text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-primary"
          disabled={isBusy}
          onClick={beginCreateView}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Plus />
        </Button>
        <Button
          aria-label="Rename view"
          className="size-8 rounded-md border border-sidebar-border text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-primary"
          disabled={!canEditSelected || isBusy}
          onClick={beginRenameView}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Pencil />
        </Button>
        <Button
          aria-label="Delete view"
          className="size-8 rounded-md border border-sidebar-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          disabled={!canEditSelected || isBusy}
          onClick={() => {
            void deleteSelectedView();
          }}
          size="icon-sm"
          type="button"
          variant={pendingDelete ? "destructive" : "ghost"}
        >
          <Trash2 />
        </Button>
        {editMode ? (
          <div className="flex w-full items-center gap-1.5">
            <Input
              aria-label="View name"
              autoFocus
              className="min-w-0 flex-1"
              onChange={(event) => {
                setDraftName(event.currentTarget.value);
                setPendingDelete(false);
                setViewError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void saveViewDraft();
                }
              }}
              placeholder="View name"
              value={draftName}
            />
            <Button disabled={isBusy} onClick={() => void saveViewDraft()} size="icon-sm" type="button">
              <Check />
            </Button>
            <Button disabled={isBusy} onClick={resetEditor} size="icon-sm" type="button" variant="secondary">
              <X />
            </Button>
          </div>
        ) : null}
        {viewError ? <p className="m-0 w-full text-xs text-destructive">{viewError}</p> : null}
      </div>
    </div>
  );
}

function GraphStageCanvas({
  activeView,
  dirtyCount,
  draggingRecord,
  isBusy,
  isWorkbench,
  itemCount,
  snapshot,
  views,
  onClearDrag,
  onClearWorkbench,
  onCreateView,
  onDeleteView,
  onRenameView,
  onSaveLayout,
  onPositionDraft,
  onRemoveWorkbenchEdges,
  onRemoveWorkbenchItems,
  onConnectItems,
  onSelect,
  onSnapshot,
  onViewChange,
  onWorkbenchPlaceEdge,
  onWorkbenchPlaceItem
}: GraphStageProps) {
  const { fitBounds, screenToFlowPosition } = useReactFlow<FlowItem, FlowEdge>();
  const initialItems = useMemo(() => buildFlowItems(snapshot.viewItems), [snapshot.viewItems]);
  const initialEdges = useMemo(() => buildFlowEdges(snapshot.viewEdges, snapshot.viewItems), [snapshot.viewEdges, snapshot.viewItems]);
  const [flowItems, setFlowItems, onNodesChange] = useNodesState<FlowItem>(initialItems);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState<FlowEdge>(initialEdges);
  const [activeHopFocus, setActiveHopFocus] = useState<{ hopLimit: number; itemId: string } | null>(null);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const selectedItem = flowItems.find((item) => item.selected) ?? null;

  useEffect(() => {
    setFlowItems(initialItems);
    setActiveHopFocus(null);
  }, [initialItems, setFlowItems]);

  useEffect(() => {
    setFlowEdges(initialEdges);
    setActiveHopFocus(null);
  }, [initialEdges, setFlowEdges]);

  function focusItems(itemsToFocus: FlowItem[]) {
    if (itemsToFocus.length === 0) {
      return;
    }

    fitBounds(getNodesBounds(itemsToFocus), {
      duration: 280,
      padding: itemsToFocus.length === 1 ? 0.75 : 0.32
    });
  }

  function focusSelectedItem() {
    focusSelectedHops(1);
  }

  function focusSelectedNeighborhood() {
    if (!selectedItem) {
      return;
    }

    focusSelectedHops(2);
  }

  function itemIdsWithinHops(rootItemId: string, hopLimit: number) {
    const visibleItemIds = new Set<string>([rootItemId]);
    let frontierItemIds = new Set<string>([rootItemId]);

    for (let hop = 0; hop < hopLimit; hop += 1) {
      const nextFrontierItemIds = new Set<string>();

      flowEdges.forEach((edge) => {
        if (frontierItemIds.has(edge.source) && !visibleItemIds.has(edge.target)) {
          nextFrontierItemIds.add(edge.target);
        }

        if (frontierItemIds.has(edge.target) && !visibleItemIds.has(edge.source)) {
          nextFrontierItemIds.add(edge.source);
        }
      });

      nextFrontierItemIds.forEach((itemId) => visibleItemIds.add(itemId));
      frontierItemIds = nextFrontierItemIds;
    }

    return visibleItemIds;
  }

  function focusSelectedHops(hopLimit: number) {
    if (!selectedItem) {
      return;
    }

    if (activeHopFocus?.itemId === selectedItem.id && activeHopFocus.hopLimit === hopLimit) {
      clearHopFocus();
      return;
    }

    const visibleItemIds = itemIdsWithinHops(selectedItem.id, hopLimit);
    const visibleItems = flowItems.filter((item) => visibleItemIds.has(item.id));

    setFlowItems((currentItems) =>
      currentItems.map((item) => ({
        ...item,
        hidden: !visibleItemIds.has(item.id)
      }))
    );
    setFlowEdges((currentEdges) =>
      currentEdges.map((edge) => ({
        ...edge,
        hidden: !(visibleItemIds.has(edge.source) && visibleItemIds.has(edge.target))
      }))
    );

    setActiveHopFocus({ hopLimit, itemId: selectedItem.id });
    focusItems(visibleItems);
  }

  function clearHopFocus() {
    setFlowItems((currentItems) => currentItems.map((item) => (item.hidden ? { ...item, hidden: false } : item)));
    setFlowEdges((currentEdges) => currentEdges.map((edge) => (edge.hidden ? { ...edge, hidden: false } : edge)));
    setActiveHopFocus(null);
  }

  function applyLayoutedItems(layoutedItems: FlowItem[]) {
    const positionByItemId = new Map(layoutedItems.map((item) => [item.id, item.position] as const));

    setFlowItems((currentItems) =>
      currentItems.map((item) => {
        const position = positionByItemId.get(item.id);

        return position
          ? {
              ...item,
              position
            }
          : item;
      })
    );

    layoutedItems.forEach((item) => {
      onPositionDraft(item.data.viewItemId, item.position);
    });
    focusItems(layoutedItems);
  }

  async function autoArrangeGraph(direction: GraphLayoutDirection) {
    if (flowItems.length === 0) {
      return;
    }

    setLayoutError(null);

    try {
      applyLayoutedItems(await layoutGraphWithElk(flowItems, flowEdges, elkLayoutProfile(direction)));
    } catch (error) {
      setLayoutError(layoutFailureMessage(error));
    }
  }

  async function autoArrangeGraphRadial() {
    if (flowItems.length === 0) {
      return;
    }

    setLayoutError(null);

    try {
      applyLayoutedItems(await layoutGraphWithElk(flowItems, flowEdges, elkLayoutProfile("RADIAL")));
    } catch (error) {
      setLayoutError(layoutFailureMessage(error));
    }
  }

  async function placeDraggingRecord(clientX: number, clientY: number, transferredRecord?: SelectedRecord) {
    const record = draggingRecord ?? transferredRecord;
    const activeViewId = snapshot.activeView?.id;

    onClearDrag();

    if (!record || !activeViewId) {
      return;
    }

    const position = screenToFlowPosition({
      x: clientX,
      y: clientY
    });

    if (record.kind === "item") {
      if (isWorkbench) {
        onWorkbenchPlaceItem(record.id, position);
        onSelect({ kind: "item", id: record.id });
        return;
      }

      const nextSnapshot = await placeItem({
        domain_filter_id: snapshot.activeDomain?.id ?? NO_DOMAIN_ID,
        item_id: record.id,
        view_id: activeViewId,
        x: position.x,
        y: position.y
      });
      onSnapshot(nextSnapshot);
      onSelect({ kind: "item", id: record.id });
      return;
    }

    const edge = snapshot.edges.find((candidate) => candidate.id === record.id);

    if (!edge) {
      return;
    }

    const placedItemIds = new Set(snapshot.viewItems.map((item) => item.item_id));
    let nextSnapshot = snapshot;
    const sourceMissing = !placedItemIds.has(edge.source_id);
    const targetMissing = !placedItemIds.has(edge.target_id);
    const sourcePosition =
      sourceMissing && targetMissing
        ? { x: position.x - 180, y: position.y }
        : { x: position.x - 140, y: position.y };
    const targetPosition =
      sourceMissing && targetMissing
        ? { x: position.x + 180, y: position.y }
        : { x: position.x + 140, y: position.y };

    if (isWorkbench) {
      if (sourceMissing) {
        onWorkbenchPlaceItem(edge.source_id, sourcePosition);
      }

      if (targetMissing) {
        onWorkbenchPlaceItem(edge.target_id, targetPosition);
      }

      onWorkbenchPlaceEdge(edge.id);
      onSelect({ kind: "edge", id: edge.id });
      return;
    }

    if (sourceMissing) {
      nextSnapshot = await placeItem({
        domain_filter_id: snapshot.activeDomain?.id ?? NO_DOMAIN_ID,
        item_id: edge.source_id,
        view_id: activeViewId,
        ...sourcePosition
      });
      placedItemIds.add(edge.source_id);
    }

    if (targetMissing) {
      nextSnapshot = await placeItem({
        domain_filter_id: snapshot.activeDomain?.id ?? NO_DOMAIN_ID,
        item_id: edge.target_id,
        view_id: activeViewId,
        ...targetPosition
      });
      placedItemIds.add(edge.target_id);
    }

    nextSnapshot = await placeEdge({
      domain_filter_id: snapshot.activeDomain?.id ?? NO_DOMAIN_ID,
      edge_id: edge.id,
      view_id: activeViewId
    });
    onSnapshot(nextSnapshot);
    onSelect({ kind: "edge", id: edge.id });
  }

  async function connect(connection: Connection) {
    if (!connection.source || !connection.target || connection.source === connection.target) {
      return;
    }

    const sourceItem = flowItems.find((item) => item.id === connection.source);
    const targetItem = flowItems.find((item) => item.id === connection.target);
    const activeViewId = snapshot.activeView?.id;

    if (!sourceItem || !targetItem || !activeViewId) {
      return;
    }

    onConnectItems(sourceItem.data.itemId, targetItem.data.itemId);
  }

  async function removeItemsFromView(items: FlowItem[]) {
    if (isWorkbench) {
      onRemoveWorkbenchItems(items.map((item) => item.data.itemId));
      onSelect(null);
      return;
    }

    const viewItemIds = items.map((item) => item.data.viewItemId);

    if (viewItemIds.length === 0) {
      return;
    }

    let nextSnapshot = snapshot;

    for (const viewItemId of viewItemIds) {
      nextSnapshot = await removeViewItem(viewItemId);
    }

    onSelect(null);
    onSnapshot(nextSnapshot);
  }

  async function removeEdgesFromView(edges: FlowEdge[]) {
    if (isWorkbench) {
      onRemoveWorkbenchEdges(edges.map((edge) => edge.data?.edgeId).filter((edgeId): edgeId is string => Boolean(edgeId)));
      onSelect(null);
      return;
    }

    const viewEdgeIds = edges
      .map((edge) => edge.data?.viewEdgeId)
      .filter((viewEdgeId): viewEdgeId is string => Boolean(viewEdgeId));

    if (viewEdgeIds.length === 0) {
      return;
    }

    let nextSnapshot = snapshot;

    for (const viewEdgeId of viewEdgeIds) {
      nextSnapshot = await removeViewEdge(viewEdgeId);
    }

    onSelect(null);
    onSnapshot(nextSnapshot);
  }

  return (
    <>
      <StageToolbar
        activeView={activeView}
        canArrange={flowItems.length > 0}
        dirtyCount={dirtyCount}
        isBusy={isBusy}
        itemCount={itemCount}
        views={views}
        onAutoArrange={autoArrangeGraph}
        onAutoArrangeRadial={autoArrangeGraphRadial}
        onClearWorkbench={onClearWorkbench}
        onCreateView={onCreateView}
        onDeleteView={onDeleteView}
        onRenameView={onRenameView}
        onSaveLayout={onSaveLayout}
        onViewChange={onViewChange}
      />
      {layoutError ? <p className="absolute left-4 top-4 z-30 m-0 text-xs text-destructive">{layoutError}</p> : null}
      <div
        className="stage-canvas"
        onDragOver={(event) => {
          if (draggingRecord) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          void placeDraggingRecord(event.clientX, event.clientY, parseDraggedRecord(event.dataTransfer));
        }}
        onMouseUp={(event) => {
          if (draggingRecord) {
            void placeDraggingRecord(event.clientX, event.clientY);
          }
        }}
      >
        <ReactFlow
          className="graph-flow"
          connectionLineType={ConnectionLineType.Straight}
          connectionLineStyle={
            {
              filter: "drop-shadow(0 0 4px color-mix(in oklch, var(--primary) 18%, transparent))",
              stroke: "color-mix(in oklch, var(--primary) 72%, transparent)",
              strokeLinecap: "round",
              strokeWidth: 1.45
            } as React.CSSProperties
          }
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          deleteKeyCode={["Backspace", "Delete"]}
          edges={flowEdges}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ maxZoom: 1.1, padding: 0.28 }}
          maxZoom={2.25}
          minZoom={0.2}
          nodes={flowItems}
          nodeTypes={nodeTypes}
          nodesConnectable
          nodesDraggable
          onConnect={(connection) => {
            void connect(connection);
          }}
          onEdgeClick={(event, edge) => {
            event.stopPropagation();
            onSelect({ kind: "edge", id: edge.data?.edgeId ?? edge.id });
          }}
          onEdgesChange={onEdgesChange}
          onEdgesDelete={(deletedEdges) => {
            void removeEdgesFromView(deletedEdges);
          }}
          onNodeClick={(event, item) => {
            event.stopPropagation();
            onSelect({ kind: "item", id: item.data.itemId });
          }}
          onNodeDragStop={(_, item) => {
            onPositionDraft(item.data.viewItemId, item.position);
          }}
          onNodesChange={onNodesChange}
          onNodesDelete={(deletedItems) => {
            void removeItemsFromView(deletedItems);
          }}
          onPaneClick={() => {
            clearHopFocus();
            onSelect(null);
          }}
          panOnDrag
          proOptions={{ hideAttribution: true }}
          selectionOnDrag
        >
          <Background
            color="color-mix(in oklch, var(--muted-foreground) 18%, transparent)"
            gap={42}
            lineWidth={1}
            variant={BackgroundVariant.Lines}
          />
          <Controls className="graph-controls" position="bottom-right" showInteractive>
            <ControlButton
              aria-label="Focus 1 hop"
              aria-pressed={Boolean(activeHopFocus && activeHopFocus.itemId === selectedItem?.id && activeHopFocus.hopLimit === 1)}
              disabled={!selectedItem}
              onClick={focusSelectedItem}
              title="Focus 1 hop"
              type="button"
            >
              <Focus />
            </ControlButton>
            <ControlButton
              aria-label="Focus 2 hops"
              aria-pressed={Boolean(activeHopFocus && activeHopFocus.itemId === selectedItem?.id && activeHopFocus.hopLimit === 2)}
              disabled={!selectedItem}
              onClick={focusSelectedNeighborhood}
              title="Focus 2 hops"
              type="button"
            >
              <Network />
            </ControlButton>
          </Controls>
        </ReactFlow>
        {snapshot.viewItems.length === 0 ? (
          <Empty className="pointer-events-none absolute inset-0 z-10 grid place-items-center text-muted-foreground">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Network />
              </EmptyMedia>
              <EmptyTitle>No items in this view.</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : null}
      </div>
    </>
  );
}

function buildFlowItems(viewItems: ViewItemRecord[]): FlowItem[] {
  return viewItems.map((viewItem) => ({
    data: {
      itemId: viewItem.item_id,
      itemTable: viewItem.item_table,
      label: viewItem.label,
      role: viewItem.role,
      summary: viewItem.claim_text ?? viewItem.source,
      typeLabel: viewItem.type,
      viewItemId: viewItem.view_item_id
    },
    id: viewItem.item_id,
    position: {
      x: viewItem.x,
      y: viewItem.y
    },
    type: "graphItem"
  }));
}

function buildFlowEdges(viewEdges: ViewEdgeRecord[], viewItems: ViewItemRecord[]): FlowEdge[] {
  const visibleItemIds = new Set(viewItems.map((item) => item.item_id));

  return viewEdges
    .filter((edge) => visibleItemIds.has(edge.source_id) && visibleItemIds.has(edge.target_id))
    .map((viewEdge) => ({
    data: {
      edgeId: viewEdge.edge_id,
        label: viewEdge.label,
        typeLabel: viewEdge.type,
        viewEdgeId: viewEdge.view_edge_id
      },
      id: viewEdge.edge_id,
      label: viewEdge.type,
      labelBgBorderRadius: 5,
      labelBgPadding: [8, 3],
      labelBgStyle: edgeLabelBgStyle,
      labelShowBg: true,
      labelStyle: edgeLabelStyle,
      source: viewEdge.source_id,
      target: viewEdge.target_id,
      type: "centered"
    }));
}

function elkDirection(direction: GraphLayoutDirection) {
  if (direction === "LR") {
    return "RIGHT";
  }

  if (direction === "BT") {
    return "UP";
  }

  return "DOWN";
}

function elkLayoutProfile(mode: GraphLayoutMode): ElkLayoutProfile {
  if (mode === "RADIAL") {
    return {
      mode,
      layoutOptions: {
        "elk.algorithm": "radial",
        "elk.radial.compactor": "WEDGE_COMPACTION",
        "elk.separateConnectedComponents": "true",
        "elk.spacing.nodeNode": "100"
      }
    };
  }

  return {
    mode,
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": elkDirection(mode),
      "elk.edgeRouting": "POLYLINE",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.spacing.edgeNodeBetweenLayers": "56",
      "elk.layered.spacing.nodeNodeBetweenLayers": "132",
      "elk.spacing.nodeNode": "88"
    }
  };
}

function elkEdgeEndpoints(edge: FlowEdge) {
  const edgeType = flowEdgeType(edge);

  if (isChildToParentEdgeType(edgeType)) {
    return {
      source: edge.target,
      target: edge.source
    };
  }

  return {
    source: edge.source,
    target: edge.target
  };
}

async function layoutGraphWithElk(items: FlowItem[], edges: FlowEdge[], profile: ElkLayoutProfile) {
  if (items.length === 0) {
    return items;
  }

  const elk = await loadElk();
  const itemIds = new Set(items.map((item) => item.id));
  const elkGraph: ElkNode = {
    id: "root",
    layoutOptions: profile.layoutOptions,
    children: items.map((item) => ({
      id: item.id,
      width: itemWidth(item),
      height: itemHeight(item)
    })),
    edges: edges
      .filter((edge) => itemIds.has(edge.source) && itemIds.has(edge.target) && edge.source !== edge.target)
      .map((edge): ElkExtendedEdge => {
        const endpoints = elkEdgeEndpoints(edge);

        return {
          id: edge.id,
          sources: [endpoints.source],
          targets: [endpoints.target]
        };
      })
  };

  const layoutedGraph = await elk.layout(elkGraph);
  const positionByItemId = new Map(
    (layoutedGraph.children ?? []).map((item) => [item.id, { x: item.x ?? 0, y: item.y ?? 0 }] as const)
  );

  const positioned = items.map((item) => ({
    ...item,
    position: positionByItemId.get(item.id) ?? item.position
  }));

  if (profile.mode === "RADIAL") {
    return evenlyDistributeFirstRing(positioned, edges);
  }

  return positioned;
}

function evenlyDistributeFirstRing(items: FlowItem[], edges: FlowEdge[]) {
  const itemById = new Map(items.map((item) => [item.id, item] as const));
  const childrenByParent = new Map<string, Set<string>>();
  const indegree = new Map<string, number>(items.map((item) => [item.id, 0]));

  edges.forEach((edge) => {
    if (edge.source === edge.target || !itemById.has(edge.source) || !itemById.has(edge.target)) {
      return;
    }

    const { source, target } = elkEdgeEndpoints(edge);
    const siblings = childrenByParent.get(source) ?? new Set<string>();

    if (!siblings.has(target)) {
      siblings.add(target);
      childrenByParent.set(source, siblings);
      indegree.set(target, (indegree.get(target) ?? 0) + 1);
    }
  });

  function reachable(startId: string) {
    const seen = new Set<string>([startId]);
    const stack = [startId];

    while (stack.length > 0) {
      const id = stack.pop() as string;

      for (const child of childrenByParent.get(id) ?? []) {
        if (!seen.has(child)) {
          seen.add(child);
          stack.push(child);
        }
      }
    }

    return seen;
  }

  const roots = items.filter((item) => (indegree.get(item.id) ?? 0) === 0);

  if (roots.length === 0) {
    return items;
  }

  const rootId = roots
    .map((item) => ({ id: item.id, size: reachable(item.id).size }))
    .sort((a, b) => b.size - a.size)[0].id;

  const firstRing = [...(childrenByParent.get(rootId) ?? [])];

  if (firstRing.length < 2) {
    return items;
  }

  const rootItem = itemById.get(rootId);

  if (!rootItem) {
    return items;
  }

  const centerX = rootItem.position.x + itemWidth(rootItem) / 2;
  const centerY = rootItem.position.y + itemHeight(rootItem) / 2;

  const branchByItemId = new Map<string, string>();
  const claimed = new Set<string>([rootId]);

  firstRing.forEach((branchId) => {
    const stack = [branchId];

    while (stack.length > 0) {
      const id = stack.pop() as string;

      if (claimed.has(id)) {
        continue;
      }

      claimed.add(id);
      branchByItemId.set(id, branchId);

      for (const child of childrenByParent.get(id) ?? []) {
        if (!claimed.has(child)) {
          stack.push(child);
        }
      }
    }
  });

  const angleOf = (id: string) => {
    const item = itemById.get(id);

    if (!item) {
      return 0;
    }

    return Math.atan2(item.position.y + itemHeight(item) / 2 - centerY, item.position.x + itemWidth(item) / 2 - centerX);
  };

  const sortedRing = [...firstRing].sort((a, b) => angleOf(a) - angleOf(b));
  const startAngle = angleOf(sortedRing[0]);
  const rotationByBranch = new Map<string, number>();

  sortedRing.forEach((branchId, index) => {
    const targetAngle = startAngle + (2 * Math.PI * index) / sortedRing.length;
    rotationByBranch.set(branchId, targetAngle - angleOf(branchId));
  });

  return items.map((item) => {
    const branchId = branchByItemId.get(item.id);
    const rotation = branchId ? rotationByBranch.get(branchId) : undefined;

    if (rotation === undefined || rotation === 0) {
      return item;
    }

    const halfWidth = itemWidth(item) / 2;
    const halfHeight = itemHeight(item) / 2;
    const dx = item.position.x + halfWidth - centerX;
    const dy = item.position.y + halfHeight - centerY;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);

    return {
      ...item,
      position: {
        x: centerX + dx * cos - dy * sin - halfWidth,
        y: centerY + dx * sin + dy * cos - halfHeight
      }
    };
  });
}

async function loadElk() {
  elkPromise ??= import("elkjs/lib/elk.bundled.js").then(({ default: ELK }) => new ELK());

  return elkPromise;
}

function layoutFailureMessage(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);

  return detail ? `ELK layout failed: ${detail}` : "ELK layout failed.";
}

function flowEdgeType(edge: FlowEdge) {
  return normalizeEdgeType(edge.data?.typeLabel ?? String(edge.label ?? ""));
}

function isChildToParentEdgeType(edgeType: string) {
  return ["classifiedas", "operationof", "partof", "phaseof", "stepin"].includes(edgeType);
}

function normalizeEdgeType(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function itemWidth(item: FlowItem) {
  return item.measured?.width ?? item.width ?? defaultItemWidth;
}

function itemHeight(item: FlowItem) {
  return item.measured?.height ?? item.height ?? defaultItemHeight;
}

function parseDraggedRecord(dataTransfer: DataTransfer): SelectedRecord {
  const encoded = dataTransfer.getData("application/x-memoria-record");
  const [kind, id] = encoded.split(":");

  if ((kind === "item" || kind === "edge") && id) {
    return { kind, id };
  }

  const fallbackId = dataTransfer.getData("text/plain");

  return fallbackId ? { kind: "item", id: fallbackId } : null;
}
