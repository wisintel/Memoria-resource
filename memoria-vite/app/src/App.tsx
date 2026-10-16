import { LoaderCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { GraphStage } from "@/features/graph/GraphStage";
import {
  useCreateDomain,
  useCreateEdge,
  useCreateItem,
  useCreateView,
  useDeleteDomain,
  useDeleteEdge,
  useDeleteItem,
  useDeleteView,
  useGraph,
  useResetWorkbench,
  useRunDomainContext,
  useSaveItemPositions,
  useUpdateDomain,
  useUpdateEdge,
  useUpdateItem,
  useUpdateView
} from "@/features/graph/useGraph";
import {
  DocumentInspector,
  Inspector
} from "@/features/inspector/Inspector";
import { DocumentsStage } from "@/features/intake/DocumentsStage";
import {
  useAssignShelfFolderItem,
  useCreateShelfFolder,
  useDeleteDocument,
  useDeleteShelfFolder,
  useDocuments,
  useImportDocument,
  useImportDocumentFile,
  useSaveDocumentDetails,
  useUpdateShelfFolder
} from "@/features/intake/useDocuments";
import { PipelineInspector } from "@/features/pipeline/PipelineInspector";
import { PipelineShelf } from "@/features/pipeline/PipelineShelf";
import { PipelineStage } from "@/features/pipeline/PipelineStage";
import type { PipelineToolKey } from "@/features/pipeline/PipelineShelf";
import {
  DOMAIN_CONTEXT_PROMPT,
  type DomainContextStats
} from "@/features/pipeline/domainContext";
import {
  applyWorkbenchScratch,
  isWorkbenchView,
  itemIdFromWorkbenchViewItemId,
  selectedRecord,
  summarizeSelectedDetails,
  type WorkbenchScratchState
} from "@/features/workbench/workbench";
import {
  fileToBase64,
  isHtmlDocumentFile,
  isImportableDocument,
  isPdfDocumentFile,
  mimeTypeForSource,
  titleFromFileName
} from "@/lib/document-files";
import { queryKeys } from "@/lib/query-keys";
import {
  buildCreateEdgeInput,
  buildCreateItemInput,
  buildUpdateEdgeInput,
  buildUpdateItemInput,
  defaultTypeForItemClass,
  emptyInspectorForm,
  formFromDocument,
  formFromDetails,
  selectedDomainValue,
  serializeListInput,
  type InspectorEditInput
} from "@/lib/record-form";
import { classLabel } from "@/lib/semantic-display";
import { typeOptionsForItemTable } from "@/lib/type-options";
import { useCodexModels } from "@/lib/use-codex-models";
import {
  DEFAULT_WORKBENCH_MODEL,
  FALLBACK_WORKBENCH_MODEL_OPTIONS,
  normalizeWorkbenchModel
} from "@/lib/workbench-models";
import { AppShell } from "@/shell/AppShell";
import { AssistantComposer } from "@/shell/AssistantComposer";
import { LeftRail, type WorkspaceMode } from "@/shell/LeftRail";
import { defaultClassForMode, Shelf } from "@/shell/Shelf";
import { RecordFormDialog } from "@/shell/forms/RecordFormDialog";
import {
  createDistillationRun,
  createPrompt as createStoredPrompt,
  createPromptVersion as createStoredPromptVersion,
  loadDistillationRun,
  loadDistillationSnapshot,
  loadPromptSnapshot,
  resetDistillationRun,
  resolveAdmissionSubject,
  runDistillationStage,
  setActivePromptVersion as setActiveStoredPromptVersion,
  updateAppContext,
} from "./api";
import type {
  GraphSnapshot,
  DocumentRecord,
  DistillationSnapshot,
  DistillationStageKey,
  PromptSnapshot,
  SelectedRecord
} from "./types";

type PendingRelationship = {
  sourceId: string;
  targetId: string;
};
type RecordFormState = {
  id?: string;
  itemTable: string;
  mode: "create" | "edit";
  prefill?: Partial<InspectorEditInput>;
};
type PipelineRunActivity = {
  label: string;
  startedAt: number;
  title: string;
};

const NO_DOMAIN_ID = "__no_domain__";

export default function App() {
  const [activeMode, setActiveMode] = useState<WorkspaceMode>("documents");
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [domainFilterId, setDomainFilterId] = useState<string | null>(null);
  const [distillationState, setDistillationState] = useState<DistillationSnapshot | null>(null);
  const [selectedPipelineDocumentId, setSelectedPipelineDocumentId] = useState<string | null>(null);
  const [selectedPipelineRunId, setSelectedPipelineRunId] = useState<string | null>(null);
  const [selectedPipelineStage, setSelectedPipelineStage] = useState<PipelineToolKey>("domain_context");
  const [selectedPipelineSubjectId, setSelectedPipelineSubjectId] = useState<string | null>(null);
  const [workbenchModel, setWorkbenchModel] = useState(DEFAULT_WORKBENCH_MODEL);
  const [domainContextOutput, setDomainContextOutput] = useState("");
  const [domainContextPrompt, setDomainContextPrompt] = useState(DOMAIN_CONTEXT_PROMPT);
  const [domainContextRunError, setDomainContextRunError] = useState<string | null>(null);
  const [domainPromptSnapshot, setDomainPromptSnapshot] = useState<PromptSnapshot | null>(null);
  const [selectedDomainPromptId, setSelectedDomainPromptId] = useState<string | null>(null);
  const [selectedDomainPromptVersionId, setSelectedDomainPromptVersionId] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedRecord>(null);
  const [recordForm, setRecordForm] = useState<RecordFormState | null>(null);
  const [selectedShelfClass, setSelectedShelfClass] = useState("");
  const [draggingRecord, setDraggingRecord] = useState<SelectedRecord>(null);
  const [positionDrafts, setPositionDrafts] = useState<Record<string, { x: number; y: number }>>({});
  const [workbenchScratch, setWorkbenchScratch] = useState<WorkbenchScratchState>({ edgeIds: [], items: {} });
  const [pendingRelationship, setPendingRelationship] = useState<PendingRelationship | null>(null);
  const [pendingRelationshipError, setPendingRelationshipError] = useState<string | null>(null);
  const [pipelineRunActivity, setPipelineRunActivity] = useState<PipelineRunActivity | null>(null);
  const [isManuallyBusy, setIsBusy] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const queryClient = useQueryClient();
  const activeGraphParams = useMemo(
    () => ({ domainId: domainFilterId, viewId: activeViewId }),
    [activeViewId, domainFilterId]
  );
  const graphKey = queryKeys.graph(activeGraphParams);
  const graphQuery = useGraph(activeGraphParams);
  const snapshot = graphQuery.data ?? null;
  const createDomainMutation = useCreateDomain();
  const updateDomainMutation = useUpdateDomain();
  const deleteDomainMutation = useDeleteDomain();
  const createViewMutation = useCreateView();
  const updateViewMutation = useUpdateView();
  const deleteViewMutation = useDeleteView();
  const createItemMutation = useCreateItem(activeGraphParams);
  const updateItemMutation = useUpdateItem(activeGraphParams);
  const deleteItemMutation = useDeleteItem(activeGraphParams);
  const createEdgeMutation = useCreateEdge(activeGraphParams);
  const updateEdgeMutation = useUpdateEdge(activeGraphParams);
  const deleteEdgeMutation = useDeleteEdge(activeGraphParams);
  const saveItemPositionsMutation = useSaveItemPositions(activeGraphParams);
  const resetWorkbenchMutation = useResetWorkbench(activeGraphParams);
  const runDomainContextMutation = useRunDomainContext(activeGraphParams);
  const { data: codexModels } = useCodexModels();
  const documentsQuery = useDocuments();
  const importDocumentMutation = useImportDocument();
  const importDocumentFileMutation = useImportDocumentFile();
  const deleteDocumentMutation = useDeleteDocument();
  const createShelfFolderMutation = useCreateShelfFolder();
  const updateShelfFolderMutation = useUpdateShelfFolder();
  const deleteShelfFolderMutation = useDeleteShelfFolder();
  const assignShelfFolderItemMutation = useAssignShelfFolderItem();
  const saveDocumentDetailsMutation = useSaveDocumentDetails();
  const documentWorkbench = documentsQuery.data ?? null;
  const isDocumentBusy =
    documentsQuery.isFetching ||
    importDocumentMutation.isPending ||
    importDocumentFileMutation.isPending ||
    deleteDocumentMutation.isPending ||
    createShelfFolderMutation.isPending ||
    updateShelfFolderMutation.isPending ||
    deleteShelfFolderMutation.isPending ||
    assignShelfFolderItemMutation.isPending ||
    saveDocumentDetailsMutation.isPending;
  const isBusy = isManuallyBusy || isDocumentBusy || graphQuery.isFetching;
  const modelOptions = codexModels?.models?.length ? codexModels.models : FALLBACK_WORKBENCH_MODEL_OPTIONS;
  const selectedModel = normalizeWorkbenchModel(workbenchModel, modelOptions);

  function writeGraphSnapshot(nextSnapshot: GraphSnapshot) {
    queryClient.setQueryData(graphKey, nextSnapshot);
  }

  function writeActiveGraphSnapshot(nextSnapshot: GraphSnapshot) {
    const nextViewId = nextSnapshot.activeView?.id ?? null;
    const nextDomainId = nextSnapshot.activeDomain?.id ?? NO_DOMAIN_ID;

    queryClient.setQueryData(queryKeys.graph({ domainId: nextDomainId, viewId: nextViewId }), nextSnapshot);
    setActiveViewId(nextViewId);
    setDomainFilterId(nextDomainId);
  }

  useEffect(() => {
    document.documentElement.classList.add("dark");

    return () => {
      document.documentElement.classList.remove("dark");
    };
  }, []);

  useEffect(() => {
    if (activeMode !== "pipeline" || distillationState) {
      return;
    }

    void loadPipelineState();
  }, [activeMode, distillationState]);

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    if (domainFilterId === null) {
      setDomainFilterId(snapshot.activeDomain?.id ?? NO_DOMAIN_ID);
    }

    if (activeViewId === null && snapshot.activeView?.id) {
      setActiveViewId(snapshot.activeView.id);
    }
  }, [activeViewId, domainFilterId, snapshot]);

  const shelfClasses = useMemo(
    () => snapshot?.itemClasses ?? [],
    [snapshot?.itemClasses]
  );
  const shelfClassCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    if (!snapshot) {
      return counts;
    }

    const activeDomainId = snapshot.activeDomain?.id ?? null;

    shelfClasses.forEach((itemClass) => {
      if (itemClass.name === "types") {
        counts[itemClass.name] = snapshot.types.filter((type) => !type.domain_id || type.domain_id === activeDomainId).length;
        return;
      }

      if (itemClass.name === "edges") {
        counts[itemClass.name] = snapshot.edges.length;
        return;
      }

      if (itemClass.name === "nodes") {
        counts[itemClass.name] = snapshot.items.filter((item) => !["claims", "documents", "domains", "edges", "prompts", "types"].includes(item.item_table)).length;
        return;
      }

      counts[itemClass.name] = snapshot.items.filter((item) => item.item_table === itemClass.name).length;
    });

    return counts;
  }, [shelfClasses, snapshot]);
  const modeDefaultShelfClass = defaultClassForMode(activeMode);
  const defaultShelfClass = shelfClasses.some((itemClass) => itemClass.name === modeDefaultShelfClass)
    ? modeDefaultShelfClass
    : shelfClasses[0]?.name ?? "";
  const activeShelfClass =
    selectedShelfClass && shelfClasses.some((itemClass) => itemClass.name === selectedShelfClass)
      ? selectedShelfClass
      : defaultShelfClass;
  const isWorkbenchActive = isWorkbenchView(snapshot?.activeView ?? null);
  const stageSnapshot = useMemo(
    () => (snapshot ? applyWorkbenchScratch(snapshot, workbenchScratch) : null),
    [snapshot, workbenchScratch]
  );
  const shelfRows = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    if (activeShelfClass === "types") {
      const activeDomainId = snapshot.activeDomain?.id ?? null;

      return snapshot.types
        .filter((type) => !type.domain_id || type.domain_id === activeDomainId)
        .map((type) => ({
          aliases: "[]",
          body_sha256: null,
          claim_text: null,
          content_sha256: null,
          created: type.created,
          description: "",
          domain_id: type.domain_id,
          extraction_stage: null,
          id: type.id,
          intake_profile: null,
          item_table: "types",
          label: type.label,
          last_updated: "",
          normalized: type.slug,
          role: classLabel(type.item_table),
          size_bytes: null,
          source: null,
          source_id: null,
          tags: "[]",
          target_id: null,
          type: type.item_table,
          type_id: type.id,
          updated: type.updated
        }));
    }

    if (activeShelfClass === "edges") {
      const edgeItemsById = new Map(snapshot.items.filter((item) => item.item_table === "edges").map((item) => [item.id, item]));

      return snapshot.edges.map((edge) => ({
        ...(edgeItemsById.get(edge.id) ?? {
          aliases: "[]",
          body_sha256: null,
          claim_text: null,
          content_sha256: null,
          description: "",
          extraction_stage: null,
          intake_profile: null,
          item_table: "edges",
          last_updated: "",
          normalized: "",
          role: "",
          size_bytes: null,
          tags: "[]"
        }),
        ...edge,
        item_table: "edges"
      }));
    }

    return snapshot.items.filter((item) => {
      const matchesClass =
        activeShelfClass === "nodes"
          ? !["claims", "documents", "domains", "edges", "prompts", "types"].includes(item.item_table)
          : item.item_table === activeShelfClass;

      return matchesClass;
    });
  }, [activeShelfClass, snapshot]);
  const placedShelfIds = useMemo(() => {
    const placed = new Set<string>();

    stageSnapshot?.viewItems.forEach((item) => placed.add(item.item_id));
    stageSnapshot?.viewEdges.forEach((edge) => placed.add(edge.edge_id));

    return placed;
  }, [stageSnapshot?.viewEdges, stageSnapshot?.viewItems]);
  const mappedDocumentIds = useMemo(() => {
    const mapped = new Set<string>();

    documentWorkbench?.documents.forEach((document) => {
      if (document.extraction_stage === "mapped") {
        mapped.add(document.id);
      }
    });

    return mapped;
  }, [documentWorkbench?.documents]);
  const selectedShelfId =
    selected?.id ?? null;
  const selectedDocumentId =
    activeMode === "documents" && activeShelfClass === "documents" && selected?.kind === "item"
      ? selected.id
      : null;
  const selectedDocument = useMemo(
    () => documentWorkbench?.documents.find((document) => document.id === selectedDocumentId) ?? null,
    [documentWorkbench?.documents, selectedDocumentId]
  );
  useEffect(() => {
    if (activeMode !== "documents" || activeShelfClass !== "documents" || !documentWorkbench) {
      return;
    }

    if (selected?.kind === "item" && documentWorkbench.documents.some((document) => document.id === selected.id)) {
      return;
    }

    setSelected(documentWorkbench.documents[0] ? { kind: "item", id: documentWorkbench.documents[0].id } : null);
  }, [activeMode, activeShelfClass, documentWorkbench, selected]);
  const pipelineDocuments = documentWorkbench?.documents ?? distillationState?.documents ?? [];
  const selectedPipelineDocument = useMemo(
    () => pipelineDocuments.find((document) => document.id === selectedPipelineDocumentId) ?? null,
    [pipelineDocuments, selectedPipelineDocumentId]
  );
  const selectedPipelineRun = distillationState?.selectedRun?.run.id === selectedPipelineRunId
    ? distillationState.selectedRun
    : null;
  const domainContextStats = useMemo<DomainContextStats>(
    () => ({
      claim_count: snapshot?.items.filter((item) => item.item_table === "claims").length ?? 0,
      document_count: pipelineDocuments.length,
      relationship_count: snapshot?.edges.length ?? 0,
      subject_count: snapshot?.items.filter((item) => item.item_table === "nodes").length ?? 0,
      type_count: snapshot?.types.length ?? 0
    }),
    [pipelineDocuments.length, snapshot?.edges, snapshot?.items, snapshot?.types]
  );
  const selectedPipelineSubjectPackage = useMemo(
    () =>
      selectedPipelineRun?.subjectPackages.find((candidatePackage) => candidatePackage.localSubjectId === selectedPipelineSubjectId) ??
      null,
    [selectedPipelineRun?.subjectPackages, selectedPipelineSubjectId]
  );
  const admissionSubjects = useMemo(
    () => snapshot?.items.filter((item) => item.item_table === "nodes") ?? [],
    [snapshot?.items]
  );
  const selectedDocumentShards = selectedDocument
    ? (documentWorkbench?.shardsByDocumentId[selectedDocument.id] ?? [])
    : [];
  const selectedDetails = useMemo(() => selectedRecord(stageSnapshot, selected), [selected, stageSnapshot]);
  const recordFormInitialValue = useMemo(() => {
    const activeDomainId = snapshot?.activeDomain?.id ?? null;

    if (!recordForm) {
      return emptyInspectorForm(activeDomainId);
    }

    if (recordForm.mode === "create") {
      return {
        ...emptyInspectorForm(activeDomainId),
        domainId: activeDomainId ?? NO_DOMAIN_ID,
        label: recordForm.itemTable === "claims" ? "Claim" : "",
        type: defaultTypeForItemClass(recordForm.itemTable),
        ...recordForm.prefill
      };
    }

    if (recordForm.itemTable === "documents") {
      const document = documentWorkbench?.documents.find((candidate) => candidate.id === recordForm.id) ?? null;

      return document ? formFromDocument(document) : emptyInspectorForm(activeDomainId);
    }

    const details =
      recordForm.id && snapshot
        ? selectedRecord(snapshot, { kind: recordForm.itemTable === "edges" ? "edge" : "item", id: recordForm.id })
        : null;

    return details ? formFromDetails(details, activeDomainId) : emptyInspectorForm(activeDomainId);
  }, [documentWorkbench?.documents, recordForm, snapshot]);
  const recordFormReferenceItems = useMemo(() => {
    if (!recordForm || !snapshot) {
      return [];
    }

    if (recordForm.itemTable === "claims") {
      return snapshot.items.filter((item) => item.item_table !== "claims" && item.item_table !== "edges");
    }

    if (recordForm.itemTable === "edges") {
      return snapshot.items.filter((item) => item.item_table !== "edges");
    }

    return [];
  }, [recordForm, snapshot]);
  const relationshipTypeOptions = useMemo(
    () => typeOptionsForItemTable(snapshot?.types ?? [], "edges", "classified as"),
    [snapshot?.types]
  );
  const pendingRelationshipLabels = useMemo(() => {
    if (!pendingRelationship || !snapshot) {
      return null;
    }

    return {
      source: snapshot.items.find((item) => item.id === pendingRelationship.sourceId)?.label ?? "Source",
      target: snapshot.items.find((item) => item.id === pendingRelationship.targetId)?.label ?? "Target"
    };
  }, [pendingRelationship, snapshot]);
  const activeDomainFilterId = domainFilterId ?? snapshot?.activeDomain?.id ?? NO_DOMAIN_ID;
  const writableDomainId = snapshot?.activeDomain?.id ?? snapshot?.activeView?.domain_id ?? null;
  useEffect(() => {
    const activeDomain = snapshot?.activeDomain ?? null;
    const lastRun = activeDomain?.domain_context_last_run ?? null;

    setDomainContextPrompt(lastRun?.prompt || DOMAIN_CONTEXT_PROMPT);
    setDomainContextOutput(lastRun?.profile || "");
    setDomainContextRunError(null);
  }, [snapshot?.activeDomain]);
  useEffect(() => {
    if (!snapshot?.activeDomain?.id) {
      setDomainPromptSnapshot(null);
      setSelectedDomainPromptId(null);
      setSelectedDomainPromptVersionId(null);
      return;
    }

    void loadDomainContextPromptLibrary(snapshot.activeDomain.id);
  }, [snapshot?.activeDomain?.id]);
  const appContextPacket = useMemo(
    () => ({
      active_domain: snapshot?.activeDomain
        ? {
            id: snapshot.activeDomain.id,
            label: snapshot.activeDomain.label,
            slug: snapshot.activeDomain.slug
          }
        : null,
      active_mode: activeMode,
      active_view: snapshot?.activeView
        ? {
            id: snapshot.activeView.id,
            label: snapshot.activeView.label
          }
        : null,
      document_count: documentWorkbench?.documents.length ?? null,
      generated_at: new Date().toISOString(),
      selected_document: selectedDocument
        ? {
            id: selectedDocument.id,
            label: selectedDocument.label,
            shard_count: selectedDocument.shard_count,
            source_filename: selectedDocument.source_filename,
            source_type: selectedDocument.source_type,
            status: selectedDocument.status,
            extraction_stage: selectedDocument.extraction_stage,
            type: selectedDocument.type
          }
        : null,
      selected_record: selectedDetails ? summarizeSelectedDetails(selectedDetails) : null,
      shelf: {
        active_class: activeShelfClass || null,
        row_count: shelfRows.length,
        selected_id: selectedShelfId
      }
    }),
    [
      activeMode,
      activeShelfClass,
      documentWorkbench?.documents.length,
      selectedDetails,
      selectedDocument,
      selectedShelfId,
      shelfRows.length,
      snapshot?.activeDomain,
      snapshot?.activeView
    ]
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      updateAppContext(appContextPacket).catch((error) => {
        console.error(error);
      });
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [appContextPacket]);

  function changeDomain(domainId: string) {
    setDomainFilterId(domainId);
    setActiveViewId(null);
    setSelected(null);
    setPositionDrafts({});
    setWorkbenchScratch({ edgeIds: [], items: {} });
    setDistillationState(null);
    setSelectedPipelineDocumentId(null);
    setSelectedPipelineRunId(null);
  }

  function changeView(viewId: string) {
    setActiveViewId(viewId);
    setSelected(null);
    setPositionDrafts({});
  }

  async function addDomain(input: { label: string; slug?: string | null }) {
    setIsBusy(true);
    try {
      const nextSnapshot = await createDomainMutation.mutateAsync(input);
      writeActiveGraphSnapshot(nextSnapshot);
      setSelected(null);
      setSelectedShelfClass("");
      setPositionDrafts({});
    } finally {
      setIsBusy(false);
    }
  }

  async function renameDomain(domainId: string, input: { label: string; slug?: string | null }) {
    setIsBusy(true);
    try {
      const nextSnapshot = await updateDomainMutation.mutateAsync({ id: domainId, input });
      writeActiveGraphSnapshot(nextSnapshot);
      setSelected(null);
      setPositionDrafts({});
    } finally {
      setIsBusy(false);
    }
  }

  async function removeDomain(domainId: string) {
    setIsBusy(true);
    try {
      const nextSnapshot = await deleteDomainMutation.mutateAsync(domainId);
      writeActiveGraphSnapshot(nextSnapshot);
      setSelected(null);
      setSelectedShelfClass("");
      setPositionDrafts({});
    } finally {
      setIsBusy(false);
    }
  }

  async function addView(input: { copyFromActive?: boolean; label: string }) {
    const activeView = snapshot?.activeView ?? null;
    const domainId = input.copyFromActive ? activeView?.domain_id ?? writableDomainId : writableDomainId;
    const saveWorkbenchScratch = input.copyFromActive && isWorkbenchActive;

    const updates = Object.entries(positionDrafts).map(([id, position]) => ({
      id,
      ...position
    }));

    setIsBusy(true);
    try {
      const nextSnapshot = await createViewMutation.mutateAsync({
        copy_from_view_id: input.copyFromActive && !saveWorkbenchScratch ? activeView?.id ?? null : null,
        description: null,
        domain_filter_id: activeDomainFilterId,
        domain_id: domainId,
        label: input.label,
        placement_edges: saveWorkbenchScratch ? workbenchScratch.edgeIds.map((edgeId) => ({ edge_id: edgeId })) : [],
        placement_items: saveWorkbenchScratch
          ? Object.entries(workbenchScratch.items).map(([itemId, position]) => ({
              item_id: itemId,
              ...position
            }))
          : [],
        position_updates: input.copyFromActive && !saveWorkbenchScratch ? updates : []
      });
      writeActiveGraphSnapshot(nextSnapshot);
      setSelected(null);
      setPositionDrafts({});
      if (saveWorkbenchScratch) {
        setWorkbenchScratch({ edgeIds: [], items: {} });
      }
    } finally {
      setIsBusy(false);
    }
  }

  async function clearWorkbench() {
    setIsBusy(true);
    try {
      const nextSnapshot = await resetWorkbenchMutation.mutateAsync(activeDomainFilterId);
      writeActiveGraphSnapshot(nextSnapshot);
      setWorkbenchScratch({ edgeIds: [], items: {} });
      setPositionDrafts({});
      setSelected(null);
    } finally {
      setIsBusy(false);
    }
  }

  async function renameView(viewId: string, input: { label: string }) {
    setIsBusy(true);
    try {
      const nextSnapshot = await updateViewMutation.mutateAsync({
        id: viewId,
        input: {
        description: snapshot?.activeView?.description ?? null,
        label: input.label
        }
      });
      writeActiveGraphSnapshot(nextSnapshot);
      setSelected(null);
      setPositionDrafts({});
    } finally {
      setIsBusy(false);
    }
  }

  async function removeView(viewId: string) {
    setIsBusy(true);
    try {
      const nextSnapshot = await deleteViewMutation.mutateAsync(viewId);
      writeActiveGraphSnapshot(nextSnapshot);
      setSelected(null);
      setPositionDrafts({});
    } finally {
      setIsBusy(false);
    }
  }

  function changeMode(mode: WorkspaceMode) {
    setActiveMode(mode);
    setSelected(null);
    setSelectedShelfClass("");

    if (mode === "pipeline" && !distillationState) {
      void loadPipelineState();
    }
  }

  async function loadPipelineState(input: { documentId?: string | null; domainId?: string | null; runId?: string | null } = {}) {
    setIsBusy(true);
    try {
      const nextState = await loadDistillationSnapshot({
        ...input,
        domainId: input.domainId ?? activeDomainFilterId
      });
      setDistillationState(nextState);
      setSelectedPipelineDocumentId(nextState.selectedDocumentId);
      setSelectedPipelineRunId(nextState.selectedRunId);
    } finally {
      setIsBusy(false);
    }
  }

  async function selectPipelineDocument(documentId: string | null) {
    setSelectedPipelineDocumentId(documentId);
    setSelectedPipelineRunId(null);
    setSelectedPipelineSubjectId(null);
    await loadPipelineState({ documentId });
  }

  async function selectPipelineRun(runId: string | null) {
    setSelectedPipelineRunId(runId);
    setSelectedPipelineSubjectId(null);

    if (!runId) {
      return;
    }

    setIsBusy(true);
    try {
      const detail = await loadDistillationRun(runId);
      setDistillationState((current) =>
        current
          ? {
              ...current,
              selectedRun: detail,
              selectedRunId: detail.run.id
            }
          : current
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function addDistillationRun() {
    if (!selectedPipelineDocumentId) {
      return;
    }

    setIsBusy(true);
    try {
      const detail = await createDistillationRun({
        document_id: selectedPipelineDocumentId,
        domain_id: writableDomainId
      });
      await loadPipelineState({ documentId: selectedPipelineDocumentId, runId: detail.run.id });
    } finally {
      setIsBusy(false);
    }
  }

  async function runPipelineStage(stage: DistillationStageKey) {
    if (!selectedPipelineRunId) {
      return;
    }

    setSelectedPipelineStage(stage);
    setPipelineRunActivity({
      label: stageDisplayLabel(stage),
      startedAt: Date.now(),
      title: "Running tool"
    });
    setIsBusy(true);
    try {
      const detail = await runDistillationStage(selectedPipelineRunId, stage);
      await loadPipelineState({ documentId: detail.run.document_id, runId: detail.run.id });
    } finally {
      setPipelineRunActivity(null);
      setIsBusy(false);
    }
  }

  async function resetPipelineRun() {
    if (!selectedPipelineRunId) {
      return;
    }

    setIsBusy(true);
    try {
      const detail = await resetDistillationRun(selectedPipelineRunId);
      setSelectedPipelineSubjectId(null);
      await loadPipelineState({ documentId: detail.run.document_id, runId: detail.run.id });
    } finally {
      setIsBusy(false);
    }
  }

  async function resolvePipelineSubjectPackage(
    localSubjectId: string,
    disposition: "admit" | "merge" | "reject",
    targetSubjectId?: string | null
  ) {
    if (!selectedPipelineRunId) {
      return;
    }

    setIsBusy(true);
    try {
      await resolveAdmissionSubject({
        disposition,
        local_subject_id: localSubjectId,
        run_id: selectedPipelineRunId,
        target_subject_id: targetSubjectId ?? null
      });
      await loadPipelineState({ documentId: selectedPipelineDocumentId, runId: selectedPipelineRunId });
      await queryClient.invalidateQueries({ queryKey: graphKey });
    } finally {
      setIsBusy(false);
    }
  }

  async function saveDomainContextProfile(profile: string) {
    const activeDomain = snapshot?.activeDomain;

    if (!activeDomain) {
      return;
    }

    setIsBusy(true);
    try {
      const nextSnapshot = await updateDomainMutation.mutateAsync({
        id: activeDomain.id,
        input: {
          domain_context_profile: profile,
          label: activeDomain.label,
          slug: activeDomain.slug
        }
      });
      setDomainContextRunError(null);
      writeActiveGraphSnapshot(nextSnapshot);
    } finally {
      setIsBusy(false);
    }
  }

  function refreshDomainContextOutput() {
    setDomainContextOutput("");
    setDomainContextRunError(null);
  }

  async function loadDomainContextPromptLibrary(domainId: string) {
    const promptState = await loadPromptSnapshot({ domainId, toolKey: "domain_context" });
    applyDomainPromptSnapshot(promptState);
  }

  function applyDomainPromptSnapshot(promptState: PromptSnapshot) {
    const selectedVersion =
      promptState.versions.find((version) => version.id === promptState.selectedVersionId) ??
      promptState.versions[0] ??
      null;

    setDomainPromptSnapshot(promptState);
    setSelectedDomainPromptId(selectedVersion?.prompt_id ?? promptState.selectedPromptId);
    setSelectedDomainPromptVersionId(selectedVersion?.id ?? promptState.selectedVersionId);

    if (selectedVersion?.body) {
      setDomainContextPrompt(selectedVersion.body);
    }
  }

  function selectDomainPrompt(promptId: string | null) {
    if (!promptId || !domainPromptSnapshot) {
      setSelectedDomainPromptId(null);
      setSelectedDomainPromptVersionId(null);
      return;
    }

    const activeVersionId = domainPromptSnapshot.activeBinding?.active_prompt_version_id ?? null;
    const selectedVersion =
      domainPromptSnapshot.versions.find((version) => version.prompt_id === promptId && version.id === activeVersionId) ??
      domainPromptSnapshot.versions.find((version) => version.prompt_id === promptId) ??
      null;

    setSelectedDomainPromptId(promptId);
    setSelectedDomainPromptVersionId(selectedVersion?.id ?? null);

    if (selectedVersion) {
      setDomainContextPrompt(selectedVersion.body);
    }
  }

  function selectDomainPromptVersion(versionId: string | null) {
    const selectedVersion = domainPromptSnapshot?.versions.find((version) => version.id === versionId) ?? null;

    setSelectedDomainPromptVersionId(selectedVersion?.id ?? null);

    if (selectedVersion) {
      setSelectedDomainPromptId(selectedVersion.prompt_id);
      setDomainContextPrompt(selectedVersion.body);
    }
  }

  async function addDomainContextPrompt(label: string) {
    const activeDomain = snapshot?.activeDomain;

    if (!activeDomain) {
      return;
    }

    setIsBusy(true);
    try {
      const promptState = await createStoredPrompt({
        body: domainContextPrompt,
        domain_id: activeDomain.id,
        label,
        set_active: true,
        tool_key: "domain_context"
      });
      applyDomainPromptSnapshot(promptState);
    } finally {
      setIsBusy(false);
    }
  }

  async function saveDomainContextPromptVersion() {
    if (!selectedDomainPromptId) {
      return;
    }

    setIsBusy(true);
    try {
      const promptState = await createStoredPromptVersion(selectedDomainPromptId, {
        body: domainContextPrompt,
        set_active: true
      });
      applyDomainPromptSnapshot(promptState);
    } finally {
      setIsBusy(false);
    }
  }

  async function activateDomainContextPromptVersion() {
    if (!selectedDomainPromptVersionId) {
      return;
    }

    setIsBusy(true);
    try {
      const promptState = await setActiveStoredPromptVersion({
        prompt_version_id: selectedDomainPromptVersionId
      });
      applyDomainPromptSnapshot(promptState);
    } finally {
      setIsBusy(false);
    }
  }

  async function runDomainContextProfile(input: { model: string; prompt: string; prompt_version_id?: string | null }) {
    const activeDomain = snapshot?.activeDomain;

    if (!activeDomain) {
      return;
    }

    setDomainContextRunError(null);
    setPipelineRunActivity({
      label: "Domain Context",
      startedAt: Date.now(),
      title: "Running tool"
    });
    setIsBusy(true);
    try {
      const nextSnapshot = await runDomainContextMutation.mutateAsync({ id: activeDomain.id, input });
      const nextDomain = nextSnapshot.activeDomain;
      const generatedProfile = nextDomain?.domain_context_last_run?.profile;

      if (generatedProfile) {
        setDomainContextOutput(generatedProfile);
      }

      writeGraphSnapshot(nextSnapshot);
    } catch (error) {
      setDomainContextRunError(error instanceof Error ? error.message : "Domain context run failed.");
    } finally {
      setPipelineRunActivity(null);
      setIsBusy(false);
    }
  }

  async function importSourceDocument(input: {
    content: string;
    label: string;
    mime_type?: string | null;
    source_filename?: string | null;
    source_type: "html" | "markdown";
  }) {
    const nextWorkbench = await importDocumentMutation.mutateAsync({
      ...input,
      domain_id: writableDomainId
    });

    setSelected(nextWorkbench.documentId ? { kind: "item", id: nextWorkbench.documentId } : null);
    await queryClient.invalidateQueries({ queryKey: graphKey });

    return nextWorkbench.deduped;
  }

  async function importSourceDocumentFile(input: {
    data_base64: string;
    label: string;
    mime_type?: string | null;
    source_filename?: string | null;
    source_type?: "html" | "markdown";
  }) {
    const nextWorkbench = await importDocumentFileMutation.mutateAsync({
      ...input,
      domain_id: writableDomainId
    });

    setSelected(nextWorkbench.documentId ? { kind: "item", id: nextWorkbench.documentId } : null);
    await queryClient.invalidateQueries({ queryKey: graphKey });

    return nextWorkbench.deduped;
  }

  async function importSourceFile(file: File) {
    if (!isImportableDocument(file)) {
      throw new Error("Only Markdown, HTML, and PDF files can be imported.");
    }

    if (isPdfDocumentFile(file)) {
      return importSourceDocumentFile({
        data_base64: await fileToBase64(file),
        label: titleFromFileName(file.name),
        mime_type: file.type || "application/pdf",
        source_filename: file.name
      });
    }

    const sourceType = isHtmlDocumentFile(file) ? "html" : "markdown";

    return importSourceDocument({
      content: await file.text(),
      label: titleFromFileName(file.name),
      mime_type: file.type || mimeTypeForSource(sourceType),
      source_filename: file.name,
      source_type: sourceType
    });
  }

  function selectShelfRecord(selection: SelectedRecord) {
    if (!selection) {
      setSelected(null);
      return;
    }

    setSelected(selection);
  }

  function openCreateRecordForm(itemTable: string, prefill?: Partial<InspectorEditInput>) {
    if (!["claims", "edges", "nodes"].includes(itemTable)) {
      return;
    }

    setRecordForm({ mode: "create", itemTable, prefill });
  }

  function openEditRecordForm(itemTable: string, id: string) {
    if (!["claims", "documents", "edges", "nodes"].includes(itemTable)) {
      return;
    }

    setRecordForm({ mode: "edit", itemTable, id });
  }

  async function addCard(input: { itemTable: string; label: string; type: string; source: string | null }) {
    setIsBusy(true);
    try {
      const nextSnapshot = await createItemMutation.mutateAsync({
        domain_id: writableDomainId,
        item_table: input.itemTable,
        label: input.label,
        source: input.source,
        type: input.type
      });
      writeGraphSnapshot(nextSnapshot);
      setSelected(null);
      setSelectedShelfClass(input.itemTable);
    } finally {
      setIsBusy(false);
    }
  }

  async function submitRecordForm(input: InspectorEditInput) {
    if (!recordForm || !snapshot || isBusy) {
      return;
    }

    if (recordForm.itemTable === "documents") {
      const document = recordForm.id
        ? documentWorkbench?.documents.find((candidate) => candidate.id === recordForm.id) ?? null
        : null;

      if (recordForm.mode !== "edit" || !document || !input.label.trim() || !input.type.trim()) {
        return;
      }

      await saveDocumentDetails(document, input);
      setRecordForm(null);
      return;
    }

    if (recordForm.itemTable === "edges") {
      if (!input.sourceId || !input.targetId || !input.type.trim()) {
        return;
      }

      const viewId = isWorkbenchActive ? null : snapshot.activeView?.id ?? null;

      setIsBusy(true);
      try {
        if (recordForm.mode === "create") {
          const previousEdgeIds = new Set(snapshot.edges.map((edge) => edge.id));
          const nextSnapshot = await createEdgeMutation.mutateAsync(
            buildCreateEdgeInput(input, {
              domainFilterId: activeDomainFilterId,
              viewId
            })
          );
          const createdEdge = nextSnapshot.edges.find((edge) => !previousEdgeIds.has(edge.id)) ?? null;

          writeGraphSnapshot(nextSnapshot);
          if (isWorkbenchActive && createdEdge) {
            placeWorkbenchEdge(createdEdge.id);
          }
          setSelected(createdEdge ? { kind: "edge", id: createdEdge.id } : null);
        } else if (recordForm.id) {
          const nextSnapshot = await updateEdgeMutation.mutateAsync({
            id: recordForm.id,
            input: buildUpdateEdgeInput(input, {
              domainFilterId: activeDomainFilterId,
              viewId: snapshot.activeView?.id ?? null
            })
          });

          writeGraphSnapshot(nextSnapshot);
          setSelected({ kind: "edge", id: recordForm.id });
        }

        setSelectedShelfClass("edges");
        setRecordForm(null);
      } finally {
        setIsBusy(false);
      }
      return;
    }

    if (!["claims", "nodes"].includes(recordForm.itemTable)) {
      return;
    }

    if (!input.type.trim() || (recordForm.itemTable === "nodes" && !input.label.trim())) {
      return;
    }

    if (recordForm.itemTable === "claims" && (!input.targetId || !input.claimText?.trim())) {
      return;
    }

    setIsBusy(true);
    try {
      if (recordForm.mode === "create") {
        const previousItemIds = new Set(snapshot.items.map((item) => item.id));
        const viewId = recordForm.itemTable === "nodes" && isWorkbenchActive ? null : snapshot.activeView?.id ?? null;
        const nextSnapshot = await createItemMutation.mutateAsync(
          buildCreateItemInput(input, {
            domainFilterId: activeDomainFilterId,
            itemTable: recordForm.itemTable,
            viewId
          })
        );
        const createdItem =
          nextSnapshot.items.find((item) => !previousItemIds.has(item.id)) ??
          nextSnapshot.items.find((item) => item.item_table === recordForm.itemTable && item.label === input.label);

        writeGraphSnapshot(nextSnapshot);
        if (recordForm.itemTable === "nodes" && isWorkbenchActive && createdItem) {
          placeWorkbenchItem(createdItem.id, { x: 0, y: 0 });
        }
        setSelected(createdItem ? { kind: "item", id: createdItem.id } : null);
      } else if (recordForm.id) {
        const nextSnapshot = await updateItemMutation.mutateAsync({
          id: recordForm.id,
          input: buildUpdateItemInput(input, {
            domainFilterId: activeDomainFilterId,
            viewId: snapshot.activeView?.id ?? null
          })
        });

        writeGraphSnapshot(nextSnapshot);

        if (selectedDomainValue(input.domainId) !== snapshot.activeDomain?.id) {
          setSelected(null);
        } else {
          setSelected({ kind: "item", id: recordForm.id });
        }
      } else {
        return;
      }

      setSelectedShelfClass(recordForm.itemTable);
      setRecordForm(null);
    } finally {
      setIsBusy(false);
    }
  }

  async function saveLayout() {
    const layoutViewId = activeViewId ?? snapshot?.activeView?.id ?? null;
    const updates = Object.entries(positionDrafts).map(([id, position]) => ({
      id,
      ...position
    }));

    if (!layoutViewId || updates.length === 0 || isBusy) {
      return;
    }

    setIsBusy(true);
    try {
      const nextSnapshot = await saveItemPositionsMutation.mutateAsync({
        domain_filter_id: activeDomainFilterId,
        updates,
        view_id: layoutViewId
      });
      writeGraphSnapshot(nextSnapshot);
      setPositionDrafts({});
    } finally {
      setIsBusy(false);
    }
  }

  function placeWorkbenchItem(itemId: string, position: { x: number; y: number }) {
    setWorkbenchScratch((current) => ({
      ...current,
      items: {
        ...current.items,
        [itemId]: position
      }
    }));
  }

  function placeWorkbenchEdge(edgeId: string) {
    setWorkbenchScratch((current) =>
      current.edgeIds.includes(edgeId)
        ? current
        : {
            ...current,
            edgeIds: [...current.edgeIds, edgeId]
          }
    );
  }

  function removeWorkbenchItems(itemIds: string[]) {
    setWorkbenchScratch((current) => {
      const items = { ...current.items };

      itemIds.forEach((itemId) => {
        delete items[itemId];
      });

      const remainingItemIds = new Set(Object.keys(items));
      const edgeIds = current.edgeIds.filter((edgeId) => {
        const edge = snapshot?.edges.find((candidate) => candidate.id === edgeId);

        return edge ? remainingItemIds.has(edge.source_id) && remainingItemIds.has(edge.target_id) : false;
      });

      return { edgeIds, items };
    });
  }

  function removeWorkbenchEdges(edgeIds: string[]) {
    setWorkbenchScratch((current) => ({
      ...current,
      edgeIds: current.edgeIds.filter((edgeId) => !edgeIds.includes(edgeId))
    }));
  }

  function updateWorkbenchPosition(viewItemId: string, position: { x: number; y: number }) {
    const itemId = itemIdFromWorkbenchViewItemId(viewItemId);

    if (!itemId) {
      return;
    }

    placeWorkbenchItem(itemId, position);
  }

  async function createPendingRelationship(type: string) {
    if (!pendingRelationship || !snapshot || isBusy) {
      return;
    }

    const activeViewId = snapshot.activeView?.id ?? null;

    if (!isWorkbenchActive && !activeViewId) {
      return;
    }

    const previousEdgeIds = new Set(snapshot.edges.map((edge) => edge.id));
    const previousViewEdgeIds = new Set(snapshot.viewEdges.map((edge) => edge.view_edge_id));

    setIsBusy(true);
    setPendingRelationshipError(null);
    try {
      const nextSnapshot = await createEdgeMutation.mutateAsync({
        domain_filter_id: activeDomainFilterId,
        domain_id: snapshot.activeDomain?.id ?? null,
        source_id: pendingRelationship.sourceId,
        target_id: pendingRelationship.targetId,
        type,
        view_id: isWorkbenchActive ? null : activeViewId
      });

      writeGraphSnapshot(nextSnapshot);
      setPendingRelationship(null);

      if (isWorkbenchActive) {
        const nextEdge = nextSnapshot.edges.find((edge) => !previousEdgeIds.has(edge.id));

        if (nextEdge) {
          placeWorkbenchEdge(nextEdge.id);
          setSelected({ kind: "edge", id: nextEdge.id });
        }
      } else {
        const nextEdge = nextSnapshot.viewEdges.find((edge) => !previousViewEdgeIds.has(edge.view_edge_id));

        setSelected(nextEdge ? { kind: "edge", id: nextEdge.edge_id } : null);
      }
    } catch (error) {
      setPendingRelationshipError(error instanceof Error ? error.message : "Relationship could not be created.");
    } finally {
      setIsBusy(false);
    }
  }

  async function saveDocumentDetails(document: DocumentRecord, input: InspectorEditInput) {
    if (!snapshot || isBusy) {
      return;
    }

    const nextSnapshot = await saveDocumentDetailsMutation.mutateAsync({
      id: document.id,
      input: {
        aliases: serializeListInput(input.aliases),
        description: input.description,
        domain_id: selectedDomainValue(input.domainId),
        domain_filter_id: activeDomainFilterId,
        extraction_stage: input.extractionStage,
        intake_profile: input.intakeProfile,
        label: input.label,
        mime_type: input.mimeType,
        source: input.source,
        source_filename: input.sourceFilename,
        source_url: input.sourceUrl,
        type: input.type,
        view_id: snapshot.activeView?.id ?? null
      }
    });

    writeGraphSnapshot(nextSnapshot);
    setSelected({ kind: "item", id: document.id });
  }

  async function removeSourceDocumentById(documentId: string) {
    if (!snapshot || isBusy) {
      return;
    }

    const nextWorkbench = await deleteDocumentMutation.mutateAsync(documentId);
    setSelected((current) =>
      current?.id && current.id !== documentId && nextWorkbench.documents.some((candidate) => candidate.id === current.id)
        ? current
        : nextWorkbench.documents[0]
          ? { kind: "item", id: nextWorkbench.documents[0].id }
          : null
    );
    await queryClient.invalidateQueries({ queryKey: graphKey });
  }

  async function addDocumentShelfFolder(input: { label: string }) {
    return createShelfFolderMutation.mutateAsync({ label: input.label, scope: "documents" });
  }

  async function setDocumentShelfFolderCollapsed(folderId: string, collapsed: boolean) {
    await updateShelfFolderMutation.mutateAsync({ id: folderId, input: { collapsed, scope: "documents" } });
  }

  async function removeDocumentShelfFolder(folderId: string) {
    await deleteShelfFolderMutation.mutateAsync(folderId);
  }

  async function moveDocumentToShelfFolder(folderId: string, documentId: string) {
    await assignShelfFolderItemMutation.mutateAsync({
      folder_id: folderId,
      item_id: documentId,
      scope: "documents"
    });
  }

  async function removeGraphSelection(selection: Exclude<SelectedRecord, null>) {
    if (!snapshot || isBusy) {
      return;
    }

    const details = selectedRecord(stageSnapshot, selection);

    if (!details) {
      return;
    }

    setIsBusy(true);
    try {
      const nextSnapshot =
        details.kind === "item"
          ? await deleteItemMutation.mutateAsync({
              domainId: snapshot.activeDomain?.id ?? NO_DOMAIN_ID,
              id: details.id,
              viewId: snapshot.activeView?.id ?? null
            })
          : await deleteEdgeMutation.mutateAsync({
              domainId: snapshot.activeDomain?.id ?? NO_DOMAIN_ID,
              id: details.id,
              viewId: snapshot.activeView?.id ?? null
            });

      writeGraphSnapshot(nextSnapshot);
      setSelected(null);
    } finally {
      setIsBusy(false);
    }
  }

  const rail = <LeftRail activeMode={activeMode} onModeChange={changeMode} />;
  const shelf =
    activeMode === "pipeline" ? (
      <PipelineShelf
        activeDomain={snapshot?.activeDomain ?? null}
        domains={snapshot?.domains ?? []}
        isBusy={isBusy}
        activeStage={selectedPipelineStage}
        selectedRun={selectedPipelineRun}
        selectedRunId={selectedPipelineRunId}
        stages={distillationState?.stages ?? []}
        onDomainChange={(domainId) => {
          void changeDomain(domainId);
        }}
        onStageChange={setSelectedPipelineStage}
        onRunStage={(stage) => {
          void runPipelineStage(stage);
        }}
      />
    ) : (
      <Shelf
        activeClass={activeShelfClass}
        activeDomain={snapshot?.activeDomain ?? null}
        classCounts={shelfClassCounts}
        classes={shelfClasses}
        domains={snapshot?.domains ?? []}
        documentPlacedIds={mappedDocumentIds}
        draggingRecord={draggingRecord}
        graphPlacedIds={placedShelfIds}
        isBusy={isBusy}
        rows={shelfRows}
        selectedId={selectedShelfId}
        shelfFolderItems={documentWorkbench?.shelfFolderItems ?? []}
        shelfFolders={documentWorkbench?.shelfFolders ?? []}
        onClassChange={setSelectedShelfClass}
        onCreateDomain={addDomain}
        onCreateCard={addCard}
        onCreateShelfFolder={addDocumentShelfFolder}
        onDeleteDomain={removeDomain}
        onDeleteDocument={removeSourceDocumentById}
        onDeleteGraphSelection={removeGraphSelection}
        onDeleteShelfFolder={removeDocumentShelfFolder}
        onDomainChange={(domainId) => {
          void changeDomain(domainId);
        }}
        onDragStart={setDraggingRecord}
        onDocumentFileImport={importSourceDocumentFile}
        onDocumentImport={importSourceDocument}
        onMoveDocumentToShelfFolder={moveDocumentToShelfFolder}
        onOpenCreateForm={openCreateRecordForm}
        onOpenEditForm={openEditRecordForm}
        onSelect={selectShelfRecord}
        onToggleShelfFolder={setDocumentShelfFolderCollapsed}
        onUpdateDomain={renameDomain}
      />
    );
  const stage =
    activeMode === "graph" ? (
      <>
        {snapshot && stageSnapshot ? (
          <GraphStage
            activeView={snapshot?.activeView ?? null}
            dirtyCount={isWorkbenchActive ? 0 : Object.keys(positionDrafts).length}
            draggingRecord={draggingRecord}
            isBusy={isBusy}
            isWorkbench={isWorkbenchActive}
            itemCount={stageSnapshot?.viewItems.length ?? 0}
            snapshot={stageSnapshot}
            views={snapshot?.views ?? []}
            onClearDrag={() => setDraggingRecord(null)}
            onClearWorkbench={clearWorkbench}
            onCreateView={addView}
            onDeleteView={removeView}
            onRenameView={renameView}
            onSaveLayout={saveLayout}
            onPositionDraft={(viewItemId, position) => {
              if (isWorkbenchActive) {
                updateWorkbenchPosition(viewItemId, position);
                return;
              }

              setPositionDrafts((drafts) => ({
                ...drafts,
                [viewItemId]: position
              }));
            }}
            onRemoveWorkbenchEdges={removeWorkbenchEdges}
            onRemoveWorkbenchItems={removeWorkbenchItems}
            onWorkbenchPlaceEdge={placeWorkbenchEdge}
            onWorkbenchPlaceItem={placeWorkbenchItem}
            onConnectItems={(sourceId, targetId) => {
              setPendingRelationshipError(null);
              setPendingRelationship({ sourceId, targetId });
            }}
            onSelect={setSelected}
            onSnapshot={writeGraphSnapshot}
            onViewChange={(viewId) => {
              void changeView(viewId);
            }}
          />
        ) : (
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center text-sm text-muted-foreground">Loading graph</div>
        )}
      </>
    ) : activeMode === "documents" ? (
      <DocumentsStage
        isBusy={isBusy}
        onImportFile={importSourceFile}
        selectedDocumentId={selectedDocumentId}
        workbench={documentWorkbench}
      />
    ) : (
      <PipelineStage
        activeDomain={snapshot?.activeDomain ?? null}
        domainContextOutput={domainContextOutput}
        domainContextPrompt={domainContextPrompt}
        modelOptions={modelOptions}
        promptSnapshot={domainPromptSnapshot}
        documents={pipelineDocuments}
        isBusy={isBusy}
        runs={distillationState?.runs ?? []}
        selectedDocumentId={selectedPipelineDocumentId}
        selectedDocument={selectedPipelineDocument}
        selectedRun={selectedPipelineRun}
        selectedRunId={selectedPipelineRunId}
        selectedStage={selectedPipelineStage}
        selectedSubjectId={selectedPipelineSubjectId}
        selectedModel={selectedModel}
        onCreateRun={addDistillationRun}
        onDocumentChange={(documentId) => {
          void selectPipelineDocument(documentId);
        }}
        onResetRun={resetPipelineRun}
        onRunChange={(runId) => {
          void selectPipelineRun(runId);
        }}
        onDomainContextOutputChange={setDomainContextOutput}
        onDomainContextPromptChange={setDomainContextPrompt}
        onCreatePrompt={addDomainContextPrompt}
        onPromptChange={selectDomainPrompt}
        onPromptVersionChange={selectDomainPromptVersion}
        onSavePromptVersion={saveDomainContextPromptVersion}
        onSetActivePromptVersion={activateDomainContextPromptVersion}
        onModelChange={setWorkbenchModel}
        onSubjectSelect={setSelectedPipelineSubjectId}
        selectedPromptId={selectedDomainPromptId}
        selectedPromptVersionId={selectedDomainPromptVersionId}
      />
    );
  const inspector =
    activeMode === "pipeline" ? (
      <PipelineInspector
        activeDomain={snapshot?.activeDomain ?? null}
        candidatePackage={selectedPipelineSubjectPackage}
        domainContextModel={selectedModel}
        domainContextOutput={domainContextOutput}
        domainContextPrompt={domainContextPrompt}
        domainContextRunError={domainContextRunError}
        domainContextStats={domainContextStats}
        isBusy={isBusy}
        selectedStage={selectedPipelineStage}
        subjects={admissionSubjects}
        onRefreshDomainContextOutput={refreshDomainContextOutput}
        onRunDomainContext={(input) => {
          void runDomainContextProfile({
            ...input,
            prompt_version_id: selectedDomainPromptVersionId
          });
        }}
        onSaveDomainContext={(profile) => {
          void saveDomainContextProfile(profile);
        }}
        onResolveSubject={(localSubjectId, disposition, targetSubjectId) => {
          void resolvePipelineSubjectPackage(localSubjectId, disposition, targetSubjectId);
        }}
      />
    ) : activeMode === "documents" && activeShelfClass === "documents" ? (
      <DocumentInspector
        document={selectedDocument}
        domains={snapshot?.domains ?? []}
        isLoading={!documentWorkbench}
        shards={selectedDocumentShards}
      />
    ) : (
      <Inspector
        details={selectedDetails}
        domains={snapshot?.domains ?? []}
        isBusy={isBusy}
        onAddRelatedClaim={(targetId) => openCreateRecordForm("claims", { targetId })}
        onAddRelatedRelation={(sourceId) => openCreateRecordForm("edges", { sourceId })}
        onClear={() => setSelected(null)}
      />
    );
  const chrome = (
    <>
      <RecordFormDialog
        domains={snapshot?.domains ?? []}
        initialValue={recordFormInitialValue}
        isBusy={isBusy}
        itemTable={recordForm?.itemTable ?? "nodes"}
        mode={recordForm?.mode ?? "create"}
        open={Boolean(recordForm)}
        referenceItems={recordFormReferenceItems}
        types={snapshot?.types ?? []}
        onClose={() => setRecordForm(null)}
        onSubmit={submitRecordForm}
      />
      <RelationshipTypeDialog
        isBusy={isBusy}
        open={Boolean(pendingRelationship)}
        error={pendingRelationshipError}
        sourceLabel={pendingRelationshipLabels?.source ?? ""}
        targetLabel={pendingRelationshipLabels?.target ?? ""}
        types={relationshipTypeOptions}
        onCancel={() => {
          setPendingRelationship(null);
          setPendingRelationshipError(null);
        }}
        onCreate={(type) => createPendingRelationship(type)}
      />
      <AssistantComposer
        onImportFile={importSourceFile}
      />
      {pipelineRunActivity ? <PipelineRunOverlay activity={pipelineRunActivity} /> : null}
    </>
  );

  return (
    <AppShell
      chrome={chrome}
      inspector={inspector}
      rail={rail}
      shelf={shelf}
      stage={stage}
      stageRef={stageRef}
    />
  );
}

function PipelineRunOverlay({ activity }: { activity: PipelineRunActivity }) {
  const [elapsedMs, setElapsedMs] = useState(() => Date.now() - activity.startedAt);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setElapsedMs(Date.now() - activity.startedAt);
    }, 250);

    return () => window.clearInterval(interval);
  }, [activity.startedAt]);

  return (
    <div className="pipeline-run-overlay" role="status" aria-live="polite">
      <div className="pipeline-run-dialog">
        <LoaderCircle />
        <div>
          <p>{activity.label}</p>
          <h2>{activity.title}</h2>
        </div>
        <time>{formatElapsed(elapsedMs)}</time>
      </div>
    </div>
  );
}

