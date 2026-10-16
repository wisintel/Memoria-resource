import type { TableRow } from "@/lib/supabase/client";

export type ClassTableFieldTemplate = {
  label: string;
  multiple?: boolean;
  name: string;
  options?: readonly {
    label: string;
    value: string;
  }[];
  placeholder?: string;
  referenceTable?:
    | "classes"
    | "documents"
    | "domains"
    | "domain_types"
    | "entities"
    | "kinds"
    | "records"
    | "relationships"
    | "statuses"
    | "types"
    | "views";
  required?: boolean;
};

export type ClassTableTemplate = {
  createFields?: readonly ClassTableFieldTemplate[];
  deleteEnabled?: boolean;
  editFields?: readonly ClassTableFieldTemplate[];
  previewFields: readonly string[];
  tableName: string;
  titleField?: string;
};

export const classTableTemplates = {
  classes: {
    previewFields: ["id", "label", "table_name", "type_id", "purpose", "field_layout", "created_at", "updated_at"],
    tableName: "classes",
    titleField: "label",
  },
  claims: {
    createFields: [
      {
        label: "Claim text",
        name: "claim_text",
        placeholder: "Claim text",
        required: true,
      },
      {
        label: "Domain",
        name: "domain_id",
        placeholder: "Domain",
        referenceTable: "domains",
        required: true,
      },
      {
        label: "Type",
        name: "type_id",
        placeholder: "Type",
        referenceTable: "types",
        required: true,
      },
      {
        label: "Status",
        name: "status_id",
        placeholder: "Optional",
        referenceTable: "statuses",
      },
      {
        label: "Source document",
        name: "source_document_id",
        placeholder: "Optional",
        referenceTable: "documents",
      },
      {
        label: "Targets",
        multiple: true,
        name: "target_entity_ids",
        placeholder: "Targets",
        referenceTable: "entities",
        required: true,
      },
    ],
    deleteEnabled: true,
    editFields: [
      {
        label: "Claim text",
        name: "claim_text",
        required: true,
      },
      {
        label: "Domain",
        name: "domain_id",
        referenceTable: "domains",
        required: true,
      },
      {
        label: "Type",
        name: "type_id",
        referenceTable: "types",
        required: true,
      },
      {
        label: "Status",
        name: "status_id",
        placeholder: "Optional",
        referenceTable: "statuses",
      },
      {
        label: "Source document",
        name: "source_document_id",
        placeholder: "Optional",
        referenceTable: "documents",
      },
      {
        label: "Targets",
        multiple: true,
        name: "target_entity_ids",
        referenceTable: "entities",
        required: true,
      },
    ],
    previewFields: [
      "id",
      "domain_id",
      "target_entity_ids",
      "source_document_id",
      "type_id",
      "slug",
      "label",
      "claim_text",
      "status_id",
      "created_at",
      "updated_at",
    ],
    tableName: "claims",
    titleField: "label",
  },
  domains: {
    createFields: [
      {
        label: "Label",
        name: "label",
        placeholder: "Label",
        required: true,
      },
      {
        label: "Domain type",
        name: "domain_type_id",
        placeholder: "Optional",
        referenceTable: "domain_types",
      },
      {
        label: "Core subject",
        name: "core_entity_id",
        placeholder: "Optional",
        referenceTable: "entities",
      },
      {
        label: "Status",
        name: "status_id",
        placeholder: "Optional",
        referenceTable: "statuses",
      },
    ],
    editFields: [
      {
        label: "Label",
        name: "label",
        required: true,
      },
      {
        label: "Domain type",
        name: "domain_type_id",
        placeholder: "Optional",
        referenceTable: "domain_types",
      },
      {
        label: "Core subject",
        name: "core_entity_id",
        placeholder: "Optional",
        referenceTable: "entities",
      },
      {
        label: "Status",
        name: "status_id",
        placeholder: "Optional",
        referenceTable: "statuses",
      },
    ],
    previewFields: ["id", "slug", "label", "core_entity_id", "domain_type_id", "status_id", "created_at", "updated_at"],
    tableName: "domains",
    titleField: "label",
  },
  domain_types: {
    previewFields: [
      "id",
      "slug",
      "label",
      "source_reference",
      "guidance_path",
      "created_at",
      "updated_at",
    ],
    tableName: "domain_types",
    titleField: "label",
  },
  documents: {
    deleteEnabled: true,
    editFields: [
      {
        label: "Label",
        name: "label",
        required: true,
      },
      {
        label: "Description",
        name: "description",
        placeholder: "Optional",
      },
      {
        label: "Domain",
        name: "domain_id",
        referenceTable: "domains",
        required: true,
      },
      {
        label: "Type",
        name: "type_id",
        referenceTable: "types",
      },
      {
        label: "Status",
        name: "status",
        options: [
          { label: "Ready", value: "ready" },
          { label: "Processing", value: "processing" },
          { label: "Failed", value: "failed" },
          { label: "Extracted", value: "extracted" },
        ],
        required: true,
      },
    ],
    previewFields: [
      "id",
      "domain_id",
      "type_id",
      "label",
      "title",
      "source_type",
      "status",
      "source_filename",
      "source_url",
      "content_hash",
      "mime_type",
      "size_bytes",
      "shard_count",
      "extracted_by_tool_id",
      "error_message",
      "created_at",
      "updated_at",
    ],
    tableName: "documents",
    titleField: "label",
  },
  entities: {
    createFields: [
      {
        label: "Label",
        name: "label",
        placeholder: "Label",
        required: true,
      },
      {
        label: "Domain",
        name: "domain_id",
        placeholder: "Domain",
        referenceTable: "domains",
        required: true,
      },
      {
        label: "Type",
        name: "type_id",
        placeholder: "Type",
        referenceTable: "types",
        required: true,
      },
      {
        label: "Status",
        name: "status_id",
        placeholder: "Status",
        referenceTable: "statuses",
        required: true,
      },
    ],
    deleteEnabled: true,
    editFields: [
      {
        label: "Label",
        name: "label",
        required: true,
      },
      {
        label: "Domain",
        name: "domain_id",
        referenceTable: "domains",
        required: true,
      },
      {
        label: "Type",
        name: "type_id",
        referenceTable: "types",
        required: true,
      },
      {
        label: "Status",
        name: "status_id",
        placeholder: "Status",
        referenceTable: "statuses",
        required: true,
      },
    ],
    previewFields: ["id", "domain_id", "type_id", "slug", "label", "description", "status_id", "created_at", "updated_at"],
    tableName: "entities",
    titleField: "label",
  },
  entity_aliases: {
    createFields: [
      {
        label: "Alias",
        name: "alias",
        placeholder: "Alias",
        required: true,
      },
      {
        label: "Domain",
        name: "domain_id",
        placeholder: "Domain",
        referenceTable: "domains",
        required: true,
      },
      {
        label: "Subject",
        name: "entity_id",
        placeholder: "Subject",
        referenceTable: "entities",
        required: true,
      },
      {
        label: "Status",
        name: "status_id",
        placeholder: "Optional",
        referenceTable: "statuses",
      },
      {
        label: "Source document",
        name: "source_document_id",
        placeholder: "Optional",
        referenceTable: "documents",
      },
    ],
    deleteEnabled: true,
    editFields: [
      {
        label: "Alias",
        name: "alias",
        required: true,
      },
      {
        label: "Domain",
        name: "domain_id",
        referenceTable: "domains",
        required: true,
      },
      {
        label: "Subject",
        name: "entity_id",
        referenceTable: "entities",
        required: true,
      },
      {
        label: "Status",
        name: "status_id",
        placeholder: "Optional",
        referenceTable: "statuses",
      },
      {
        label: "Source document",
        name: "source_document_id",
        placeholder: "Optional",
        referenceTable: "documents",
      },
    ],
    previewFields: [
      "id",
      "domain_id",
      "entity_id",
      "alias",
      "normalized_alias",
      "status_id",
      "source_document_id",
      "created_at",
      "updated_at",
    ],
    tableName: "entity_aliases",
    titleField: "alias",
  },
  kinds: {
    createFields: [
      {
        label: "Label",
        name: "label",
        placeholder: "Label",
        required: true,
      },
      {
        label: "Type",
        name: "type_id",
        placeholder: "Type",
        referenceTable: "types",
        required: true,
      },
      {
        label: "Status",
        name: "status_id",
        placeholder: "Optional status UUID",
        referenceTable: "statuses",
      },
    ],
    deleteEnabled: true,
    editFields: [
      {
        label: "Label",
        name: "label",
        required: true,
      },
      {
        label: "Type",
        name: "type_id",
        referenceTable: "types",
        required: true,
      },
      {
        label: "Status",
        name: "status_id",
        placeholder: "Optional status UUID",
        referenceTable: "statuses",
      },
    ],
    previewFields: ["id", "type_id", "slug", "label", "status_id", "created_at", "updated_at"],
    tableName: "kinds",
    titleField: "label",
  },
  relationships: {
    createFields: [
      {
        label: "Domain",
        name: "domain_id",
        placeholder: "Domain",
        referenceTable: "domains",
        required: true,
      },
      {
        label: "Type",
        name: "type_id",
        placeholder: "Type",
        referenceTable: "types",
        required: true,
      },
      {
        label: "Status",
        name: "status_id",
        placeholder: "Optional",
        referenceTable: "statuses",
      },
      {
        label: "Source class",
        name: "source_class_id",
        placeholder: "Source class",
        referenceTable: "classes",
        required: true,
      },
      {
        label: "Source record",
        name: "source_record_id",
        placeholder: "Source record",
        referenceTable: "records",
        required: true,
      },
      {
        label: "Target class",
        name: "target_class_id",
        placeholder: "Target class",
        referenceTable: "classes",
        required: true,
      },
      {
        label: "Target record",
        name: "target_record_id",
        placeholder: "Target record",
        referenceTable: "records",
        required: true,
      },
    ],
    deleteEnabled: true,
    editFields: [
      {
        label: "Domain",
        name: "domain_id",
        referenceTable: "domains",
        required: true,
      },
      {
        label: "Type",
        name: "type_id",
        referenceTable: "types",
        required: true,
      },
      {
        label: "Status",
        name: "status_id",
        placeholder: "Optional",
        referenceTable: "statuses",
      },
      {
        label: "Source class",
        name: "source_class_id",
        referenceTable: "classes",
        required: true,
      },
      {
        label: "Source record",
        name: "source_record_id",
        referenceTable: "records",
        required: true,
      },
      {
        label: "Target class",
        name: "target_class_id",
        referenceTable: "classes",
        required: true,
      },
      {
        label: "Target record",
        name: "target_record_id",
        referenceTable: "records",
        required: true,
      },
    ],
    previewFields: [
      "label",
      "domain_id",
      "type_id",
      "source_class_id",
      "source_record_id",
      "target_class_id",
      "target_record_id",
      "status_id",
      "id",
      "created_at",
      "updated_at",
    ],
    tableName: "relationships",
    titleField: "label",
  },
  views: {
    previewFields: [
      "id",
      "domain_id",
      "slug",
      "label",
      "view_kind",
      "status_id",
      "created_at",
      "updated_at",
    ],
    tableName: "views",
    titleField: "label",
  },
  view_nodes: {
    previewFields: [
      "id",
      "view_id",
      "record_class_id",
      "record_id",
      "visibility",
      "x",
      "y",
      "pinned",
      "created_at",
      "updated_at",
    ],
    tableName: "view_nodes",
    titleField: "record_id",
  },
  view_relationships: {
    previewFields: [
      "id",
      "view_id",
      "relationship_id",
      "visibility",
      "created_at",
      "updated_at",
    ],
    tableName: "view_relationships",
    titleField: "relationship_id",
  },
  statuses: {
    createFields: [
      {
        label: "Label",
        name: "label",
        placeholder: "Label",
        required: true,
      },
      {
        label: "Class",
        name: "class_id",
        placeholder: "Class UUID",
        referenceTable: "classes",
        required: true,
      },
    ],
    deleteEnabled: true,
    editFields: [
      {
        label: "Label",
        name: "label",
        required: true,
      },
      {
        label: "Class",
        name: "class_id",
        referenceTable: "classes",
        required: true,
      },
    ],
    previewFields: ["id", "class_id", "slug", "label", "created_at", "updated_at"],
    tableName: "statuses",
    titleField: "label",
  },
  tools: {
    previewFields: [
      "id",
      "slug",
      "label",
      "tool_kind",
      "purpose",
      "asset_path",
      "metadata_path",
      "entrypoint",
      "launch_url",
      "env_contract",
      "config",
      "status",
      "created_at",
      "updated_at",
    ],
    tableName: "tools",
    titleField: "label",
  },
  types: {
    createFields: [
      {
        label: "Label",
        name: "label",
        placeholder: "Label",
        required: true,
      },
      {
        label: "Domain",
        name: "domain_id",
        placeholder: "Optional domain",
        referenceTable: "domains",
      },
      {
        label: "Class",
        name: "class_id",
        placeholder: "Class UUID",
        referenceTable: "classes",
        required: true,
      },
      {
        label: "Status",
        name: "status_id",
        placeholder: "Optional status UUID",
        referenceTable: "statuses",
      },
    ],
    deleteEnabled: true,
    editFields: [
      {
        label: "Label",
        name: "label",
        required: true,
      },
      {
        label: "Domain",
        name: "domain_id",
        placeholder: "Optional domain",
        referenceTable: "domains",
      },
      {
        label: "Class",
        name: "class_id",
        referenceTable: "classes",
        required: true,
      },
    ],
    previewFields: [
      "id",
      "domain_id",
      "class_id",
      "slug",
      "label",
      "status_id",
      "created_at",
      "updated_at",
    ],
    tableName: "types",
    titleField: "label",
  },
} as const satisfies Record<string, ClassTableTemplate>;

