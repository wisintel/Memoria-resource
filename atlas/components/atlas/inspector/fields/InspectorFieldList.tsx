"use client";

import { ChevronsUpDown } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ClassTableFieldTemplate } from "@/lib/class-table-templates";
import { createSupabaseClient, type TableRow } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  filteredReferenceOptions,
  type ReferenceOption,
  type ReferenceOptions,
} from "./reference-options";

type InspectorFieldListVariant = "compact" | "searchable";
type InspectorFieldControlMode = "controlled" | "uncontrolled";
type LiveRecordReferenceTableName = "claims" | "entities";

type InspectorFieldListProps = {
  controlMode?: InspectorFieldControlMode;
  defaultValues?: Record<string, string>;
  fields: readonly ClassTableFieldTemplate[];
  fieldValues: Record<string, string>;
  optionContextValues?: Record<string, string>;
  onFieldValueChange: (fieldName: string, value: string) => void;
  referenceOptions: ReferenceOptions;
  tableName: string;
  variant?: InspectorFieldListVariant;
};

export function InspectorFieldList({
  controlMode = "controlled",
  defaultValues = {},
  fields,
  fieldValues,
  optionContextValues = {},
  onFieldValueChange,
  referenceOptions,
  tableName,
  variant = "compact",
}: InspectorFieldListProps) {
  const fieldRows = groupInspectorFields(fields);
  const pairClassName =
    variant === "compact" ? "grid grid-cols-2 gap-5" : "grid grid-cols-2 gap-2";

  return (
    <>
      {fieldRows.map((fieldRow) =>
        fieldRow.length === 1 ? (
          <InspectorEditField
            controlMode={controlMode}
            defaultValue={defaultValues[fieldRow[0].name] ?? ""}
            field={fieldRow[0]}
            fieldValues={fieldValues}
            key={fieldRow[0].name}
            optionContextValues={optionContextValues}
            onFieldValueChange={onFieldValueChange}
            referenceOptions={referenceOptions}
            tableName={tableName}
            variant={variant}
          />
        ) : (
          <FieldGroup
            className={pairClassName}
            key={fieldRow.map((field) => field.name).join(":")}
          >
            {fieldRow.map((field) => (
              <InspectorEditField
                controlMode={controlMode}
                defaultValue={defaultValues[field.name] ?? ""}
                field={field}
                fieldValues={fieldValues}
                key={field.name}
                optionContextValues={optionContextValues}
                onFieldValueChange={onFieldValueChange}
                referenceOptions={referenceOptions}
                tableName={tableName}
                variant={variant}
              />
            ))}
          </FieldGroup>
        ),
      )}
    </>
  );
}

export function InspectorControlField({
  children,
  label,
  variant = "compact",
}: {
  children: ReactNode;
  label: string;
  variant?: InspectorFieldListVariant;
}) {
  return (
    <Field className="min-w-0">
      <FieldLabel className={fieldLabelClassName}>{label}</FieldLabel>
      {variant === "searchable" ? (
        <FieldDescription className="text-foreground">
          {children}
        </FieldDescription>
      ) : (
        children
      )}
    </Field>
  );
}

