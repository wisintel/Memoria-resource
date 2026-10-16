import { and, eq, sql } from "drizzle-orm";

import { db } from "@/data/client";
import { classes } from "@/data/schema/classes";
import {
  domainMapNodes,
  domainMapRelationships,
  domainMaps,
} from "@/data/schema/domain-maps";
import { statuses } from "@/data/schema/statuses";
import { types } from "@/data/schema/types";
import {
  createCanonicalObject,
  getDomainMemberObject,
} from "@/data/queries/canonical-objects";
import { getClassByKey } from "@/data/queries/registry";
import { ensureDefaultWorkspaceMap } from "@/services/default-workspace-map";
import {
  addDomainMapObjectInput,
  addDomainMapRelationshipInput,
  connectDomainMapObjectsInput,
  createDomainMapInput,
  type DomainMapNodeView,
  type DomainMapRelationshipView,
  type DomainMapSnapshot,
  type DomainMapSummary,
  type GraphPosition,
  type MapVisibility,
  type RelationshipTypeOption,
  updateDomainMapInput,
  updateDomainMapLayoutInput,
} from "@/domain/domain-maps";
import { slugify } from "@/lib/slug";
import { getDomainBySlug } from "@/services/domains";
import { createRelationship } from "@/services/relationships";
import { err, ok, type CommandResult } from "@/services/result";

type DomainMapRow = {
  default_relationship_type_id: string | null;
  id: string;
  slug: string;
  label: string;
  description: string | null;
  is_default_workspace: boolean | null;
  is_wip: boolean | null;
  status_key: string | null;
  status_label: string | null;
  map_kind_label: string | null;
  updated_at: Date;
};

type DomainMapNodeRow = {
  id: string;
  layout_metadata: unknown;
  object_id: string;
  object_class_key: string;
  label: string | null;
  type_label: string | null;
  node_role: string | null;
  visibility: MapVisibility | null;
  position: unknown;
};

type DomainMapRelationshipRow = {
  id: string;
  relationship_id: string;
  source_object_id: string;
  target_object_id: string;
  label: string | null;
  type_id: string | null;
  type_label: string | null;
  visibility: MapVisibility | null;
};

type RelationshipTypeRow = {
  id: string;
  label: string;
};

type DomainMapMembershipRow = {
  domain_id: string;
  domain_map_id: string;
};

type DomainMapNodeMembershipRow = {
  id: string;
  object_id: string;
};

type RelationshipEndpointRow = {
  source_object_id: string;
  target_object_id: string;
};

type DomainMapNodeCountRow = {
  node_count: number;
};

const defaultNodeSpacingX = 220;
const defaultNodeSpacingY = 130;
const defaultNodeOriginX = 80;
const defaultNodeOriginY = 80;

function pgErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }
  if ("code" in error && typeof error.code === "string") {
    return error.code;
  }
  if (
    "cause" in error &&
    typeof error.cause === "object" &&
    error.cause !== null &&
    "code" in error.cause &&
    typeof error.cause.code === "string"
  ) {
    return error.cause.code;
  }
  return null;
}

function mapSummaryFromRow(row: DomainMapRow): DomainMapSummary {
  return {
    defaultRelationshipTypeId: row.default_relationship_type_id,
    id: row.id,
    slug: row.slug,
    label: row.label,
    description: row.description,
    isDefaultWorkspace: row.is_default_workspace === true,
    isWip: row.is_wip === true,
    statusKey: row.status_key,
    statusLabel: row.status_label,
    mapKindLabel: row.map_kind_label,
    updatedAt: row.updated_at,
  };
}

function positionFromValue(value: unknown): GraphPosition {
  if (typeof value !== "object" || value === null) {
    return { x: 0, y: 0 };
  }

  const candidate = value as { x?: unknown; y?: unknown };
  return {
    x:
      typeof candidate.x === "number" && Number.isFinite(candidate.x)
        ? candidate.x
        : 0,
    y:
      typeof candidate.y === "number" && Number.isFinite(candidate.y)
        ? candidate.y
        : 0,
  };
}

