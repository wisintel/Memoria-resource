"use client";

import { ChevronRight } from "lucide-react";
import { useState, type ComponentType, type DragEvent, type MouseEvent, type ReactNode } from "react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export type AtlasShelfOption = {
  count?: number;
  disabled?: boolean;
  label: string;
  value: string;
};

export type AtlasShelfItem = {
  active?: boolean;
  detail?: string;
  icon?: ComponentType<{ "aria-hidden"?: boolean; "data-icon"?: string }>;
  id: string;
  inView?: boolean;
  status?: string;
  subtitle?: string;
  title: string;
};

export type AtlasShelfGroup = {
  collapsed?: boolean;
  droppable?: boolean;
  id: string;
  items: AtlasShelfItem[];
  onDropItem?: (itemId: string) => void;
  onToggleCollapsed?: (collapsed: boolean) => void;
  title: string;
};

const atlasShelfItemDragType = "application/x-atlas-shelf-item";

export type AtlasShelfProps = {
  actions?: ReactNode;
  activeItemId?: string;
  className?: string;
  displayTitle?: boolean;
  emptyDescription?: string;
  emptyIcon?: ComponentType<{ "aria-hidden"?: boolean; "data-icon"?: string }>;
  emptyTitle?: string;
  filterAction?: ReactNode;
  filterLabel?: string;
  filterOptions?: AtlasShelfOption[];
  filterValue?: string;
  footer?: ReactNode;
  itemsDraggable?: boolean;
  items: AtlasShelfItem[];
  itemGroups?: AtlasShelfGroup[];
  itemActions?: (item: AtlasShelfItem) => ReactNode;
  onFilterChange?: (value: string) => void;
  onItemDragStart?: (id: string) => void;
  onItemSelect?: (id: string) => void;
  onShelfContextMenu?: (event: MouseEvent) => void;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  searchValue?: string;
  showEmptyState?: boolean;
  subtitle?: string;
  title: string;
};