export type KnownClassTableName = keyof typeof classTableTemplates;

export type MutableClassTableName = {
  [TableName in KnownClassTableName]: (typeof classTableTemplates)[TableName] extends {
    createFields: readonly ClassTableFieldTemplate[];
  }
    ? TableName
    : never;
}[KnownClassTableName];

export function getClassTableTemplate(tableName: string): ClassTableTemplate | null {
  return isKnownClassTableName(tableName) ? classTableTemplates[tableName] : null;
}

export function getMutableClassTableTemplate(tableName: string): ClassTableTemplate | null {
  if (!isKnownClassTableName(tableName)) {
    return null;
  }

  const template: ClassTableTemplate = classTableTemplates[tableName];

  return template.createFields || template.editFields || template.deleteEnabled
    ? template
    : null;
}

export function isKnownClassTableName(tableName: string): tableName is KnownClassTableName {
  return tableName in classTableTemplates;
}

export function rowTemplateTitle(row: TableRow, template: ClassTableTemplate) {
  const titleField = template.titleField;

  if (titleField) {
    const value = row[titleField];

    if (typeof value === "string" && value.length > 0) {
      return value;
    }

    if (typeof value === "number") {
      return String(value);
    }
  }

  for (const field of ["label", "name", "title", "slug", "id"]) {
    const value = row[field];

    if (typeof value === "string" && value.length > 0) {
      return value;
    }

    if (typeof value === "number") {
      return String(value);
    }
  }

  return "Selected row";
}
