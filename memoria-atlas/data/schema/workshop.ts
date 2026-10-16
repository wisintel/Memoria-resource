import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { extractionBundles, extractionClaims } from "./pipeline";
import { subjects } from "./subjects";

export const workshopPackageDecisions = pgTable(
  "workshop_package_decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bundleId: uuid("bundle_id")
      .notNull()
      .references(() => extractionBundles.id, { onDelete: "cascade" }),
    subjectText: text("subject_text").notNull(),
    normalizedSubject: text("normalized_subject").notNull(),
    outcome: text("outcome").notNull(),
    actorKind: text("actor_kind").notNull().default("user"),
    targetSubjectId: uuid("target_subject_id").references(() => subjects.id, {
      onDelete: "set null",
    }),
    resultingSubjectId: uuid("resulting_subject_id").references(
      () => subjects.id,
      { onDelete: "set null" }
    ),
    resultingClaimIds: jsonb("resulting_claim_ids").notNull().default([]),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("workshop_package_decisions_bundle_subject_unique").on(
      table.bundleId,
      table.normalizedSubject
    ),
    index("workshop_package_decisions_bundle_id_idx").on(table.bundleId),
    index("workshop_package_decisions_resulting_subject_id_idx").on(
      table.resultingSubjectId
    ),
  ]
);

export const workshopClaimDecisions = pgTable(
  "workshop_claim_decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    claimRowId: uuid("claim_row_id")
      .notNull()
      .references(() => extractionClaims.id, { onDelete: "cascade" }),
    outcome: text("outcome").notNull(),
    actorKind: text("actor_kind").notNull().default("user"),
    resultMetadata: jsonb("result_metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("workshop_claim_decisions_claim_row_unique").on(table.claimRowId),
    index("workshop_claim_decisions_claim_row_id_idx").on(table.claimRowId),
    index("workshop_claim_decisions_outcome_idx").on(table.outcome),
  ]
);
