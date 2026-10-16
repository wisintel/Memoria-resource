import {
  boolean,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const classCategoryEnum = pgEnum("class_category", [
  "knowledge_object",
  "graph_construct",
  "operational",
  "ontology",
  "supporting",
]);

export const classes = pgTable("classes", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  tableName: text("table_name"),
  category: classCategoryEnum("category").notNull(),
  shelfVisibleDefault: boolean("shelf_visible_default")
    .notNull()
    .default(false),
  inspectable: boolean("inspectable").notNull().default(true),
  referenceSelectable: boolean("reference_selectable").notNull().default(false),
  graphVisibleDefault: boolean("graph_visible_default")
    .notNull()
    .default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
