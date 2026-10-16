"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  createClassTableRow,
  deleteClassTableRow,
  updateClassTableRow,
  type ClassTableRowMutationState,
} from "@/app/atlas/actions";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { InspectorRail, InspectorRailSection } from "./InspectorRail";
import { InspectorFieldList, shortId } from "./fields/InspectorFieldList";
import type { ReferenceOptions } from "./fields/reference-options";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
} from "@/components/ui/field";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  rowTemplateTitle,
  type ClassTableFieldTemplate,
  type ClassTableTemplate,
} from "@/lib/class-table-templates";
import type { ClassRecord, TableRow } from "@/lib/supabase/client";
import type { ReferenceLabels } from "../utils/table-formatting";
export {
  buildReferenceOptions,
  filteredReferenceOptions,
  type ReferenceOption,
  type ReferenceOptions,
} from "./fields/reference-options";

const initialRowMutationState: ClassTableRowMutationState = {
  error: null,
  ok: false,
};

const emptyFieldTemplates: readonly ClassTableFieldTemplate[] = [];

export function ClassTableRowInspector({
  onDeleted,
  referenceOptions,
  selectedClass,
  selectedDomainId,
  selectedRow,
  tableName,
  template,
}: {
  onDeleted: () => void;
  referenceOptions: ReferenceOptions;
  selectedClass: ClassRecord;
  selectedDomainId: string | null;
  selectedRow: TableRow;
  tableName: string;
  template: ClassTableTemplate;
}) {
  const editableRow = readEditableRow(selectedRow, template);
  const contextTray = buildSelectedRowContextTray({
    referenceOptions,
    row: selectedRow,
    tableName,
  });

  if (!editableRow) {
    return (
      <InspectorRail>
        <InspectorRailSection
          eyebrow={classDisplayLabel(selectedClass)}
          title="Selected row"
        >
          <FieldDescription>
            This row is missing the fields needed for editing.
          </FieldDescription>
        </InspectorRailSection>
      </InspectorRail>
    );
  }

  return (
    <InspectorRail>
      <InspectorRailSection
        eyebrow={classDisplayLabel(selectedClass)}
        title={editableRow.title}
      >
        <FieldDescription>
          {selectedClass.purpose ??
            "No purpose has been recorded for this class table yet."}
        </FieldDescription>
        <ClassTableEditForm
          editableRow={editableRow}
          key={editableRow.id}
          defaultDomainId={selectedDomainId}
          referenceOptions={referenceOptions}
          tableName={tableName}
          template={template}
        />
        {template.deleteEnabled ? (
          <ClassTableDeleteForm
            editableRow={editableRow}
            onDeleted={onDeleted}
            template={template}
          />
        ) : null}
        {contextTray}
      </InspectorRailSection>
    </InspectorRail>
  );
}

export function ClassTableCreateForm({
  classLabel,
  contextValues: additionalContextValues = {},
  defaultDomainId,
  referenceOptions,
  tableName,
  template,
}: {
  classLabel: string;
  contextValues?: Record<string, string>;
  defaultDomainId: string | null;
  referenceOptions: ReferenceOptions;
  tableName: string;
  template: ClassTableTemplate;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const createFields = template.createFields ?? emptyFieldTemplates;
  const contextValues = useMemo(
    () =>
      buildContextFieldValues(
        createFields,
        defaultDomainId,
        additionalContextValues,
      ),
    [additionalContextValues, createFields, defaultDomainId],
  );
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() =>
    buildInitialFieldValues(createFields, {}, contextValues),
  );
  const [state, formAction, pending] = useActionState(
    createClassTableRow,
    initialRowMutationState,
  );

  useEffect(() => {
    if (!state.ok) {
      return;
    }

    const resetId = window.setTimeout(() => {
      formRef.current?.reset();
      setFieldValues(buildInitialFieldValues(createFields, {}, contextValues));
    }, 0);

    router.refresh();

    return () => window.clearTimeout(resetId);
  }, [contextValues, createFields, router, state.ok]);

  function updateFieldValue(fieldName: string, value: string) {
    setFieldValues((values) => ({
      ...values,
      [fieldName]: value,
    }));
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-3 border-y border-border py-4"
    >
      <input name="table_name" type="hidden" value={template.tableName} />
      <Badge className="w-fit" variant="outline">
        New {singularizeLabel(classLabel)}
      </Badge>
      <InspectorFieldList
        controlMode="uncontrolled"
        fieldValues={fieldValues}
        fields={createFields}
        onFieldValueChange={updateFieldValue}
        referenceOptions={referenceOptions}
        tableName={tableName}
        variant="searchable"
      />
      {state.error ? <FieldError>{state.error}</FieldError> : null}
      {state.ok ? <FieldDescription>Row created.</FieldDescription> : null}
      <Button disabled={pending} type="submit">
        {pending ? "Adding..." : `Add ${singularizeLabel(classLabel)}`}
      </Button>
    </form>
  );
}

