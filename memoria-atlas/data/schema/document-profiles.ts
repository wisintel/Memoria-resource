import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import {
  documentProfileConfidenceEnum,
  documentProfileStatusEnum,
} from "./enums";
import { documents } from "./documents";

// A Document Profile is per-document inspection guidance for extraction: what
// the document is, how it's shaped, and how to capture it. Guidance, not
// evidence, and regenerable — one per Document, updated in place when
// re-inspected. Scalar/status fields are columns; the list-shaped hints
// (structure flags, handling flags, capture-profile hint, domain hint,
// ambiguity notes) live in the `profile` jsonb payload.
export const documentProfiles = pgTable(
  "document_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .unique()
      .references(() => documents.id, { onDelete: "cascade" }),
    inspectionStatus: documentProfileStatusEnum("inspection_status").notNull(),
    confidence: documentProfileConfidenceEnum("confidence").notNull(),
    documentShape: text("document_shape"),
    sourceForm: text("source_form"),
    summary: text("summary"),
    profile: jsonb("profile").notNull().default({}),
    errorSummary: text("error_summary"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("document_profiles_document_id_idx").on(table.documentId)]
);
