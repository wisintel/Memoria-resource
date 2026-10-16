import type React from "react";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  NO_DOMAIN_ID,
  SUBJECT_ROLE_OPTIONS,
  type InspectorEditInput
} from "@/lib/record-form";
import { typeOptionsForItemTable } from "@/lib/type-options";
import type { DomainRecord, GraphItemRecord, TypeRecord } from "@/types";
import type { FieldDef } from "@/shell/forms/schema";

export function RecordForm({
  domains,
  itemTable,
  referenceItems,
  schema,
  types,
  value,
  onChange
}: {
  domains: DomainRecord[];
  itemTable: string;
  referenceItems: GraphItemRecord[];
  schema: FieldDef[];
  types: TypeRecord[];
  value: InspectorEditInput;
  onChange: React.Dispatch<React.SetStateAction<InspectorEditInput>>;
}) {
  return (
    <FieldGroup>
      {schema.map((field) => {
        return (
          <Field key={field.key}>
            <FieldLabel htmlFor={`record-form-${field.key}`}>{field.label}</FieldLabel>
            <RecordFormControl
              domains={domains}
              field={field}
              itemTable={itemTable}
              referenceItems={referenceItems}
              types={types}
              value={value}
              onChange={onChange}
            />
          </Field>
        );
      })}
    </FieldGroup>
  );
}

function RecordFormControl({
  domains,
  field,
  itemTable,
  referenceItems,
  types,
  value,
  onChange
}: {
  domains: DomainRecord[];
  field: FieldDef;
  itemTable: string;
  referenceItems: GraphItemRecord[];
  types: TypeRecord[];
  value: InspectorEditInput;
  onChange: React.Dispatch<React.SetStateAction<InspectorEditInput>>;
}) {
  const fieldValue = value[field.key];
  const textValue = typeof fieldValue === "string" ? fieldValue : fieldValue ?? "";

  if (field.input === "textarea") {
    return (
      <Textarea
        id={`record-form-${field.key}`}
        value={textValue}
        onChange={(event) => {
          const nextValue = event.currentTarget.value;
          onChange((current) => ({ ...current, [field.key]: nextValue }));
        }}
      />
    );
  }

  if (field.input === "select" || field.input === "reference") {
    return (
      <Select
        value={selectValue(field, value)}
        onValueChange={(nextValue) => {
          onChange((current) => ({
            ...current,
            [field.key]: field.options === "role" && nextValue === "none" ? "" : nextValue
          }));
        }}
      >
        <SelectTrigger id={`record-form-${field.key}`}>
          <SelectValue placeholder={field.label} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {selectOptions(field, domains, referenceItems, types, itemTable, value.type).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    );
  }

  return (
    <Input
      id={`record-form-${field.key}`}
      value={textValue}
      onChange={(event) => {
        const nextValue = event.currentTarget.value;
        onChange((current) => ({ ...current, [field.key]: nextValue }));
      }}
    />
  );
}

function selectValue(field: FieldDef, value: InspectorEditInput) {
  if (field.input === "reference") {
    const fieldValue = value[field.key];

    return typeof fieldValue === "string" && fieldValue ? fieldValue : undefined;
  }

  if (field.options === "domains") {
    return value.domainId || NO_DOMAIN_ID;
  }

  if (field.options === "role") {
    return value.role || "none";
  }

  const fieldValue = value[field.key];

  return typeof fieldValue === "string" && fieldValue ? fieldValue : undefined;
}

function selectOptions(
  field: FieldDef,
  domains: DomainRecord[],
  referenceItems: GraphItemRecord[],
  types: TypeRecord[],
  itemTable: string,
  currentType: string
) {
  if (field.input === "reference") {
    return referenceItems.map((item) => ({
      label: item.label,
      value: item.id
    }));
  }

  if (field.options === "domains") {
    return [
      { label: "No domain", value: NO_DOMAIN_ID },
      ...domains.map((domain) => ({ label: domain.label, value: domain.id }))
    ];
  }

  if (field.options === "types") {
    return typeOptionsForItemTable(types, itemTable, currentType).map((type) => ({
      label: type,
      value: type
    }));
  }

  if (field.options === "role") {
    return [
      { label: "None", value: "none" },
      ...SUBJECT_ROLE_OPTIONS.map((role) => ({ label: role, value: role }))
    ];
  }

  return [];
}
