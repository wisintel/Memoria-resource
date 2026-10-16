"use client";
import { FolderPlus, Plus } from "lucide-react";
import { type FormEvent, type MouseEvent, type ReactNode, useMemo, useState, useTransition } from "react";

import { InspectorHeader } from "@/components/atlas/inspector/InspectorBlocks";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getMutableClassTableTemplate } from "@/lib/class-table-templates";
import type {
  ClassRecord,
  ClassTableSamples,
  DocumentShelfFolderItemRecord,
  DocumentShelfFolderRecord,
  TableRow,
  TableValue,
} from "@/lib/supabase/client";

import { AtlasShelf, type AtlasShelfGroup, type AtlasShelfItem, type AtlasShelfOption } from "./AtlasShelf";

type UniversalClassShelfProps = {
  activeItemId?: string | null;
  classes: ClassRecord[];
  currentViewMembership?: ReadonlySet<string>;
  documentShelfFolderItems?: DocumentShelfFolderItemRecord[];
  documentShelfFolders?: DocumentShelfFolderRecord[];
  dragEnabled?: boolean;
  headerControls?: ReactNode;
  onCreateDocumentShelfFolder?: (label: string) => Promise<DocumentShelfFolderActionResult>;
  onCreateSelectedClass?: (tableName: string) => void;
  onDocumentUpload?: () => void;
  onItemDragStart?: (id: string) => void;
  onItemSelect: (id: string) => void;
  onMoveDocumentToShelfFolder?: (folderId: string, documentId: string) => Promise<DocumentShelfFolderActionResult>;
  onSelectedClassTableNameChange: (tableName: string) => void;
  onToggleDocumentShelfFolder?: (folderId: string, collapsed: boolean) => Promise<DocumentShelfFolderActionResult>;
  selectedClassTableName: string | null;
  selectedDomainId: string | null;
  selectedDomainName: string | null;
  tableSamples: ClassTableSamples;
};

type DocumentShelfFolderActionResult = {
  error: string | null;
  folderId: string | null;
  ok: boolean;
};

type ShelfEntry = {
  classId: string;
  item: AtlasShelfItem;
  sourceClassId: string;
  sourceRecordId: string;
  targetClassId: string;
  targetEntityId: string;
  targetRecordId: string;
  typeId: string;
};

type RelationshipGroupMode = "type" | "source" | "target";

const atlasShelfTableLabels: Record<string, string> = {
  claims: "Claims",
  documents: "Documents",
  domains: "Domains",
  entities: "Subjects",
  entity_aliases: "Aliases",
  relationships: "Relationships",
  statuses: "Statuses",
  types: "Types",
};

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

const atlasShelfTableOrder = [
  "entities",
  "claims",
  "relationships",
  "documents",
  "domains",
  "types",
  "statuses",
  "entity_aliases",
];

const shelfItemCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export function UniversalClassShelf({
  activeItemId,
  classes,
  currentViewMembership,
  documentShelfFolderItems = [],
  documentShelfFolders = [],
  dragEnabled = false,
  headerControls,
  onCreateDocumentShelfFolder,
  onCreateSelectedClass,
  onDocumentUpload,
  onItemDragStart,
  onItemSelect,
  onMoveDocumentToShelfFolder,
  onSelectedClassTableNameChange,
  onToggleDocumentShelfFolder,
  selectedDomainId,
  selectedClassTableName,
  selectedDomainName,
  tableSamples,
}: UniversalClassShelfProps) {
  const [relationshipGroupMode, setRelationshipGroupMode] = useState<RelationshipGroupMode>("type");
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderLabel, setFolderLabel] = useState("");
  const [folderError, setFolderError] = useState<string | null>(null);
  const [isCreatingFolder, startCreateFolderTransition] = useTransition();
  const [, startMoveDocumentTransition] = useTransition();
  const [, startToggleFolderTransition] = useTransition();
  const visibleClasses = useMemo(
    () =>
      classes
        .filter((classRecord) => atlasShelfTableNames.has(classRecord.table_name))
        .sort(
          (left, right) =>
            atlasShelfTableOrder.indexOf(left.table_name) - atlasShelfTableOrder.indexOf(right.table_name),
        ),
    [classes],
  );
  const selectedClass =
    visibleClasses.find((classRecord) => classRecord.table_name === selectedClassTableName) ??
    visibleClasses[0] ??
    null;
  const selectedSample = selectedClass ? (tableSamples[selectedClass.table_name] ?? null) : null;
  const sourceTypeIds = useMemo(
    () =>
      new Set(
        (tableSamples.types?.rows ?? [])
          .filter((row) => stringValue(row.label).toLowerCase() === "source")
          .map((row) => stringValue(row.id))
          .filter(Boolean),
      ),
    [tableSamples.types?.rows],
  );
  const selectedMutableTemplate = selectedClass ? getMutableClassTableTemplate(selectedClass.table_name) : null;
  const canCreateSelectedClass = Boolean(selectedMutableTemplate?.createFields?.length);
  const canUploadDocument = selectedClass?.table_name === "documents";
  const selectedClassDisplayLabel = selectedClass
    ? atlasShelfTableLabels[selectedClass.table_name] ?? selectedClass.label
    : null;
  const canOrganizeDocuments = Boolean(
    selectedClass?.table_name === "documents" &&
      selectedDomainId &&
      onCreateDocumentShelfFolder &&
      onMoveDocumentToShelfFolder &&
      onToggleDocumentShelfFolder,
  );
  const classOptions = useMemo<AtlasShelfOption[]>(
    () =>
      visibleClasses.map((classRecord) => ({
        count:
          tableSamples[classRecord.table_name]?.count ??
          tableSamples[classRecord.table_name]?.rows.length ??
          0,
        label: atlasShelfTableLabels[classRecord.table_name] ?? classRecord.label,
        value: classRecord.table_name,
      })),
    [tableSamples, visibleClasses],
  );
  const shelfEntries = useMemo<ShelfEntry[]>(
    () =>
      (selectedSample?.rows ?? [])
        .filter((row) => !isHiddenExtractedSourceDocument(row, selectedClass?.table_name, sourceTypeIds))
        .map((row, index) => {
        const id = stringValue(row.id) || `${selectedClass?.table_name ?? "row"}:${index}`;

        return {
          classId: stringValue(row.class_id),
          item: {
            detail: rowDetail(row),
            id,
            inView: currentViewMembership?.has(`${selectedClass?.table_name ?? ""}:${id}`) ?? false,
            status: shelfItemStatus(row, selectedClass?.table_name, selectedClass?.label),
            title: selectedClass?.table_name === "claims" ? claimShelfTitle(row) : rowTitle(row),
          },
          sourceClassId: stringValue(row.source_class_id),
          sourceRecordId: stringValue(row.source_record_id),
          targetClassId: stringValue(row.target_class_id),
          targetEntityId: firstString(row.target_entity_ids),
          targetRecordId: stringValue(row.target_record_id),
          typeId: stringValue(row.type_id),
        };
      }),
    [currentViewMembership, selectedClass?.label, selectedClass?.table_name, selectedSample?.rows, sourceTypeIds],
  );
  const items = useMemo<AtlasShelfItem[]>(
    () => shelfEntries.map((entry) => entry.item),
    [shelfEntries],
  );
  const itemGroups = useMemo<AtlasShelfGroup[] | undefined>(
    () =>
      selectedClass?.table_name === "documents" && canOrganizeDocuments
        ? buildDocumentFolderGroups({
            entries: shelfEntries,
            folderItems: documentShelfFolderItems,
            folders: documentShelfFolders,
            onMoveDocumentToShelfFolder: (folderId, documentId) => {
              if (!onMoveDocumentToShelfFolder) {
                return;
              }

              setFolderError(null);
              startMoveDocumentTransition(async () => {
                const result = await onMoveDocumentToShelfFolder(folderId, documentId);

                if (!result.ok) {
                  setFolderError(result.error ?? "Document could not be moved.");
                  return;
                }
              });
            },
            onToggleDocumentShelfFolder: (folderId, collapsed) => {
              if (!onToggleDocumentShelfFolder) {
                return;
              }

              setFolderError(null);
              startToggleFolderTransition(async () => {
                const result = await onToggleDocumentShelfFolder(folderId, collapsed);

                if (!result.ok) {
                  setFolderError(result.error ?? "Folder could not be updated.");
                }
              });
            },
          })
        : selectedClass?.table_name === "claims"
        ? buildClaimTargetGroups({ entries: shelfEntries, entityRows: tableSamples.entities?.rows ?? [] })
        : selectedClass?.table_name === "entities"
        ? buildEntityTypeGroups({ entries: shelfEntries, typeRows: tableSamples.types?.rows ?? [] })
        : selectedClass?.table_name === "relationships"
        ? buildRelationshipGroups({
            classes,
            entries: shelfEntries,
            mode: relationshipGroupMode,
            tableSamples,
            typeRows: tableSamples.types?.rows ?? [],
          })
        : buildClassGroups({ classes, entries: shelfEntries }),
    [
      classes,
      canOrganizeDocuments,
      documentShelfFolderItems,
      documentShelfFolders,
      relationshipGroupMode,
      selectedClass?.table_name,
      shelfEntries,
      tableSamples,
      onMoveDocumentToShelfFolder,
      onToggleDocumentShelfFolder,
    ],
  );
  const relationshipGroupControl =
    selectedClass?.table_name === "relationships" ? (
      <Select
        value={relationshipGroupMode}
        onValueChange={(nextValue) => {
          if (isRelationshipGroupMode(nextValue)) {
            setRelationshipGroupMode(nextValue);
          }
        }}
      >
        <SelectTrigger
          aria-label="Group relationships"
          className="h-8 w-[92px] rounded-md border-sidebar-border bg-sidebar px-2 text-xs font-medium text-muted-foreground shadow-none"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end" alignItemWithTrigger={false} side="bottom">
          <SelectGroup>
            <SelectItem value="type">Type</SelectItem>
            <SelectItem value="source">Source</SelectItem>
            <SelectItem value="target">Target</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    ) : null;
  const createButton =
    selectedClass && (canCreateSelectedClass || canUploadDocument) ? (
      <Button
        aria-label={canUploadDocument ? "Upload document" : `Create ${selectedClassDisplayLabel}`}
        onClick={() => {
          if (canUploadDocument) {
            onDocumentUpload?.();
            return;
          }

          onCreateSelectedClass?.(selectedClass.table_name);
        }}
        size="icon"
        title={canUploadDocument ? "Upload document" : `New ${selectedClassDisplayLabel}`}
        type="button"
        variant="ghost"
      >
        <Plus aria-hidden={true} />
      </Button>
    ) : null;
  const folderButton =
    canOrganizeDocuments ? (
      <Button
        aria-label="Create folder"
        onClick={openFolderDialog}
        size="icon"
        title="Create folder"
        type="button"
        variant="ghost"
      >
        <FolderPlus aria-hidden={true} />
      </Button>
    ) : null;

  function openFolderDialog() {
    setFolderLabel("");
    setFolderError(null);
    setFolderDialogOpen(true);
  }

  function handleShelfContextMenu(event: MouseEvent) {
    if (!canOrganizeDocuments) {
      return;
    }

    event.preventDefault();
    openFolderDialog();
  }

  function submitFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFolderError(null);

    if (!onCreateDocumentShelfFolder) {
      return;
    }

    startCreateFolderTransition(async () => {
      const result = await onCreateDocumentShelfFolder(folderLabel);

      if (!result.ok) {
        setFolderError(result.error ?? "Folder could not be created.");
        return;
      }

      setFolderDialogOpen(false);
      setFolderLabel("");
    });
  }

  return (
    <>
      <AtlasShelf
      activeItemId={activeItemId ?? undefined}
      displayTitle={false}
      emptyDescription={selectedSample?.error ?? "No records in this class yet."}
      emptyTitle={selectedSample?.error ? "Class unavailable" : "No records"}
      actions={
        <InspectorHeader
          subtitle="Domain"
          title={headerControls ?? selectedDomainName ?? "All"}
        />
      }
      filterLabel="Shelf view"
      filterAction={
        relationshipGroupControl || folderButton || createButton ? (
          <div className="flex items-center gap-1">
            {relationshipGroupControl}
            {folderButton}
            {createButton}
          </div>
        ) : null
      }
      filterOptions={classOptions}
      filterValue={selectedClass?.table_name}
      itemsDraggable={dragEnabled}
      items={items}
      itemGroups={itemGroups}
      onFilterChange={onSelectedClassTableNameChange}
      onItemDragStart={onItemDragStart}
      onItemSelect={onItemSelect}
      onShelfContextMenu={canOrganizeDocuments ? handleShelfContextMenu : undefined}
      showEmptyState={true}
      title={selectedClassDisplayLabel ?? "Classes"}
    />
      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={submitFolder}>
            <div className="grid gap-2">
              <Label htmlFor="document-folder-label">Name</Label>
              <Input
                autoFocus={true}
                id="document-folder-label"
                onChange={(event) => setFolderLabel(event.currentTarget.value)}
                value={folderLabel}
              />
            </div>
            {folderError ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {folderError}
              </p>
            ) : null}
            <DialogFooter>
              <Button disabled={isCreatingFolder || !folderLabel.trim()} type="submit">
                {isCreatingFolder ? "Creating" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {folderError && !folderDialogOpen ? (
        <div className="pointer-events-none fixed bottom-5 left-5 z-50 rounded-md border border-destructive/30 bg-popover px-3 py-2 text-sm text-destructive shadow-lg">
          {folderError}
        </div>
      ) : null}
    </>
  );
}