function nodeFromRow(row: DomainMapNodeRow): DomainMapNodeView {
  return {
    id: row.id,
    layoutMetadata: layoutMetadataFromValue(row.layout_metadata),
    objectId: row.object_id,
    objectClassKey: row.object_class_key,
    label: row.label ?? "Untitled object",
    typeLabel: row.type_label,
    nodeRole: row.node_role ?? "member",
    visibility: row.visibility ?? "visible",
    position: positionFromValue(row.position),
  };
}

function layoutMetadataFromValue(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const candidate = value as { isCollapsed?: unknown };

  return {
    ...(typeof candidate.isCollapsed === "boolean"
      ? { isCollapsed: candidate.isCollapsed }
      : {}),
  };
}

function isWipWorkspaceMetadata(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const metadata = value as { isWip?: unknown };

  return metadata.isWip === true;
}

function relationshipFromRow(
  row: DomainMapRelationshipRow
): DomainMapRelationshipView {
  return {
    id: row.id,
    relationshipId: row.relationship_id,
    sourceObjectId: row.source_object_id,
    targetObjectId: row.target_object_id,
    label: row.label ?? "Untitled relationship",
    typeId: row.type_id,
    typeLabel: row.type_label,
    visibility: row.visibility ?? "visible",
  };
}

async function getDomainMapClass() {
  const graphClass = await getClassByKey("domain_map");
  if (!graphClass) {
    throw new Error("Domain Map class is not registered.");
  }
  return graphClass;
}

async function getDefaultStatusForClass(classId: string) {
  const [status] = await db
    .select()
    .from(statuses)
    .where(and(eq(statuses.classId, classId), eq(statuses.key, "active")))
    .limit(1);
  return status ?? null;
}

async function getArchivedStatusForClass(classId: string) {
  const [status] = await db
    .select()
    .from(statuses)
    .where(and(eq(statuses.classId, classId), eq(statuses.key, "archived")))
    .limit(1);
  return status ?? null;
}

async function getDomainMapType(domainId: string, typeId: string) {
  const [type] = await db
    .select({ id: types.id })
    .from(types)
    .innerJoin(classes, eq(classes.id, types.classId))
    .where(
      and(
        eq(types.id, typeId),
        eq(classes.key, "domain_map"),
        sql`(${types.domainId} is null or ${types.domainId} = ${domainId})`
      )
    )
    .limit(1);
  return type ?? null;
}

async function getStatusForDomainMapClass(statusId: string) {
  const [status] = await db
    .select({ id: statuses.id })
    .from(statuses)
    .innerJoin(classes, eq(classes.id, statuses.classId))
    .where(and(eq(statuses.id, statusId), eq(classes.key, "domain_map")))
    .limit(1);
  return status ?? null;
}

async function getDomainMapMembership(
  domainSlug: string,
  domainMapId: string
): Promise<DomainMapMembershipRow | null> {
  const rows = await db.execute<DomainMapMembershipRow>(sql`
    select
      domains.id as domain_id,
      domain_maps.id as domain_map_id
    from domain_maps
    inner join object_domain_memberships
      on object_domain_memberships.object_id = domain_maps.id
    inner join domains
      on domains.id = object_domain_memberships.domain_id
    where domains.slug = ${domainSlug}
      and domain_maps.id = ${domainMapId}
      and object_domain_memberships.membership_state = 'member'
    limit 1
  `);
  return rows[0] ?? null;
}

async function getDomainMapNodeByObjectId(
  mapId: string,
  objectId: string
): Promise<DomainMapNodeMembershipRow | null> {
  const rows = await db.execute<DomainMapNodeMembershipRow>(sql`
    select id, object_id
    from domain_map_nodes
    where domain_map_id = ${mapId}
      and object_id = ${objectId}
    limit 1
  `);

  return rows[0] ?? null;
}

