import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DialogClose } from "@/components/ui/dialog";
import type { ShelfClassKey } from "@/domain/shelf";

export type RecordCrudMode = "create" | "edit";

export type RecordCrudDialogProps = {
  classKey: ShelfClassKey;
  domainSlug: string;
  initialClaimModality?: string | null;
  initialClaimType?: string | null;
  initialClaimText?: string | null;
  initialClaimTargetSubjectId?: string | null;
  initialRelationshipSourceSubjectId?: string | null;
  initialRelationshipTargetSubjectId?: string | null;
  mode: RecordCrudMode;
  onClose: () => void;
  onDone: (selection?: { classKey: ShelfClassKey; id: string }) => void;
  open: boolean;
  selectedId: string | null;
};

export function UnsupportedRecordCard({
  mode,
  onClose,
  recordLabel,
  title,
}: {
  mode: RecordCrudMode;
  onClose: () => void;
  recordLabel: string;
  title: string;
}) {
  return (
    <Card className="border-0 py-8 shadow-none [--card-spacing:--spacing(8)]">
      <CardHeader className="gap-2">
        <CardAction>
          <DialogClose asChild>
            <Button
              aria-label="Close record form"
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <X />
            </Button>
          </DialogClose>
        </CardAction>
        <p className="text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">
          {recordLabel}
        </p>
        <CardTitle className="text-2xl">{title}</CardTitle>
        <CardDescription>
          {mode === "create" ? "Create" : "Edit"} is not wired for this class
          yet.
        </CardDescription>
      </CardHeader>
      <CardFooter className="justify-end border-t">
        <Button className="min-w-24" onClick={onClose} type="button">
          Close
        </Button>
      </CardFooter>
    </Card>
  );
}

export function normalizeOptionKey(value?: string | null) {
  return value?.replace(/[^a-zA-Z0-9]+/g, "").toLowerCase() ?? "";
}

export function modeLabel(mode: RecordCrudMode) {
  if (mode === "create") {
    return "New";
  }

  return "Edit";
}