function isRelationshipGroupMode(value: string | null): value is RelationshipGroupMode {
  return value === "type" || value === "source" || value === "target";
}

function isHiddenExtractedSourceDocument(
  row: TableRow,
  tableName: string | undefined,
  sourceTypeIds: ReadonlySet<string>,
) {
  return (
    tableName === "documents" &&
    stringValue(row.status) === "extracted" &&
    sourceTypeIds.has(stringValue(row.type_id))
  );
}

function buildDocumentFolderGroups({
  entries,
  folderItems,
  folders,
  onMoveDocumentToShelfFolder,
  onToggleDocumentShelfFolder,
}: {
  entries: ShelfEntry[];
  folderItems: DocumentShelfFolderItemRecord[];
  folders: DocumentShelfFolderRecord[];
  onMoveDocumentToShelfFolder: (folderId: string, documentId: string) => void;
  onToggleDocumentShelfFolder: (folderId: string, collapsed: boolean) => void;
}) {
  if (folders.length === 0) {
    return undefined;
  }

  const entryById = new Map(entries.map((entry) => [entry.item.id, entry]));
  const placedDocumentIds = new Set(folderItems.map((item) => item.document_id));
  const groups: AtlasShelfGroup[] = folders.map((folder) => {
    const folderDocumentItems = folderItems
      .filter((item) => item.folder_id === folder.id)
      .map((item) => entryById.get(item.document_id)?.item)
      .filter((item): item is AtlasShelfItem => Boolean(item));

    return {
      collapsed: folder.collapsed,
      droppable: true,
      id: folder.id,
      items: folderDocumentItems,
      onDropItem: (documentId) => onMoveDocumentToShelfFolder(folder.id, documentId),
      onToggleCollapsed: (collapsed) => onToggleDocumentShelfFolder(folder.id, collapsed),
      title: folder.label,
    };
  });
  const unfiledItems = entries
    .filter((entry) => !placedDocumentIds.has(entry.item.id))
    .map((entry) => entry.item)
    .sort(compareShelfItems);

  if (unfiledItems.length > 0) {
    groups.push({
      id: "document-folder:unfiled",
      items: unfiledItems,
      title: "Unfiled",
    });
  }

  return groups;
}

