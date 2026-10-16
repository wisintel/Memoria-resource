import { and, eq, sql } from "drizzle-orm";
import { db } from "./client";
import { classes, statuses, types } from "./schema";
import { defaultOntologyTypeSeeds } from "@/lib/ontology/default-ontology";

type ClassSeed = typeof classes.$inferInsert & {
  key: string;
};

type StatusSeed = {
  key: string;
  label: string;
};

const classSeeds: ClassSeed[] = [
  {
    key: "domain",
    label: "Domain",
    tableName: "domains",
    category: "knowledge_object",
    inspectable: true,
  },
  {
    key: "document",
    label: "Document",
    tableName: "documents",
    category: "knowledge_object",
    shelfVisibleDefault: true,
    inspectable: true,
    referenceSelectable: true,
  },
  {
    key: "subject",
    label: "Subject",
    tableName: "subjects",
    category: "knowledge_object",
    shelfVisibleDefault: true,
    inspectable: true,
    referenceSelectable: true,
    graphVisibleDefault: true,
  },
  {
    key: "claim",
    label: "Claim",
    tableName: "claims",
    category: "knowledge_object",
    inspectable: true,
    referenceSelectable: true,
  },
  {
    key: "relationship",
    label: "Relationship",
    tableName: "relationships",
    category: "knowledge_object",
    shelfVisibleDefault: true,
    inspectable: true,
    referenceSelectable: true,
    graphVisibleDefault: true,
  },
  {
    key: "domain_map",
    label: "Domain Map",
    tableName: "domain_maps",
    category: "graph_construct",
    shelfVisibleDefault: true,
    inspectable: true,
  },
  {
    key: "bundle",
    label: "Bundle",
    tableName: "extraction_bundles",
    category: "operational",
    shelfVisibleDefault: true,
    inspectable: true,
  },
  {
    key: "type",
    label: "Type",
    tableName: "types",
    category: "ontology",
    shelfVisibleDefault: true,
    inspectable: true,
    referenceSelectable: true,
  },
  {
    key: "evidence",
    label: "Evidence",
    tableName: "evidence",
    category: "supporting",
    inspectable: true,
  },
  {
    key: "lexicalization",
    label: "Lexicalization",
    tableName: "lexicalizations",
    category: "supporting",
    inspectable: true,
  },
];

const statusSeedsByClass: Record<string, StatusSeed[]> = {
  domain: [
    { key: "active", label: "Active" },
    { key: "archived", label: "Archived" },
  ],
  document: [
    { key: "ready", label: "Ready" },
    { key: "processing", label: "Processing" },
    { key: "failed", label: "Failed" },
    { key: "archived", label: "Archived" },
  ],
  subject: [
    { key: "active", label: "Active" },
    { key: "archived", label: "Archived" },
  ],
  claim: [
    { key: "active", label: "Active" },
    { key: "archived", label: "Archived" },
  ],
  relationship: [
    { key: "active", label: "Active" },
    { key: "archived", label: "Archived" },
  ],
  domain_map: [
    { key: "active", label: "Active" },
    { key: "archived", label: "Archived" },
  ],
  bundle: [
    { key: "assembling", label: "Assembling" },
    { key: "needs_review", label: "Needs Review" },
    { key: "committed", label: "Committed" },
    { key: "archived", label: "Archived" },
  ],
  type: [
    { key: "active", label: "Active" },
    { key: "archived", label: "Archived" },
  ],
  evidence: [
    { key: "active", label: "Active" },
    { key: "archived", label: "Archived" },
  ],
  lexicalization: [
    { key: "active", label: "Active" },
    { key: "archived", label: "Archived" },
  ],
};

