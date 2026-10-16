"use client";

import {
  createAtlasDocumentShelfFolder,
  moveAtlasDocumentToShelfFolder,
  updateAtlasDocumentShelfFolder,
} from "@/app/atlas/actions";
import {
  FlaskConical,
  FolderOpen,
  Network,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ActiveGraphDrag } from "@/components/atlas/stage/GraphStagePanel";
import {
  Sidebar,
  SidebarContent,
  SidebarProvider,
} from "@/components/ui/sidebar";
import type { ChatContext } from "@/lib/chat-context";
import type {
  ClassRecord,
  ClassTableSamples,
  DocumentRecord,
  DocumentShelfFolderItemRecord,
  DocumentShelfFolderRecord,
  DocumentShardRecord,
  DomainRecord,
  SelectedViewRecords,
  TableRow,
  ViewRecordCounts,
} from "@/lib/supabase/client";

import { AtlasStageContainer } from "../stage/AtlasStageContainer";
import {
  MemoriaComposer,
  type DocumentIntakeActions,
  type DocumentIntakeContext,
  type EntityComposerContext,
} from "../composer/MemoriaComposer";
import { DomainContextSelector } from "./DomainContextSelector";
import { ShellGrid } from "./ShellGrid";
import { UniversalClassInspector } from "../inspector/UniversalClassInspector";
import { UniversalClassShelf } from "../shelf/UniversalClassShelf";

type AtlasMode = {
  id: string;
  title: string;
  Icon: LucideIcon;
};

type AtlasShellFrameProps = {
  chatContext: ChatContext;
  classes: ClassRecord[];
  documents: DocumentRecord[];
  documentShelfFolderItems: DocumentShelfFolderItemRecord[];
  documentShelfFolders: DocumentShelfFolderRecord[];
  documentShardsByDocumentId: Record<string, DocumentShardRecord[]>;
  domains: DomainRecord[];
  domainName: string | null;
  isAllDomainsSelected: boolean;
  selectedDomainId: string | null;
  selectedViewId: string | null;
  selectedViewRecords: SelectedViewRecords;
  tableSamples: ClassTableSamples;
  viewRecordCounts: ViewRecordCounts;
};

const atlasModes: AtlasMode[] = [
  {
    id: "documents",
    title: "Documents",
    Icon: FolderOpen,
  },
  {
    id: "distillation",
    title: "Distillation",
    Icon: FlaskConical,
  },
  {
    id: "graph",
    title: "Graph",
    Icon: Network,
  },
];

const atlasShelfTableNames = new Set([
  "claims",
  "documents",
  "domains",
  "entities",
  "entity_aliases",
  "relationships",
  "statuses",
  "types",
]);

const atlasShelfVisitStorageKey = "atlas:shelf-visited";

const shellClassName =
  "grid-cols-[16rem_minmax(0,1fr)_minmax(336px,22.4vw)] max-shell:grid-rows-[minmax(160px,28svh)_minmax(0,1fr)_auto]";
const shelfClassName =
  "min-h-0 overflow-hidden border-r border-sidebar-border bg-sidebar max-shell:border-r-0 max-shell:border-b";
const stageClassName =
  "relative min-w-0 overflow-hidden bg-background before:pointer-events-none before:absolute before:inset-0 before:z-10 before:content-[''] before:bg-[radial-gradient(100%_88%_at_50%_50%,transparent_62%,rgb(0_0_0_/_32%)_100%)]";
const stageBoxClassName = "absolute inset-0 z-20 min-h-0 overflow-hidden border-0 bg-transparent shadow-none";
const inspectorSidebarProviderClassName = "h-full min-h-0 w-full max-shell:max-h-[34svh]";
const inspectorSidebarClassName =
  "h-full w-full border-l border-sidebar-border max-shell:border-l-0 max-shell:border-t";