function InspectorEditField({
  controlMode,
  defaultValue,
  field,
  fieldValues,
  optionContextValues,
  onFieldValueChange,
  referenceOptions,
  tableName,
  variant,
}: {
  controlMode: InspectorFieldControlMode;
  defaultValue: string;
  field: ClassTableFieldTemplate;
  fieldValues: Record<string, string>;
  optionContextValues: Record<string, string>;
  onFieldValueChange: (fieldName: string, value: string) => void;
  referenceOptions: ReferenceOptions;
  tableName: string;
  variant: InspectorFieldListVariant;
}) {
  const optionValues = {
    ...optionContextValues,
    ...fieldValues,
  };
  const options = field.referenceTable
    ? filteredReferenceOptions({
        field,
        fieldValues: optionValues,
        referenceOptions,
        tableName,
      })
    : [];
  const value = fieldValues[field.name] ?? defaultValue;
  const sharedProps = {
    name: field.name,
    placeholder: field.placeholder,
    required: field.required,
  };

  return (
    <InspectorControlField label={field.label} variant={variant}>
      {field.referenceTable && field.multiple ? (
        <InspectorReferenceMultiSelect
          field={field}
          onValueChange={(nextValue) =>
            onFieldValueChange(field.name, nextValue)
          }
          options={options}
          value={value}
          variant={variant}
        />
      ) : field.referenceTable === "records" && variant === "searchable" ? (
        <InspectorLiveRecordReferenceSelect
          field={field}
          fieldValues={optionValues}
          onValueChange={(nextValue) =>
            onFieldValueChange(field.name, nextValue)
          }
          options={options}
          referenceOptions={referenceOptions}
          value={value}
        />
      ) : field.referenceTable ? (
        <InspectorReferenceSelect
          field={field}
          onValueChange={(nextValue) =>
            onFieldValueChange(field.name, nextValue)
          }
          options={options}
          value={value}
          variant={variant}
        />
      ) : field.options ? (
        <InspectorStaticSelect
          field={field}
          onValueChange={(nextValue) =>
            onFieldValueChange(field.name, nextValue)
          }
          value={value}
          variant={variant}
        />
      ) : isLongTextField(field) ? (
        <Textarea
          {...sharedProps}
          className="min-h-28 resize-y"
          {...(controlMode === "controlled"
            ? {
                onChange: (event) =>
                  onFieldValueChange(field.name, event.currentTarget.value),
                value,
              }
            : {
                defaultValue: value,
              })}
        />
      ) : (
        <Input
          {...sharedProps}
          aria-label={field.label}
          {...(controlMode === "controlled"
            ? {
                onChange: (event) =>
                  onFieldValueChange(field.name, event.currentTarget.value),
                value,
              }
            : {
                defaultValue: value,
              })}
        />
      )}
    </InspectorControlField>
  );
}

