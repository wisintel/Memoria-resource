import type React from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  normalizeInspectorForm,
  type InspectorEditInput
} from "@/lib/record-form";
import type { DomainRecord, GraphItemRecord, TypeRecord } from "@/types";
import { RecordForm } from "@/shell/forms/RecordForm";
import { recordFormSchema } from "@/shell/forms/schema";

export function RecordFormDialog({
  domains,
  initialValue,
  isBusy,
  itemTable,
  mode,
  open,
  referenceItems,
  types,
  onClose,
  onSubmit
}: {
  domains: DomainRecord[];
  initialValue: InspectorEditInput;
  isBusy: boolean;
  itemTable: string;
  mode: "create" | "edit";
  open: boolean;
  referenceItems: GraphItemRecord[];
  types: TypeRecord[];
  onClose: () => void;
  onSubmit: (values: InspectorEditInput) => Promise<void>;
}) {
  const [value, setValue] = useState(initialValue);
  const schema = recordFormSchema[itemTable] ?? [];
  const submitLabel = mode === "create" ? "Create" : "Save";
  const recordLabel = recordFormLabel(itemTable);
  const title = mode === "create" ? `Create ${recordLabel}` : `Edit ${recordLabel}`;

  useEffect(() => {
    if (open) {
      setValue(initialValue);
    }
  }, [initialValue, open]);

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit(normalizeInspectorForm(value));
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <DialogContent className="p-0 sm:max-w-2xl">
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{recordLabel} details</DialogDescription>
        </DialogHeader>
        <Card className="border-0 shadow-none">
          <form className="contents" onSubmit={(event) => void submitForm(event)}>
            <CardHeader>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{recordLabel} details</CardDescription>
            </CardHeader>
            <CardContent>
              <RecordForm
                domains={domains}
                itemTable={itemTable}
                referenceItems={referenceItems}
                schema={schema}
                types={types}
                value={value}
                onChange={setValue}
              />
            </CardContent>
            <CardFooter className="justify-end gap-2 border-t">
              <Button disabled={isBusy} onClick={onClose} type="button" variant="outline">
                Cancel
              </Button>
              <Button disabled={isBusy || !canSubmitRecordForm(itemTable, value)} type="submit">
                {submitLabel}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </DialogContent>
    </Dialog>
  );
}

function canSubmitRecordForm(itemTable: string, value: InspectorEditInput) {
  if (!value.type.trim()) {
    return false;
  }

  if (itemTable === "claims") {
    return Boolean(value.targetId && value.claimText?.trim());
  }

  if (itemTable === "edges") {
    return Boolean(value.sourceId && value.targetId);
  }

  return Boolean(value.label.trim());
}

function recordFormLabel(itemTable: string) {
  const labels: Record<string, string> = {
    claims: "claim",
    documents: "document",
    edges: "relationship",
    nodes: "subject"
  };

  return labels[itemTable] ?? "record";
}