function buildClassGroups({
  classes,
  entries,
}: {
  classes: ClassRecord[];
  entries: ShelfEntry[];
}) {
  if (entries.length === 0) {
    return undefined;
  }

  const classIds = new Set(entries.map((entry) => entry.classId).filter(Boolean));

  if (classIds.size <= 1) {
    return undefined;
  }

  const classLookup = new Map(classes.map((classRecord) => [classRecord.id, classRecord]));
  const groups = new Map<string, AtlasShelfGroup>();

  for (const entry of entries) {
    const groupId = entry.classId || "unclassified";
    const classRecord = classLookup.get(groupId);
    const title = classRecord
      ? atlasShelfTableLabels[classRecord.table_name] ?? classRecord.label
      : "Unclassified";
    const group = groups.get(groupId) ?? {
      id: groupId,
      items: [],
      title,
    };

    group.items.push(entry.item);
    groups.set(groupId, group);
  }

  for (const group of groups.values()) {
    group.items.sort(compareShelfItems);
  }

  return Array.from(groups.values()).sort((left, right) => {
    const leftClass = classLookup.get(left.id);
    const rightClass = classLookup.get(right.id);
    const leftOrder = shelfClassOrder(leftClass);
    const rightOrder = shelfClassOrder(rightClass);

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return left.title.localeCompare(right.title);
  });
}

