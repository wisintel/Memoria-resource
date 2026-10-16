import {
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { domains } from "./domains";
import { objects } from "./objects";

export const objectDomainMemberships = pgTable(
  "object_domain_memberships",
  {
    objectId: uuid("object_id")
      .notNull()
      .references(() => objects.id, { onDelete: "cascade" }),
    domainId: uuid("domain_id")
      .notNull()
      .references(() => domains.id, { onDelete: "cascade" }),
    membershipState: text("membership_state").notNull().default("member"),
    membershipRole: text("membership_role"),
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
      columns: [table.objectId, table.domainId],
      name: "object_domain_memberships_object_id_domain_id_pk",
    }),
  ]
);
