import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  foreignKey,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { classes } from "./classes";
import { domains } from "./domains";
import { statuses } from "./statuses";

export const types = pgTable(
  "types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id),
    domainId: uuid("domain_id").references((): AnyPgColumn => domains.id, {
      onDelete: "cascade",
    }),
    parentTypeId: uuid("parent_type_id"),
    slug: text("slug").notNull(),
    label: text("label").notNull(),
    description: text("description"),
    statusId: uuid("status_id").references(() => statuses.id),
    metadata: jsonb("metadata").notNull().default({}),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    foreignKey({
      columns: [table.parentTypeId],
      foreignColumns: [table.id],
      name: "types_parent_type_id_types_id_fk",
    }),
    uniqueIndex("types_class_id_global_slug_unique")
      .on(table.classId, table.slug)
      .where(sql`${table.domainId} is null`),
    uniqueIndex("types_class_id_domain_id_slug_unique")
      .on(table.classId, table.domainId, table.slug)
      .where(sql`${table.domainId} is not null`),
  ]
);