export function AtlasShellFrame({
  chatContext,
  classes,
  documents,
  documentShelfFolderItems,
  documentShelfFolders,
  documentShardsByDocumentId,
  domains,
  domainName,
  isAllDomainsSelected,
  selectedDomainId,
  selectedViewId,
  selectedViewRecords,
  tableSamples,
  viewRecordCounts,
}: AtlasShellFrameProps) {
  const router = useRouter();
  const [activeModeId, setActiveModeId] = useState("graph");
  const [selectedClassTableName, setSelectedClassTableName] = useState<string | null>(
    () => initialShelfClassTableName(classes),
  );
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [inspectorTarget, setInspectorTarget] = useState<{ recordId: string; tableName: string } | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(chatContext.documentId ?? null);
  const [selectedDistillationDocumentId, setSelectedDistillationDocumentId] = useState<string | null>(() =>
    initialDistillationDocumentId(documents, chatContext.documentId ?? null),
  );
  const [editTarget, setEditTarget] = useState<{ recordId: string; tableName: string } | null>(null);
  const [createTargetTableName, setCreateTargetTableName] = useState<string | null>(null);
  const activeGraphDragRef = useRef<ActiveGraphDrag | null>(null);
  const documentIntakeActionsRef = useRef<DocumentIntakeActions | null>(null);
  const [activeGraphDrag, setActiveGraphDrag] = useState<ActiveGraphDrag | null>(null);
  const activeMode = atlasModes.find((mode) => mode.id === activeModeId) ?? atlasModes[0];
  const documentShelfSelected = selectedClassTableName === "documents";
  const inspectorClassTableName =
    editTarget?.tableName ??
    inspectorTarget?.tableName ??
    (activeMode.id === "documents" && documentShelfSelected && selectedDocumentId
      ? "documents"
      : selectedClassTableName);
  const inspectorRecordId =
    editTarget?.recordId ??
    inspectorTarget?.recordId ??
    (activeMode.id === "documents" && documentShelfSelected ? selectedDocumentId : selectedRecordId);
  const inspectorEditing = Boolean(editTarget && inspectorClassTableName && inspectorRecordId);
  const shelfActiveItemId =
    selectedClassTableName === "documents"
      ? activeMode.id === "distillation"
        ? selectedDistillationDocumentId
        : selectedDocumentId
      : selectedRecordId;
  const selectedDocument =
    documents.find((document) => document.id === selectedDocumentId) ?? null;
  const selectedDistillationDocument =
    documents.find((document) => document.id === selectedDistillationDocumentId) ?? null;
  const stageDocument =
    activeMode.id === "distillation" ? selectedDistillationDocument : selectedDocument;
  const stageDocumentId = stageDocument?.id ?? null;
  const handleDistillationDocumentChange = useCallback(
    (documentId: string) => {
      setSelectedDistillationDocumentId(documentId);
    },
    [],
  );
  const currentViewMembership = useMemo(() => {
    const classTableNameById = new Map(classes.map((classRecord) => [classRecord.id, classRecord.table_name]));
    const viewNodeRows = selectedViewRecords.viewNodes;
    const viewRelationshipRows = selectedViewRecords.viewRelationships;

    return new Set(
      [
        ...viewNodeRows
          .map((viewNode) => {
            const tableName = classTableNameById.get(stringValue(viewNode.record_class_id));
            const recordId = stringValue(viewNode.record_id);

            return tableName && recordId ? `${tableName}:${recordId}` : "";
          }),
        ...viewRelationshipRows
          .map((viewRelationship) => {
            const relationshipId = stringValue(viewRelationship.relationship_id);

            return relationshipId ? `relationships:${relationshipId}` : "";
          }),
      ].filter(Boolean),
    );
  }, [classes, selectedViewRecords.viewNodes, selectedViewRecords.viewRelationships]);
  const composerContext = useMemo(
    () => ({
      ...chatContext,
      mode: activeMode.id,
      screen: activeMode.id,
      selectedRecordId: inspectorRecordId,
      selectedRecordTable: inspectorClassTableName,
    }),
    [activeMode.id, chatContext, inspectorClassTableName, inspectorRecordId],
  );
  const entityComposerContext = useMemo(
    () =>
      buildEntityComposerContext({
        classes,
        domainId: selectedDomainId,
        domainLabel: domainName,
        tableSamples,
      }),
    [classes, domainName, selectedDomainId, tableSamples],
  );
  const documentIntakeContext = useMemo<DocumentIntakeContext>(
    () => ({
      domainId: selectedDomainId,
      domainLabel: domainName,
    }),
    [domainName, selectedDomainId],
  );

  useEffect(() => {
    markAtlasShelfVisited();
  }, []);

  function selectMode(modeId: string) {
    setActiveModeId(modeId);
    if ((modeId === "documents" || modeId === "distillation") && hasAtlasShelfTable(classes, "documents")) {
      setSelectedClassTableName("documents");
      setSelectedRecordId(null);
    }
    setEditTarget(null);
    setCreateTargetTableName(null);
    setInspectorTarget(null);
  }

  function selectRecord(recordId: string) {
    if (selectedClassTableName === "documents") {
      if (activeModeId === "distillation") {
        setSelectedDistillationDocumentId(recordId);
      } else {
        setActiveModeId("documents");
        setSelectedDocumentId(recordId);
      }
    }

    setSelectedRecordId(recordId);
    setInspectorTarget(
      selectedClassTableName ? { recordId, tableName: selectedClassTableName } : null,
    );
    setEditTarget(
      selectedClassTableName === "relationships"
        ? { recordId, tableName: selectedClassTableName }
        : null,
    );
    setCreateTargetTableName(null);
  }

  function selectGraphRecord(selection: { recordId: string; tableName: string } | null) {
    setEditTarget(null);
    setCreateTargetTableName(null);

    if (!selection) {
      setInspectorTarget(null);
      return;
    }

    setInspectorTarget(selection);
    setEditTarget(
      selection.tableName === "relationships"
        ? { recordId: selection.recordId, tableName: selection.tableName }
        : null,
    );
  }

  function selectClassTableName(tableName: string) {
    setSelectedClassTableName(tableName);
    setSelectedRecordId(null);
    setInspectorTarget(null);
    setEditTarget(null);
    setCreateTargetTableName(null);
  }

  function selectDocument(recordId: string) {
    setActiveModeId(activeModeId === "distillation" ? "distillation" : "documents");
    setSelectedDocumentId(recordId);
    setInspectorTarget({ recordId, tableName: "documents" });
    setEditTarget(null);
    setCreateTargetTableName(null);
  }

  const setGraphDrag = useCallback((graphDrag: ActiveGraphDrag | null) => {
    activeGraphDragRef.current = graphDrag;
    setActiveGraphDrag(graphDrag);
  }, []);
  const clearActiveGraphDrag = useCallback(() => {
    activeGraphDragRef.current = null;
    setActiveGraphDrag(null);
  }, []);
  const createDocumentShelfFolder = useCallback(
    async (label: string) => {
      if (!selectedDomainId) {
        return {
          error: "Select a domain before creating a folder.",
          folderId: null,
          ok: false,
        };
      }

      const result = await createAtlasDocumentShelfFolder({
        domainId: selectedDomainId,
        label,
      });

      if (result.ok) {
        router.refresh();
      }

      return result;
    },
    [router, selectedDomainId],
  );
  const moveDocumentToShelfFolder = useCallback(
    async (folderId: string, documentId: string) => {
      if (!selectedDomainId) {
        return {
          error: "Select a domain before moving a document.",
          folderId: null,
          ok: false,
        };
      }

      const result = await moveAtlasDocumentToShelfFolder({
        documentId,
        domainId: selectedDomainId,
        folderId,
      });

      if (result.ok) {
        router.refresh();
      }

      return result;
    },
    [router, selectedDomainId],
  );
  const setDocumentShelfFolderCollapsed = useCallback(
    async (folderId: string, collapsed: boolean) => {
      if (!selectedDomainId) {
        return {
          error: "Select a domain before updating a folder.",
          folderId: null,
          ok: false,
        };
      }

      const result = await updateAtlasDocumentShelfFolder({
        collapsed,
        domainId: selectedDomainId,
        folderId,
      });

      if (result.ok) {
        router.refresh();
      }

      return result;
    },
    [router, selectedDomainId],
  );

  return (
    <ShellGrid backdrop="grid" className={shellClassName}>
      <aside aria-label={`${activeMode.title} shelf`} className={shelfClassName}>
        <UniversalClassShelf
          activeItemId={shelfActiveItemId}
          classes={classes}
          currentViewMembership={currentViewMembership}
          documentShelfFolderItems={documentShelfFolderItems}
          documentShelfFolders={documentShelfFolders}
          dragEnabled={
            (activeMode.id === "graph" && isGraphDraggableShelfClass(selectedClassTableName)) ||
            selectedClassTableName === "documents"
          }
          headerControls={
            <DomainContextSelector
              compact={true}
              compactLabel={domainName ?? (isAllDomainsSelected ? "All" : "None")}
              domains={domains}
              isAllDomainsSelected={isAllDomainsSelected}
              routePath="/atlas"
              selectedDomainId={selectedDomainId}
            />
          }
          selectedDomainName={domainName}
          onCreateSelectedClass={setCreateTargetTableName}
          onCreateDocumentShelfFolder={createDocumentShelfFolder}
          onDocumentUpload={() => documentIntakeActionsRef.current?.upload()}
          onItemDragStart={(recordId) => {
            if (!isGraphDraggableShelfClass(selectedClassTableName)) {
              return;
            }

            setGraphDrag({ recordId, tableName: selectedClassTableName });
          }}
          onItemSelect={selectRecord}
          onMoveDocumentToShelfFolder={moveDocumentToShelfFolder}
          onSelectedClassTableNameChange={selectClassTableName}
          onToggleDocumentShelfFolder={setDocumentShelfFolderCollapsed}
          selectedClassTableName={selectedClassTableName}
          selectedDomainId={selectedDomainId}
          tableSamples={tableSamples}
        />
      </aside>

      <section aria-label={activeMode.title} className={stageClassName}>
        <div className={stageBoxClassName}>
          <AtlasStageContainer
            activeGraphDrag={activeGraphDrag}
            activeGraphDragRef={activeGraphDragRef}
            activeModeId={activeMode.id}
            classes={classes}
            clearActiveGraphDrag={clearActiveGraphDrag}
            documents={documents}
            documentIntakeActionsRef={documentIntakeActionsRef}
            onDistillationDocumentSelect={handleDistillationDocumentChange}
            onDocumentSelect={selectDocument}
            onGraphRecordSelect={selectGraphRecord}
            selectedDistillationDocumentId={selectedDistillationDocument?.id ?? null}
            selectedDocumentId={stageDocumentId}
            selectedDomainId={selectedDomainId}
            selectedViewId={selectedViewId}
            selectedViewRecords={selectedViewRecords}
            shardsByDocumentId={documentShardsByDocumentId}
            tableSamples={tableSamples}
          />
        </div>

        <MemoriaComposer
          activeStageModeId={activeMode.id}
          context={composerContext}
          documentContext={documentIntakeContext}
          documentIntakeActionsRef={documentIntakeActionsRef}
          entityContext={entityComposerContext}
          initialMessage="Ready in Atlas."
          onStageModeChange={selectMode}
          stageModes={atlasModes}
        />
      </section>

      <SidebarProvider className={inspectorSidebarProviderClassName}>
        <Sidebar
          aria-label="Atlas inspector"
          className={inspectorSidebarClassName}
          collapsible="none"
          side="right"
        >
          <SidebarContent>
            <UniversalClassInspector
              classes={classes}
              documentShardsByDocumentId={documentShardsByDocumentId}
              domainName={domainName}
              createTargetTableName={createTargetTableName}
              editing={inspectorEditing}
              onCreateTargetChange={setCreateTargetTableName}
              onEditingChange={(editing) => {
                if (!editing) {
                  setEditTarget(null);
                } else if (inspectorClassTableName && inspectorRecordId) {
                  setEditTarget({
                    recordId: inspectorRecordId,
                    tableName: inspectorClassTableName,
                  });
                } else if (selectedDomainId) {
                  setEditTarget({
                    recordId: selectedDomainId,
                    tableName: "domains",
                  });
                }
              }}
              selectedClassTableName={inspectorClassTableName}
              selectedDomainId={selectedDomainId}
              selectedRecordId={inspectorRecordId}
              selectedViewId={selectedViewId}
              tableSamples={tableSamples}
              viewRecordCounts={viewRecordCounts}
            />
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    </ShellGrid>
  );
}

