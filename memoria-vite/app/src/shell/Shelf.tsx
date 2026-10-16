import {
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  FileUp,
  Folder,
  FolderPlus,
  Pencil,
  Plus,
  Trash2
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator
} from "@/components/ui/sidebar";
import {
  fileToBase64,
  isHtmlDocumentFile,
  isImportableDocument,
  isPdfDocumentFile,
  mimeTypeForSource,
  titleFromFileName
} from "@/lib/document-files";
import { classLabel, edgeDisplayLabel, itemColor } from "@/lib/semantic-display";
import { cn } from "@/lib/utils";
import type {
  DocumentWorkbenchSnapshot,
  DomainRecord,
  GraphItemRecord,
  ItemClass,
  SelectedRecord,
  ShelfFolderItemRecord,
  ShelfFolderRecord
} from "@/types";
import type { WorkspaceMode } from "@/shell/LeftRail";

const NO_DOMAIN_ID = "__no_domain__";
const NO_SHELF_CLASS_ID = "__no_shelf_class__";
const TYPE_SHELF_CLASS_ORDER = ["nodes", "claims", "documents", "edges"];
const NON_DRAGGABLE_ITEM_TABLES = new Set(["claims", "domains", "prompts", "types"]);
const shelfRowButtonClass =
  "min-h-8 cursor-grab gap-2.5 rounded-md border-0 bg-transparent px-2 py-1.5 shadow-none transition-colors active:cursor-grabbing disabled:cursor-default";
const shelfGroupRowClass =
  "flex min-h-8 w-full items-center gap-2 rounded-md border-0 bg-transparent px-2 py-1.5 text-left text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 [&>svg]:size-3.5 [&>svg]:shrink-0";
const shelfCountBadgeClass = "h-5 min-w-5 rounded-full px-1.5 text-xs font-semibold tabular-nums";
type ShelfDeleteTarget =
  | { id: string; kind: "document"; label: string }
  | { id: string; kind: "folder"; label: string }
  | { kind: "graph"; label: string; selection: Exclude<SelectedRecord, null> };

export function defaultClassForMode(mode: WorkspaceMode) {
  return mode === "documents" ? "documents" : "nodes";
}

