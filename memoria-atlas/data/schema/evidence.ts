import { index, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { documents, sourceUnits } from "./documents";
import { evidenceLinkRoleEnum } from "./enums";
import { objects } from "./objects";
import { statuses } from "./statuses";

export const evidence = pgTable(
  "evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    evidenceKind: text("evidence_kind").notNull(),
    sourceKind: text("source_kind").notNull(),
    sourceDocumentId: uuid("source_document_id").references(
      () => documents.id
    ),
    sourceUnitId: uuid("source_unit_id").references(() => sourceUnits.id),
    locator: jsonb("locator").notNull().default({}),
    excerpt: text("excerpt").notNull().default(""),
    summary: text("summary").notNull().default(""),
    statusId: uuid("status_id").references(() => statuses.id),
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
    index("evidence_source_document_id_idx").on(table.sourceDocumentId),
    index("evidence_source_unit_id_idx").on(table.sourceUnitId),
  ]
);

export const evidenceLinks = pgTable(
  "evidence_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    evidenceId: uuid("evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "cascade" }),
    targetObjectId: uuid("target_object_id")
      .notNull()
      .references(() => objects.id, { onDelete: "cascade" }),
    linkRole: evidenceLinkRoleEnum("link_role")
      .notNull()
      .default("supports"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("evidence_links_evidence_target_role_unique").on(
      table.evidenceId,
      table.targetObjectId,
      table.linkRole
    ),
    index("evidence_links_target_object_id_idx").on(table.targetObjectId),
  ]
);