async function getDomainMapNodeByNodeId(
  mapId: string,
  nodeId: string
): Promise<DomainMapNodeMembershipRow | null> {
  const rows = await db.execute<DomainMapNodeMembershipRow>(sql`
    select id, object_id
    from domain_map_nodes
    where domain_map_id = ${mapId}
      and id = ${nodeId}
    limit 1
  `);

  return rows[0] ?? null;
}

async function getRelationshipEndpoints(
  relationshipId: string
): Promise<RelationshipEndpointRow | null> {
  const rows = await db.execute<RelationshipEndpointRow>(sql`
    select source_object_id, target_object_id
    from relationships
    where id = ${relationshipId}
    limit 1
  `);

  return rows[0] ?? null;
}

async function getDomainMapNodeCount(mapId: string): Promise<number> {
  const rows = await db.execute<DomainMapNodeCountRow>(sql`
    select count(*)::int as node_count
    from domain_map_nodes
    where domain_map_id = ${mapId}
  `);

  return rows[0]?.node_count ?? 0;
}

function defaultNodePosition(index: number): GraphPosition {
  return {
    x: defaultNodeOriginX + (index % 4) * defaultNodeSpacingX,
    y: defaultNodeOriginY + Math.floor(index / 4) * defaultNodeSpacingY,
  };
}

function relationshipEndpointPosition(
  fallbackIndex: number,
  isSource: boolean,
  dropPosition?: GraphPosition
): GraphPosition {
  if (!dropPosition) {
    return defaultNodePosition(fallbackIndex);
  }

  return {
    x: dropPosition.x + (isSource ? -180 : 180),
    y: dropPosition.y,
  };
}

async function listDomainMapSummaries(
  domainSlug: string
): Promise<DomainMapSummary[]> {
  const rows = await db.execute<DomainMapRow>(sql`
    select
      domain_maps.id,
      domain_maps.slug,
      domain_maps.label,
      domain_maps.description,
      domain_maps.metadata ->> 'defaultRelationshipTypeId' as default_relationship_type_id,
      (domain_maps.metadata ->> 'isDefaultWorkspace') = 'true' as is_default_workspace,
      (domain_maps.metadata ->> 'isWip') = 'true' as is_wip,
      statuses.key as status_key,
      statuses.label as status_label,
      map_types.label as map_kind_label,
      domain_maps.updated_at
    from domain_maps
    inner join object_domain_memberships
      on object_domain_memberships.object_id = domain_maps.id
    inner join domains
      on domains.id = object_domain_memberships.domain_id
    left join statuses
      on statuses.id = domain_maps.status_id
    left join types as map_types
      on map_types.id = domain_maps.map_kind_type_id
    where domains.slug = ${domainSlug}
      and object_domain_memberships.membership_state = 'member'
      and coalesce(statuses.key, 'active') <> 'archived'
    order by
      case
        when (domain_maps.metadata ->> 'isDefaultWorkspace') = 'true'
          and (domain_maps.metadata ->> 'isWip') = 'true'
          then 0
        else 1
      end,
      lower(domain_maps.label) asc
  `);

  return rows.map(mapSummaryFromRow);
}

async function getMapNodes(activeMapId: string): Promise<DomainMapNodeView[]> {
  const rows = await db.execute<DomainMapNodeRow>(sql`
    select
      domain_map_nodes.id,
      domain_map_nodes.object_id,
      classes.key as object_class_key,
      subjects.canonical_label as label,
      subject_types.label as type_label,
      domain_map_nodes.node_role,
      domain_map_nodes.visibility,
      domain_map_nodes.layout_metadata,
      domain_map_nodes.position
    from domain_map_nodes
    inner join objects
      on objects.id = domain_map_nodes.object_id
    inner join classes
      on classes.id = objects.class_id
    left join subjects
      on subjects.id = domain_map_nodes.object_id
    left join types as subject_types
      on subject_types.id = subjects.subject_type_id
    where domain_map_nodes.domain_map_id = ${activeMapId}
    order by lower(coalesce(subjects.canonical_label, objects.id::text)) asc
  `);
  return rows.map(nodeFromRow);
}