export function Shelf({
  activeClass,
  activeDomain,
  classCounts,
  classes,
  domains,
  documentPlacedIds,
  draggingRecord,
  graphPlacedIds,
  isBusy,
  rows,
  selectedId,
  shelfFolderItems,
  shelfFolders,
  onClassChange,
  onCreateDomain,
  onCreateCard,
  onCreateShelfFolder,
  onDeleteDomain,
  onDeleteDocument,
  onDeleteGraphSelection,
  onDeleteShelfFolder,
  onDocumentFileImport,
  onDocumentImport,
  onDomainChange,
  onDragStart,
  onMoveDocumentToShelfFolder,
  onOpenCreateForm,
  onOpenEditForm,
  onSelect,
  onToggleShelfFolder,
  onUpdateDomain
}: {
  activeClass: string;
  activeDomain: DomainRecord | null;
  classCounts: Record<string, number>;
  classes: ItemClass[];
  domains: DomainRecord[];
  documentPlacedIds: Set<string>;
  draggingRecord: SelectedRecord;
  graphPlacedIds: Set<string>;
  isBusy: boolean;
  rows: GraphItemRecord[];
  selectedId: string | null;
  shelfFolderItems: ShelfFolderItemRecord[];
  shelfFolders: ShelfFolderRecord[];
  onClassChange: (value: string) => void;
  onCreateDomain: (input: { label: string; slug?: string | null }) => Promise<void>;
  onCreateCard: (input: { itemTable: string; label: string; type: string; source: string | null }) => Promise<void>;
  onCreateShelfFolder?: (input: { label: string }) => Promise<DocumentWorkbenchSnapshot>;
  onDeleteDomain: (id: string) => Promise<void>;
  onDeleteDocument?: (documentId: string) => Promise<void>;
  onDeleteGraphSelection?: (selection: Exclude<SelectedRecord, null>) => Promise<void>;
  onDeleteShelfFolder?: (folderId: string) => Promise<void>;
  onDocumentFileImport?: (input: {
    data_base64: string;
    label: string;
    mime_type?: string | null;
    source_filename?: string | null;
    source_type?: "html" | "markdown";
  }) => Promise<boolean>;
  onDocumentImport?: (input: {
    content: string;
    label: string;
    mime_type?: string | null;
    source_filename?: string | null;
    source_type: "html" | "markdown";
  }) => Promise<boolean>;
  onDomainChange: (value: string) => void;
  onDragStart: (selection: SelectedRecord) => void;
  onMoveDocumentToShelfFolder?: (folderId: string, documentId: string) => Promise<void>;
  onOpenCreateForm?: (itemTable: string) => void;
  onOpenEditForm?: (itemTable: string, id: string) => void;
  onSelect: (selection: SelectedRecord) => void;
  onToggleShelfFolder?: (folderId: string, collapsed: boolean) => Promise<void>;
  onUpdateDomain: (id: string, input: { label: string; slug?: string | null }) => Promise<void>;
}) {
  const [domainDialog, setDomainDialog] = useState<"create" | "edit" | null>(null);
  const [cardDialogOpen, setCardDialogOpen] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [shelfDeleteTarget, setShelfDeleteTarget] = useState<ShelfDeleteTarget | null>(null);
  const [shelfDeleteError, setShelfDeleteError] = useState<string | null>(null);
  const [domainForm, setDomainForm] = useState({ label: "", slug: "" });
  const [cardForm, setCardForm] = useState({ label: "", source: "", type: "concept" });
  const [folderForm, setFolderForm] = useState({ label: "" });
  const [domainError, setDomainError] = useState<string | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [documentImportError, setDocumentImportError] = useState<string | null>(null);
  const [documentImportNotice, setDocumentImportNotice] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const domainDialogTitle = domainDialog === "edit" ? "Edit domain" : "New domain";
  const canOpenCreateRecordForm = ["claims", "edges", "nodes"].includes(activeClass);
  const canOpenEditRecordForm = ["claims", "documents", "edges", "nodes"].includes(activeClass);
  const canImportDocument = activeClass === "documents" && Boolean(onDocumentImport || onDocumentFileImport);
  const canOrganizeDocuments = activeClass === "documents" && Boolean(onCreateShelfFolder);
  const placedIds = activeClass === "documents" ? documentPlacedIds : graphPlacedIds;
  const activeClassCount = classCounts[activeClass] ?? rows.length;
  const selectedDocumentRow = canOrganizeDocuments ? rows.find((row) => row.id === selectedId) ?? null : null;
  const selectedFolder = canOrganizeDocuments && selectedFolderId
    ? shelfFolders.find((folder) => folder.id === selectedFolderId) ?? null
    : null;
  const selectedDocumentFolderId = selectedDocumentRow
    ? shelfFolderItems.find((item) => item.item_id === selectedDocumentRow.id)?.folder_id ?? null
    : null;
  const selectedGraphRecord = selectedId && activeClass !== "documents"
    ? ({ kind: activeClass === "edges" ? "edge" : "item", id: selectedId } as Exclude<SelectedRecord, null>)
    : null;
  const selectedGraphRow = selectedGraphRecord ? rows.find((row) => row.id === selectedGraphRecord.id) ?? null : null;

  useEffect(() => {
    if (!canOrganizeDocuments) {
      setSelectedFolderId(null);
    }
  }, [canOrganizeDocuments]);

  function openCreateDomain() {
    setDomainForm({ label: "", slug: "" });
    setDomainError(null);
    setDomainDialog("create");
  }

  function openEditDomain() {
    if (!activeDomain) {
      return;
    }

    setDomainForm({ label: activeDomain.label, slug: activeDomain.slug });
    setDomainError(null);
    setDomainDialog("edit");
  }

  function openCreateFolder() {
    if (!canOrganizeDocuments) {
      return;
    }

    setFolderForm({ label: "" });
    setFolderError(null);
    setFolderDialogOpen(true);
  }

  async function submitDomain(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDomainError(null);

    try {
      const input = {
        label: domainForm.label,
        slug: domainForm.slug || null
      };

      if (domainDialog === "edit" && activeDomain) {
        await onUpdateDomain(activeDomain.id, input);
      } else {
        await onCreateDomain(input);
      }

      setDomainDialog(null);
    } catch (error) {
      setDomainError(error instanceof Error ? error.message : "Domain could not be saved.");
    }
  }

  async function submitCard(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCardError(null);

    try {
      await onCreateCard({
        itemTable: activeClass,
        label: cardForm.label,
        source: cardForm.source || null,
        type: cardForm.type
      });
      setCardDialogOpen(false);
    } catch (error) {
      setCardError(error instanceof Error ? error.message : "Card could not be created.");
    }
  }

  async function submitFolder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFolderError(null);

    if (!onCreateShelfFolder) {
      return;
    }

    try {
      const previousFolderIds = new Set(shelfFolders.map((folder) => folder.id));
      const nextWorkbench = await onCreateShelfFolder({ label: folderForm.label });
      const createdFolder =
        nextWorkbench.shelfFolders.find((folder) => !previousFolderIds.has(folder.id)) ??
        nextWorkbench.shelfFolders.find((folder) => folder.label === folderForm.label);

      if (selectedDocumentRow && createdFolder && onMoveDocumentToShelfFolder) {
        await onMoveDocumentToShelfFolder(createdFolder.id, selectedDocumentRow.id);
      }

      setFolderDialogOpen(false);
    } catch (error) {
      setFolderError(error instanceof Error ? error.message : "Folder could not be created.");
    }
  }

  async function addSelectedDocumentToFolder(folderId: string) {
    if (!selectedDocumentRow || !onMoveDocumentToShelfFolder) {
      return;
    }

    setFolderError(null);

    try {
      await onMoveDocumentToShelfFolder(folderId, selectedDocumentRow.id);
      setFolderDialogOpen(false);
    } catch (error) {
      setFolderError(error instanceof Error ? error.message : "Document could not be added to the folder.");
    }
  }

  async function confirmDeleteDomain() {
    if (!activeDomain) {
      return;
    }

    setDeleteError(null);

    try {
      await onDeleteDomain(activeDomain.id);
      setDeleteOpen(false);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Domain could not be deleted.");
    }
  }

  function selectShelfDocument(selection: SelectedRecord) {
    setSelectedFolderId(null);
    onSelect(selection);
  }

  function openShelfDeleteDialog(target: ShelfDeleteTarget | null) {
    if (!target) {
      return;
    }

    setShelfDeleteError(null);
    setShelfDeleteTarget(target);
  }

  async function confirmShelfDelete() {
    if (!shelfDeleteTarget) {
      return;
    }

    setShelfDeleteError(null);

    try {
      if (shelfDeleteTarget.kind === "document") {
        await onDeleteDocument?.(shelfDeleteTarget.id);
      } else if (shelfDeleteTarget.kind === "folder") {
        await onDeleteShelfFolder?.(shelfDeleteTarget.id);
        setSelectedFolderId(null);
      } else {
        await onDeleteGraphSelection?.(shelfDeleteTarget.selection);
      }

      setShelfDeleteTarget(null);
    } catch (error) {
      setShelfDeleteError(error instanceof Error ? error.message : `${shelfDeleteTarget.label} could not be deleted.`);
    }
  }

  async function importDocumentFile(file: File) {
    setDocumentImportError(null);
    setDocumentImportNotice(null);

    if (!onDocumentImport && !onDocumentFileImport) {
      return;
    }

    if (!isImportableDocument(file)) {
      setDocumentImportError("Only Markdown, HTML, and PDF files can be imported.");
      return;
    }

    try {
      if (isPdfDocumentFile(file)) {
        if (!onDocumentFileImport) {
          setDocumentImportError("PDF import is not available.");
          return;
        }

        const deduped = await onDocumentFileImport({
          data_base64: await fileToBase64(file),
          label: titleFromFileName(file.name),
          mime_type: file.type || "application/pdf",
          source_filename: file.name
        });

        setDocumentImportNotice(deduped ? "Source already exists in this domain." : `Imported document: ${titleFromFileName(file.name)}`);
        return;
      }

      if (!onDocumentImport) {
        setDocumentImportError("Document import is not available.");
        return;
      }

      const sourceType = isHtmlDocumentFile(file) ? "html" : "markdown";
      const deduped = await onDocumentImport({
        content: await file.text(),
        label: titleFromFileName(file.name),
        mime_type: file.type || mimeTypeForSource(sourceType),
        source_filename: file.name,
        source_type: sourceType
      });

      setDocumentImportNotice(deduped ? "Source already exists in this domain." : `Imported document: ${titleFromFileName(file.name)}`);
    } catch (error) {
      setDocumentImportError(error instanceof Error ? error.message : "Document could not be imported.");
    }
  }

  return (
    <Sidebar collapsible="none" className="min-h-0 overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <SidebarHeader className="m-3 gap-4 rounded-lg border border-sidebar-border bg-card p-5 text-card-foreground shadow-sm">
        <div className="flex min-w-0 flex-col gap-3">
          <span className="text-sm font-semibold text-foreground">Domain</span>
          <Select
            onValueChange={onDomainChange}
            value={activeDomain?.id ?? NO_DOMAIN_ID}
          >
            <SelectTrigger
              aria-label="Domain"
              className="h-9 w-full justify-between rounded-md border-sidebar-border bg-sidebar-accent px-3 text-sm font-semibold text-foreground shadow-none hover:bg-sidebar-accent/80 [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate"
            >
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent align="start" className="min-w-56" position="popper">
              <SelectGroup>
                <SelectItem value={NO_DOMAIN_ID}>None</SelectItem>
                {domains.map((domain) => (
                  <SelectItem key={domain.id} value={domain.id}>
                    {domain.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Button
            aria-label="Create domain"
            className="h-9 rounded-md"
            disabled={isBusy}
            onClick={openCreateDomain}
            type="button"
          >
            <Plus data-icon="inline-start" />
          </Button>
          <Button
            aria-label="Edit domain"
            className="h-9 rounded-md"
            disabled={!activeDomain || isBusy}
            onClick={openEditDomain}
            type="button"
          >
            <Pencil data-icon="inline-start" />
          </Button>
          <Button
            aria-label="Delete domain"
            className="h-9 rounded-md"
            disabled={!activeDomain || domains.length <= 1 || isBusy}
            onClick={() => {
              setDeleteError(null);
              setDeleteOpen(true);
            }}
            type="button"
            variant="outline"
          >
            <Trash2 data-icon="inline-start" />
          </Button>
        </div>
      </SidebarHeader>
      <SidebarContent className="min-h-0 overflow-auto">
        <SidebarGroup
          className="gap-3 px-3 py-3"
          onContextMenu={(event) => {
            if (!canOrganizeDocuments) {
              return;
            }

            event.preventDefault();
            openCreateFolder();
          }}
        >
          <SidebarSeparator className="mx-0" />
          <div className="sticky top-0 z-10 flex min-h-9 items-center gap-2 bg-sidebar p-1">
            <Select
              disabled={classes.length === 0}
              onValueChange={(value) => {
                if (value !== NO_SHELF_CLASS_ID) {
                  onClassChange(value);
                }
              }}
              value={activeClass || NO_SHELF_CLASS_ID}
            >
              <SelectTrigger
                aria-label="Shelf class"
                className="h-auto flex-1 justify-between rounded-none border-0 bg-transparent px-1 py-0 text-xs font-semibold text-muted-foreground shadow-none hover:text-foreground focus-visible:ring-0 [&>svg]:hidden"
              >
                <span>{activeClass ? classLabel(activeClass) : "Rows"}</span>
                <Badge className={shelfCountBadgeClass} variant="secondary">{activeClassCount}</Badge>
              </SelectTrigger>
              <SelectContent position="popper" className="w-(--radix-select-trigger-width)">
                <SelectGroup>
                  {classes.length === 0 ? (
                    <SelectItem disabled value={NO_SHELF_CLASS_ID}>
                      Rows
                    </SelectItem>
                  ) : null}
                  {classes.map((itemClass) => (
                    <SelectItem key={itemClass.name} value={itemClass.name}>
                      <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                        <span className="min-w-0 truncate">{classLabel(itemClass.name)}</span>
                        <span className="justify-self-end text-xs font-semibold text-muted-foreground tabular-nums">{classCounts[itemClass.name] ?? 0}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          {documentImportError ? <p className="-mt-1 mx-1 text-xs leading-snug text-destructive">{documentImportError}</p> : null}
          {documentImportNotice ? <p className="-mt-1 mx-1 text-xs leading-snug text-muted-foreground">{documentImportNotice}</p> : null}
          <SidebarGroupContent
            onContextMenu={(event) => {
              if (!canOrganizeDocuments) {
                return;
              }

              event.preventDefault();
              openCreateFolder();
            }}
          >
            <SidebarMenu className="gap-0.5">
              {canOrganizeDocuments ? (
                <DocumentShelfRows
                  folders={shelfFolders}
                  folderItems={shelfFolderItems}
                  draggingRecord={draggingRecord}
                  isBusy={isBusy}
                  placedIds={placedIds}
                  rows={rows}
                  selectedFolderId={selectedFolderId}
                  selectedId={selectedId}
                  onDragStart={onDragStart}
                  onMoveDocumentToFolder={onMoveDocumentToShelfFolder}
                  onSelect={selectShelfDocument}
                  onSelectFolder={setSelectedFolderId}
                  onToggleFolder={onToggleShelfFolder}
                />
              ) : activeClass === "types" ? (
                <TypeShelfRows
                  placedIds={placedIds}
                  rows={rows}
                  selectedId={selectedId}
                  onDragStart={onDragStart}
                  onSelect={onSelect}
                />
              ) : (
                <TypeGroupedShelfRows
                  placedIds={placedIds}
                  rows={rows}
                  selectedId={selectedId}
                  onDragStart={onDragStart}
                  onSelect={onSelect}
                />
              )}
            </SidebarMenu>
            {rows.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Database />
                  </EmptyMedia>
                  <EmptyTitle>No rows</EmptyTitle>
                  <EmptyDescription>This class does not have any database rows yet.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : null}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border px-3 py-3">
        {/* TODO(forms): replace these class-specific actions with the universal form engine. */}
        {canImportDocument ? (
          <div className="grid grid-cols-4 gap-2">
            <Button
              aria-label="Upload document"
              className="h-9 rounded-md"
              disabled={isBusy}
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              <FileUp data-icon="inline-start" />
            </Button>
            <Button
              aria-label="Organize document"
              className="h-9 rounded-md"
              disabled={isBusy}
              onClick={openCreateFolder}
              type="button"
            >
              <FolderPlus data-icon="inline-start" />
            </Button>
            <Button
              aria-label="Edit document"
              className="h-9 rounded-md"
              disabled={isBusy || !selectedDocumentRow || !onOpenEditForm}
              onClick={() => {
                if (selectedDocumentRow) {
                  onOpenEditForm?.("documents", selectedDocumentRow.id);
                }
              }}
              type="button"
              variant="outline"
            >
              <Pencil data-icon="inline-start" />
            </Button>
            <Button
              aria-label={selectedFolder ? "Delete folder" : "Delete document"}
              className="h-9 rounded-md"
              disabled={
                isBusy ||
                (!selectedFolder && !selectedDocumentRow) ||
                (selectedFolder ? !onDeleteShelfFolder : !onDeleteDocument)
              }
              onClick={() => {
                openShelfDeleteDialog(
                  selectedFolder
                    ? { id: selectedFolder.id, kind: "folder", label: selectedFolder.label }
                    : selectedDocumentRow
                      ? { id: selectedDocumentRow.id, kind: "document", label: selectedDocumentRow.label }
                      : null
                );
              }}
              type="button"
              variant="destructive"
            >
              <Trash2 data-icon="inline-start" />
            </Button>
            <input
              accept=".md,.markdown,.html,.htm,.pdf,text/markdown,text/html,application/pdf"
              className="sr-only"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0] ?? null;
                event.currentTarget.value = "";

                if (file) {
                  void importDocumentFile(file);
                }
              }}
              ref={fileInputRef}
              type="file"
            />
          </div>
        ) : activeClass !== "documents" ? (
          <div className="grid grid-cols-3 gap-2">
            <Button
              aria-label="Create card"
              className="h-9 rounded-md"
              disabled={isBusy || !canOpenCreateRecordForm || !onOpenCreateForm}
              onClick={() => {
                if (canOpenCreateRecordForm) {
                  onOpenCreateForm?.(activeClass);
                }
              }}
              type="button"
            >
              <Plus data-icon="inline-start" />
            </Button>
            <Button
              aria-label="Edit selected graph row"
              className="h-9 rounded-md"
              disabled={isBusy || !canOpenEditRecordForm || !selectedGraphRecord || !onOpenEditForm}
              onClick={() => {
                if (selectedGraphRecord) {
                  onOpenEditForm?.(activeClass, selectedGraphRecord.id);
                }
              }}
              type="button"
              variant="outline"
            >
              <Pencil data-icon="inline-start" />
            </Button>
            <Button
              aria-label="Delete selected graph row"
              className="h-9 rounded-md"
              disabled={isBusy || !selectedGraphRecord || !onDeleteGraphSelection}
              onClick={() => {
                if (selectedGraphRecord) {
                  openShelfDeleteDialog({
                    kind: "graph",
                    label: selectedGraphRow?.label ?? "Selected row",
                    selection: selectedGraphRecord
                  });
                }
              }}
              type="button"
              variant="destructive"
            >
              <Trash2 data-icon="inline-start" />
            </Button>
          </div>
        ) : null}
      </SidebarFooter>
      <Dialog
        open={domainDialog !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDomainDialog(null);
          }
        }}
      >
        <DialogContent>
          <form className="flex flex-col gap-6" onSubmit={submitDomain}>
            <DialogHeader>
              <DialogTitle>{domainDialogTitle}</DialogTitle>
              <DialogDescription>Domains filter the shelf and graph rows.</DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="domain-label">Name</FieldLabel>
                <Input
                  id="domain-label"
                  autoFocus
                  value={domainForm.label}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setDomainForm((form) => ({ ...form, label: value }));
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="domain-slug">Slug</FieldLabel>
                <Input
                  id="domain-slug"
                  value={domainForm.slug}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setDomainForm((form) => ({ ...form, slug: value }));
                  }}
                />
                <FieldDescription>Leave blank to generate from the name.</FieldDescription>
              </Field>
              {domainError ? <p className="text-sm text-destructive">{domainError}</p> : null}
            </FieldGroup>
            <DialogFooter>
              <Button disabled={isBusy} type="submit">
                {domainDialog === "edit" ? "Save" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={cardDialogOpen} onOpenChange={setCardDialogOpen}>
        <DialogContent>
          <form className="flex flex-col gap-6" onSubmit={submitCard}>
            <DialogHeader>
              <DialogTitle>New {classLabel(activeClass).slice(0, -1).toLowerCase()}</DialogTitle>
              <DialogDescription>Create a card in the selected workspace.</DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="card-label">Name</FieldLabel>
                <Input
                  id="card-label"
                  autoFocus
                  value={cardForm.label}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setCardForm((form) => ({ ...form, label: value }));
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="card-type">Type</FieldLabel>
                <Input
                  id="card-type"
                  value={cardForm.type}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setCardForm((form) => ({ ...form, type: value }));
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="card-source">Source</FieldLabel>
                <Input
                  id="card-source"
                  value={cardForm.source}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setCardForm((form) => ({ ...form, source: value }));
                  }}
                />
                <FieldDescription>Optional reference or source path.</FieldDescription>
              </Field>
              {cardError ? <p className="text-sm text-destructive">{cardError}</p> : null}
            </FieldGroup>
            <DialogFooter>
              <Button disabled={isBusy} type="submit">
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent>
          <form className="flex flex-col gap-6" onSubmit={submitFolder}>
            <DialogHeader>
              <DialogTitle>{selectedDocumentRow ? "Organize document" : "New folder"}</DialogTitle>
              <DialogDescription>
                {selectedDocumentRow
                  ? `Add ${selectedDocumentRow.label} to a shelf folder.`
                  : "Create a collapsible group in the document shelf."}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup>
              {selectedDocumentRow && shelfFolders.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {shelfFolders.map((folder) => (
                    <Button
                      className="min-h-9 justify-start gap-2 text-left [&>span]:min-w-0 [&>span]:flex-1 [&>span]:truncate [&>svg:last-child]:ml-auto"
                      disabled={isBusy || selectedDocumentFolderId === folder.id}
                      key={folder.id}
                      onClick={() => {
                        void addSelectedDocumentToFolder(folder.id);
                      }}
                      type="button"
                      variant="outline"
                    >
                      <Folder data-icon="inline-start" />
                      <span>{folder.label}</span>
                      {selectedDocumentFolderId === folder.id ? <Check data-icon="inline-end" /> : null}
                    </Button>
                  ))}
                </div>
              ) : null}
              <Field>
                <FieldLabel htmlFor="shelf-folder-label">
                  {selectedDocumentRow ? "New folder" : "Name"}
                </FieldLabel>
                <Input
                  id="shelf-folder-label"
                  autoFocus
                  value={folderForm.label}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setFolderForm((form) => ({ ...form, label: value }));
                  }}
                />
              </Field>
              {folderError ? <p className="text-sm text-destructive">{folderError}</p> : null}
            </FieldGroup>
            <DialogFooter>
              <Button disabled={isBusy} type="submit">
                {selectedDocumentRow ? "Create and add" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete domain?</AlertDialogTitle>
            <AlertDialogDescription>
              This can only delete domains that do not have rows.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isBusy}
              onClick={(event) => {
                event.preventDefault();
                void confirmDeleteDomain();
              }}
              variant="destructive"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={shelfDeleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setShelfDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {shelfDeleteTarget?.kind === "graph" ? "row" : shelfDeleteTarget?.kind}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {shelfDeleteTarget?.kind === "folder"
                ? `This deletes the folder "${shelfDeleteTarget.label}" and leaves its documents in the shelf.`
                : shelfDeleteTarget
                  ? `This deletes "${shelfDeleteTarget.label}".`
                  : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {shelfDeleteError ? <p className="text-sm text-destructive">{shelfDeleteError}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isBusy}
              onClick={(event) => {
                event.preventDefault();
                void confirmShelfDelete();
              }}
              variant="destructive"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sidebar>
  );
}

