import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { objects } from "./objects";
import { statuses } from "./statuses";

export const domains = pgTable(
  "domains",
  {
    id: uuid("id")
      .primaryKey()
      .references(() => objects.id, { onDelete: "cascade" }),
    slug: text("slug").notNull().unique(),
    label: text("label").notNull(),
    description: text("description"),
    statusId: uuid("status_id").references(() => statuses.id),
    ownerUserId: text("owner_user_id"),
    createdBy: text("created_by"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  }
);
