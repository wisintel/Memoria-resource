"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ButtonGroup,
  ButtonGroupSeparator,
} from "@/components/ui/button-group";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  deleteExtractionRunWorkshopAction,
  deleteShelfItemShellAction,
} from "@/app/actions";
import type { ShelfClassKey, ShelfClassOption } from "@/domain/shelf";
import { libraryDocumentImportEvent } from "@/lib/shell/events";
import { cn } from "@/lib/utils";

type ClassControlProps = {
  options: ShelfClassOption[];
  value: ShelfClassKey;
  onValueChange: (value: ShelfClassKey) => void;
};

export function ClassControl({
  onValueChange,
  options,
  value,
}: ClassControlProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const selectedClass = searchParams.get("class");
  const selectedId = searchParams.get("sel");
  const isOperationalRunClass = value === "run";
  const canEditSelected =
    Boolean(selectedId) && selectedClass === value && !isOperationalRunClass;
  const canDeleteSelected =
    Boolean(selectedId) &&
    selectedClass === value &&
    (value === "run" || !isOperationalRunClass);
  const canImportDocument = pathname === "/workshop" && value === "document";
  const domainSlug = searchParams.get("domain")?.trim() ?? "";

  useEffect(() => {
    if (value !== "run" || !canDeleteSelected || deleteDialogOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Delete" && event.key !== "Backspace") {
        return;
      }

      const target = event.target;

      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      event.preventDefault();
      setDeleteError(null);
      setDeleteDialogOpen(true);
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canDeleteSelected, deleteDialogOpen, value]);

  function openRecordCrud(mode: "create" | "edit") {
    const params = new URLSearchParams(searchParams.toString());
    params.set("class", value);
    params.set("dialog", "record-crud");
    params.set("mode", mode);

    router.replace(`${pathname}?${params.toString()}`, {
      scroll: false,
    });
  }

  function handleCreate() {
    if (canImportDocument) {
      window.dispatchEvent(new Event(libraryDocumentImportEvent));
      return;
    }

    openRecordCrud("create");
  }

  function openDeleteDialog() {
    if (!selectedId || selectedClass !== value || deletePending) {
      return;
    }

    if (!domainSlug) {
      setDeleteError("Select a domain before deleting a shelf item.");
      return;
    }

    setDeleteError(null);
    setDeleteDialogOpen(true);
  }

  async function handleDelete() {
    if (!selectedId || selectedClass !== value || deletePending) {
      return;
    }

    setDeleteError(null);
    setDeletePending(true);

    const result =
      value === "run"
        ? await deleteExtractionRunWorkshopAction(domainSlug, selectedId)
        : await deleteShelfItemShellAction(domainSlug, value, selectedId);

    setDeletePending(false);

    if (!result.ok) {
      setDeleteError(result.error.message);
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.set("domain", domainSlug);
    params.set("class", value);
    params.delete("sel");
    params.delete("step");
    params.delete("dialog");
    params.delete("mode");
    window.dispatchEvent(new Event("memoria:shelf-refresh"));
    setDeleteDialogOpen(false);

    router.replace(`${pathname}?${params.toString()}`, {
      scroll: false,
    });
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <ButtonGroup className="w-full overflow-hidden rounded-[var(--radius-md)] border border-border bg-input">
        <Select
          value={value}
          onValueChange={(nextValue) =>
            onValueChange(nextValue as ShelfClassKey)
          }
        >
          <SelectTrigger
            className="min-w-0 flex-1 border-0 bg-transparent font-sans text-sm font-medium tracking-normal normal-case text-foreground [&_[data-slot=select-value]]:font-sans [&_[data-slot=select-value]]:font-medium [&_[data-slot=select-value]]:tracking-normal [&_[data-slot=select-value]]:normal-case"
            aria-label="Select class"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            align="start"
            className="max-h-[min(32rem,var(--radix-select-content-available-height))] min-w-56 font-sans"
            position="popper"
          >
            <SelectGroup>
              {options.map((option) => (
                <SelectItem
                  key={option.id}
                  value={option.id}
                  className="font-sans tracking-normal normal-case"
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <ButtonGroupSeparator className="bg-border" />
        <ClassIconButton
          disabled={deletePending || isOperationalRunClass}
          label={
            isOperationalRunClass
              ? "Start run"
              : canImportDocument
                ? "Import document"
                : `Create ${classLabel(value)}`
          }
          onClick={handleCreate}
        >
          <Plus data-icon="inline-start" />
        </ClassIconButton>
        <ButtonGroupSeparator className="bg-border" />
        <ClassIconButton
          disabled={!canEditSelected || deletePending}
          label={`Edit selected ${classLabel(value)}`}
          onClick={() => openRecordCrud("edit")}
        >
          <Pencil data-icon="inline-start" />
        </ClassIconButton>
        <ButtonGroupSeparator className="bg-border" />
        <ClassIconButton
          label={
            value === "run"
              ? "Delete run"
              : `Delete selected ${classLabel(value)}`
          }
          danger
          disabled={!canDeleteSelected || deletePending}
          onClick={openDeleteDialog}
        >
          <Trash2 data-icon="inline-start" />
        </ClassIconButton>
      </ButtonGroup>
      {deleteError ? (
        <p className="text-xs text-destructive" role="alert">
          {deleteError}
        </p>
      ) : null}
      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(nextOpen) => {
          if (!deletePending) {
            setDeleteDialogOpen(nextOpen);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {value === "run"
                ? "Delete run?"
                : `Delete selected ${classLabel(value)}?`}
            </DialogTitle>
            <DialogDescription>
              {value === "run"
                ? "This permanently deletes the selected run, its step log, and its extraction bundle."
                : `This permanently deletes the selected ${classLabel(value)} and its dependent records.`}
            </DialogDescription>
          </DialogHeader>
          {deleteError ? (
            <p className="text-sm text-destructive" role="alert">
              {deleteError}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button disabled={deletePending} type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              disabled={deletePending}
              onClick={() => void handleDelete()}
              type="button"
              variant="destructive"
            >
              {deletePending ? "Deleting" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ClassIconButton({
  children,
  danger,
  disabled,
  label,
  onClick,
}: {
  children: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  label: string;
  onClick?: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className={cn(
            "text-muted-foreground",
            danger
              ? "hover:bg-destructive/10 hover:text-destructive"
              : "hover:bg-muted hover:text-foreground"
          )}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function classLabel(classKey: ShelfClassKey) {
  if (classKey === "domain_map") {
    return "map";
  }

  return classKey.replaceAll("_", " ");
}
