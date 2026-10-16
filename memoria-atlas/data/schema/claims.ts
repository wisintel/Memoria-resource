import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { assertionStateEnum, extractionModalityEnum } from "./enums";
import { objects } from "./objects";
import { statuses } from "./statuses";
import { types } from "./types";

export const claims = pgTable(
  "claims",
  {
    id: uuid("id")
      .primaryKey()
      .references(() => objects.id, { onDelete: "cascade" }),
    reviewNumber: integer("review_number")
      .notNull()
      .default(sql`nextval('claims_review_number_seq'::regclass)`)
      .unique(),
    claimText: text("claim_text").notNull(),
    claimTypeId: uuid("claim_type_id").references(() => types.id),
    modality: extractionModalityEnum("modality"),
    statusId: uuid("status_id").references(() => statuses.id),
    assertionState: assertionStateEnum("assertion_state")
      .notNull()
      .default("accepted"),
    confidence: text("confidence"),
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
    index("claims_claim_type_id_idx").on(table.claimTypeId),
    index("claims_modality_idx").on(table.modality),
    index("claims_status_id_idx").on(table.statusId),
    index("claims_assertion_state_idx").on(table.assertionState),
  ]
);

export const claimTargets = pgTable(
  "claim_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    targetObjectId: uuid("target_object_id")
      .notNull()
      .references(() => objects.id, { onDelete: "cascade" }),
    targetRole: text("target_role").notNull().default("about"),
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
    unique("claim_targets_claim_target_role_unique").on(
      table.claimId,
      table.targetObjectId,
      table.targetRole
    ),
    index("claim_targets_target_object_id_idx").on(table.targetObjectId),
  ]
);