async function getMapRelationships(
  activeMapId: string
): Promise<DomainMapRelationshipView[]> {
  const rows = await db.execute<DomainMapRelationshipRow>(sql`
    select
      domain_map_relationships.id,
      domain_map_relationships.relationship_id,
      relationships.source_object_id,
      relationships.target_object_id,
      concat_ws(
        ' - ',
        coalesce(source_subjects.canonical_label, relationships.source_object_id::text),
        coalesce(relationship_types.label, 'Relationship'),
        coalesce(target_subjects.canonical_label, relationships.target_object_id::text)
      ) as label,
      relationships.relationship_type_id as type_id,
      relationship_types.label as type_label,
      domain_map_relationships.visibility
    from domain_map_relationships
    inner join relationships
      on relationships.id = domain_map_relationships.relationship_id
    left join subjects as source_subjects
      on source_subjects.id = relationships.source_object_id
    left join subjects as target_subjects
      on target_subjects.id = relationships.target_object_id
    left join types as relationship_types
      on relationship_types.id = relationships.relationship_type_id
    where domain_map_relationships.domain_map_id = ${activeMapId}
    order by
      lower(coalesce(relationship_types.label, 'Relationship')),
      lower(coalesce(source_subjects.canonical_label, relationships.source_object_id::text)),
      lower(coalesce(target_subjects.canonical_label, relationships.target_object_id::text)),
      relationships.id
  `);
  return rows.map(relationshipFromRow);
}

async function getRelationshipTypes(
  domainId: string
): Promise<RelationshipTypeOption[]> {
  const rows = await db.execute<RelationshipTypeRow>(sql`
    select
      types.id,
      types.label
    from types
    inner join classes
      on classes.id = types.class_id
    where classes.key = 'relationship'
      and (types.domain_id is null or types.domain_id = ${domainId})
    order by lower(types.label) asc
  `);
  return rows.map((row) => ({ id: row.id, label: row.label }));
}

export async function getDomainMapSnapshot(
  domainSlug: string,
  mapId?: string | null
): Promise<DomainMapSnapshot> {
  const domain = await getDomainBySlug(domainSlug);
  if (!domain) {
    return {
      maps: [],
      activeMap: null,
      nodes: [],
      relationships: [],
      relationshipTypes: [],
    };
  }

  let maps = await listDomainMapSummaries(domainSlug);

  if (maps.length === 0) {
    await ensureDefaultWorkspaceMap(domain.id, domain.slug);
    maps = await listDomainMapSummaries(domainSlug);
  }

  const wipWorkspaceMap =
    maps.find((map) => map.isDefaultWorkspace && map.isWip) ?? null;
  const activeMap =
    (mapId ? maps.find((map) => map.id === mapId) : null) ??
    wipWorkspaceMap ??
    maps[0] ??
    null;

  const [nodes, relationships, relationshipTypes] = await Promise.all([
    activeMap ? getMapNodes(activeMap.id) : Promise.resolve([]),
    activeMap ? getMapRelationships(activeMap.id) : Promise.resolve([]),
    getRelationshipTypes(domain.id),
  ]);

  return {
    maps,
    activeMap,
    nodes,
    relationships,
    relationshipTypes,
  };
}

