"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderPlus,
  Search,
  Trash2,
} from "lucide-react";
import type { DragEvent, FormEvent, ReactNode } from "react";
import {
  cloneElement,
  Fragment,
  isValidElement,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  assignDocumentToShelfFolderShellAction,
  createDocumentShelfFolderShellAction,
  deleteDocumentShelfFolderShellAction,
  updateDocumentShelfFolderShellAction,
} from "@/app/(shell)/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClassControl } from "@/components/shell/ClassControl";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  type DocumentShelfFolder,
  type DocumentShelfFolderItem,
  isShelfClassKey,
  shelfDragDataType,
  type ShelfClassKey,
  type ShelfDragItem,
  type ShelfItem,
  type ShelfItemsResponse,
} from "@/domain/shelf";
import { cn } from "@/lib/utils";
import { resolveSurfaceShelf } from "@/lib/shell/surface-registry";
import type { ShelfClassOption } from "@/lib/shell/types";

const defaultClassOptions = [
  { id: "document", label: "Documents" },
  { id: "subject", label: "Subjects" },
  { id: "claim", label: "Claims" },
  { id: "relationship", label: "Relationships" },
  { id: "type", label: "Types" },
] satisfies ShelfClassOption[];

const defaultClassKey = "subject" satisfies ShelfClassKey;
const shelfFetchLimit = 500;
const groupedShelfVisibleItemLimit = 10;
const documentFolderDragDataType =
  "application/x-project-memoria-document-shelf-item";

