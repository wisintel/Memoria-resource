import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { objects } from "./objects";
import { statuses } from "./statuses";
import { types } from "./types";

export const documents = pgTable(
  "documents",
  {
    id: uuid("id")
      .primaryKey()
      .references(() => objects.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    documentTypeId: uuid("document_type_id").references(() => types.id),
    sourceType: text("source_type").notNull().default("markdown"),
    statusId: uuid("status_id").references(() => statuses.id),
    preparationState: text("preparation_state")
      .notNull()
      .default("not_started"),
    description: text("description").notNull().default(""),
    contentSha256: text("content_sha256").notNull().default(""),
    bodySha256: text("body_sha256").notNull().default(""),
    sizeBytes: integer("size_bytes").notNull().default(0),
    documentForm: text("document_form").notNull(),
    structuralNotes: text("structural_notes"),
    sourceFilename: text("source_filename"),
    sourceUrl: text("source_url"),
    mimeType: text("mime_type"),
    shardCount: integer("shard_count").notNull().default(0),
    errorMessage: text("error_message"),
    source: text("source"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("documents_document_type_id_idx").on(table.documentTypeId),
    index("documents_status_id_idx").on(table.statusId),
    index("documents_content_sha256_idx").on(table.contentSha256),
  ]
);

export const sourceUnits = pgTable(
  "source_units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    unitType: text("unit_type").notNull().default("chunk"),
    headingPath: jsonb("heading_path").notNull().default([]),
    body: text("body").notNull(),
    locator: jsonb("locator").notNull().default({}),
    sizeBytes: integer("size_bytes").notNull().default(0),
    contentSha256: text("content_sha256").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("source_units_document_position_unique").on(
      table.documentId,
      table.position
    ),
    index("source_units_document_id_idx").on(table.documentId),
  ]
);
