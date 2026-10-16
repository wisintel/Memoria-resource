import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { mapVisibilityEnum } from "./enums";
import { objects } from "./objects";
import { relationships } from "./relationships";
import { statuses } from "./statuses";
import { types } from "./types";

export const domainMaps = pgTable(
  "domain_maps",
  {
    id: uuid("id")
      .primaryKey()
      .references(() => objects.id, { onDelete: "cascade" }),
    slug: text("slug").notNull().unique(),
    label: text("label").notNull(),
    mapKindTypeId: uuid("map_kind_type_id").references(() => types.id),
    description: text("description").notNull().default(""),
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
    index("domain_maps_map_kind_type_id_idx").on(table.mapKindTypeId),
    index("domain_maps_status_id_idx").on(table.statusId),
  ]
);

export const domainMapNodes = pgTable(
  "domain_map_nodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    domainMapId: uuid("domain_map_id")
      .notNull()
      .references(() => domainMaps.id, { onDelete: "cascade" }),
    objectId: uuid("object_id")
      .notNull()
      .references(() => objects.id, { onDelete: "cascade" }),
    nodeRole: text("node_role").notNull().default("member"),
    visibility: mapVisibilityEnum("visibility").notNull().default("visible"),
    position: jsonb("position").notNull().default({}),
    layoutMetadata: jsonb("layout_metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("domain_map_nodes_map_object_unique").on(
      table.domainMapId,
      table.objectId
    ),
    index("domain_map_nodes_object_id_idx").on(table.objectId),
  ]
);

export const domainMapRelationships = pgTable(
  "domain_map_relationships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    domainMapId: uuid("domain_map_id")
      .notNull()
      .references(() => domainMaps.id, { onDelete: "cascade" }),
    relationshipId: uuid("relationship_id")
      .notNull()
      .references(() => relationships.id, { onDelete: "cascade" }),
    visibility: mapVisibilityEnum("visibility").notNull().default("visible"),
    layoutMetadata: jsonb("layout_metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("domain_map_relationships_map_relationship_unique").on(
      table.domainMapId,
      table.relationshipId
    ),
    index("domain_map_relationships_relationship_id_idx").on(
      table.relationshipId
    ),
  ]
);
