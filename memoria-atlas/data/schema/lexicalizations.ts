import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { domains } from "./domains";
import { objects } from "./objects";
import { statuses } from "./statuses";

export const lexicalizations = pgTable(
  "lexicalizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    objectId: uuid("object_id")
      .notNull()
      .references(() => objects.id, { onDelete: "cascade" }),
    lexicalType: text("lexical_type").notNull().default("alias"),
    value: text("value").notNull(),
    normalizedValue: text("normalized_value").notNull(),
    language: text("language").notNull().default("en"),
    domainId: uuid("domain_id").references(() => domains.id, {
      onDelete: "cascade",
    }),
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
    index("lexicalizations_object_id_idx").on(table.objectId),
    index("lexicalizations_normalized_value_idx").on(table.normalizedValue),
  ]
);