export function ClassTableEditForm({
  defaultDomainId,
  editableRow,
  referenceOptions,
  tableName,
  template,
}: {
  defaultDomainId: string | null;
  editableRow: EditableClassTableRow;
  referenceOptions: ReferenceOptions;
  tableName: string;
  template: ClassTableTemplate;
}) {
  const router = useRouter();
  const editFields = template.editFields ?? emptyFieldTemplates;
  const contextValues = useMemo(
    () => buildContextFieldValues(editFields, defaultDomainId),
    [defaultDomainId, editFields],
  );
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() =>
    buildInitialFieldValues(editFields, editableRow.values, contextValues),
  );
  const [state, formAction, pending] = useActionState(
    updateClassTableRow,
    initialRowMutationState,
  );

  useEffect(() => {
    if (!state.ok) {
      return;
    }

    router.refresh();
  }, [router, state.ok]);

  function updateFieldValue(fieldName: string, value: string) {
    setFieldValues((values) => ({
      ...values,
      [fieldName]: value,
    }));
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 border-y border-border py-4"
    >
      <input name="table_name" type="hidden" value={template.tableName} />
      <input name="id" type="hidden" value={editableRow.id} />
      <InspectorFieldList
        controlMode="uncontrolled"
        defaultValues={editableRow.values}
        fieldValues={fieldValues}
        fields={editFields}
        onFieldValueChange={updateFieldValue}
        referenceOptions={referenceOptions}
        tableName={tableName}
        variant="searchable"
      />
      {state.error ? <FieldError>{state.error}</FieldError> : null}
      {state.ok ? <FieldDescription>Row saved.</FieldDescription> : null}
      <Button disabled={pending} type="submit">
        {pending ? "Saving..." : "Save row"}
      </Button>
    </form>
  );
}

export function ClassTableDeleteForm({
  editableRow,
  onDeleted,
  template,
}: {
  editableRow: EditableClassTableRow;
  onDeleted: () => void;
  template: ClassTableTemplate;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    deleteClassTableRow,
    initialRowMutationState,
  );

  useEffect(() => {
    if (!state.ok) {
      return;
    }

    onDeleted();
    router.refresh();
  }, [onDeleted, router, state.ok]);

  return (
    <>
      <form
        ref={formRef}
        action={formAction}
        className="flex flex-col gap-3 border-b border-border pb-4"
      >
        <input name="table_name" type="hidden" value={template.tableName} />
        <input name="id" type="hidden" value={editableRow.id} />
        {state.error ? <FieldError>{state.error}</FieldError> : null}
        <Button
          disabled={pending}
          onClick={() => setConfirmOpen(true)}
          type="button"
          variant="destructive"
        >
          {pending ? "Deleting..." : "Delete row"}
        </Button>
      </form>
      <ConfirmDialog
        confirmLabel="Delete row"
        description={
          <>
            This will permanently remove{" "}
            <span className="text-foreground">{editableRow.title}</span>.
          </>
        }
        isPending={pending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => formRef.current?.requestSubmit()}
        open={confirmOpen}
        pendingLabel="Deleting..."
        title={`Delete ${editableRow.title}?`}
        tone="destructive"
      />
    </>
  );
}

