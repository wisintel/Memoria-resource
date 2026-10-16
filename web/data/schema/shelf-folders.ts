import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { documents } from "./documents";
import { domains } from "./domains";

export const shelfFolders = pgTable(
  "shelf_folders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    domainId: uuid("domain_id")
      .notNull()
      .references(() => domains.id, { onDelete: "cascade" }),
    scope: text("scope").notNull().default("documents"),
    label: text("label").notNull(),
    position: integer("position").notNull().default(0),
    collapsed: boolean("collapsed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("shelf_folders_domain_scope_idx").on(table.domainId, table.scope),
  ]
);

export const shelfFolderItems = pgTable(
  "shelf_folder_items",
  {
    folderId: uuid("folder_id")
      .notNull()
      .references(() => shelfFolders.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    primaryKey({
      columns: [table.folderId, table.itemId],
      name: "shelf_folder_items_folder_item_pk",
    }),
    index("shelf_folder_items_item_id_idx").on(table.itemId),
  ]
);
