import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { objects } from "./objects";
import { statuses } from "./statuses";
import { types } from "./types";

export const subjects = pgTable(
  "subjects",
  {
    id: uuid("id")
      .primaryKey()
      .references(() => objects.id, { onDelete: "cascade" }),
    canonicalLabel: text("canonical_label").notNull(),
    subjectTypeId: uuid("subject_type_id").references(() => types.id),
    description: text("description").notNull().default(""),
    statusId: uuid("status_id").references(() => statuses.id),
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
    index("subjects_subject_type_id_idx").on(table.subjectTypeId),
    index("subjects_status_id_idx").on(table.statusId),
  ]
);