function buildEntityTypeGroups({
  entries,
  typeRows,
}: {
  entries: ShelfEntry[];
  typeRows: TableRow[];
}) {
  if (entries.length === 0) {
    return undefined;
  }

  const typeLookup = new Map(typeRows.map((row) => [stringValue(row.id), row]));
  const groups = new Map<string, AtlasShelfGroup>();

  for (const entry of entries) {
    const groupId = entry.typeId || "untyped";
    const typeRow = typeLookup.get(groupId);
    const group = groups.get(groupId) ?? {
      id: groupId,
      items: [],
      title: typeRow ? rowTitle(typeRow) : "No type",
    };

    group.items.push(entry.item);
    groups.set(groupId, group);
  }

  for (const group of groups.values()) {
    group.items.sort(compareShelfItems);
  }

  return Array.from(groups.values()).sort((left, right) => {
    if (left.id === "untyped") {
      return 1;
    }

    if (right.id === "untyped") {
      return -1;
    }

    return shelfItemCollator.compare(left.title, right.title);
  });
}

function buildClaimTargetGroups({
  entries,
  entityRows,
}: {
  entries: ShelfEntry[];
  entityRows: TableRow[];
}) {
  if (entries.length === 0) {
    return undefined;
  }

  const entityLookup = new Map(entityRows.map((row) => [stringValue(row.id), row]));
  const groups = new Map<string, AtlasShelfGroup>();

  for (const entry of entries) {
    const groupId = entry.targetEntityId || "untargeted";
    const entityRow = entityLookup.get(groupId);
    const group = groups.get(groupId) ?? {
      id: groupId,
      items: [],
      title: entityRow ? rowTitle(entityRow) : "Unassigned target",
    };

    group.items.push(entry.item);
    groups.set(groupId, group);
  }

  for (const group of groups.values()) {
    group.items.sort(compareShelfItems);
  }

  return Array.from(groups.values()).sort((left, right) => {
    if (left.id === "untargeted") {
      return 1;
    }

    if (right.id === "untargeted") {
      return -1;
    }

    return shelfItemCollator.compare(left.title, right.title);
  });
}

