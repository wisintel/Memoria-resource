"use client";

import {
  Background,
  BackgroundVariant,
  BaseEdge,
  ConnectionLineType,
  ControlButton,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
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
import type {
  ELK as ElkLayoutEngine,
  ElkExtendedEdge,
  ElkNode,
} from "elkjs/lib/elk-api";
import ELK from "elkjs/lib/elk.bundled.js";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Force,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import {
  ArrowDown,
  ArrowUp,
  ArrowRight,
  Archive,
  CircleDot,
  Focus,
  Info,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";

import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  DomainMapNodeView,
  DomainMapRelationshipView,
  DomainMapSnapshot,
  GraphPosition,
} from "@/domain/domain-maps";
import { shelfDragDataType, type ShelfDragItem } from "@/domain/shelf";
import { cn } from "@/lib/utils";

type DomainMapGraphStageProps = {
  activeMapId: string;
  domainSlug: string;
  isLoading?: boolean;
  isMutating?: boolean;
  maps: DomainMapSnapshot["maps"];
  onArchiveMap: () => void;
  onCreateMap: () => void;
  onEditMap: () => void;
  onInspectRecord: (selection: {
    classKey: "relationship" | "subject";
    id: string;
  }) => void;
  onInspectActiveMap: () => void;
  onMapChange: (mapId: string) => void;
  onRefresh: () => void;
  snapshot: DomainMapSnapshot;
  onError: (message: string | null) => void;
  onSnapshot: (snapshot: DomainMapSnapshot) => void;
};

type FlowNodeData = {
  collapsedCount: number;
  label: string;
  nodeId: string;
  objectClassKey: string;
  objectId: string;
  typeLabel: string | null;
};

type FlowEdgeData = {
  label: string;
  mapRelationshipId: string;
  relationshipId: string;
  typeLabel: string | null;
};

type DomainFlowNode = Node<FlowNodeData, "domainMapNode">;
type DomainFlowEdge = Edge<FlowEdgeData, "domainMapEdge">;
type GraphLayoutMode = "LR" | "TB" | "BT" | "RADIAL";
type RadialForceNode = SimulationNodeDatum & {
  height: number;
  id: string;
  radius: number;
  width: number;
};
type RadialForceLink = SimulationLinkDatum<RadialForceNode>;

type ElkLayoutProfile = {
  layoutOptions: Record<string, string>;
  mode: GraphLayoutMode;
};

type DomainMapApiPayload = {
  error?: string;
  ok?: boolean;
  snapshot?: DomainMapSnapshot;
  updatedNodeIds?: string[];
};

type SelectedGraphItem =
  | {
      kind: "node";
      label: string;
      nodeId: string;
      objectId: string;
    }
  | {
      kind: "edge";
      label: string;
      mapRelationshipId: string;
    };

type ActiveFocus = {
  hopLimit: 1 | 2;
  objectId: string;
};

const nodeWidth = 190;
const nodeHeight = 72;
const nodeDotCenterY = 6.5;
const edgeLabelBgStyle = {
  fill: "color-mix(in oklch, var(--card) 90%, transparent)",
  stroke: "var(--border)",
  strokeWidth: 1,
} as const;
const edgeLabelStyle = {
  fill: "var(--muted-foreground)",
  fontSize: 11,
  fontWeight: 560,
} as const;
let elkInstance: ElkLayoutEngine | null = null;

const nodeTypes = { domainMapNode: DomainMapNode };
const edgeTypes = { domainMapEdge: CenteredDomainMapEdge };

export function DomainMapGraphStage(props: DomainMapGraphStageProps) {
  return (
    <ReactFlowProvider>
      <DomainMapGraphCanvas {...props} />
    </ReactFlowProvider>
  );
}

function DomainMapGraphCanvas({
  activeMapId,
  domainSlug,
  isLoading,
  isMutating,
  maps,
  onArchiveMap,
  onCreateMap,
  onEditMap,
  onError,
  onInspectActiveMap,
  onInspectRecord,
  onMapChange,
  onRefresh,
  onSnapshot,
  snapshot,
}: DomainMapGraphStageProps) {
  const { fitView, screenToFlowPosition } = useReactFlow<
    DomainFlowNode,
    DomainFlowEdge
  >();
  const snapshotNodes = useMemo(
    () => buildFlowNodes(snapshot.nodes),
    [snapshot.nodes]
  );
  const snapshotEdges = useMemo(
    () => buildFlowEdges(snapshot.relationships, snapshot.nodes),
    [snapshot.nodes, snapshot.relationships]
  );
  const preferredRelationshipTypeId = useMemo(() => {
    const defaultRelationshipTypeId =
      snapshot.activeMap?.defaultRelationshipTypeId ?? "";

    return snapshot.relationshipTypes.some(
      (type) => type.id === defaultRelationshipTypeId
    )
      ? defaultRelationshipTypeId
      : (snapshot.relationshipTypes[0]?.id ?? "");
  }, [snapshot.activeMap?.defaultRelationshipTypeId, snapshot.relationshipTypes]);
  const [nodes, setNodes, onNodesChange] =
    useNodesState<DomainFlowNode>(snapshotNodes);
  const [edges, setEdges, onEdgesChange] =
    useEdgesState<DomainFlowEdge>(snapshotEdges);
  const [isLayouting, setIsLayouting] = useState(false);
  const [relationshipTypeId, setRelationshipTypeId] = useState(
    preferredRelationshipTypeId
  );
  const [selectedGraphItem, setSelectedGraphItem] =
    useState<SelectedGraphItem | null>(null);
  const [activeFocus, setActiveFocus] = useState<ActiveFocus | null>(null);
  const activeFocusRef = useRef<ActiveFocus | null>(null);
  const previousActiveMapIdRef = useRef(activeMapId);
  const [collapsedAnchorIds, setCollapsedAnchorIds] = useState<Set<string>>(
    new Set()
  );
  const collapsedGraph = collapseGraphForAnchors(
    nodes,
    edges,
    collapsedAnchorIds
  );
  useEffect(() => {
    activeFocusRef.current = activeFocus;
  }, [activeFocus]);

  useEffect(() => {
    setRelationshipTypeId(preferredRelationshipTypeId);
  }, [activeMapId, preferredRelationshipTypeId]);

  useEffect(() => {
    setCollapsedAnchorIds(
      new Set(
        snapshot.nodes
          .filter((node) => node.layoutMetadata.isCollapsed)
          .map((node) => node.objectId)
      )
    );
  }, [activeMapId, snapshot.nodes]);

  useEffect(() => {
    const shouldPreservePositions =
      previousActiveMapIdRef.current === activeMapId;
    const focusedObjectIds = activeFocusRef.current
      ? objectIdsWithinHops(
          activeFocusRef.current.objectId,
          activeFocusRef.current.hopLimit,
          snapshotEdges
        )
      : null;

    setNodes((currentNodes) => {
      const currentPositionById = new Map(
        currentNodes.map((node) => [node.id, node.position])
      );

      return snapshotNodes.map((node) => {
        const nextNode = {
          ...node,
          position: shouldPreservePositions
            ? (currentPositionById.get(node.id) ?? node.position)
            : node.position,
        };

        return focusedObjectIds
          ? { ...nextNode, hidden: !focusedObjectIds.has(node.id) }
          : nextNode;
      });
    });

    setEdges(
      focusedObjectIds
        ? snapshotEdges.map((edge) => ({
            ...edge,
            hidden: !(
              focusedObjectIds.has(edge.source) &&
              focusedObjectIds.has(edge.target)
            ),
          }))
        : snapshotEdges
    );
    previousActiveMapIdRef.current = activeMapId;
  }, [activeMapId, setEdges, setNodes, snapshotEdges, snapshotNodes]);

  useOnSelectionChange<DomainFlowNode, DomainFlowEdge>({
    onChange: ({ edges: selectedEdges, nodes: selectedNodes }) => {
      const selectedNode = selectedNodes[0];
      const selectedEdge = selectedEdges[0];

      if (selectedNode) {
        setSelectedGraphItem({
          kind: "node",
          label: selectedNode.data.label,
          nodeId: selectedNode.data.nodeId,
          objectId: selectedNode.data.objectId,
        });
        return;
      }

      if (selectedEdge) {
        setSelectedGraphItem({
          kind: "edge",
          label: String(
            selectedEdge.label ?? selectedEdge.data?.label ?? "Relationship"
          ),
          mapRelationshipId:
            selectedEdge.data?.mapRelationshipId ?? selectedEdge.id,
        });
        return;
      }

      setSelectedGraphItem(null);
    },
  });

  const runGraphMutation = useCallback(
    async function runGraphMutation(
      request: Promise<Response>,
      fallback: string
    ) {
      onError(null);

      try {
        const payload = await readDomainMapPayload(await request);

        if (!payload.snapshot) {
          throw new Error(fallback);
        }

        const nextObjectIds = new Set(
          payload.snapshot.nodes.map((node) => node.objectId)
        );
        const nextActiveFocus =
          activeFocus && nextObjectIds.has(activeFocus.objectId)
            ? activeFocus
            : null;

        if (activeFocus && !nextActiveFocus) {
          activeFocusRef.current = null;
          setActiveFocus(null);
        }
        setCollapsedAnchorIds((current) => {
          const next = new Set(
            [...current].filter((anchorId) => nextObjectIds.has(anchorId))
          );

          return next.size === current.size ? current : next;
        });
        setSelectedGraphItem(null);
        onSnapshot(payload.snapshot);
      } catch (error) {
        onError(error instanceof Error ? error.message : fallback);
      }
    },
    [activeFocus, onError, onSnapshot]
  );

  const handleRelationshipTypeChange = useCallback(
    async function handleRelationshipTypeChange(nextRelationshipTypeId: string) {
      setRelationshipTypeId(nextRelationshipTypeId);

      if (!snapshot.activeMap) {
        return;
      }

      await runGraphMutation(
        fetch(`/api/domain-maps/${activeMapId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            defaultRelationshipTypeId: nextRelationshipTypeId,
            domainSlug,
          }),
        }),
        "Default relationship type was not saved."
      );
    },
    [activeMapId, domainSlug, runGraphMutation, snapshot.activeMap]
  );

  async function createConnection(connection: Connection) {
    if (!connection.source || !connection.target) {
      return;
    }

    if (!relationshipTypeId) {
      onError("Select a relationship type before connecting nodes.");
      return;
    }

    await runGraphMutation(
      fetch(`/api/domain-maps/${activeMapId}/connections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domainSlug,
          relationshipTypeId,
          sourceSubjectId: connection.source,
          targetSubjectId: connection.target,
        }),
      }),
      "Relationship was not created."
    );
  }

  const removeSelectedGraphItem = useCallback(
    async function removeSelectedGraphItem() {
      if (!selectedGraphItem) {
        return;
      }

      const params = new URLSearchParams({ domain: domainSlug });

      if (selectedGraphItem.kind === "node") {
        await runGraphMutation(
          fetch(
            `/api/domain-maps/${activeMapId}/nodes/${selectedGraphItem.nodeId}?${params.toString()}`,
            { method: "DELETE" }
          ),
          "Node was not removed from the map."
        );
        return;
      }

      await runGraphMutation(
        fetch(
          `/api/domain-maps/${activeMapId}/relationships/${selectedGraphItem.mapRelationshipId}?${params.toString()}`,
          { method: "DELETE" }
        ),
        "Relationship was not removed from the map."
      );
    },
    [activeMapId, domainSlug, runGraphMutation, selectedGraphItem]
  );

  useEffect(() => {
    if (!selectedGraphItem) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.key !== "Backspace" ||
        event.repeat ||
        isEditableKeyboardTarget(event.target)
      ) {
        return;
      }

      event.preventDefault();
      void removeSelectedGraphItem();
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [removeSelectedGraphItem, selectedGraphItem]);

  function focusSelectedNode(hopLimit: 1 | 2) {
    if (!selectedGraphItem || selectedGraphItem.kind !== "node") {
      onError("Select a node to focus.");
      return;
    }

    const visibleObjectIds = objectIdsWithinHops(
      selectedGraphItem.objectId,
      hopLimit,
      edges
    );

    setNodes((currentNodes) =>
      currentNodes.map((node) => ({
        ...node,
        hidden: !visibleObjectIds.has(node.id),
      }))
    );
    setEdges((currentEdges) =>
      currentEdges.map((edge) => ({
        ...edge,
        hidden: !(
          visibleObjectIds.has(edge.source) && visibleObjectIds.has(edge.target)
        ),
      }))
    );
    setActiveFocus({
      hopLimit,
      objectId: selectedGraphItem.objectId,
    });
    window.requestAnimationFrame(() =>
      fitView({ maxZoom: 1.1, padding: 0.26 })
    );
  }

  function clearFocus() {
    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.hidden ? { ...node, hidden: false } : node
      )
    );
    setEdges((currentEdges) =>
      currentEdges.map((edge) =>
        edge.hidden ? { ...edge, hidden: false } : edge
      )
    );
    setActiveFocus(null);
    window.requestAnimationFrame(() =>
      fitView({ maxZoom: 1.1, padding: 0.26 })
    );
  }

  async function autoArrange(mode: GraphLayoutMode) {
    const visibleNodes = collapsedGraph.nodes.filter((node) => !node.hidden);
    const visibleEdges = collapsedGraph.edges.filter((edge) => !edge.hidden);

    if (visibleNodes.length === 0) {
      return;
    }

    onError(null);
    setIsLayouting(true);

    try {
      const layoutedVisibleNodes = await layoutGraphWithElk(
        visibleNodes,
        visibleEdges,
        elkLayoutProfile(mode)
      );
      const layoutedNodesById = new Map(
        layoutedVisibleNodes.map((node) => [node.id, node])
      );
      const nextNodes = nodes.map((node) => {
        const layoutedNode = layoutedNodesById.get(node.id);

        return layoutedNode
          ? { ...node, position: layoutedNode.position }
          : node;
      });

      setNodes(nextNodes);
      window.requestAnimationFrame(() =>
        fitView({ maxZoom: 1.1, padding: 0.24 })
      );
      await saveLayoutNodes(layoutedVisibleNodes, "Layout was not saved.");
    } catch (error) {
      onError(layoutFailureMessage(error));
    } finally {
      setIsLayouting(false);
    }
  }

  async function saveLayoutNodes(
    nodesToSave: DomainFlowNode[],
    fallback = "Layout was not saved."
  ) {
    if (nodesToSave.length === 0) {
      return;
    }

    onError(null);
    try {
      const response = await fetch(`/api/domain-maps/${activeMapId}/layout`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domainSlug,
          nodes: nodesToSave.map((node) => ({
            isCollapsed: collapsedAnchorIds.has(node.id),
            nodeId: node.data.nodeId,
            position: node.position,
          })),
        }),
      });
      const payload = await readDomainMapPayload(response);

      if (!payload.ok) {
        throw new Error(fallback);
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : fallback);
    }
  }

  async function saveCurrentLayout() {
    await saveLayoutNodes(nodes, "Layout was not saved.");
  }

  async function placeShelfItemOnMap(
    item: ShelfDragItem,
    position: GraphPosition
  ) {
    if (item.classKey === "subject") {
      await runGraphMutation(
        fetch(`/api/domain-maps/${activeMapId}/nodes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            domainSlug,
            objectId: item.id,
            position,
          }),
        }),
        `${item.title} was not placed on the map.`
      );
      return;
    }

    if (item.classKey === "relationship") {
      await runGraphMutation(
        fetch(`/api/domain-maps/${activeMapId}/relationships`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            domainSlug,
            relationshipId: item.id,
            position,
          }),
        }),
        `${item.title} was not placed on the map.`
      );
      return;
    }

    onError(`${item.title} cannot be placed on a Domain Map.`);
  }

  function handleShelfDragOver(event: DragEvent<HTMLDivElement>) {
    if (!hasShelfDragItem(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  async function handleShelfDrop(event: DragEvent<HTMLDivElement>) {
    const item = parseShelfDragItem(event.dataTransfer);

    if (!item) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    await placeShelfItemOnMap(
      item,
      screenToFlowPosition({ x: event.clientX, y: event.clientY })
    );
  }

  return (
    <div
      className="relative h-full min-h-0 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-background"
      onDragOver={handleShelfDragOver}
      onDrop={(event) => {
        void handleShelfDrop(event);
      }}
    >
      <div className="absolute top-3 right-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center justify-end gap-2">
        <Select
          value={snapshot.activeMap?.id}
          onValueChange={onMapChange}
          disabled={maps.length === 0 || isLoading}
        >
          <SelectTrigger
            className="h-8 min-w-48 max-w-72 bg-card/95 font-sans text-xs normal-case shadow-sm backdrop-blur"
            aria-label="Select Domain Map"
            size="sm"
          >
            <SelectValue placeholder="No map selected" />
          </SelectTrigger>
          <SelectContent className="font-sans">
            <SelectGroup>
              {maps.map((map) => (
                <SelectItem
                  key={map.id}
                  value={map.id}
                  className="font-sans normal-case"
                >
                  {map.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <StageToolbarButton label="New map" onClick={onCreateMap}>
          <Plus data-icon="inline-start" />
        </StageToolbarButton>
        <StageToolbarButton
          label="Edit map details"
          disabled={!snapshot.activeMap || isMutating}
          onClick={onEditMap}
        >
          <Pencil data-icon="inline-start" />
        </StageToolbarButton>
        <StageToolbarButton
          label="Inspect active map"
          disabled={!snapshot.activeMap}
          onClick={onInspectActiveMap}
        >
          <Info data-icon="inline-start" />
        </StageToolbarButton>
        <StageToolbarButton
          label="Archive map"
          disabled={!snapshot.activeMap || isMutating}
          onClick={onArchiveMap}
        >
          <Archive data-icon="inline-start" />
        </StageToolbarButton>
        <StageToolbarButton
          label="Refresh"
          disabled={isLoading}
          onClick={onRefresh}
        >
          <RefreshCw data-icon="inline-start" />
        </StageToolbarButton>
      </div>

      <div className="absolute top-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] items-center gap-2">
        <Select
          value={relationshipTypeId}
          onValueChange={(nextRelationshipTypeId) => {
            void handleRelationshipTypeChange(nextRelationshipTypeId);
          }}
          disabled={snapshot.relationshipTypes.length === 0}
        >
          <SelectTrigger
            aria-label="Relationship type"
            className="h-8 min-w-48 bg-card/95 font-sans text-xs normal-case shadow-sm backdrop-blur"
            size="sm"
          >
            <SelectValue placeholder="Relationship type" />
          </SelectTrigger>
          <SelectContent className="font-sans">
            <SelectGroup>
              {snapshot.relationshipTypes.map((type) => (
                <SelectItem
                  key={type.id}
                  value={type.id}
                  className="font-sans normal-case"
                >
                  {type.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1 border-l border-border/70 pl-2">
          <StageToolbarButton
            label="Save layout"
            disabled={nodes.length === 0}
            onClick={() => void saveCurrentLayout()}
          >
            <Save data-icon="inline-start" />
          </StageToolbarButton>
          <StageToolbarButton
            label="Arrange left to right"
            disabled={isLayouting || nodes.length === 0}
            onClick={() => void autoArrange("LR")}
          >
            <ArrowRight data-icon="inline-start" />
          </StageToolbarButton>
          <StageToolbarButton
            label="Arrange top to bottom"
            disabled={isLayouting || nodes.length === 0}
            onClick={() => void autoArrange("TB")}
          >
            <ArrowDown data-icon="inline-start" />
          </StageToolbarButton>
          <StageToolbarButton
            label="Arrange bottom to top"
            disabled={isLayouting || nodes.length === 0}
            onClick={() => void autoArrange("BT")}
          >
            <ArrowUp data-icon="inline-start" />
          </StageToolbarButton>
          <StageToolbarButton
            label="Arrange radial"
            disabled={isLayouting || nodes.length === 0}
            onClick={() => void autoArrange("RADIAL")}
          >
            <CircleDot data-icon="inline-start" />
          </StageToolbarButton>
        </div>
      </div>
      <ReactFlow
        className="domain-map-flow"
        connectionLineType={ConnectionLineType.Straight}
        connectionLineStyle={{
          stroke: "color-mix(in oklch, var(--primary) 72%, transparent)",
          strokeLinecap: "round",
          strokeWidth: 1.45,
        }}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        edges={collapsedGraph.edges}
        edgeTypes={edgeTypes}
        edgesFocusable
        fitView
        fitViewOptions={{ maxZoom: 1.1, padding: 0.28 }}
        maxZoom={2.25}
        minZoom={0.2}
        nodes={collapsedGraph.nodes}
        nodeTypes={nodeTypes}
        nodesConnectable={Boolean(relationshipTypeId)}
        nodesDraggable
        nodesFocusable
        deleteKeyCode={null}
        onConnect={(connection) => {
          void createConnection(connection);
        }}
        onEdgeClick={(event, edge) => {
          event.stopPropagation();
          setSelectedGraphItem({
            kind: "edge",
            label: String(edge.label ?? edge.data?.label ?? "Relationship"),
            mapRelationshipId: edge.data?.mapRelationshipId ?? edge.id,
          });
          onInspectRecord({
            classKey: "relationship",
            id: edge.data?.relationshipId ?? edge.id,
          });
        }}
        onEdgesChange={onEdgesChange}
        onNodeClick={(event, node) => {
          event.stopPropagation();
          setSelectedGraphItem({
            kind: "node",
            label: node.data.label,
            nodeId: node.data.nodeId,
            objectId: node.data.objectId,
          });
          onInspectRecord({
            classKey: "subject",
            id: node.data.objectId,
          });
        }}
        onNodeDragStop={(_, node) => {
          void saveLayoutNodes([node], "Node position was not saved.");
        }}
        onNodeDoubleClick={(event, node) => {
          event.stopPropagation();
          setCollapsedAnchorIds((current) => {
            const next = new Set(current);

            if (next.has(node.id)) {
              next.delete(node.id);
            } else {
              next.add(node.id);
            }

            return next;
          });
        }}
        onNodesChange={onNodesChange}
        onPaneClick={() => {
          setSelectedGraphItem(null);
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
        <Controls
          className="domain-map-controls"
          position="top-right"
          showInteractive
          style={{ top: "50%", transform: "translateY(-50%)" }}
        >
          <ControlButton
            aria-label="Focus 1 hop"
            aria-pressed={
              activeFocus?.hopLimit === 1 &&
              selectedGraphItem?.kind === "node" &&
              activeFocus.objectId === selectedGraphItem.objectId
            }
            disabled={!selectedGraphItem || selectedGraphItem.kind !== "node"}
            onClick={() => focusSelectedNode(1)}
            title="Focus 1 hop"
            type="button"
          >
            <Focus />
          </ControlButton>
          <ControlButton
            aria-label="Focus 2 hops"
            aria-pressed={
              activeFocus?.hopLimit === 2 &&
              selectedGraphItem?.kind === "node" &&
              activeFocus.objectId === selectedGraphItem.objectId
            }
            disabled={!selectedGraphItem || selectedGraphItem.kind !== "node"}
            onClick={() => focusSelectedNode(2)}
            title="Focus 2 hops"
            type="button"
          >
            <Network />
          </ControlButton>
          <ControlButton
            aria-label="Clear focus"
            disabled={!activeFocus}
            onClick={clearFocus}
            title="Clear focus"
            type="button"
          >
            <X />
          </ControlButton>
          <ControlButton
            aria-label="Remove selected"
            disabled={!selectedGraphItem}
            onClick={() => void removeSelectedGraphItem()}
            title={
              selectedGraphItem
                ? `Remove ${selectedGraphItem.label}`
                : "Remove selected"
            }
            type="button"
          >
            <Trash2 />
          </ControlButton>
        </Controls>
      </ReactFlow>

      {nodes.length === 0 ? (
        <Empty className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-none border-0 text-muted-foreground">
          <EmptyHeader>
            <EmptyTitle>No nodes on this map</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : null}
    </div>
  );
}

function DomainMapNode({ data, selected }: NodeProps<DomainFlowNode>) {
  return (
    <div className={cn("domain-map-node", selected && "is-selected")}>
      <Handle
        className="domain-map-node-handle"
        position={Position.Top}
        style={{
          left: "50%",
          top: `${nodeDotCenterY}px`,
          transform: "translate(-50%, -50%)",
        }}
        type="target"
      />
      <Handle
        className="domain-map-node-handle"
        position={Position.Top}
        style={{
          left: "50%",
          top: `${nodeDotCenterY}px`,
          transform: "translate(-50%, -50%)",
        }}
        type="source"
      />
      <span className="domain-map-node-dot" />
      {data.collapsedCount > 0 ? (
        <span
          aria-label={`${data.collapsedCount} collapsed`}
          className="domain-map-node-collapse-count"
          title={`${data.collapsedCount} collapsed`}
        >
          {data.collapsedCount}
        </span>
      ) : null}
      <span className="domain-map-node-label">{data.label}</span>
      <span className="domain-map-node-type">
        {data.typeLabel ?? data.objectClassKey}
      </span>
    </div>
  );
}

function StageToolbarButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick?: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          disabled={disabled}
          aria-label={label}
          onClick={onClick}
          className="bg-card/95 shadow-sm backdrop-blur"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function CenteredDomainMapEdge(props: EdgeProps<DomainFlowEdge>) {
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
    style,
  } = props;
  const sourceNode = useInternalNode<DomainFlowNode>(props.source);
  const targetNode = useInternalNode<DomainFlowNode>(props.target);
  const sourceWidth =
    sourceNode?.measured.width ?? sourceNode?.width ?? nodeWidth;
  const targetWidth =
    targetNode?.measured.width ?? targetNode?.width ?? nodeWidth;
  const sourceX = sourceNode
    ? sourceNode.internals.positionAbsolute.x + sourceWidth / 2
    : props.sourceX;
  const sourceY = sourceNode
    ? sourceNode.internals.positionAbsolute.y + nodeDotCenterY
    : props.sourceY;
  const targetX = targetNode
    ? targetNode.internals.positionAbsolute.x + targetWidth / 2
    : props.targetX;
  const targetY = targetNode
    ? targetNode.internals.positionAbsolute.y + nodeDotCenterY
    : props.targetY;
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

function buildFlowNodes(nodes: DomainMapNodeView[]): DomainFlowNode[] {
  return nodes.map((node) => ({
    id: node.objectId,
    type: "domainMapNode",
    position: node.position,
    data: {
      collapsedCount: 0,
      label: node.label,
      nodeId: node.id,
      objectClassKey: node.objectClassKey,
      objectId: node.objectId,
      typeLabel: node.typeLabel,
    },
  }));
}

function collapseGraphForAnchors(
  nodes: DomainFlowNode[],
  edges: DomainFlowEdge[],
  collapsedAnchorIds: Set<string>
) {
  if (collapsedAnchorIds.size === 0) {
    return {
      edges: edges.map((edge) => ({ ...edge, hidden: edge.hidden ?? false })),
      nodes: nodes.map((node) => ({
        ...node,
        hidden: node.hidden ?? false,
        data: {
          ...node.data,
          collapsedCount: 0,
        },
      })),
    };
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  const childNodeIdsByParentId = visualChildNodeIdsByParent(nodes, edges);
  const collapsedNodeIdsByAnchorId = new Map<string, Set<string>>();
  const hiddenNodeIds = new Set<string>();

  collapsedAnchorIds.forEach((anchorId) => {
    if (!nodeIds.has(anchorId)) {
      return;
    }

    collapsedNodeIdsByAnchorId.set(
      anchorId,
      descendantNodeIdsForAnchor(anchorId, childNodeIdsByParentId)
    );
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
      if (
        !collapsedAnchorIds.has(nodeId) ||
        nestedCollapsedAnchorIds.has(nodeId)
      ) {
        hiddenNodeIds.add(nodeId);
      }
    });
  });

  return {
    edges: edges.map((edge) => ({
      ...edge,
      hidden:
        Boolean(edge.hidden) ||
        hiddenNodeIds.has(edge.source) ||
        hiddenNodeIds.has(edge.target),
    })),
    nodes: nodes.map((node) => ({
      ...node,
      hidden: Boolean(node.hidden) || hiddenNodeIds.has(node.id),
      data: {
        ...node.data,
        collapsedCount: collapsedNodeIdsByAnchorId.get(node.id)?.size ?? 0,
      },
    })),
  };
}

function visualChildNodeIdsByParent(
  nodes: DomainFlowNode[],
  edges: DomainFlowEdge[]
) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const childNodeIds = new Map<string, string[]>();

  edges.forEach((edge) => {
    const endpoints = visualEdgeEndpoints(edge);

    if (
      !nodeIds.has(endpoints.source) ||
      !nodeIds.has(endpoints.target) ||
      endpoints.source === endpoints.target
    ) {
      return;
    }

    const existing = childNodeIds.get(endpoints.source) ?? [];

    existing.push(endpoints.target);
    childNodeIds.set(endpoints.source, existing);
  });

  return childNodeIds;
}

function descendantNodeIdsForAnchor(
  anchorId: string,
  outgoingNodeIdsBySourceId: Map<string, string[]>
) {
  const descendantNodeIds = new Set<string>();
  const pendingNodeIds = [...(outgoingNodeIdsBySourceId.get(anchorId) ?? [])];

  while (pendingNodeIds.length > 0) {
    const nodeId = pendingNodeIds.shift();

    if (!nodeId || nodeId === anchorId || descendantNodeIds.has(nodeId)) {
      continue;
    }

    descendantNodeIds.add(nodeId);
    pendingNodeIds.push(...(outgoingNodeIdsBySourceId.get(nodeId) ?? []));
  }

  return descendantNodeIds;
}

function buildFlowEdges(
  relationships: DomainMapRelationshipView[],
  nodes: DomainMapNodeView[]
): DomainFlowEdge[] {
  const visibleNodeIds = new Set(nodes.map((node) => node.objectId));

  return relationships
    .filter(
      (relationship) =>
        visibleNodeIds.has(relationship.sourceObjectId) &&
        visibleNodeIds.has(relationship.targetObjectId)
    )
    .map((relationship) => ({
      id: relationship.relationshipId,
      type: "domainMapEdge",
      source: relationship.sourceObjectId,
      target: relationship.targetObjectId,
      label: relationship.typeLabel ?? relationship.label,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: "color-mix(in oklch, var(--primary) 70%, transparent)",
      },
      style: {
        stroke: "color-mix(in oklch, var(--primary) 58%, transparent)",
        strokeWidth: 1.35,
      },
      data: {
        label: relationship.label,
        mapRelationshipId: relationship.id,
        relationshipId: relationship.relationshipId,
        typeLabel: relationship.typeLabel,
      },
      labelBgBorderRadius: 6,
      labelBgPadding: [6, 4],
      labelBgStyle: edgeLabelBgStyle,
      labelShowBg: true,
      labelStyle: edgeLabelStyle,
    }));
}

async function readDomainMapPayload(response: Response) {
  const payload = (await response.json()) as DomainMapApiPayload;

  if (!response.ok) {
    throw new Error(payload.error ?? "Domain Map request failed.");
  }

  return payload;
}

async function loadElk() {
  elkInstance ??= new ELK();

  return elkInstance;
}

function elkLayoutProfile(mode: GraphLayoutMode): ElkLayoutProfile {
  if (mode === "RADIAL") {
    return {
      mode,
      layoutOptions: {
        "elk.algorithm": "radial",
        "elk.radial.compactor": "WEDGE_COMPACTION",
        "elk.separateConnectedComponents": "true",
        "elk.spacing.nodeNode": "100",
      },
    };
  }

  return {
    mode,
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": mode === "LR" ? "RIGHT" : mode === "BT" ? "UP" : "DOWN",
      "elk.edgeRouting": "POLYLINE",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.spacing.edgeNodeBetweenLayers": "56",
      "elk.layered.spacing.nodeNodeBetweenLayers": "132",
      "elk.spacing.nodeNode": "88",
    },
  };
}

async function layoutGraphWithElk(
  nodes: DomainFlowNode[],
  edges: DomainFlowEdge[],
  profile: ElkLayoutProfile
) {
  if (profile.mode === "RADIAL") {
    return layoutGraphRadially(nodes, edges);
  }

  const elk = await loadElk();
  const nodeIds = new Set(nodes.map((node) => node.id));
  const elkGraph: ElkNode = {
    id: "root",
    layoutOptions: profile.layoutOptions,
    children: nodes.map((node) => ({
      id: node.id,
      width: node.measured?.width ?? node.width ?? nodeWidth,
      height: node.measured?.height ?? node.height ?? nodeHeight,
    })),
    edges: edges
      .filter(
        (edge) =>
          nodeIds.has(edge.source) &&
          nodeIds.has(edge.target) &&
          edge.source !== edge.target
      )
      .map((edge): ElkExtendedEdge => {
        const endpoints = visualEdgeEndpoints(edge);

        return {
          id: edge.id,
          sources: [endpoints.source],
          targets: [endpoints.target],
        };
      }),
  };

  const layoutedGraph = await elk.layout(elkGraph);
  const positionByNodeId = new Map(
    (layoutedGraph.children ?? []).map(
      (node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }] as const
    )
  );

  return nodes.map((node) => ({
    ...node,
    position: positionByNodeId.get(node.id) ?? node.position,
  }));
}

function layoutGraphRadially(nodes: DomainFlowNode[], edges: DomainFlowEdge[]) {
  if (nodes.length <= 1) {
    return nodes.map((node) => ({
      ...node,
      position: { x: 0, y: 0 },
    }));
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  const visualEdges = edges
    .map(visualEdgeEndpoints)
    .filter(
      (edge) =>
        nodeIds.has(edge.source) &&
        nodeIds.has(edge.target) &&
        edge.source !== edge.target
    );
  const degreeByNodeId = new Map(nodes.map((node) => [node.id, 0]));

  for (const edge of visualEdges) {
    degreeByNodeId.set(edge.source, (degreeByNodeId.get(edge.source) ?? 0) + 1);
    degreeByNodeId.set(edge.target, (degreeByNodeId.get(edge.target) ?? 0) + 1);
  }

  const sortedNodes = [...nodes].sort((left, right) => {
    const degreeDelta =
      (degreeByNodeId.get(right.id) ?? 0) - (degreeByNodeId.get(left.id) ?? 0);

    if (degreeDelta !== 0) {
      return degreeDelta;
    }

    return left.data.label.localeCompare(right.data.label);
  });
  const centerNode = sortedNodes[0];

  if (!centerNode) {
    return nodes;
  }

  const ringNodes = sortedNodes
    .slice(1)
    .sort((left, right) => left.data.label.localeCompare(right.data.label));
  const radius = Math.max(
    240,
    (ringNodes.length * (nodeWidth + 56)) / (Math.PI * 2)
  );
  const positionByNodeId = new Map<string, { x: number; y: number }>();
  const centerSize = nodeSize(centerNode);

  positionByNodeId.set(centerNode.id, {
    x: -centerSize.width / 2,
    y: -centerSize.height / 2,
  });

  ringNodes.forEach((node, index) => {
    const angle = -Math.PI / 2 + (index / ringNodes.length) * Math.PI * 2;
    const size = nodeSize(node);

    positionByNodeId.set(node.id, {
      x: Math.cos(angle) * radius - size.width / 2,
      y: Math.sin(angle) * radius - size.height / 2,
    });
  });

  applyRadialForceLayout(nodes, visualEdges, positionByNodeId, centerNode.id);

  return nodes.map((node) => ({
    ...node,
    position: positionByNodeId.get(node.id) ?? node.position,
  }));
}

function applyRadialForceLayout(
  nodes: DomainFlowNode[],
  edges: Array<{ source: string; target: string }>,
  positionByNodeId: Map<string, { x: number; y: number }>,
  centerNodeId: string
) {
  const childIdsByParentId = new Map<string, Set<string>>();

  edges.forEach((edge) => {
    const existing = childIdsByParentId.get(edge.source) ?? new Set<string>();

    existing.add(edge.target);
    childIdsByParentId.set(edge.source, existing);
  });

  const forceNodes: RadialForceNode[] = nodes.map((node) => {
    const position = positionByNodeId.get(node.id) ?? node.position;
    const size = nodeSize(node);
    const radius = Math.max(size.width, size.height) / 2 + 38;

    return {
      height: size.height,
      id: node.id,
      radius,
      width: size.width,
      x: position.x + size.width / 2,
      y: position.y + size.height / 2,
      ...(node.id === centerNodeId ? { fx: 0, fy: 0 } : {}),
    };
  });
  const nodeById = new Map(forceNodes.map((node) => [node.id, node]));
  const forceLinks: RadialForceLink[] = edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
  }));

  const simulation = forceSimulation<RadialForceNode>(forceNodes)
    .stop()
    .force("center", forceCenter(0, 0).strength(0.025))
    .force(
      "charge",
      forceManyBody<RadialForceNode>().strength((node) =>
        childIdsByParentId.has(node.id) ? -980 : -560
      )
    )
    .force(
      "collide",
      forceCollide<RadialForceNode>()
        .radius((node) => node.radius)
        .strength(0.92)
        .iterations(3)
    )
    .force(
      "link",
      forceLink<RadialForceNode, RadialForceLink>(forceLinks)
        .id((node) => node.id)
        .distance((link) =>
          radialLinkDistance(link, centerNodeId, childIdsByParentId)
        )
        .strength((link) =>
          isLinkFromCenter(link, centerNodeId) ? 0.42 : 0.68
        )
    )
    .force(
      "cluster",
      clusterSeparationForce(childIdsByParentId, centerNodeId)
    );

  for (let tick = 0; tick < 260; tick += 1) {
    simulation.tick();
  }

  forceNodes.forEach((forceNode) => {
    const sourceNode = nodeById.get(forceNode.id);
    const width = sourceNode?.width ?? forceNode.width;
    const height = sourceNode?.height ?? forceNode.height;

    positionByNodeId.set(forceNode.id, {
      x: (forceNode.x ?? 0) - width / 2,
      y: (forceNode.y ?? 0) - height / 2,
    });
  });
}

function radialLinkDistance(
  link: RadialForceLink,
  centerNodeId: string,
  childIdsByParentId: Map<string, Set<string>>
) {
  const sourceId = forceNodeId(link.source);
  const targetId = forceNodeId(link.target);

  if (sourceId === centerNodeId) {
    return childIdsByParentId.has(targetId) ? 420 : 300;
  }

  return childIdsByParentId.has(targetId) ? 260 : 205;
}

function isLinkFromCenter(link: RadialForceLink, centerNodeId: string) {
  return forceNodeId(link.source) === centerNodeId;
}

function forceNodeId(node: string | number | RadialForceNode) {
  return typeof node === "object" ? node.id : String(node);
}

function clusterSeparationForce(
  childIdsByParentId: Map<string, Set<string>>,
  centerNodeId: string
): Force<RadialForceNode, undefined> {
  let forceNodes: RadialForceNode[] = [];
  let nodeById = new Map<string, RadialForceNode>();
  const clusterParentIds = [...childIdsByParentId.keys()];
  const memberIdsByParentId = new Map(
    clusterParentIds.map((parentId) => [
      parentId,
      new Set([parentId, ...(childIdsByParentId.get(parentId) ?? [])]),
    ])
  );
  const radiusByParentId = new Map(
    clusterParentIds.map((parentId) => {
      const childCount = childIdsByParentId.get(parentId)?.size ?? 0;

      return [parentId, 170 + Math.sqrt(childCount) * 105] as const;
    })
  );

  const force: Force<RadialForceNode, undefined> = (alpha) => {
    for (
      let leftIndex = 0;
      leftIndex < clusterParentIds.length;
      leftIndex += 1
    ) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < clusterParentIds.length;
        rightIndex += 1
      ) {
        pushClusterPairApart(
          nodeById.get(clusterParentIds[leftIndex]),
          nodeById.get(clusterParentIds[rightIndex]),
          (radiusByParentId.get(clusterParentIds[leftIndex]) ?? 0) +
            (radiusByParentId.get(clusterParentIds[rightIndex]) ?? 0),
          alpha
        );
      }
    }

    clusterParentIds.forEach((parentId) => {
      const parentNode = nodeById.get(parentId);
      const memberIds = memberIdsByParentId.get(parentId);
      const clusterRadius = radiusByParentId.get(parentId) ?? 0;

      if (!parentNode || !memberIds) {
        return;
      }

      forceNodes.forEach((node) => {
        if (memberIds.has(node.id)) {
          return;
        }

        pushNodeOutsideCluster(parentNode, node, clusterRadius, alpha);
      });
    });
  };

  force.initialize = (nextNodes) => {
    forceNodes = nextNodes;
    nodeById = new Map(nextNodes.map((node) => [node.id, node]));
  };

  return force;
}

function pushClusterPairApart(
  left: RadialForceNode | undefined,
  right: RadialForceNode | undefined,
  minimumDistance: number,
  alpha: number
) {
  if (!left || !right || left.id === right.id) {
    return;
  }

  const dx = (right.x ?? 0) - (left.x ?? 0) || 1;
  const dy = (right.y ?? 0) - (left.y ?? 0) || 1;
  const distance = Math.max(Math.sqrt(dx * dx + dy * dy), 1);

  if (distance >= minimumDistance) {
    return;
  }

  const strength = ((minimumDistance - distance) / distance) * alpha * 0.42;
  const fx = dx * strength;
  const fy = dy * strength;

  if (!isFixedForceNode(left)) {
    left.vx = (left.vx ?? 0) - fx;
    left.vy = (left.vy ?? 0) - fy;
  }
  if (!isFixedForceNode(right)) {
    right.vx = (right.vx ?? 0) + fx;
    right.vy = (right.vy ?? 0) + fy;
  }
}

function pushNodeOutsideCluster(
  parentNode: RadialForceNode,
  node: RadialForceNode,
  clusterRadius: number,
  alpha: number
) {
  const dx = (node.x ?? 0) - (parentNode.x ?? 0) || 1;
  const dy = (node.y ?? 0) - (parentNode.y ?? 0) || 1;
  const distance = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
  const minimumDistance = clusterRadius + node.radius;

  if (distance >= minimumDistance) {
    return;
  }

  const strength = ((minimumDistance - distance) / distance) * alpha * 0.34;

  node.vx = (node.vx ?? 0) + dx * strength;
  node.vy = (node.vy ?? 0) + dy * strength;
}

function isFixedForceNode(node: RadialForceNode) {
  return typeof node.fx === "number" && typeof node.fy === "number";
}

function nodeSize(node: DomainFlowNode) {
  return {
    height: node.measured?.height ?? node.height ?? nodeHeight,
    width: node.measured?.width ?? node.width ?? nodeWidth,
  };
}

function visualEdgeEndpoints(edge: DomainFlowEdge) {
  if (isChildToParentEdgeType(flowEdgeType(edge))) {
    return {
      source: edge.target,
      target: edge.source,
    };
  }

  return {
    source: edge.source,
    target: edge.target,
  };
}

function flowEdgeType(edge: DomainFlowEdge) {
  return normalizeEdgeType(edge.data?.typeLabel ?? String(edge.label ?? ""));
}

function isChildToParentEdgeType(edgeType: string) {
  return [
    "classifiedas",
    "isa",
    "operationof",
    "orbits",
    "partof",
    "phaseof",
    "principleof",
    "stepin",
  ].includes(edgeType);
}


function normalizeEdgeType(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function objectIdsWithinHops(
  startObjectId: string,
  hopLimit: 1 | 2,
  edges: DomainFlowEdge[]
) {
  const adjacentObjectIds = new Map<string, Set<string>>();

  for (const edge of edges) {
    if (edge.source === edge.target) {
      continue;
    }

    addAdjacentObjectId(adjacentObjectIds, edge.source, edge.target);
    addAdjacentObjectId(adjacentObjectIds, edge.target, edge.source);
  }

  const visibleObjectIds = new Set([startObjectId]);
  let frontier = new Set([startObjectId]);

  for (let hop = 0; hop < hopLimit; hop += 1) {
    const nextFrontier = new Set<string>();

    for (const objectId of frontier) {
      for (const neighborId of adjacentObjectIds.get(objectId) ?? []) {
        if (!visibleObjectIds.has(neighborId)) {
          visibleObjectIds.add(neighborId);
          nextFrontier.add(neighborId);
        }
      }
    }

    frontier = nextFrontier;
  }

  return visibleObjectIds;
}

function addAdjacentObjectId(
  adjacentObjectIds: Map<string, Set<string>>,
  objectId: string,
  neighborId: string
) {
  const existing = adjacentObjectIds.get(objectId);

  if (existing) {
    existing.add(neighborId);
    return;
  }

  adjacentObjectIds.set(objectId, new Set([neighborId]));
}

function hasShelfDragItem(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.types).includes(shelfDragDataType);
}

function parseShelfDragItem(dataTransfer: DataTransfer): ShelfDragItem | null {
  const encoded = dataTransfer.getData(shelfDragDataType);

  if (!encoded) {
    return null;
  }

  try {
    const candidate = JSON.parse(encoded) as Partial<ShelfDragItem>;

    if (
      (candidate.classKey === "subject" ||
        candidate.classKey === "relationship") &&
      typeof candidate.id === "string" &&
      typeof candidate.title === "string"
    ) {
      return {
        classKey: candidate.classKey,
        id: candidate.id,
        title: candidate.title,
      };
    }
  } catch {
    return null;
  }

  return null;
}

function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

function layoutFailureMessage(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);

  return detail ? `ELK layout failed: ${detail}` : "ELK layout failed.";
}