export async function createDomainMap(
  domainSlug: string,
  input: unknown
): Promise<CommandResult<DomainMapSnapshot>> {
  const parsed = createDomainMapInput.safeParse(input);
  if (!parsed.success) {
    return err(
      "invalid_input",
      "Domain map input is invalid",
      parsed.error.flatten()
    );
  }

  const domain = await getDomainBySlug(domainSlug);
  if (!domain) {
    return err("not_found", "Domain was not found", { domainSlug });
  }

  const graphClass = await getDomainMapClass();
  const defaultStatus = await getDefaultStatusForClass(graphClass.id);
  const mapKindType =
    parsed.data.mapKindTypeId === undefined
      ? null
      : await getDomainMapType(domain.id, parsed.data.mapKindTypeId);

  if (parsed.data.mapKindTypeId && !mapKindType) {
    return err("invalid_input", "Domain map type is invalid", {
      typeId: parsed.data.mapKindTypeId,
    });
  }

  try {
    const created = await createCanonicalObject({
      classId: graphClass.id,
      domainId: domain.id,
      insertRecord: async (tx, objectId) => {
        const [row] = await tx
          .insert(domainMaps)
          .values({
            id: objectId,
            slug: parsed.data.slug
              ? slugify(parsed.data.slug)
              : slugify(parsed.data.label),
            label: parsed.data.label,
            description: parsed.data.description || "",
            mapKindTypeId: mapKindType?.id ?? null,
            statusId: defaultStatus?.id ?? null,
          })
          .returning({ id: domainMaps.id });
        return row;
      },
    });

    return ok(await getDomainMapSnapshot(domainSlug, created.id));
  } catch (error) {
    if (pgErrorCode(error) === "23505") {
      return err("slug_taken", "A domain map with this slug already exists");
    }
    throw error;
  }
}

export async function updateDomainMap(
  domainSlug: string,
  mapId: string,
  input: unknown
): Promise<CommandResult<DomainMapSnapshot>> {
  const parsed = updateDomainMapInput.safeParse(input);
  if (!parsed.success) {
    return err(
      "invalid_input",
      "Domain map input is invalid",
      parsed.error.flatten()
    );
  }

  const membership = await getDomainMapMembership(domainSlug, mapId);
  if (!membership) {
    return err("not_found", "Domain map was not found", { mapId });
  }

  const mapKindType =
    parsed.data.mapKindTypeId === undefined ||
    parsed.data.mapKindTypeId === null
      ? null
      : await getDomainMapType(membership.domain_id, parsed.data.mapKindTypeId);

  if (parsed.data.mapKindTypeId && !mapKindType) {
    return err("invalid_input", "Domain map type is invalid", {
      typeId: parsed.data.mapKindTypeId,
    });
  }

  const status =
    parsed.data.statusId === undefined
      ? null
      : await getStatusForDomainMapClass(parsed.data.statusId);

  if (parsed.data.statusId && !status) {
    return err("invalid_input", "Domain map status is invalid", {
      statusId: parsed.data.statusId,
    });
  }

  const relationshipTypes =
    parsed.data.defaultRelationshipTypeId === undefined ||
    parsed.data.defaultRelationshipTypeId === null
      ? []
      : await getRelationshipTypes(membership.domain_id);

  const defaultRelationshipType =
    parsed.data.defaultRelationshipTypeId === undefined ||
    parsed.data.defaultRelationshipTypeId === null
      ? null
      : (relationshipTypes.find(
          (type) => type.id === parsed.data.defaultRelationshipTypeId
        ) ?? null);

  if (parsed.data.defaultRelationshipTypeId && !defaultRelationshipType) {
    return err("invalid_input", "Default relationship type is invalid", {
      typeId: parsed.data.defaultRelationshipTypeId,
    });
  }

  const updates: Partial<typeof domainMaps.$inferInsert> = {};
  if (parsed.data.label !== undefined) {
    updates.label = parsed.data.label;
  }
  if (parsed.data.description !== undefined) {
    updates.description = parsed.data.description || "";
  }
  if (parsed.data.statusId !== undefined) {
    updates.statusId = status?.id ?? null;
  }
  if (parsed.data.mapKindTypeId !== undefined) {
    updates.mapKindTypeId = mapKindType?.id ?? null;
  }
  const shouldFinalizeWorkspace = parsed.data.label !== undefined;

  if (
    parsed.data.defaultRelationshipTypeId !== undefined ||
    shouldFinalizeWorkspace
  ) {
    const metadataWithRelationshipType =
      parsed.data.defaultRelationshipTypeId !== undefined
        ? sql`
      jsonb_set(
        coalesce(${domainMaps.metadata}, '{}'::jsonb),
        '{defaultRelationshipTypeId}',
        ${JSON.stringify(parsed.data.defaultRelationshipTypeId)}::jsonb,
        true
      )
    `
        : sql`coalesce(${domainMaps.metadata}, '{}'::jsonb)`;

    updates.metadata = (shouldFinalizeWorkspace
      ? sql`(${metadataWithRelationshipType}) - 'isWip' - 'isDefaultWorkspace'`
      : metadataWithRelationshipType) as unknown as typeof domainMaps.$inferInsert.metadata;
  }
  if (Object.keys(updates).length > 0) {
    await db.update(domainMaps).set(updates).where(eq(domainMaps.id, mapId));
  }

  return ok(await getDomainMapSnapshot(domainSlug, mapId));
}

