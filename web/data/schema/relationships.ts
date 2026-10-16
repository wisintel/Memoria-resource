import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { assertionStateEnum } from "./enums";
import { objects } from "./objects";
import { statuses } from "./statuses";
import { types } from "./types";

export const relationships = pgTable(
  "relationships",
  {
    id: uuid("id")
      .primaryKey()
      .references(() => objects.id, { onDelete: "cascade" }),
    sourceObjectId: uuid("source_object_id")
      .notNull()
      .references(() => objects.id),
    targetObjectId: uuid("target_object_id")
      .notNull()
      .references(() => objects.id),
    relationshipTypeId: uuid("relationship_type_id").references(
      () => types.id
    ),
    statusId: uuid("status_id").references(() => statuses.id),
    assertionState: assertionStateEnum("assertion_state")
      .notNull()
      .default("accepted"),
    label: text("label").notNull().default(""),
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
    index("relationships_source_object_id_idx").on(table.sourceObjectId),
    index("relationships_target_object_id_idx").on(table.targetObjectId),
    index("relationships_relationship_type_id_idx").on(
      table.relationshipTypeId
    ),
    index("relationships_status_id_idx").on(table.statusId),
  ]
);