function DocumentShelfRows({
  folders,
  folderItems,
  draggingRecord,
  isBusy,
  placedIds,
  rows,
  selectedFolderId,
  selectedId,
  onDragStart,
  onMoveDocumentToFolder,
  onSelect,
  onSelectFolder,
  onToggleFolder
}: {
  folders: ShelfFolderRecord[];
  folderItems: ShelfFolderItemRecord[];
  draggingRecord: SelectedRecord;
  isBusy: boolean;
  placedIds: Set<string>;
  rows: GraphItemRecord[];
  selectedFolderId: string | null;
  selectedId: string | null;
  onDragStart: (selection: SelectedRecord) => void;
  onMoveDocumentToFolder?: (folderId: string, documentId: string) => Promise<void>;
  onSelect: (selection: SelectedRecord) => void;
  onSelectFolder: (folderId: string) => void;
  onToggleFolder?: (folderId: string, collapsed: boolean) => Promise<void>;
}) {
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const folderIdByItemId = new Map(folderItems.map((item) => [item.item_id, item.folder_id]));
  const itemsByFolderId = new Map<string, ShelfFolderItemRecord[]>();

  for (const item of folderItems) {
    if (!rowsById.has(item.item_id)) {
      continue;
    }

    const items = itemsByFolderId.get(item.folder_id) ?? [];
    items.push(item);
    itemsByFolderId.set(item.folder_id, items);
  }

  const unfiledRows = rows.filter((row) => !folderIdByItemId.has(row.id));

  async function moveToFolder(folderId: string, event: React.DragEvent<HTMLButtonElement>) {
    if (!onMoveDocumentToFolder || isBusy) {
      return;
    }

    const selection = parseDraggedRecord(event.dataTransfer) ?? draggingRecord;

    if (selection?.kind !== "item" || !rowsById.has(selection.id)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    await onMoveDocumentToFolder(folderId, selection.id);
  }

  function allowFolderDrop(event: React.DragEvent<HTMLElement>) {
    if (!onMoveDocumentToFolder || isBusy) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  async function dropOnFolder(folderId: string, event: React.DragEvent<HTMLElement>) {
    if (!onMoveDocumentToFolder || isBusy) {
      return;
    }

    const selection = parseDraggedRecord(event.dataTransfer) ?? draggingRecord;

    if (selection?.kind !== "item" || !rowsById.has(selection.id)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    await onMoveDocumentToFolder(folderId, selection.id);
  }

  return (
    <>
      {folders.map((folder) => {
        const folderRows = (itemsByFolderId.get(folder.id) ?? [])
          .sort((left, right) => left.position - right.position)
          .map((item) => rowsById.get(item.item_id))
          .filter((row): row is GraphItemRecord => Boolean(row));

        return (
          <div
            className="grid gap-0.5"
            key={folder.id}
            onDragOver={allowFolderDrop}
            onDrop={(event) => {
              void dropOnFolder(folder.id, event);
            }}
          >
            <SidebarMenuItem>
              <button
                className={cn(
                  shelfGroupRowClass,
                  selectedFolderId === folder.id && "bg-sidebar-accent text-sidebar-accent-foreground"
                )}
                disabled={isBusy}
                onClick={() => {
                  onSelectFolder(folder.id);
                  void onToggleFolder?.(folder.id, !folder.collapsed);
                }}
                onDragOver={(event) => {
                  allowFolderDrop(event);
                }}
                onDrop={(event) => {
                  void moveToFolder(folder.id, event);
                }}
                type="button"
              >
                {folder.collapsed ? <ChevronRight /> : <ChevronDown />}
                <Folder />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold leading-4">{folder.label}</span>
                <Badge className={shelfCountBadgeClass} variant="secondary">{folderRows.length}</Badge>
              </button>
            </SidebarMenuItem>
            {!folder.collapsed ? (
              <div
                className="ml-4 grid gap-0.5 border-l border-sidebar-border pl-2"
                onDragOver={allowFolderDrop}
                onDrop={(event) => {
                  void dropOnFolder(folder.id, event);
                }}
              >
                {folderRows.length > 0 ? (
                  folderRows.map((row) => (
                    <ShelfRow
                      child
                      isPlaced={placedIds.has(row.id)}
                      key={row.id}
                      row={row}
                      selected={row.id === selectedId}
                      onDragStart={onDragStart}
                      onSelect={onSelect}
                    />
                  ))
                ) : (
                  <div className="my-1 rounded-md border border-dashed border-sidebar-border px-2 py-1.5 text-xs leading-snug text-muted-foreground">Drop documents here</div>
                )}
              </div>
            ) : null}
          </div>
        );
      })}
      {unfiledRows.map((row) => (
        <ShelfRow
          isPlaced={placedIds.has(row.id)}
          key={row.id}
          row={row}
          selected={row.id === selectedId}
          onDragStart={onDragStart}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

function TypeShelfRows({
  placedIds,
  rows,
  selectedId,
  onDragStart,
  onSelect
}: {
  placedIds: Set<string>;
  rows: GraphItemRecord[];
  selectedId: string | null;
  onDragStart: (selection: SelectedRecord) => void;
  onSelect: (selection: SelectedRecord) => void;
}) {
  const groups = useMemo(() => {
    const rowsByClass = new Map<string, GraphItemRecord[]>();

    for (const row of rows) {
      const itemTable = row.type || "unknown";
      const groupRows = rowsByClass.get(itemTable) ?? [];
      groupRows.push(row);
      rowsByClass.set(itemTable, groupRows);
    }

    return Array.from(rowsByClass.entries())
      .map(([itemTable, groupRows]) => ({
        itemTable,
        rows: groupRows.sort((left, right) => left.label.localeCompare(right.label))
      }))
      .sort((left, right) => classOrderIndex(left.itemTable) - classOrderIndex(right.itemTable) || classLabel(left.itemTable).localeCompare(classLabel(right.itemTable)));
  }, [rows]);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setOpenGroups((current) => {
      const next = { ...current };
      let changed = false;
      const groupIds = new Set(groups.map((group) => group.itemTable));

      for (const group of groups) {
        if (!(group.itemTable in next)) {
          next[group.itemTable] = true;
          changed = true;
        }
      }

      for (const key of Object.keys(next)) {
        if (!groupIds.has(key)) {
          delete next[key];
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [groups]);

  return (
    <>
      {groups.map((group) => {
        const expanded = openGroups[group.itemTable] ?? true;

        return (
          <div className="grid gap-0.5" key={group.itemTable}>
            <SidebarMenuItem>
              <button
                aria-label={expanded ? `Collapse ${classLabel(group.itemTable)} types` : `Expand ${classLabel(group.itemTable)} types`}
                className={shelfGroupRowClass}
                onClick={() => {
                  setOpenGroups((current) => ({
                    ...current,
                    [group.itemTable]: !(current[group.itemTable] ?? true)
                  }));
                }}
                type="button"
              >
                {expanded ? <ChevronDown /> : <ChevronRight />}
                <span className="size-2 shrink-0 rounded-full" style={{ background: itemColor(group.itemTable) }} />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold leading-4">{classLabel(group.itemTable)}</span>
                <Badge className={shelfCountBadgeClass} variant="secondary">{group.rows.length}</Badge>
              </button>
            </SidebarMenuItem>
            {expanded ? (
              <div className="ml-6 grid gap-0.5 border-l border-sidebar-border pl-2">
                {group.rows.map((row) => (
                  <ShelfRow
                    child
                    isPlaced={placedIds.has(row.id)}
                    key={row.id}
                    row={row}
                    selected={row.id === selectedId}
                    onDragStart={onDragStart}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

function TypeGroupedShelfRows({
  placedIds,
  rows,
  selectedId,
  onDragStart,
  onSelect
}: {
  placedIds: Set<string>;
  rows: GraphItemRecord[];
  selectedId: string | null;
  onDragStart: (selection: SelectedRecord) => void;
  onSelect: (selection: SelectedRecord) => void;
}) {
  const groups = useMemo(() => {
    const rowsByType = new Map<string, GraphItemRecord[]>();

    for (const row of rows) {
      const typeLabel = shelfTypeGroupLabel(row);
      const groupRows = rowsByType.get(typeLabel) ?? [];
      groupRows.push(row);
      rowsByType.set(typeLabel, groupRows);
    }

    return Array.from(rowsByType.entries())
      .map(([typeLabel, groupRows]) => ({
        rows: groupRows.sort((left, right) => shelfRowSortLabel(left).localeCompare(shelfRowSortLabel(right))),
        typeLabel
      }))
      .sort((left, right) => left.typeLabel.localeCompare(right.typeLabel));
  }, [rows]);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setOpenGroups((current) => {
      const next = { ...current };
      let changed = false;
      const groupIds = new Set(groups.map((group) => group.typeLabel));

      for (const group of groups) {
        if (!(group.typeLabel in next)) {
          next[group.typeLabel] = true;
          changed = true;
        }
      }

      for (const key of Object.keys(next)) {
        if (!groupIds.has(key)) {
          delete next[key];
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [groups]);

  return (
    <>
      {groups.map((group) => {
        const expanded = openGroups[group.typeLabel] ?? true;

        return (
          <div className="grid gap-0.5" key={group.typeLabel}>
            <SidebarMenuItem>
              <button
                aria-label={expanded ? `Collapse ${group.typeLabel}` : `Expand ${group.typeLabel}`}
                className={shelfGroupRowClass}
                onClick={() => {
                  setOpenGroups((current) => ({
                    ...current,
                    [group.typeLabel]: !(current[group.typeLabel] ?? true)
                  }));
                }}
                type="button"
              >
                {expanded ? <ChevronDown /> : <ChevronRight />}
                <span className="size-2 shrink-0 rounded-full" style={{ background: itemColor(group.rows[0]?.item_table ?? "nodes") }} />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold leading-4">{group.typeLabel}</span>
                <Badge className={shelfCountBadgeClass} variant="secondary">{group.rows.length}</Badge>
              </button>
            </SidebarMenuItem>
            {expanded ? (
              <div className="ml-6 grid gap-0.5 border-l border-sidebar-border pl-2">
                {group.rows.map((row) => (
                  <ShelfRow
                    child
                    isPlaced={placedIds.has(row.id)}
                    key={row.id}
                    row={row}
                    selected={row.id === selectedId}
                    onDragStart={onDragStart}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

function ShelfRow({
  child = false,
  isPlaced,
  row,
  selected,
  onDragStart,
  onSelect
}: {
  child?: boolean;
  isPlaced: boolean;
  row: GraphItemRecord;
  selected: boolean;
  onDragStart: (selection: SelectedRecord) => void;
  onSelect: (selection: SelectedRecord) => void;
}) {
  const isEdge = row.item_table === "edges";
  const selection: Exclude<SelectedRecord, null> = { kind: isEdge ? "edge" : "item", id: row.id };
  const canDrag = !NON_DRAGGABLE_ITEM_TABLES.has(row.item_table);
  const rowTitle = isEdge ? edgeDisplayLabel(row) : row.label;
  const rowSubtitle = isEdge ? row.label || displayTypeLabel(row.type) : null;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        draggable={canDrag}
        className={cn(shelfRowButtonClass, child && "min-h-7 pl-1.5 text-muted-foreground/90", !canDrag && "cursor-default active:cursor-default")}
        isActive={selected}
        onClick={() => onSelect(selection)}
        onDragEnd={() => {
          if (canDrag) {
            onDragStart(null);
          }
        }}
        onDragStart={(event) => {
          if (!canDrag) {
            event.preventDefault();
            return;
          }

          event.dataTransfer.effectAllowed = "copy";
          event.dataTransfer.setData("application/x-memoria-record", `${selection.kind}:${selection.id}`);
          event.dataTransfer.setData("text/plain", row.id);
          onDragStart(selection);
        }}
        onMouseDown={(event) => {
          if (canDrag && event.button === 0) {
            onDragStart(selection);
          }
        }}
        type="button"
      >
        <span className={cn("size-2 shrink-0 rounded-full bg-sidebar-border", child && "size-1.5", isPlaced && "bg-sidebar-primary")} />
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="truncate text-xs font-medium leading-4">{rowTitle}</span>
          {rowSubtitle ? <span className="truncate text-xs font-medium leading-3 text-muted-foreground">{rowSubtitle}</span> : null}
        </span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function classOrderIndex(itemTable: string) {
  const index = TYPE_SHELF_CLASS_ORDER.indexOf(itemTable);

  return index === -1 ? TYPE_SHELF_CLASS_ORDER.length : index;
}

function displayTypeLabel(type: string | null | undefined) {
  const normalized = type?.trim();

  if (!normalized) {
    return "None";
  }

  return normalized.replace(/[_-]/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function shelfTypeGroupLabel(row: GraphItemRecord) {
  return displayTypeLabel(row.type);
}

function shelfRowSortLabel(row: GraphItemRecord) {
  return row.item_table === "edges" ? edgeDisplayLabel(row) : row.label;
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