export async function archiveDomainMap(
  domainSlug: string,
  mapId: string
): Promise<CommandResult<DomainMapSnapshot>> {
  const membership = await getDomainMapMembership(domainSlug, mapId);
  if (!membership) {
    return err("not_found", "Domain map was not found", { mapId });
  }

  const graphClass = await getDomainMapClass();
  const archivedStatus = await getArchivedStatusForClass(graphClass.id);
  if (!archivedStatus) {
    return err(
      "registry_missing",
      "Archived status is not registered for Domain Maps"
    );
  }

  await db
    .update(domainMaps)
    .set({ statusId: archivedStatus.id })
    .where(eq(domainMaps.id, mapId));

  return ok(await getDomainMapSnapshot(domainSlug));
}

export async function clearDomainMap(
  domainSlug: string,
  mapId: string
): Promise<CommandResult<DomainMapSnapshot>> {
  const membership = await getDomainMapMembership(domainSlug, mapId);
  if (!membership) {
    return err("not_found", "Domain map was not found", { mapId });
  }

  const [map] = await db
    .select({ metadata: domainMaps.metadata })
    .from(domainMaps)
    .where(eq(domainMaps.id, mapId))
    .limit(1);

  if (!isWipWorkspaceMetadata(map?.metadata)) {
    return err("invalid_input", "Only WIP workspace maps can be cleared", {
      mapId,
    });
  }

  await db
    .delete(domainMapRelationships)
    .where(eq(domainMapRelationships.domainMapId, mapId));
  await db
    .delete(domainMapNodes)
    .where(eq(domainMapNodes.domainMapId, mapId));

  return ok(await getDomainMapSnapshot(domainSlug, mapId));
}

export async function addObjectToDomainMap(
  domainSlug: string,
  mapId: string,
  input: unknown
): Promise<CommandResult<DomainMapSnapshot>> {
  const parsed = addDomainMapObjectInput.safeParse(input);
  if (!parsed.success) {
    return err(
      "invalid_input",
      "Domain map object input is invalid",
      parsed.error.flatten()
    );
  }

  const membership = await getDomainMapMembership(domainSlug, mapId);
  if (!membership) {
    return err("not_found", "Domain map was not found", { mapId });
  }

  const object = await getDomainMemberObject({
    domainSlug,
    objectId: parsed.data.objectId,
  });
  if (!object) {
    return err("not_found", "Object was not found in this domain", {
      objectId: parsed.data.objectId,
    });
  }

  await db
    .insert(domainMapNodes)
    .values({
      domainMapId: mapId,
      objectId: parsed.data.objectId,
      nodeRole: parsed.data.nodeRole,
      visibility: parsed.data.visibility,
      position: parsed.data.position,
    })
    .onConflictDoUpdate({
      target: [domainMapNodes.domainMapId, domainMapNodes.objectId],
      set: {
        nodeRole: parsed.data.nodeRole,
        visibility: parsed.data.visibility,
        position: parsed.data.position,
      },
    });

  return ok(await getDomainMapSnapshot(domainSlug, mapId));
}