function InspectorStaticSelect({
  field,
  onValueChange,
  value,
  variant = "compact",
}: {
  field: ClassTableFieldTemplate;
  onValueChange: (value: string) => void;
  value: string;
  variant?: InspectorFieldListVariant;
}) {
  const noneValue = `__none_${field.name}`;
  const options = field.options ?? [];
  const selectValue = value || noneValue;
  const selectedOption = options.find((option) => option.value === value);
  const placeholder =
    variant === "compact"
      ? (field.placeholder ?? field.label)
      : (field.placeholder ?? `Select ${field.label.toLowerCase()}`);

  return (
    <>
      <input name={field.name} type="hidden" value={value} />
      <Select
        value={selectValue}
        onValueChange={(nextValue) => {
          if (nextValue !== null) {
            onValueChange(nextValue === noneValue ? "" : nextValue);
          }
        }}
      >
        <SelectTrigger
          aria-label={field.label}
          className={cn(
            "w-full",
            variant === "compact"
              ? "border-input bg-transparent text-sm text-foreground disabled:opacity-60"
              : "disabled:border-border/60 disabled:bg-muted/30 disabled:text-muted-foreground disabled:opacity-70",
          )}
          disabled={options.length === 0 && field.required}
        >
          <SelectValue placeholder={placeholder}>
            {() => selectedOption?.label ?? (value || placeholder)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {!field.required ? (
              <SelectItem value={noneValue}>None</SelectItem>
            ) : null}
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </>
  );
}

export function InspectorReferenceSelect({
  field,
  onValueChange,
  options,
  value,
  variant = "compact",
}: {
  field: ClassTableFieldTemplate;
  onValueChange: (value: string) => void;
  options: ReferenceOption[];
  value: string;
  variant?: InspectorFieldListVariant;
}) {
  const noneValue = `__none_${field.name}`;
  const selectValue = value || noneValue;
  const selectedOption = options.find((option) => option.value === value);
  const placeholder =
    variant === "compact"
      ? (field.placeholder ?? field.label)
      : (field.placeholder ?? `Select ${field.label.toLowerCase()}`);
  const content = (
    <>
      <input name={field.name} type="hidden" value={value} />
      <Select
        value={selectValue}
        onValueChange={(nextValue) => {
          if (nextValue !== null) {
            onValueChange(nextValue === noneValue ? "" : nextValue);
          }
        }}
      >
        <SelectTrigger
          aria-label={field.label}
          className={cn(
            "w-full",
            variant === "compact"
              ? "border-input bg-transparent text-sm text-foreground disabled:opacity-60"
              : "disabled:border-border/60 disabled:bg-muted/30 disabled:text-muted-foreground disabled:opacity-70",
          )}
          disabled={options.length === 0 && field.required}
        >
          <SelectValue placeholder={placeholder}>
            {() =>
              selectedOption?.label ?? (value ? shortId(value) : placeholder)
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {!field.required ? (
              <SelectItem value={noneValue}>None</SelectItem>
            ) : null}
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {variant === "compact" ? (
                  option.label
                ) : (
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{option.label}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {shortId(option.value)}
                    </span>
                  </span>
                )}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </>
  );

  return variant === "compact" ? (
    content
  ) : (
    <FieldGroup className="gap-2">{content}</FieldGroup>
  );
}

function InspectorLiveRecordReferenceSelect({
  field,
  fieldValues,
  onValueChange,
  options,
  referenceOptions,
  value,
}: {
  field: ClassTableFieldTemplate;
  fieldValues: Record<string, string>;
  onValueChange: (value: string) => void;
  options: ReferenceOption[];
  referenceOptions: ReferenceOptions;
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [remoteOptions, setRemoteOptions] = useState<ReferenceOption[]>([]);
  const [selectedRemoteOption, setSelectedRemoteOption] = useState<{
    option: ReferenceOption;
    tableName: LiveRecordReferenceTableName;
    value: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const selectedTableName = liveRecordReferenceTableName({
    fieldName: field.name,
    fieldValues,
    referenceOptions,
  });
  const mergedOptions = useMemo(
    () =>
      mergeReferenceOptions([
        selectedRemoteOption?.tableName === selectedTableName &&
        selectedRemoteOption.value === value
          ? selectedRemoteOption.option
          : null,
        ...options,
        ...remoteOptions,
      ]),
    [options, remoteOptions, selectedRemoteOption, selectedTableName, value],
  );
  const selectedOption = mergedOptions.find((option) => option.value === value);
  const placeholder = field.placeholder ?? `Select ${field.label.toLowerCase()}`;
  const disabled = !selectedTableName;

  useEffect(() => {
    if (!selectedTableName || !value || options.some((option) => option.value === value)) {
      return;
    }

    let cancelled = false;
    const tableName = selectedTableName;

    async function loadSelectedOption() {
      const result = await fetchRecordReferenceOptions({
        domainId: fieldValues.domain_id,
        ids: [value],
        search: "",
        tableName,
      });

      if (cancelled) {
        return;
      }

      const option = result.options[0] ?? null;

      if (option) {
        setSelectedRemoteOption({ option, tableName, value });
      }
    }

    void loadSelectedOption();

    return () => {
      cancelled = true;
    };
  }, [fieldValues.domain_id, options, selectedTableName, value]);

  useEffect(() => {
    if (!open || !selectedTableName) {
      return;
    }

    let cancelled = false;
    const tableName = selectedTableName;
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setErrorMessage(null);

      const result = await fetchRecordReferenceOptions({
        domainId: fieldValues.domain_id,
        ids: value ? [value] : [],
        search,
        tableName,
      });

      if (cancelled) {
        return;
      }

      setRemoteOptions(result.options);
      setErrorMessage(result.error);
      setLoading(false);
    }, 160);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [fieldValues.domain_id, open, search, selectedTableName, value]);

  return (
    <FieldGroup className="gap-2">
      <input name={field.name} type="hidden" value={value} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              aria-label={field.label}
              className="h-9 w-full justify-between disabled:border-border/60 disabled:bg-muted/30 disabled:text-muted-foreground disabled:opacity-70"
              disabled={disabled}
              type="button"
              variant="outline"
            />
          }
        >
          <span className="min-w-0 truncate">
            {selectedOption?.label ?? (value ? shortId(value) : placeholder)}
          </span>
          <ChevronsUpDown className="ml-2 size-3.5 shrink-0 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(360px,calc(100vw_-_32px))] p-1.5">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={placeholder}
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>
                {loading ? "Loading..." : errorMessage ?? "No records"}
              </CommandEmpty>
              <CommandGroup>
                {!field.required ? (
                  <CommandItem
                    data-checked={!value}
                    onSelect={() => {
                      onValueChange("");
                      setOpen(false);
                    }}
                    value="none"
                  >
                    None
                  </CommandItem>
                ) : null}
                {mergedOptions.map((option) => (
                  <CommandItem
                    data-checked={option.value === value}
                    key={option.value}
                    onSelect={() => {
                      onValueChange(option.value);
                      setOpen(false);
                    }}
                    value={option.value}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{option.label}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {shortId(option.value)}
                      </span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </FieldGroup>
  );
}

function InspectorReferenceMultiSelect({
  field,
  onValueChange,
  options,
  value,
  variant,
}: {
  field: ClassTableFieldTemplate;
  onValueChange: (value: string) => void;
  options: ReferenceOption[];
  value: string;
  variant: InspectorFieldListVariant;
}) {
  return variant === "compact" ? (
    <CompactReferenceMultiSelect
      field={field}
      onValueChange={onValueChange}
      options={options}
      value={value}
    />
  ) : (
    <SearchableReferenceMultiSelect
      field={field}
      onValueChange={onValueChange}
      options={options}
      value={value}
    />
  );
}

function CompactReferenceMultiSelect({
  field,
  onValueChange,
  options,
  value,
}: {
  field: ClassTableFieldTemplate;
  onValueChange: (value: string) => void;
  options: ReferenceOption[];
  value: string;
}) {
  const selectedValues = splitMultiValue(value);
  const selectedValueSet = new Set(selectedValues);

  function toggleValue(optionValue: string) {
    const nextValues = selectedValueSet.has(optionValue)
      ? selectedValues.filter((selectedValue) => selectedValue !== optionValue)
      : [...selectedValues, optionValue];

    onValueChange(nextValues.join(","));
  }

  return (
    <ScrollArea className="max-h-72 rounded-lg border border-input">
      <FieldGroup className="gap-1 p-2">
        {selectedValues.map((selectedValue) => (
          <input
            key={selectedValue}
            name={field.name}
            type="hidden"
            value={selectedValue}
          />
        ))}
        {options.length > 0 ? (
          options.map((option) => (
            <Field
              className="min-w-0 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-accent/70"
              key={option.value}
              orientation="horizontal"
            >
              <Checkbox
                aria-label={option.label}
                checked={selectedValueSet.has(option.value)}
                onCheckedChange={() => toggleValue(option.value)}
              />
              <FieldLabel className="min-w-0 flex-1 truncate font-normal">
                {option.label}
              </FieldLabel>
            </Field>
          ))
        ) : (
          <Empty className="min-h-24 border-0 p-3">
            <EmptyHeader>
              <EmptyTitle>No options</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
      </FieldGroup>
    </ScrollArea>
  );
}

function SearchableReferenceMultiSelect({
  field,
  onValueChange,
  options,
  value,
}: {
  field: ClassTableFieldTemplate;
  onValueChange: (value: string) => void;
  options: ReferenceOption[];
  value: string;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const selectedValues = splitMultiValue(value);
  const selectedValueSet = new Set(selectedValues);
  const selectedOptions = selectedValues.map((selectedValue) =>
    optionForValue(options, selectedValue),
  );
  const showSearch = options.length > 10;
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const availableOptions = options.filter(
    (option) => !selectedValueSet.has(option.value),
  );
  const visibleOptions = normalizedSearchQuery
    ? availableOptions.filter((option) =>
        option.label.toLowerCase().includes(normalizedSearchQuery),
      )
    : availableOptions;

  function toggleSelectedValue(optionValue: string) {
    const nextSelectedValues = selectedValueSet.has(optionValue)
      ? selectedValues.filter((selectedValue) => selectedValue !== optionValue)
      : [...selectedValues, optionValue];

    onValueChange(nextSelectedValues.join(","));
  }

  return (
    <FieldGroup className="min-h-80 gap-2 rounded-lg border border-border bg-card/35 p-2">
      {selectedValues.map((selectedValue) => (
        <input
          key={selectedValue}
          name={field.name}
          type="hidden"
          value={selectedValue}
        />
      ))}
      <Field orientation="horizontal" className="justify-between gap-3">
        <Badge variant="outline">Selected {selectedValues.length}</Badge>
        <Badge variant="secondary">{options.length} available</Badge>
      </Field>
      {selectedOptions.length > 0 ? (
        <ScrollArea className="min-h-16 max-h-48 border-b border-border pb-2">
          <FieldGroup className="gap-1 pr-3">
            {selectedOptions.map((option) => (
              <Button
                className="flex items-center justify-between gap-2 rounded-sm bg-accent/54 px-2 py-1 text-left text-xs text-foreground"
                key={option.value}
                onClick={() => toggleSelectedValue(option.value)}
                size="xs"
                type="button"
                variant="ghost"
              >
                <span className="min-w-0 truncate">{option.label}</span>
                <Badge variant="secondary">Remove</Badge>
              </Button>
            ))}
          </FieldGroup>
        </ScrollArea>
      ) : null}
      {showSearch ? (
        <Input
          aria-label={`Search ${field.label.toLowerCase()}`}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={`Search ${field.label.toLowerCase()}`}
          value={searchQuery}
        />
      ) : null}
      {options.length > 0 ? (
        <ScrollArea className="min-h-56 max-h-96 rounded-md border border-border bg-background/24">
          <FieldGroup className="gap-0">
            {visibleOptions.length > 0 ? (
              visibleOptions.map((option) => (
                <Field
                  className="w-full border-b border-border/70 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent/70"
                  key={option.value}
                  orientation="horizontal"
                >
                  <Checkbox
                    aria-label={option.label}
                    checked={selectedValueSet.has(option.value)}
                    onCheckedChange={() => toggleSelectedValue(option.value)}
                  />
                  <FieldLabel className="min-w-0 flex-1 font-normal">
                    <span className="block truncate text-foreground">
                      {option.label}
                    </span>
                    <span className="block font-mono text-[10px] text-muted-foreground">
                      {shortId(option.value)}
                    </span>
                  </FieldLabel>
                </Field>
              ))
            ) : availableOptions.length === 0 ? (
              <Empty className="min-h-28 border-0 p-4">
                <EmptyHeader>
                  <EmptyTitle>All selected</EmptyTitle>
                  <EmptyDescription>
                    All available targets are selected.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Empty className="min-h-28 border-0 p-4">
                <EmptyHeader>
                  <EmptyTitle>No matches</EmptyTitle>
                </EmptyHeader>
              </Empty>
            )}
          </FieldGroup>
        </ScrollArea>
      ) : (
        <Empty className="min-h-28 border-0 p-4">
          <EmptyHeader>
            <EmptyTitle>No options</EmptyTitle>
            <EmptyDescription>
              No {field.label.toLowerCase()} options yet.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </FieldGroup>
  );
}

function groupInspectorFields(fields: readonly ClassTableFieldTemplate[]) {
  const fieldRows: ClassTableFieldTemplate[][] = [];
  let index = 0;

  while (index < fields.length) {
    const field = fields[index];
    const nextField = fields[index + 1];

    if (
      (field.name === "type_id" && nextField?.name === "kind_id") ||
      (field.name === "source_class_id" &&
        nextField?.name === "source_record_id") ||
      (field.name === "target_class_id" &&
        nextField?.name === "target_record_id")
    ) {
      fieldRows.push([field, nextField]);
      index += 2;
      continue;
    }

    fieldRows.push([field]);
    index += 1;
  }

  return fieldRows;
}

function isLongTextField(field: ClassTableFieldTemplate) {
  return field.name === "claim_text" || field.name === "description";
}

function liveRecordReferenceTableName({
  fieldName,
  fieldValues,
  referenceOptions,
}: {
  fieldName: string;
  fieldValues: Record<string, string>;
  referenceOptions: ReferenceOptions;
}): LiveRecordReferenceTableName | null {
  const classFieldName =
    fieldName === "source_record_id"
      ? "source_class_id"
      : fieldName === "target_record_id"
        ? "target_class_id"
        : "";
  const selectedClassId = classFieldName ? fieldValues[classFieldName] : "";
  const selectedClass = referenceOptions.classes?.find((option) => option.value === selectedClassId);
  const tableName = selectedClass ? stringRowValue(selectedClass.row, "table_name") : "";

  return tableName === "entities" || tableName === "claims" ? tableName : null;
}

async function fetchRecordReferenceOptions({
  domainId,
  ids,
  search,
  tableName,
}: {
  domainId: string;
  ids: string[];
  search: string;
  tableName: LiveRecordReferenceTableName;
}): Promise<{ error: string | null; options: ReferenceOption[] }> {
  const trimmedSearch = search.trim();
  const template = recordReferenceTemplate(tableName);
  const supabase = createSupabaseClient();
  const options: ReferenceOption[] = [];

  if (ids.length > 0) {
    const { data, error } = await supabase
      .from(tableName)
      .select(template.fields)
      .in("id", [...new Set(ids)]);

    if (error) {
      return { error: error.message, options };
    }

    options.push(...referenceOptionsFromRows((data ?? []) as unknown as TableRow[], template.titleField));
  }

  let query = supabase
    .from(tableName)
    .select(template.fields)
    .order("label", { ascending: true })
    .limit(30);

  if (domainId) {
    query = query.eq("domain_id", domainId);
  }

  if (trimmedSearch) {
    query = query.ilike("label", `%${trimmedSearch}%`);
  }

  const { data, error } = await query;

  if (error) {
    return { error: error.message, options };
  }

  options.push(...referenceOptionsFromRows((data ?? []) as unknown as TableRow[], template.titleField));

  return {
    error: null,
    options: mergeReferenceOptions(options),
  };
}

function recordReferenceTemplate(tableName: LiveRecordReferenceTableName) {
  return tableName === "claims"
    ? {
        fields: "id,domain_id,type_id,kind_id,target_entity_ids,source_document_id,status_id,slug,label,claim_text,created_at,updated_at",
        titleField: "claim_text",
      }
    : {
        fields: "id,domain_id,type_id,kind_id,status_id,slug,label,created_at,updated_at",
        titleField: "label",
      };
}

function referenceOptionsFromRows(rows: TableRow[], titleField: string) {
  return rows
    .map((row) => {
      const id = stringRowValue(row, "id");

      if (!id) {
        return null;
      }

      return {
        label: stringRowValue(row, titleField) || stringRowValue(row, "label") || shortId(id),
        row,
        value: id,
      };
    })
    .filter((option): option is ReferenceOption => option !== null);
}

function mergeReferenceOptions(options: Array<ReferenceOption | null>) {
  const optionByValue = new Map<string, ReferenceOption>();

  for (const option of options) {
    if (!option || optionByValue.has(option.value)) {
      continue;
    }

    optionByValue.set(option.value, option);
  }

  return Array.from(optionByValue.values());
}

function stringRowValue(row: TableRow, fieldName: string) {
  const value = row[fieldName];

  return typeof value === "string" ? value : "";
}

export function shortId(value: string) {
  return value.length > 8 ? value.slice(0, 8) : value;
}

function splitMultiValue(value: string) {
  return uniqueStringArray(value.split(",").map((item) => item.trim()));
}

function uniqueStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(value.filter((item): item is string => typeof item === "string")),
  );
}

function optionForValue(
  options: ReferenceOption[],
  value: string,
): ReferenceOption {
  return (
    options.find((option) => option.value === value) ?? {
      label: shortId(value),
      row: { id: value },
      value,
    }
  );
}

const fieldLabelClassName = "mono-label text-primary";