export function Shelf() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const shelf = resolveSurfaceShelf(pathname);
  const selectedId = searchParams.get("sel");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [items, setItems] = useState<ShelfItem[]>([]);
  const [folders, setFolders] = useState<DocumentShelfFolder[]>([]);
  const [folderItems, setFolderItems] = useState<DocumentShelfFolderItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderDeleteTarget, setFolderDeleteTarget] =
    useState<DocumentShelfFolder | null>(null);
  const [folderPending, setFolderPending] = useState(false);
  const [folderLabel, setFolderLabel] = useState("");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const classOptions = shelf?.classOptions ?? defaultClassOptions;
  const domainSlug = searchParams.get("domain")?.trim() ?? "";
  const activeMapId = searchParams.get("map")?.trim() ?? "";
  const classParam = searchParams.get("class") ?? "";
  const selectedPackage = searchParams.get("pkg");
  const activeClass = resolveActiveClass(classParam, classOptions);
  const shelfSelectedId = classParam === activeClass ? selectedId : null;

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [query]);

  useEffect(() => {
    if (!shelf) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    let changed = false;

    const nextClass = resolveActiveClass(
      params.get("class") ?? "",
      classOptions
    );

    if (
      params.get("class") !== nextClass &&
      params.get("class") !== "domain_map"
    ) {
      params.set("class", nextClass);
      changed = true;
    }

    if (changed) {
      router.replace(`${pathname}?${params.toString()}`);
    }
  }, [classOptions, pathname, router, searchParams, shelf]);

  useEffect(() => {
    function refreshShelf() {
      setRefreshNonce((current) => current + 1);
    }

    window.addEventListener("memoria:shelf-refresh", refreshShelf);

    return () =>
      window.removeEventListener("memoria:shelf-refresh", refreshShelf);
  }, []);

  useEffect(() => {
    if (!shelf || !domainSlug) {
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({
      class: activeClass,
      domain: domainSlug,
      limit: String(shelfFetchLimit),
    });
    const normalizedQuery = debouncedQuery.trim();

    if (normalizedQuery) {
      params.set("q", normalizedQuery);
    }
    if (activeMapId) {
      params.set("map", activeMapId);
    }

    fetch(`/api/shelf?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Shelf data could not be loaded.");
        }

        return (await response.json()) as ShelfItemsResponse;
      })
      .then((payload) => {
        setItems(payload.items);
        setFolders(payload.folders ?? []);
        setFolderItems(payload.folderItems ?? []);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setItems([]);
        setFolders([]);
        setFolderItems([]);
        setLoadError(
          error instanceof Error
            ? error.message
            : "Shelf data could not be loaded."
        );
      });

    return () => controller.abort();
  }, [
    activeClass,
    activeMapId,
    debouncedQuery,
    domainSlug,
    refreshNonce,
    shelf,
  ]);

  const itemHrefs = useMemo(() => {
    const hrefs = new Map<string, string>();

    for (const item of items) {
      const params = new URLSearchParams(searchParams.toString());
      if (domainSlug) {
        params.set("domain", domainSlug);
      } else {
        params.delete("domain");
      }
      params.set("class", activeClass);
      params.set("sel", item.id);
      params.delete("candidate");
      params.delete("pkg");
      params.delete("step");
      hrefs.set(item.id, `${pathname}?${params.toString()}`);
    }

    return hrefs;
  }, [activeClass, domainSlug, items, pathname, searchParams]);

  function handleClassChange(nextClass: ShelfClassKey) {
    const params = new URLSearchParams(searchParams.toString());
    if (domainSlug) {
      params.set("domain", domainSlug);
    } else {
      params.delete("domain");
    }
    params.set("class", nextClass);
    params.delete("sel");
    params.delete("candidate");
    params.delete("pkg");
    params.delete("step");
    router.replace(`${pathname}?${params.toString()}`);
  }

  async function handleCreateFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (folderPending) {
      return;
    }

    setFolderError(null);
    setFolderPending(true);

    const result = await createDocumentShelfFolderShellAction(domainSlug, {
      label: folderLabel,
      selectedDocumentId: shelfSelectedId,
    });

    setFolderPending(false);

    if (!result.ok) {
      setFolderError(result.error.message);
      return;
    }

    setFolderDialogOpen(false);
    setFolderLabel("");
    window.dispatchEvent(new Event("memoria:shelf-refresh"));
    router.refresh();
  }

  async function handleDeleteFolder() {
    if (!folderDeleteTarget || folderPending) {
      return;
    }

    setFolderError(null);
    setFolderPending(true);

    const result = await deleteDocumentShelfFolderShellAction(
      domainSlug,
      folderDeleteTarget.id
    );

    setFolderPending(false);

    if (!result.ok) {
      setFolderError(result.error.message);
      return;
    }

    setFolderDeleteTarget(null);
    window.dispatchEvent(new Event("memoria:shelf-refresh"));
    router.refresh();
  }

  if (!shelf) {
    return (
      <Sidebar collapsible="none" className="h-full min-h-0 w-full">
        <SidebarHeader>
          <h2 className="px-2 text-sm font-medium">Shelf</h2>
        </SidebarHeader>
        <ShelfEmpty message="No shelf is available for this route." />
      </Sidebar>
    );
  }

  return (
    <Sidebar collapsible="none" className="h-full min-h-0 w-full">
      <SidebarHeader className="gap-3 p-3">
        <h2 className="px-0 text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
          {shelf.title}
        </h2>

        <ClassControl
          options={classOptions}
          value={activeClass}
          onValueChange={handleClassChange}
        />

        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <SidebarInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter shelf"
              className="h-10 pl-9"
              aria-label="Filter shelf"
            />
          </div>
          {activeClass === "document" ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label="Create document folder"
                  className="h-10 shrink-0"
                  onClick={() => {
                    setFolderError(null);
                    setFolderDialogOpen(true);
                  }}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <FolderPlus />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Create document folder</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
        {folderError ? (
          <p className="text-xs text-destructive" role="alert">
            {folderError}
          </p>
        ) : null}
      </SidebarHeader>

      <SidebarSeparator />
      <SidebarContent className="bg-[radial-gradient(circle_at_1px_1px,color-mix(in_oklab,var(--muted-foreground)_14%,transparent)_1px,transparent_1px)] [background-size:18px_18px] shadow-[inset_0_8px_14px_-8px_rgb(0_0_0_/_0.55)]">
        <SidebarGroup className="p-3">
          <SidebarGroupContent>
            <SidebarMenu className="gap-2">
              {loadError ? (
                <ShelfEmpty message={loadError} />
              ) : items.length > 0 ||
                (activeClass === "document" && folders.length > 0) ? (
                activeClass === "document" ? (
                  <DocumentShelfSections
                    domainSlug={domainSlug}
                    folderItems={folderItems}
                    folders={folders}
                    itemHrefs={itemHrefs}
                    items={items}
                    onDeleteFolder={setFolderDeleteTarget}
                    onFolderError={setFolderError}
                    pathname={pathname}
                    selectedId={shelfSelectedId}
                  />
                ) : activeClass === "bundle" ? (
                  <BundleShelfSections
                    items={items}
                    pathname={pathname}
                    searchParams={searchParams}
                    selectedId={shelfSelectedId}
                    selectedPackage={selectedPackage}
                  />
                ) : isGroupedShelfClass(activeClass) ? (
                  <GroupedShelfSections
                    key={activeClass}
                    items={items}
                    itemHrefs={itemHrefs}
                    pathname={pathname}
                    selectedId={shelfSelectedId}
                  />
                ) : (
                  items.map((item) => (
                    <ShelfItemCard
                      key={item.id}
                      active={shelfSelectedId === item.id}
                      href={itemHrefs.get(item.id) ?? pathname}
                      item={item}
                    />
                  ))
                )
              ) : (
                <ShelfEmpty message={shelf.emptyHint ?? "No items to show."} />
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <Dialog
        open={folderDialogOpen}
        onOpenChange={(nextOpen) => {
          if (!folderPending) {
            setFolderDialogOpen(nextOpen);
            if (!nextOpen) {
              setFolderLabel("");
              setFolderError(null);
            }
          }
        }}
      >
        <DialogContent>
          <form className="grid gap-6" onSubmit={handleCreateFolder}>
            <DialogHeader>
              <DialogTitle>Create document folder</DialogTitle>
              <DialogDescription>
                {shelfSelectedId
                  ? "The selected document will be filed into this folder."
                  : "The folder will appear on the document shelf."}
              </DialogDescription>
            </DialogHeader>
            <SidebarInput
              autoFocus
              disabled={folderPending}
              onChange={(event) => setFolderLabel(event.target.value)}
              placeholder="Folder label"
              value={folderLabel}
            />
            {folderError ? (
              <p className="text-sm text-destructive" role="alert">
                {folderError}
              </p>
            ) : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button
                  disabled={folderPending}
                  type="button"
                  variant="outline"
                >
                  Cancel
                </Button>
              </DialogClose>
              <Button disabled={folderPending} type="submit">
                {folderPending ? "Creating" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(folderDeleteTarget)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !folderPending) {
            setFolderDeleteTarget(null);
            setFolderError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete folder?</DialogTitle>
            <DialogDescription>
              Documents stay on the shelf. Only the folder and its filing are
              removed.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm font-medium text-foreground">
            {folderDeleteTarget?.label}
          </p>
          {folderError ? (
            <p className="text-sm text-destructive" role="alert">
              {folderError}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button disabled={folderPending} type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              disabled={folderPending}
              onClick={() => void handleDeleteFolder()}
              type="button"
              variant="destructive"
            >
              {folderPending ? "Deleting" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sidebar>
  );
}

function DocumentShelfSections({
  domainSlug,
  folderItems,
  folders,
  itemHrefs,
  items,
  onDeleteFolder,
  onFolderError,
  pathname,
  selectedId,
}: {
  domainSlug: string;
  folderItems: DocumentShelfFolderItem[];
  folders: DocumentShelfFolder[];
  itemHrefs: Map<string, string>;
  items: ShelfItem[];
  onDeleteFolder: (folder: DocumentShelfFolder) => void;
  onFolderError: (message: string | null) => void;
  pathname: string;
  selectedId: string | null;
}) {
  const filedItemIds = new Set(folderItems.map((item) => item.itemId));
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const folderItemsByFolder = new Map<string, ShelfItem[]>();

  for (const folderItem of folderItems) {
    const item = itemsById.get(folderItem.itemId);

    if (!item) {
      continue;
    }

    const existing = folderItemsByFolder.get(folderItem.folderId);

    if (existing) {
      existing.push(item);
    } else {
      folderItemsByFolder.set(folderItem.folderId, [item]);
    }
  }

  const unfiledItems = items.filter((item) => !filedItemIds.has(item.id));

  async function assignToFolder(folderId: string, dragItem: ShelfDragItem) {
    if (dragItem.classKey !== "document") {
      return;
    }

    onFolderError(null);

    const result = await assignDocumentToShelfFolderShellAction(domainSlug, {
      documentId: dragItem.id,
      folderId,
    });

    if (!result.ok) {
      onFolderError(result.error.message);
      return;
    }

    window.dispatchEvent(new Event("memoria:shelf-refresh"));
  }

  async function toggleFolder(folder: DocumentShelfFolder) {
    onFolderError(null);

    const result = await updateDocumentShelfFolderShellAction(
      domainSlug,
      folder.id,
      {
        collapsed: !folder.collapsed,
      }
    );

    if (!result.ok) {
      onFolderError(result.error.message);
      return;
    }

    window.dispatchEvent(new Event("memoria:shelf-refresh"));
  }

  return (
    <>
      {folders.map((folder, index) => {
        const visibleItems = folderItemsByFolder.get(folder.id) ?? [];

        return (
          <Fragment key={folder.id}>
            <SidebarMenuItem className={index > 0 ? "pt-2" : undefined}>
              <div
                className="group/folder flex items-center gap-1 rounded-[var(--radius-md)] border border-border bg-card/85 px-1.5 py-1.5 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--foreground)_7%,transparent),0_1px_1px_rgb(0_0_0_/_0.25)] transition-colors data-[drop=true]:border-primary/60 data-[drop=true]:bg-primary/10"
                onDragOver={(event) => {
                  if (canAcceptDocumentDrop(event)) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }
                }}
                onDrop={(event) => {
                  const dragItem = readShelfDragItem(event);

                  if (!dragItem || dragItem.classKey !== "document") {
                    return;
                  }

                  event.preventDefault();
                  void assignToFolder(folder.id, dragItem);
                }}
              >
                <button
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-[calc(var(--radius-md)-2px)] px-1.5 py-1 text-left text-sidebar-foreground transition-colors hover:bg-muted"
                  onClick={() => void toggleFolder(folder)}
                  type="button"
                >
                  {folder.collapsed ? (
                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <Folder className="size-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {folder.label}
                  </span>
                  <span className="rounded-full border border-border bg-background px-1.5 py-0.5 font-heading text-[10px] text-muted-foreground tabular-nums">
                    {visibleItems.length}
                  </span>
                </button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label={`Delete ${folder.label}`}
                      className="size-7 shrink-0 text-muted-foreground opacity-70 hover:bg-destructive/10 hover:text-destructive group-hover/folder:opacity-100"
                      onClick={() => {
                        onFolderError(null);
                        onDeleteFolder(folder);
                      }}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete folder</TooltipContent>
                </Tooltip>
              </div>
            </SidebarMenuItem>
            {!folder.collapsed
              ? visibleItems.map((item) => (
                  <ShelfItemCard
                    key={item.id}
                    active={selectedId === item.id}
                    href={itemHrefs.get(item.id) ?? pathname}
                    item={item}
                  />
                ))
              : null}
          </Fragment>
        );
      })}
      {folders.length > 0 && unfiledItems.length > 0 ? (
        <SidebarMenuItem className="pt-2">
          <div className="flex items-center gap-2 px-1 py-1.5">
            <span className="h-px flex-1 bg-border" />
            <span className="max-w-32 truncate font-heading text-[10px] font-semibold tracking-[0.14em] text-primary uppercase">
              Unfiled
            </span>
            <span className="rounded-full border border-border bg-card px-1.5 py-0.5 font-heading text-[10px] text-muted-foreground tabular-nums">
              {unfiledItems.length}
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>
        </SidebarMenuItem>
      ) : null}
      {unfiledItems.map((item) => (
        <ShelfItemCard
          key={item.id}
          active={selectedId === item.id}
          href={itemHrefs.get(item.id) ?? pathname}
          item={item}
        />
      ))}
    </>
  );
}

function GroupedShelfSections({
  items,
  itemHrefs,
  pathname,
  selectedId,
}: {
  items: ShelfItem[];
  itemHrefs: Map<string, string>;
  pathname: string;
  selectedId: string | null;
}) {
  const groups = groupShelfItems(items);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set()
  );

  function toggleGroup(groupKey: string) {
    setCollapsedGroups((current) => {
      const next = new Set(current);

      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }

      return next;
    });
  }

  return (
    <>
      {groups.map((group, index) => {
        const collapsed = collapsedGroups.has(group.key);

        return (
          <Fragment key={group.key}>
            <SidebarMenuItem className={index > 0 ? "pt-2" : undefined}>
              <button
                aria-expanded={!collapsed}
                className="flex w-full items-center gap-2 rounded-[var(--radius-md)] px-1 py-1.5 text-left transition-colors hover:bg-muted"
                onClick={() => toggleGroup(group.key)}
                type="button"
              >
                {collapsed ? (
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="h-px flex-1 bg-border" />
                <span className="max-w-32 truncate font-heading text-[10px] font-semibold tracking-[0.14em] text-primary uppercase">
                  {group.label}
                </span>
                <span className="rounded-full border border-border bg-card px-1.5 py-0.5 font-heading text-[10px] text-muted-foreground tabular-nums">
                  {group.items.length}
                </span>
                <span className="h-px flex-1 bg-border" />
              </button>
            </SidebarMenuItem>
            {collapsed
              ? null
              : renderGroupedShelfItems(
                  group.items.map((item) => (
                    <ShelfItemCard
                      key={item.id}
                      active={selectedId === item.id}
                      href={itemHrefs.get(item.id) ?? pathname}
                      item={item}
                    />
                  )),
                  `${group.key}-items`
                )}
          </Fragment>
        );
      })}
    </>
  );
}

function BundleShelfSections({
  items,
  pathname,
  searchParams,
  selectedId,
  selectedPackage,
}: {
  items: ShelfItem[];
  pathname: string;
  searchParams: URLSearchParams;
  selectedId: string | null;
  selectedPackage: string | null;
}) {
  const groups = groupShelfItems(items);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set()
  );

  function toggleGroup(groupKey: string) {
    setCollapsedGroups((current) => {
      const next = new Set(current);

      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }

      return next;
    });
  }

  function packageHref(item: ShelfItem) {
    const parsed = parseBundlePackageShelfId(item.id);
    const params = new URLSearchParams(searchParams.toString());
    params.set("class", "bundle");
    params.set("sel", parsed?.bundleId ?? item.id);
    if (parsed) {
      params.set("pkg", parsed.packageId);
    } else {
      params.delete("pkg");
    }
    params.delete("candidate");
    params.delete("step");

    return `${pathname}?${params.toString()}`;
  }

  return (
    <>
      {groups.map((group, index) => {
        const collapsed = collapsedGroups.has(group.key);

        return (
          <Fragment key={group.key}>
            <SidebarMenuItem className={index > 0 ? "pt-2" : undefined}>
              <button
                aria-expanded={!collapsed}
                className="flex w-full items-center gap-2 rounded-[var(--radius-md)] px-1 py-1.5 text-left transition-colors hover:bg-muted"
                onClick={() => toggleGroup(group.key)}
                type="button"
              >
                {collapsed ? (
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="h-px flex-1 bg-border" />
                <span className="max-w-32 truncate font-heading text-[10px] font-semibold tracking-[0.14em] text-primary uppercase">
                  {group.label}
                </span>
                <span className="rounded-full border border-border bg-card px-1.5 py-0.5 font-heading text-[10px] text-muted-foreground tabular-nums">
                  {group.items.length}
                </span>
                <span className="h-px flex-1 bg-border" />
              </button>
            </SidebarMenuItem>
            {collapsed
              ? null
              : renderGroupedShelfItems(
                  group.items.map((item) => {
                    const parsed = parseBundlePackageShelfId(item.id);
                    const active =
                      parsed !== null &&
                      selectedId === parsed.bundleId &&
                      selectedPackage === parsed.packageId;

                    return (
                      <BundlePackageShelfItem
                        active={active}
                        href={packageHref(item)}
                        item={item}
                        key={item.id}
                      />
                    );
                  }),
                  `${group.key}-items`
                )}
          </Fragment>
        );
      })}
    </>
  );
}

function renderGroupedShelfItems(items: ReactNode[], key: string) {
  if (items.length <= groupedShelfVisibleItemLimit) {
    return items;
  }

  return (
    <SidebarMenuItem key={key} className="min-h-0">
      <ScrollArea className="h-[31rem] pr-2">
        <div className="grid gap-2">
          {items.map((item) => makeNestedShelfItem(item))}
        </div>
      </ScrollArea>
    </SidebarMenuItem>
  );
}

function makeNestedShelfItem(item: ReactNode) {
  return isValidElement<{ nested?: boolean }>(item)
    ? cloneElement(item, { nested: true })
    : item;
}

function ShelfItemCard({
  active,
  childrenCollapsed,
  href,
  item,
  nested = false,
  onToggleChildren,
}: {
  active: boolean;
  childrenCollapsed?: boolean;
  href: string;
  item: ShelfItem;
  nested?: boolean;
  onToggleChildren?: () => void;
}) {
  const canDragToGraph =
    item.classKey === "subject" || item.classKey === "relationship";
  const canDragToShelfFolder = item.classKey === "document";
  const canDrag = canDragToGraph || canDragToShelfFolder;

  const content = (
    <>
      <SidebarMenuButton
        asChild
        isActive={active}
        className="h-auto items-start rounded-[var(--radius-md)] border border-border bg-[linear-gradient(180deg,color-mix(in_oklab,var(--muted)_82%,var(--foreground)_8%)_0%,var(--muted)_100%)] px-3 py-2.5 text-sidebar-foreground shadow-[inset_0_1px_0_color-mix(in_oklab,var(--foreground)_8%,transparent),0_1px_1px_rgb(0_0_0_/_0.35),0_8px_18px_-12px_rgb(0_0_0_/_0.9)] transition-[transform,border-color,box-shadow,color] hover:-translate-y-0.5 hover:border-primary/35 hover:text-sidebar-accent-foreground hover:shadow-[inset_0_1px_0_color-mix(in_oklab,var(--foreground)_10%,transparent),0_2px_2px_rgb(0_0_0_/_0.35),0_10px_20px_-12px_rgb(0_0_0_/_0.95)] data-active:border-primary/50 data-active:bg-primary/10 data-active:bg-none data-active:text-foreground"
      >
        <Link
          href={href}
          draggable={canDrag}
          onDragStart={(event) => {
            if (!canDrag) {
              event.preventDefault();
              return;
            }

            const dragItem: ShelfDragItem = {
              classKey: item.classKey,
              id: item.id,
              title: item.title,
            };

            event.dataTransfer.effectAllowed = canDragToShelfFolder
              ? "copyMove"
              : "copy";
            event.dataTransfer.setData(
              shelfDragDataType,
              JSON.stringify(dragItem)
            );
            if (canDragToShelfFolder) {
              event.dataTransfer.setData(documentFolderDragDataType, item.id);
            }
            event.dataTransfer.setData("text/plain", item.id);
          }}
        >
          <span
            aria-hidden="true"
            data-icon="inline-start"
            className={cn(
              "mt-1.5 size-2 shrink-0 rounded-full border transition-[background-color,border-color,box-shadow]",
              item.isOnActiveMap
                ? "border-primary bg-primary shadow-[0_0_12px_color-mix(in_oklab,var(--primary)_72%,transparent)]"
                : "border-muted-foreground/45 bg-muted-foreground/35 group-hover/menu-button:border-primary/60 group-hover/menu-button:bg-primary/60"
            )}
          />
          <span className="grid min-w-0 flex-1 gap-0.5">
            <span className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {item.title}
              </span>
              {item.badgeLabel ? (
                <Badge variant="outline">{item.badgeLabel}</Badge>
              ) : null}
              {item.weight !== undefined ? (
                <span
                  aria-label={`Weight ${item.weight}`}
                  className="shrink-0 rounded-full border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground tabular-nums"
                >
                  {item.weight}
                </span>
              ) : null}
            </span>
            {item.meta ? (
              <span className="truncate font-mono text-[11px] text-muted-foreground">
                {item.meta}
              </span>
            ) : null}
          </span>
        </Link>
      </SidebarMenuButton>
      {onToggleChildren ? (
        <Button
          aria-label={childrenCollapsed ? "Show packages" : "Hide packages"}
          className="absolute top-2 right-2 size-6 bg-background/70"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggleChildren();
          }}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          {childrenCollapsed ? <ChevronRight /> : <ChevronDown />}
        </Button>
      ) : null}
    </>
  );

  if (nested) {
    return <div className="relative">{content}</div>;
  }

  return <SidebarMenuItem className="relative">{content}</SidebarMenuItem>;
}

function BundlePackageShelfItem({
  active,
  href,
  item,
  nested = false,
}: {
  active: boolean;
  href: string;
  item: ShelfItem;
  nested?: boolean;
}) {
  const content = (
      <SidebarMenuButton
        asChild
        isActive={active}
        className="h-auto items-start rounded-[var(--radius-md)] border border-border bg-[linear-gradient(180deg,color-mix(in_oklab,var(--muted)_82%,var(--foreground)_8%)_0%,var(--muted)_100%)] px-3 py-2.5 text-sidebar-foreground shadow-[inset_0_1px_0_color-mix(in_oklab,var(--foreground)_8%,transparent),0_1px_1px_rgb(0_0_0_/_0.35),0_8px_18px_-12px_rgb(0_0_0_/_0.9)] transition-[transform,border-color,box-shadow,color] hover:-translate-y-0.5 hover:border-primary/35 hover:text-sidebar-accent-foreground hover:shadow-[inset_0_1px_0_color-mix(in_oklab,var(--foreground)_10%,transparent),0_2px_2px_rgb(0_0_0_/_0.35),0_10px_20px_-12px_rgb(0_0_0_/_0.95)] data-active:border-primary/50 data-active:bg-primary/10 data-active:bg-none data-active:text-foreground"
      >
        <Link href={href}>
          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
          <span className="grid min-w-0 flex-1 gap-0.5">
            <span className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-xs font-medium">
                {item.title}
              </span>
              {item.badgeLabel ? (
                <Badge variant="outline">{item.badgeLabel}</Badge>
              ) : null}
            </span>
            {item.meta ? (
              <span className="truncate font-mono text-[10px] text-muted-foreground">
                {item.meta}
              </span>
            ) : null}
          </span>
        </Link>
      </SidebarMenuButton>
  );

  if (nested) {
    return <div>{content}</div>;
  }

  return <SidebarMenuItem>{content}</SidebarMenuItem>;
}

function parseBundlePackageShelfId(id: string) {
  const separatorIndex = id.indexOf(":");

  if (separatorIndex < 0) {
    return null;
  }

  const bundleId = id.slice(0, separatorIndex);
  const packageId = id.slice(separatorIndex + 1);

  if (!bundleId || !packageId) {
    return null;
  }

  return {
    bundleId,
    packageId,
  };
}

function groupShelfItems(items: ShelfItem[]) {
  const groups = new Map<
    string,
    {
      items: ShelfItem[];
      key: string;
      label: string;
    }
  >();

  for (const item of items) {
    const key = item.groupKey ?? "untyped";
    const label = item.groupLabel ?? "Uncategorized";
    const group = groups.get(key);

    if (group) {
      group.items.push(item);
    } else {
      groups.set(key, {
        items: [item],
        key,
        label,
      });
    }
  }

  return Array.from(groups.values());
}

function isGroupedShelfClass(classKey: ShelfClassKey) {
  return (
    classKey === "subject" ||
    classKey === "claim" ||
    classKey === "relationship" ||
    classKey === "bundle" ||
    classKey === "type"
  );
}

function canAcceptDocumentDrop(event: DragEvent<HTMLElement>) {
  return Array.from(event.dataTransfer.types).includes(
    documentFolderDragDataType
  );
}

function readShelfDragItem(
  event: DragEvent<HTMLElement>
): ShelfDragItem | null {
  const raw = event.dataTransfer.getData(shelfDragDataType);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ShelfDragItem>;

    if (
      parsed.id &&
      parsed.title &&
      parsed.classKey &&
      isShelfClassKey(parsed.classKey)
    ) {
      return {
        classKey: parsed.classKey,
        id: parsed.id,
        title: parsed.title,
      };
    }
  } catch {
    return null;
  }

  return null;
}

function resolveActiveClass(
  classParam: string,
  classOptions: ShelfClassOption[]
): ShelfClassKey {
  const fallback = classOptions[0]?.id ?? defaultClassKey;

  if (
    isShelfClassKey(classParam) &&
    classOptions.some((option) => option.id === classParam)
  ) {
    return classParam;
  }

  return fallback;
}

function ShelfEmpty({ message }: { message: string }) {
  return (
    <Empty className="min-h-36 border-0 p-4">
      <EmptyHeader>
        <EmptyDescription>{message}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