export async function removeObjectFromDomainMap(
  domainSlug: string,
  mapId: string,
  nodeId: string
): Promise<CommandResult<DomainMapSnapshot>> {
  const membership = await getDomainMapMembership(domainSlug, mapId);
  if (!membership) {
    return err("not_found", "Domain map was not found", { mapId });
  }

  const node = await getDomainMapNodeByNodeId(mapId, nodeId);
  if (!node) {
    return err("not_found", "Domain map node was not found", { nodeId });
  }

  await db.execute(sql`
    delete from domain_map_relationships
    using relationships
    where domain_map_relationships.relationship_id = relationships.id
      and domain_map_relationships.domain_map_id = ${mapId}
      and (
        relationships.source_object_id = ${node.object_id}
        or relationships.target_object_id = ${node.object_id}
      )
  `);

  await db
    .delete(domainMapNodes)
    .where(
      and(eq(domainMapNodes.id, nodeId), eq(domainMapNodes.domainMapId, mapId))
    );

  return ok(await getDomainMapSnapshot(domainSlug, mapId));
}

export async function addRelationshipToDomainMap(
  domainSlug: string,
  mapId: string,
  input: unknown
): Promise<CommandResult<DomainMapSnapshot>> {
  const parsed = addDomainMapRelationshipInput.safeParse(input);
  if (!parsed.success) {
    return err(
      "invalid_input",
      "Domain map relationship input is invalid",
      parsed.error.flatten()
    );
  }

  const membership = await getDomainMapMembership(domainSlug, mapId);
  if (!membership) {
    return err("not_found", "Domain map was not found", { mapId });
  }

  const relationship = await getDomainMemberObject({
    domainSlug,
    objectId: parsed.data.relationshipId,
    classKey: "relationship",
  });
  if (!relationship) {
    return err("not_found", "Relationship was not found in this domain", {
      relationshipId: parsed.data.relationshipId,
    });
  }

  const endpoints = await getRelationshipEndpoints(parsed.data.relationshipId);
  if (!endpoints) {
    return err("not_found", "Relationship endpoint records were not found", {
      relationshipId: parsed.data.relationshipId,
    });
  }

  const endpointObjectIds = Array.from(
    new Set([endpoints.source_object_id, endpoints.target_object_id])
  );
  const endpointObjects = await Promise.all(
    endpointObjectIds.map((objectId) =>
      getDomainMemberObject({ domainSlug, objectId, classKey: "subject" })
    )
  );
  const missingEndpointIndex = endpointObjects.findIndex((object) => !object);
  if (missingEndpointIndex >= 0) {
    return err(
      "not_found",
      "Relationship endpoint was not found in this domain",
      { objectId: endpointObjectIds[missingEndpointIndex] }
    );
  }

  const existingNodes = await Promise.all(
    endpointObjectIds.map((objectId) =>
      getDomainMapNodeByObjectId(mapId, objectId)
    )
  );
  let nextNodeIndex = await getDomainMapNodeCount(mapId);
  const missingEndpointNodes = endpointObjectIds.flatMap((objectId, index) => {
    if (existingNodes[index]) {
      return [];
    }

    const position = relationshipEndpointPosition(
      nextNodeIndex,
      objectId === endpoints.source_object_id,
      parsed.data.position
    );
    nextNodeIndex += 1;

    return [
      {
        domainMapId: mapId,
        objectId,
        nodeRole: "member",
        visibility: "visible" as const,
        position,
      },
    ];
  });

  if (missingEndpointNodes.length > 0) {
    await db
      .insert(domainMapNodes)
      .values(missingEndpointNodes)
      .onConflictDoNothing();
  }

  await db
    .insert(domainMapRelationships)
    .values({
      domainMapId: mapId,
      relationshipId: parsed.data.relationshipId,
      visibility: parsed.data.visibility,
    })
    .onConflictDoUpdate({
      target: [
        domainMapRelationships.domainMapId,
        domainMapRelationships.relationshipId,
      ],
      set: {
        visibility: parsed.data.visibility,
      },
    });

  return ok(await getDomainMapSnapshot(domainSlug, mapId));
}

