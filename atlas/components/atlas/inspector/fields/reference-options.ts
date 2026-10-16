import {
  getClassTableTemplate,
  isKnownClassTableName,
  rowTemplateTitle,
  type ClassTableFieldTemplate,
  type KnownClassTableName,
} from "@/lib/class-table-templates";
import type { ClassTableSamples, TableRow } from "@/lib/supabase/client";

export type ReferenceOption = {
  label: string;
  row: TableRow;
  value: string;
};

export type ReferenceOptions = Partial<Record<KnownClassTableName, ReferenceOption[]>>;

export function buildReferenceOptions(tableSamples: ClassTableSamples): ReferenceOptions {
  const referenceTables: KnownClassTableName[] = [
    "claims",
    "classes",
    "documents",
    "domains",
    "domain_types",
    "entities",
    "entity_aliases",
    "kinds",
    "relationships",
    "statuses",
    "types",
    "views",
    "view_nodes",
    "view_relationships",
  ];
  const entries = referenceTables.map((tableName) => {
    const sample = tableSamples[tableName];
    const template = getClassTableTemplate(tableName);

    if (!sample || sample.error || !template) {
      return [tableName, []] as const;
    }

    const options = sample.rows
      .map((row) => {
        const id = row.id;

        if (typeof id !== "string") {
          return null;
        }

        return {
          label: rowTemplateTitle(row, template),
          row,
          value: id,
        };
      })
      .filter((option): option is ReferenceOption => option !== null);

    return [tableName, options] as const;
  });

  return Object.fromEntries(entries);
}

export function filteredReferenceOptions({
  field,
  fieldValues,
  referenceOptions,
  tableName,
}: {
  field: ClassTableFieldTemplate;
  fieldValues: Record<string, string>;
  referenceOptions: ReferenceOptions;
  tableName: string;
}) {
  if (!field.referenceTable) {
    return [];
  }

  const currentClassId = classIdForTableName(referenceOptions, tableName);

  if (field.referenceTable === "records") {
    return recordReferenceOptions({
      fieldName: field.name,
      fieldValues,
      referenceOptions,
    });
  }

  const baseOptions = referenceOptions[field.referenceTable] ?? [];

  if (field.referenceTable === "classes" && tableName === "types" && field.name === "class_id") {
    return ontologyTypeClassOptions(baseOptions);
  }

  if (
    field.referenceTable === "classes" &&
    tableName === "relationships" &&
    (field.name === "source_class_id" || field.name === "target_class_id")
  ) {
    return relationshipClassOptions({
      fieldName: field.name,
      fieldValues,
      options: baseOptions,
      referenceOptions,
    });
  }

  if (field.referenceTable === "statuses") {
    return currentClassId
      ? baseOptions.filter((option) => stringRowValue(option.row, "class_id") === currentClassId)
      : baseOptions;
  }

  if (field.referenceTable === "types" && field.name === "type_id") {
    const targetClassId = fieldValues.class_id || (tableName === "kinds" ? "" : currentClassId);
    const targetDomainId = fieldValues.domain_id;

    return baseOptions.filter((option) => {
      const typeClassId = stringRowValue(option.row, "class_id");
      const typeDomainId = stringRowValue(option.row, "domain_id");

      if (targetClassId && typeClassId !== targetClassId) {
        return false;
      }

      if (targetDomainId && typeDomainId && typeDomainId !== targetDomainId) {
        return false;
      }

      return true;
    });
  }

  if (
    field.referenceTable === "entities" &&
    (field.name === "target_entity_ids" || field.name === "entity_id")
  ) {
    const targetDomainId = fieldValues.domain_id;

    return targetDomainId
      ? baseOptions.filter((option) => stringRowValue(option.row, "domain_id") === targetDomainId)
      : [];
  }

  if (field.referenceTable === "documents" && field.name === "source_document_id") {
    const targetDomainId = fieldValues.domain_id;

    return targetDomainId
      ? baseOptions.filter((option) => stringRowValue(option.row, "domain_id") === targetDomainId)
      : [];
  }

  if (field.referenceTable === "kinds" && field.name === "kind_id") {
    const targetTypeId = fieldValues.type_id;

    return baseOptions.filter((option) => {
      const kindTypeId = stringRowValue(option.row, "type_id");

      if (targetTypeId && kindTypeId !== targetTypeId) {
        return false;
      }

      return true;
    });
  }

  return baseOptions;
}

function ontologyTypeClassOptions(options: ReferenceOption[]) {
  const allowedTableNames = new Set(["claims", "documents", "entities", "relationships"]);

  return options.filter((option) => allowedTableNames.has(stringRowValue(option.row, "table_name")));
}

function classIdForTableName(referenceOptions: ReferenceOptions, tableName: string) {
  return (
    referenceOptions.classes?.find((option) => stringRowValue(option.row, "table_name") === tableName)?.value ?? ""
  );
}

function recordReferenceOptions({
  fieldName,
  fieldValues,
  referenceOptions,
}: {
  fieldName: string;
  fieldValues: Record<string, string>;
  referenceOptions: ReferenceOptions;
}) {
  const classFieldName =
    fieldName === "source_record_id"
      ? "source_class_id"
      : fieldName === "target_record_id"
        ? "target_class_id"
        : "";
  const selectedClassId = classFieldName ? fieldValues[classFieldName] : "";
  const selectedClassOption = referenceOptions.classes?.find((option) => option.value === selectedClassId);
  const selectedTableName = selectedClassOption ? stringRowValue(selectedClassOption.row, "table_name") : "";

  if (!selectedTableName || !isKnownClassTableName(selectedTableName)) {
    return [];
  }

  const selectedDomainId = fieldValues.domain_id;
  const recordOptions = referenceOptions[selectedTableName] ?? [];

  return recordOptions.filter((option) => {
    const recordDomainId = stringRowValue(option.row, "domain_id");

    return !selectedDomainId || !recordDomainId || recordDomainId === selectedDomainId;
  });
}

function relationshipClassOptions({
  fieldName,
  fieldValues,
  options,
  referenceOptions,
}: {
  fieldName: string;
  fieldValues: Record<string, string>;
  options: ReferenceOption[];
  referenceOptions: ReferenceOptions;
}) {
  const allowedTableNames = new Set(["entities", "claims"]);
  const pairedClassFieldName = fieldName === "source_class_id" ? "target_class_id" : "source_class_id";
  const pairedClassId = fieldValues[pairedClassFieldName];
  const pairedClassOption = referenceOptions.classes?.find((option) => option.value === pairedClassId);
  const pairedTableName = pairedClassOption ? stringRowValue(pairedClassOption.row, "table_name") : "";

  return options.filter((option) => {
    const optionTableName = stringRowValue(option.row, "table_name");

    if (!allowedTableNames.has(optionTableName)) {
      return false;
    }

    return !pairedTableName || optionTableName === pairedTableName;
  });
}

function stringRowValue(row: TableRow, fieldName: string) {
  const value = row[fieldName];

  return typeof value === "string" ? value : "";
}