function InspectorBottomTray({
  emptyText,
  items,
  title,
}: {
  emptyText: string;
  items: { label: string; meta?: string; value: string }[];
  title: string;
}) {
  return (
    <FieldGroup className="mt-1 min-h-80 gap-2 rounded-lg border border-border bg-card/35 p-2">
      <Field orientation="horizontal" className="justify-between gap-3">
        <Badge variant="outline">{title}</Badge>
        <Badge variant="secondary">{items.length}</Badge>
      </Field>
      {items.length > 0 ? (
        <ScrollArea className="min-h-56 max-h-96">
          <FieldGroup className="gap-0 pr-3">
            {items.map((item) => (
              <Field
                className="border-b border-border/70 py-2 text-sm last:border-b-0"
                key={item.value}
              >
                {item.meta ? (
                  <FieldDescription className="text-foreground">
                    {item.meta}
                  </FieldDescription>
                ) : (
                  <FieldDescription className="truncate text-foreground">
                    {item.label}
                  </FieldDescription>
                )}
                {!item.meta ? (
                  <Badge className="w-fit" variant="secondary">
                    {shortId(item.value)}
                  </Badge>
                ) : null}
              </Field>
            ))}
          </FieldGroup>
        </ScrollArea>
      ) : (
        <Empty className="min-h-32 border-0 p-4">
          <EmptyHeader>
            <EmptyTitle>No records</EmptyTitle>
            <EmptyDescription>{emptyText}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </FieldGroup>
  );
}

export function buildReferenceLabels(
  referenceOptions: ReferenceOptions,
): ReferenceLabels {
  return Object.fromEntries(
    Object.values(referenceOptions)
      .flatMap((options) => options ?? [])
      .map((option) => [option.value, option.label]),
  );
}

function stringRowValue(row: TableRow, fieldName: string) {
  const value = row[fieldName];

  return typeof value === "string" ? value : "";
}

function arrayRowValue(row: TableRow, fieldName: string) {
  const value = row[fieldName];

  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function buildSelectedRowContextTray({
  referenceOptions,
  row,
  tableName,
}: {
  referenceOptions: ReferenceOptions;
  row: TableRow;
  tableName: string;
}) {
  if (tableName === "entities") {
    const entityId = stringRowValue(row, "id");
    const claimItems = (referenceOptions.claims ?? [])
      .filter((option) =>
        arrayRowValue(option.row, "target_entity_ids").includes(entityId),
      )
      .map((option) => ({
        label: option.label,
        meta: stringRowValue(option.row, "claim_text"),
        value: option.value,
      }));

    return (
      <InspectorBottomTray
        emptyText="No loaded claims target this subject yet."
        items={claimItems}
        title="Claims"
      />
    );
  }

  return null;
}

function buildInitialFieldValues(
  fields: readonly ClassTableFieldTemplate[],
  values: Record<string, string> = {},
  contextValues: Record<string, string> = {},
) {
  return Object.fromEntries(
    fields.map((field) => [
      field.name,
      values[field.name] ?? contextValues[field.name] ?? "",
    ]),
  );
}

function buildContextFieldValues(
  fields: readonly ClassTableFieldTemplate[],
  selectedDomainId: string | null,
  additionalContextValues: Record<string, string> = {},
): Record<string, string> {
  const fieldNames = new Set(fields.map((field) => field.name));
  const contextValues = Object.fromEntries(
    Object.entries(additionalContextValues).filter(
      ([fieldName, value]) => fieldNames.has(fieldName) && value,
    ),
  );

  if (selectedDomainId && fieldNames.has("domain_id")) {
    contextValues.domain_id = selectedDomainId;
  }

  return contextValues;
}

export type EditableClassTableRow = {
  id: string;
  title: string;
  values: Record<string, string>;
};

export function readEditableRow(
  row: TableRow,
  template: ClassTableTemplate,
): EditableClassTableRow | null {
  const id = row.id;

  if (typeof id !== "string") {
    return null;
  }

  const values: Record<string, string> = {};

  for (const field of template.editFields ?? []) {
    const value = row[field.name];

    values[field.name] = Array.isArray(value)
      ? value
          .filter((item): item is string => typeof item === "string")
          .join(",")
      : typeof value === "string"
        ? value
        : "";
  }

  return {
    id,
    title: rowTemplateTitle(row, template),
    values,
  };
}

function classDisplayLabel(classRecord: ClassRecord) {
  return classRecord.table_name === "entities" ? "Subjects" : classRecord.label;
}

function singularizeLabel(label: string) {
  const normalizedLabel = label.trim().toLowerCase();
  const irregularLabels: Record<string, string> = {
    classes: "class",
    statuses: "status",
  };

  if (normalizedLabel in irregularLabels) {
    return irregularLabels[normalizedLabel];
  }

  return normalizedLabel.endsWith("s")
    ? normalizedLabel.slice(0, -1)
    : normalizedLabel;
}