export async function connectObjectsOnDomainMap(
  domainSlug: string,
  mapId: string,
  input: unknown
): Promise<CommandResult<DomainMapSnapshot>> {
  const parsed = connectDomainMapObjectsInput.safeParse(input);
  if (!parsed.success) {
    return err(
      "invalid_input",
      "Domain map connection input is invalid",
      parsed.error.flatten()
    );
  }

  const membership = await getDomainMapMembership(domainSlug, mapId);
  if (!membership) {
    return err("not_found", "Domain map was not found", { mapId });
  }

  if (parsed.data.sourceSubjectId === parsed.data.targetSubjectId) {
    return err("invalid_input", "Domain map connection endpoints must differ", {
      objectId: parsed.data.sourceSubjectId,
    });
  }

  const [sourceNode, targetNode] = await Promise.all([
    getDomainMapNodeByObjectId(mapId, parsed.data.sourceSubjectId),
    getDomainMapNodeByObjectId(mapId, parsed.data.targetSubjectId),
  ]);

  if (!sourceNode || !targetNode) {
    return err(
      "invalid_input",
      "Both relationship endpoints must be visible on the active Domain Map",
      {
        sourceSubjectId: parsed.data.sourceSubjectId,
        targetSubjectId: parsed.data.targetSubjectId,
      }
    );
  }

  const relationshipResult = await createRelationship(domainSlug, {
    relationshipTypeId: parsed.data.relationshipTypeId,
    sourceSubjectId: parsed.data.sourceSubjectId,
    targetSubjectId: parsed.data.targetSubjectId,
  });

  if (!relationshipResult.ok) {
    return err(
      relationshipResult.error.code,
      relationshipResult.error.message,
      relationshipResult.error.details
    );
  }

  return addRelationshipToDomainMap(domainSlug, mapId, {
    relationshipId: relationshipResult.data.id,
  });
}

export async function removeRelationshipFromDomainMap(
  domainSlug: string,
  mapId: string,
  mapRelationshipId: string
): Promise<CommandResult<DomainMapSnapshot>> {
  const membership = await getDomainMapMembership(domainSlug, mapId);
  if (!membership) {
    return err("not_found", "Domain map was not found", { mapId });
  }

  await db
    .delete(domainMapRelationships)
    .where(
      and(
        eq(domainMapRelationships.id, mapRelationshipId),
        eq(domainMapRelationships.domainMapId, mapId)
      )
    );

  return ok(await getDomainMapSnapshot(domainSlug, mapId));
}

export async function updateDomainMapLayout(
  domainSlug: string,
  mapId: string,
  input: unknown
): Promise<CommandResult<{ updatedNodeIds: string[] }>> {
  const parsed = updateDomainMapLayoutInput.safeParse(input);
  if (!parsed.success) {
    return err(
      "invalid_input",
      "Domain map layout input is invalid",
      parsed.error.flatten()
    );
  }

  const membership = await getDomainMapMembership(domainSlug, mapId);
  if (!membership) {
    return err("not_found", "Domain map was not found", { mapId });
  }

  const layoutUpdates = parsed.data.nodes.map((node) => ({
    is_collapsed: node.isCollapsed ?? false,
    node_id: node.nodeId,
    position: node.position,
  }));
  const updatedRows = await db.execute<{ id: string }>(sql`
    update domain_map_nodes
    set
      layout_metadata = domain_map_nodes.layout_metadata || jsonb_build_object('isCollapsed', layout_updates.is_collapsed),
      position = layout_updates.position,
      updated_at = now()
    from jsonb_to_recordset(${JSON.stringify(layoutUpdates)}::jsonb)
      as layout_updates(node_id uuid, position jsonb, is_collapsed boolean)
    where domain_map_nodes.id = layout_updates.node_id
      and domain_map_nodes.domain_map_id = ${mapId}
    returning domain_map_nodes.id
  `);

  return ok({ updatedNodeIds: updatedRows.map((row) => row.id) });
}