function buildRelationshipGroups({
  classes,
  entries,
  mode,
  tableSamples,
  typeRows,
}: {
  classes: ClassRecord[];
  entries: ShelfEntry[];
  mode: RelationshipGroupMode;
  tableSamples: ClassTableSamples;
  typeRows: TableRow[];
}) {
  if (entries.length === 0) {
    return undefined;
  }

  const typeLookup = new Map(typeRows.map((row) => [stringValue(row.id), row]));
  const classLookup = new Map(classes.map((classRecord) => [classRecord.id, classRecord]));
  const groups = new Map<string, AtlasShelfGroup>();

  for (const entry of entries) {
    const group = relationshipGroupForEntry({
      classLookup,
      entry,
      mode,
      tableSamples,
      typeLookup,
    });
    const existingGroup = groups.get(group.id) ?? {
      id: group.id,
      items: [],
      title: group.title,
    };

    existingGroup.items.push(entry.item);
    groups.set(group.id, existingGroup);
  }

  for (const group of groups.values()) {
    group.items.sort(compareShelfItems);
  }

  return Array.from(groups.values()).sort((left, right) => {
    if (left.id.startsWith("missing:")) {
      return 1;
    }

    if (right.id.startsWith("missing:")) {
      return -1;
    }

    return shelfItemCollator.compare(left.title, right.title);
  });
}

function relationshipGroupForEntry({
  classLookup,
  entry,
  mode,
  tableSamples,
  typeLookup,
}: {
  classLookup: Map<string, ClassRecord>;
  entry: ShelfEntry;
  mode: RelationshipGroupMode;
  tableSamples: ClassTableSamples;
  typeLookup: Map<string, TableRow>;
}) {
  if (mode === "type") {
    const typeRow = typeLookup.get(entry.typeId);

    return {
      id: entry.typeId || "missing:type",
      title: typeRow ? rowTitle(typeRow) : "No type",
    };
  }

  const classId = mode === "source" ? entry.sourceClassId : entry.targetClassId;
  const recordId = mode === "source" ? entry.sourceRecordId : entry.targetRecordId;
  const classRecord = classLookup.get(classId);
  const record = classRecord
    ? tableSamples[classRecord.table_name]?.rows.find((row) => stringValue(row.id) === recordId)
    : undefined;

  return {
    id: recordId || `missing:${mode}`,
    title: record ? rowTitle(record) : mode === "source" ? "No source" : "No target",
  };
}

function compareShelfItems(left: AtlasShelfItem, right: AtlasShelfItem) {
  const titleComparison = shelfItemCollator.compare(left.title, right.title);

  return titleComparison === 0 ? left.id.localeCompare(right.id) : titleComparison;
}

function shelfClassOrder(classRecord: ClassRecord | undefined) {
  if (!classRecord) {
    return Number.MAX_SAFE_INTEGER;
  }

  const order = atlasShelfTableOrder.indexOf(classRecord.table_name);

  return order === -1 ? Number.MAX_SAFE_INTEGER : order;
}

function rowTitle(row: TableRow) {
  return (
    stringValue(row.label) ||
    stringValue(row.title) ||
    stringValue(row.name) ||
    stringValue(row.slug) ||
    stringValue(row.id) ||
    "Untitled"
  );
}

function claimShelfTitle(row: TableRow) {
  return stringValue(row.claim_text) || rowTitle(row);
}

function rowDetail(row: TableRow) {
  return stringValue(row.status) || stringValue(row.slug) || "";
}

function rowStatus(row: TableRow, fallbackLabel: string | undefined) {
  return (
    stringValue(row.kind) ||
    stringValue(row.type) ||
    stringValue(row.kind_label) ||
    stringValue(row.type_label) ||
    fallbackLabel ||
    ""
  );
}

function shelfItemStatus(row: TableRow, tableName: string | undefined, fallbackLabel: string | undefined) {
  if (tableName === "documents") {
    return stringValue(row.status) || fallbackLabel || "";
  }

  return rowStatus(row, fallbackLabel);
}

function stringValue(value: TableValue | undefined) {
  return typeof value === "string" ? value : "";
}

function firstString(value: TableValue | undefined) {
  return Array.isArray(value) && typeof value[0] === "string" ? value[0] : "";
}