function RelationshipTypeDialog({
  error,
  isBusy,
  open,
  sourceLabel,
  targetLabel,
  types,
  onCancel,
  onCreate
}: {
  error: string | null;
  isBusy: boolean;
  open: boolean;
  sourceLabel: string;
  targetLabel: string;
  types: string[];
  onCancel: () => void;
  onCreate: (type: string) => Promise<void>;
}) {
  const preferredType = types.includes("classified as") ? "classified as" : types[0] ?? "relates to";
  const [selectedType, setSelectedType] = useState(preferredType);

  useEffect(() => {
    if (open) {
      setSelectedType(preferredType);
    }
  }, [open, preferredType]);

  async function submitRelationship(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedType || isBusy) {
      return;
    }

    await onCreate(selectedType);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onCancel();
        }
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Relationship type</DialogTitle>
          <DialogDescription>
            {sourceLabel} {"->"} {targetLabel}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submitRelationship}>
          <Field>
            <FieldLabel>Type</FieldLabel>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {types.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          {error ? <p className="form-error">{error}</p> : null}
          <DialogFooter>
            <Button disabled={isBusy} onClick={onCancel} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={isBusy || !selectedType} type="submit">
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function stageDisplayLabel(stage: DistillationStageKey) {
  return stage
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatElapsed(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