function initialShelfClassTableName(classes: ClassRecord[]) {
  const firstVisit = isFirstAtlasShelfVisit();
  const preferredTableName = firstVisit ? "domains" : "entities";

  return (
    classes.find((classRecord) => classRecord.table_name === preferredTableName)?.table_name ??
    classes.find((classRecord) => classRecord.table_name === "entities")?.table_name ??
    classes.find((classRecord) => classRecord.table_name === "domains")?.table_name ??
    classes.find((classRecord) => atlasShelfTableNames.has(classRecord.table_name))?.table_name ??
    null
  );
}

function isFirstAtlasShelfVisit() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(atlasShelfVisitStorageKey) !== "true";
  } catch {
    return false;
  }
}

function markAtlasShelfVisited() {
  try {
    window.localStorage.setItem(atlasShelfVisitStorageKey, "true");
  } catch {
    return;
  }
}

function isGraphDraggableShelfClass(
  tableName: string | null,
): tableName is ActiveGraphDrag["tableName"] {
  return tableName === "entities" || tableName === "relationships";
}

function hasAtlasShelfTable(classes: ClassRecord[], tableName: string) {
  return classes.some((classRecord) => classRecord.table_name === tableName);
}

function buildEntityComposerContext({
  classes,
  domainId,
  domainLabel,
  tableSamples,
}: {
  classes: ClassRecord[];
  domainId: string | null;
  domainLabel: string | null;
  tableSamples: ClassTableSamples;
}): EntityComposerContext {
  const entityClassId = classes.find((classRecord) => classRecord.table_name === "entities")?.id ?? null;
  const typeRows = tableSamples.types?.rows ?? [];
  const statusRows = tableSamples.statuses?.rows ?? [];

  return {
    domainId,
    domainLabel,
    kinds: [],
    statuses: statusRows
      .filter((row) => stringValue(row.class_id) === entityClassId)
      .map((row) => ({
        label: rowLabel(row),
        slug: stringValue(row.slug) || null,
        value: stringValue(row.id),
      }))
      .filter((option) => option.value),
    types: typeRows
      .filter(
        (row) =>
          stringValue(row.class_id) === entityClassId &&
          isGlobalOrDomainScoped(row, domainId),
      )
      .map((row) => ({
        label: rowLabel(row),
        value: stringValue(row.id),
      }))
      .filter((option) => option.value),
  };
}

function isGlobalOrDomainScoped(row: TableRow, domainId: string | null) {
  const rowDomainId = stringValue(row.domain_id);

  return !rowDomainId || Boolean(domainId && rowDomainId === domainId);
}

function rowLabel(row: Record<string, unknown>) {
  return stringValue(row.label) || stringValue(row.title) || stringValue(row.slug) || stringValue(row.id);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function initialDistillationDocumentId(
  documents: DocumentRecord[],
  fallbackDocumentId: string | null,
) {
  if (fallbackDocumentId && documents.some((document) => document.id === fallbackDocumentId)) {
    return fallbackDocumentId;
  }

  return documents[0]?.id ?? null;
}