export function AtlasShelf({
  actions,
  activeItemId,
  className,
  displayTitle = true,
  emptyDescription = "No records match the current view.",
  emptyIcon: EmptyIcon,
  emptyTitle = "Nothing here yet",
  filterAction,
  filterLabel = "Type",
  filterOptions = [],
  filterValue,
  footer,
  itemsDraggable = false,
  items,
  itemGroups,
  itemActions,
  onFilterChange,
  onItemDragStart,
  onItemSelect,
  onShelfContextMenu,
  onSearchChange,
  searchPlaceholder = "Search shelf",
  searchValue,
  showEmptyState = true,
  subtitle,
  title,
}: AtlasShelfProps) {
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  const hasFilter = filterOptions.length > 0;
  const hasControls = Boolean(onSearchChange || actions);
  const hasGroups = Boolean(itemGroups?.length);
  const selectedFilterValue = filterValue ?? filterOptions[0]?.value;
  const selectedFilterOption = filterOptions.find((option) => option.value === selectedFilterValue);

  return (
    <SidebarProvider className="h-full min-h-0 w-full">
      <Sidebar
        aria-label={title}
        className={cn("h-full w-full border-0 bg-sidebar text-sidebar-foreground", className)}
        collapsible="none"
      >
        <SidebarHeader className="px-5 pt-3 pb-0">
          {displayTitle || actions ? (
            <div className="flex min-w-0 flex-col items-start gap-2.5">
              {displayTitle ? (
                <div className="flex w-full min-w-0 items-center justify-between gap-3">
                  <h2 className="truncate text-muted-foreground">{title}</h2>
                  {subtitle ? <p className="truncate text-muted-foreground">{subtitle}</p> : null}
                </div>
              ) : null}
              {actions ? <div className="w-full shrink-0">{actions}</div> : null}
            </div>
          ) : null}

          {hasControls ? (
            <div className="flex flex-col gap-2">
              {onSearchChange ? (
                <SidebarInput
                  aria-label={searchPlaceholder}
                  className="text-xs"
                  placeholder={searchPlaceholder}
                  value={searchValue}
                  onChange={(event) => onSearchChange(event.currentTarget.value)}
                />
              ) : null}

            </div>
          ) : null}
        </SidebarHeader>

        <SidebarSeparator />

        <SidebarContent>
          <SidebarGroup onContextMenu={onShelfContextMenu}>
            <SidebarGroupLabel className="mb-2 h-9 px-1">
              {hasFilter ? (
                <div className="flex w-full items-center gap-2">
                  <Select
                    value={selectedFilterValue}
                    onValueChange={(nextValue) => {
                      if (nextValue !== null) {
                        onFilterChange?.(nextValue);
                      }
                    }}
                  >
                    <SelectTrigger
                      aria-label={filterLabel}
                      className="h-8 min-w-0 flex-1 justify-between rounded-md border-sidebar-border bg-sidebar px-2 text-xs font-medium text-muted-foreground shadow-none"
                    >
                      <SelectValue placeholder={filterLabel}>
                        {(value: string | null) =>
                          filterOptions.find((option) => option.value === value)?.label ?? filterLabel
                        }
                      </SelectValue>
                      {typeof selectedFilterOption?.count === "number" ? (
                        <span className="ml-auto text-muted-foreground">{selectedFilterOption.count}</span>
                      ) : null}
                    </SelectTrigger>
                    <SelectContent align="start" alignItemWithTrigger={false} side="bottom">
                      <SelectGroup>
                        {filterOptions.map((option) => (
                          <SelectItem key={option.value} disabled={option.disabled} value={option.value}>
                            <span className="flex w-full items-center justify-between gap-3">
                              <span>{option.label}</span>
                              {typeof option.count === "number" ? (
                                <span className="text-muted-foreground">{option.count}</span>
                              ) : null}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {filterAction ? <div className="shrink-0">{filterAction}</div> : null}
                </div>
              ) : (
                <span className="flex w-full items-center justify-between">
                  <span>Nodes</span>
                  <span>{items.length}</span>
                </span>
              )}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              {items.length > 0 || hasGroups ? (
                hasGroups ? (
                  <div className="flex flex-col gap-2">
                    {itemGroups?.map((group) => {
                      const collapsed = group.collapsed ?? false;
                      const dragOver = dragOverGroupId === group.id;

                      return (
                      <div
                        key={group.id}
                        className="group/shelf-section"
                        onDragLeave={(event) => {
                          const nextTarget = event.relatedTarget;

                          if (
                            !group.droppable ||
                            (nextTarget instanceof Node && event.currentTarget.contains(nextTarget))
                          ) {
                            return;
                          }

                          setDragOverGroupId(null);
                        }}
                        onDragOver={(event) => {
                          handleGroupDragOver(event, group);
                          if (group.droppable) {
                            setDragOverGroupId(group.id);
                          }
                        }}
                        onDrop={(event) => {
                          handleGroupDrop(event, group);
                          setDragOverGroupId(null);
                        }}
                      >
                        <button
                          className={cn(
                            "flex h-8 w-full cursor-pointer list-none items-center gap-2 rounded-md px-2 text-left text-xs font-medium text-muted-foreground transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                            dragOver ? "bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-sidebar-ring/40" : null,
                          )}
                          onClick={() => group.onToggleCollapsed?.(!collapsed)}
                          type="button"
                        >
                          <ChevronRight
                            aria-hidden={true}
                            className={cn(
                              "size-3.5 shrink-0 transition-transform",
                              collapsed ? null : "rotate-90",
                            )}
                          />
                          <span className="min-w-0 flex-1 truncate">{group.title}</span>
                          <span className="shrink-0 tabular-nums">{group.items.length}</span>
                        </button>
                        {!collapsed ? (
                          <SidebarMenu className="mt-1">
                          {group.items.map((item) => (
                            <AtlasShelfRow
                              key={item.id}
                              active={item.active ?? activeItemId === item.id}
                              draggable={itemsDraggable}
                              item={item}
                              itemActions={itemActions}
                              onDragStart={onItemDragStart}
                              onSelect={onItemSelect}
                            />
                          ))}
                          </SidebarMenu>
                        ) : null}
                      </div>
                    );
                    })}
                  </div>
                ) : (
                  <SidebarMenu>
                    {items.map((item) => (
                      <AtlasShelfRow
                        key={item.id}
                        active={item.active ?? activeItemId === item.id}
                        draggable={itemsDraggable}
                        item={item}
                        itemActions={itemActions}
                        onDragStart={onItemDragStart}
                        onSelect={onItemSelect}
                      />
                    ))}
                  </SidebarMenu>
                )
              ) : showEmptyState ? (
                <Empty>
                  <EmptyHeader>
                    {EmptyIcon ? (
                      <EmptyMedia variant="icon">
                        <EmptyIcon aria-hidden={true} data-icon="inline-start" />
                      </EmptyMedia>
                    ) : null}
                    <EmptyTitle>{emptyTitle}</EmptyTitle>
                    <EmptyDescription>{emptyDescription}</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : null}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        {footer ? (
          <SidebarFooter>
            <SidebarSeparator />
            {footer}
          </SidebarFooter>
        ) : null}
      </Sidebar>
    </SidebarProvider>
  );
}

function handleGroupDragOver(event: DragEvent, group: AtlasShelfGroup) {
  if (!group.droppable) {
    return;
  }

  if (!Array.from(event.dataTransfer.types).includes(atlasShelfItemDragType)) {
    return;
  }

  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
}

function handleGroupDrop(event: DragEvent, group: AtlasShelfGroup) {
  if (!group.droppable) {
    return;
  }

  event.preventDefault();
  const itemId =
    event.dataTransfer.getData(atlasShelfItemDragType) ||
    event.dataTransfer.getData("text/plain");

  if (itemId) {
    group.onDropItem?.(itemId);
  }
}

function AtlasShelfRow({
  active,
  draggable,
  item,
  itemActions,
  onDragStart,
  onSelect,
}: {
  active: boolean;
  draggable: boolean;
  item: AtlasShelfItem;
  itemActions?: (item: AtlasShelfItem) => ReactNode;
  onDragStart?: (id: string) => void;
  onSelect?: (id: string) => void;
}) {
  const Icon = item.icon;
  const actions = itemActions?.(item);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        aria-current={active ? "page" : undefined}
        draggable={draggable}
        isActive={active}
        onClick={() => onSelect?.(item.id)}
        onDragStart={(event) => {
          if (!draggable) {
            event.preventDefault();
            return;
          }

          onDragStart?.(item.id);
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData(atlasShelfItemDragType, item.id);
          event.dataTransfer.setData("text/plain", item.id);
        }}
        onMouseDown={(event) => {
          if (draggable && event.button === 0) {
            onDragStart?.(item.id);
          }
        }}
        type="button"
      >
        {Icon ? (
          <Icon aria-hidden={true} data-icon="inline-start" />
        ) : (
          <span
            className={cn(
              "size-2.5 shrink-0 rounded-full transition",
              shelfStatusDotClassName(item),
            )}
          />
        )}
        <span>{item.title}</span>
      </SidebarMenuButton>
      {actions ? <SidebarMenuAction showOnHover>{actions}</SidebarMenuAction> : null}
    </SidebarMenuItem>
  );
}

function shelfStatusDotClassName(item: AtlasShelfItem) {
  if (item.status === "extracted") {
    return "bg-emerald-400 shadow-[0_0_12px_color-mix(in_oklch,var(--color-emerald-400)_75%,transparent)] ring-1 ring-emerald-300/60";
  }

  if (item.inView) {
    return "bg-sidebar-primary";
  }

  return "bg-sidebar-border";
}