export async function seedRegistry() {
  for (const classSeed of classSeeds) {
    await db
      .insert(classes)
      .values(classSeed)
      .onConflictDoUpdate({
        target: classes.key,
        set: {
          label: classSeed.label,
          tableName: classSeed.tableName,
          category: classSeed.category,
          shelfVisibleDefault: classSeed.shelfVisibleDefault ?? false,
          inspectable: classSeed.inspectable ?? true,
          referenceSelectable: classSeed.referenceSelectable ?? false,
          graphVisibleDefault: classSeed.graphVisibleDefault ?? false,
        },
      });
  }

  const classRows = await db.select().from(classes);
  const classIdByKey = new Map(classRows.map((row) => [row.key, row.id]));

  for (const [classKey, classStatuses] of Object.entries(statusSeedsByClass)) {
    const classId = classIdByKey.get(classKey);

    if (!classId) {
      throw new Error(`Class seed missing: ${classKey}`);
    }

    for (const [position, statusSeed] of classStatuses.entries()) {
      await db
        .insert(statuses)
        .values({
          classId,
          key: statusSeed.key,
          label: statusSeed.label,
          isDefault: position === 0,
          position,
        })
        .onConflictDoUpdate({
          target: [statuses.classId, statuses.key],
          set: {
            label: statusSeed.label,
            isDefault: position === 0,
            position,
          },
      });
    }
  }

  await seedDefaultOntologyTypes(classIdByKey);
}

async function seedDefaultOntologyTypes(classIdByKey: Map<string, string>) {
  const typeStatusId = await getDefaultStatusId("type");

  if (!typeStatusId) {
    throw new Error("Type status seed missing: active");
  }

  for (const typeSeed of defaultOntologyTypeSeeds) {
    const classId = classIdByKey.get(typeSeed.classKey);

    if (!classId) {
      throw new Error(`Class seed missing: ${typeSeed.classKey}`);
    }

    await db.execute(sql`
      insert into ${types} (
        class_id,
        domain_id,
        slug,
        label,
        description,
        status_id,
        metadata,
        created_by
      )
      values (
        ${classId},
        null,
        ${typeSeed.slug},
        ${typeSeed.label},
        ${typeSeed.description},
        ${typeStatusId},
        ${JSON.stringify(typeSeed.metadata)}::jsonb,
        'system'
      )
      on conflict (class_id, slug) where domain_id is null
      do update set
        label = excluded.label,
        description = excluded.description,
        status_id = excluded.status_id,
        metadata = excluded.metadata,
        created_by = excluded.created_by,
      updated_at = now()
    `);
  }

  const relationshipClassId = classIdByKey.get("relationship");
  const relationshipSlugs = defaultOntologyTypeSeeds
    .filter((typeSeed) => typeSeed.classKey === "relationship")
    .map((typeSeed) => typeSeed.slug);

  if (!relationshipClassId || relationshipSlugs.length === 0) {
    throw new Error("Relationship ontology seed is missing");
  }

  await db.execute(sql`
    delete from ${types} as stale_types
    where stale_types.class_id = ${relationshipClassId}
      and stale_types.domain_id is null
      and stale_types.created_by = 'system'
      and coalesce(stale_types.metadata ->> 'systemSeed', 'false') = 'true'
      and stale_types.slug not in (${sql.join(
        relationshipSlugs.map((slug) => sql`${slug}`),
        sql`, `
      )})
      and not exists (
        select 1
        from relationships
        where relationships.relationship_type_id = stale_types.id
      )
      and not exists (
        select 1
        from ${types} as child_types
        where child_types.parent_type_id = stale_types.id
      )
  `);
}

async function getDefaultStatusId(classKey: string) {
  const [row] = await db
    .select({ id: statuses.id })
    .from(statuses)
    .innerJoin(classes, eq(classes.id, statuses.classId))
    .where(and(eq(classes.key, classKey), eq(statuses.isDefault, true)))
    .limit(1);

  return row?.id ?? null;
}

export async function getSeededClassId(key: string) {
  const [classRow] = await db
    .select({ id: classes.id })
    .from(classes)
    .where(eq(classes.key, key))
    .limit(1);

  return classRow?.id ?? null;
}
