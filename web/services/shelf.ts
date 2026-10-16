import { sql } from "drizzle-orm";
import { db } from "@/data/client";
import type {
  DocumentShelfFolder,
  DocumentShelfFolderItem,
  DocumentShelfFolders,
  ShelfClassKey,
  ShelfItem,
} from "@/domain/shelf";
import { err, ok } from "@/services/result";
import type { CommandResult } from "@/services/result";

type CountSafeLimit = number;

type LoadShelfItemsInput = {
  classKey: ShelfClassKey;
  domainSlug: string;
  limit?: CountSafeLimit;
  mapId?: string | null;
  query?: string;
};

type ShelfRow = {
  badgeLabel?: string | null;
  groupKey?: string | null;
  groupLabel?: string | null;
  id: string;
  isOnActiveMap?: boolean | null;
  meta?: string | null;
  title: string | null;
  weight?: number | null;
};

type DeletedShelfItem = {
  classKey: ShelfClassKey;
  id: string;
};

type DocumentShelfFolderRow = {
  id: string;
  label: string;
  position: number;
  collapsed: boolean;
};

type DocumentShelfFolderItemRow = {
  folderId: string;
  itemId: string;
  position: number;
};

type CreateDocumentShelfFolderInput = {
  label: string;
  selectedDocumentId?: string | null;
};

type UpdateDocumentShelfFolderInput = {
  collapsed?: boolean;
  label?: string;
};

const objectBackedShelfTables = {
  bundle: "extraction_bundles",
  claim: "claims",
  document: "documents",
  domain_map: "domain_maps",
  relationship: "relationships",
  subject: "subjects",
} as const satisfies Partial<Record<ShelfClassKey, string>>;

function objectBackedShelfTableFor(classKey: ShelfClassKey) {
  if (classKey in objectBackedShelfTables) {
    return objectBackedShelfTables[
      classKey as keyof typeof objectBackedShelfTables
    ];
  }

  return null;
}

const defaultLimit = 500;
const maxLimit = 500;

export async function loadShelfItems({
  classKey,
  domainSlug,
  limit = defaultLimit,
  mapId = null,
  query = "",
}: LoadShelfItemsInput): Promise<ShelfItem[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), maxLimit);
  const normalizedQuery = query.trim().toLowerCase();
  const searchPattern = `%${normalizedQuery}%`;
  const rows = await loadRowsForClass({
    classKey,
    domainSlug,
    limit: safeLimit,
    mapId: mapId?.trim() || null,
    searchPattern,
  });

  const items = rows.map((row) => ({
    id: row.id,
    title: row.title?.trim() || row.id,
    classKey,
    badgeLabel: row.badgeLabel?.trim() || undefined,
    groupKey: row.groupKey?.trim() || undefined,
    groupLabel: row.groupLabel?.trim() || undefined,
    isOnActiveMap: row.isOnActiveMap === true,
    meta: row.meta?.trim() || undefined,
    weight: row.weight ?? undefined,
  }));

  return items;
}

export async function loadDocumentShelfFolders(
  domainSlug: string
): Promise<DocumentShelfFolders> {
  const folders = (await db.execute(sql`
    select
      shelf_folders.id,
      shelf_folders.label,
      shelf_folders.position,
      shelf_folders.collapsed
    from shelf_folders
    join domains on domains.id = shelf_folders.domain_id
    where domains.slug = ${domainSlug}
      and shelf_folders.scope = 'documents'
    order by shelf_folders.position, lower(shelf_folders.label), shelf_folders.id
  `)) as unknown as DocumentShelfFolderRow[];

  const folderItems = (await db.execute(sql`
    select
      shelf_folder_items.folder_id as "folderId",
      shelf_folder_items.item_id as "itemId",
      shelf_folder_items.position
    from shelf_folder_items
    join shelf_folders on shelf_folders.id = shelf_folder_items.folder_id
    join domains on domains.id = shelf_folders.domain_id
    where domains.slug = ${domainSlug}
      and shelf_folders.scope = 'documents'
    order by shelf_folders.position, shelf_folder_items.position, shelf_folder_items.item_id
  `)) as unknown as DocumentShelfFolderItemRow[];

  return {
    folders: folders.map(toDocumentShelfFolder),
    folderItems: folderItems.map(toDocumentShelfFolderItem),
  };
}

export async function createDocumentShelfFolder(
  domainSlug: string,
  input: CreateDocumentShelfFolderInput
): Promise<CommandResult<DocumentShelfFolder>> {
  const label = input.label.trim();

  if (!label) {
    return err("invalid_input", "Folder label is required");
  }

  const [row] = (await db.execute(sql`
    with scoped_domain as (
      select domains.id
      from domains
      where domains.slug = ${domainSlug}
      limit 1
    )
    insert into shelf_folders (domain_id, scope, label, position)
    select
      scoped_domain.id,
      'documents',
      ${label},
      coalesce(
        (
          select max(existing.position) + 1
          from shelf_folders existing
          where existing.domain_id = scoped_domain.id
            and existing.scope = 'documents'
        ),
        0
      )
    from scoped_domain
    returning id, label, position, collapsed
  `)) as unknown as DocumentShelfFolderRow[];

  if (!row) {
    return err("not_found", "Domain was not found", { domainSlug });
  }

  const folder = toDocumentShelfFolder(row);

  if (input.selectedDocumentId) {
    const assignment = await assignDocumentToShelfFolder(domainSlug, {
      documentId: input.selectedDocumentId,
      folderId: folder.id,
    });

    if (!assignment.ok) {
      return err(assignment.error.code, assignment.error.message, {
        folderId: folder.id,
        selectedDocumentId: input.selectedDocumentId,
      });
    }
  }

  return ok(folder);
}

export async function updateDocumentShelfFolder(
  domainSlug: string,
  folderId: string,
  input: UpdateDocumentShelfFolderInput
): Promise<CommandResult<DocumentShelfFolder>> {
  const label = input.label?.trim() || null;
  const collapsed =
    typeof input.collapsed === "boolean" ? input.collapsed : null;

  const [row] = (await db.execute(sql`
    update shelf_folders
    set
      label = coalesce(${label}, shelf_folders.label),
      collapsed = coalesce(${collapsed}, shelf_folders.collapsed),
      updated_at = now()
    from domains
    where shelf_folders.id = ${folderId}
      and shelf_folders.domain_id = domains.id
      and domains.slug = ${domainSlug}
      and shelf_folders.scope = 'documents'
    returning
      shelf_folders.id,
      shelf_folders.label,
      shelf_folders.position,
      shelf_folders.collapsed
  `)) as unknown as DocumentShelfFolderRow[];

  if (!row) {
    return err("not_found", "Folder was not found", { domainSlug, folderId });
  }

  return ok(toDocumentShelfFolder(row));
}

export async function deleteDocumentShelfFolder(
  domainSlug: string,
  folderId: string
): Promise<CommandResult<{ id: string }>> {
  const [row] = (await db.execute(sql`
    delete from shelf_folders
    using domains
    where shelf_folders.id = ${folderId}
      and shelf_folders.domain_id = domains.id
      and domains.slug = ${domainSlug}
      and shelf_folders.scope = 'documents'
    returning shelf_folders.id
  `)) as unknown as Array<{ id: string }>;

  if (!row) {
    return err("not_found", "Folder was not found", { domainSlug, folderId });
  }

  return ok({ id: row.id });
}

export async function assignDocumentToShelfFolder(
  domainSlug: string,
  input: {
    documentId: string;
    folderId: string;
  }
): Promise<CommandResult<DocumentShelfFolderItem>> {
  const [row] = (await db.execute(sql`
    with scoped_folder as (
      select shelf_folders.id, shelf_folders.domain_id
      from shelf_folders
      join domains on domains.id = shelf_folders.domain_id
      where shelf_folders.id = ${input.folderId}
        and domains.slug = ${domainSlug}
        and shelf_folders.scope = 'documents'
      limit 1
    ),
    scoped_document as (
      select documents.id
      from documents
      join objects on objects.id = documents.id
      join classes on classes.id = objects.class_id
      join object_domain_memberships memberships
        on memberships.object_id = objects.id
      where documents.id = ${input.documentId}
        and memberships.domain_id = (select domain_id from scoped_folder)
        and memberships.membership_state = 'member'
        and classes.key = 'document'
      limit 1
    ),
    removed_existing as (
      delete from shelf_folder_items existing_items
      using shelf_folders existing_folders
      where existing_items.folder_id = existing_folders.id
        and existing_folders.domain_id = (select domain_id from scoped_folder)
        and existing_folders.scope = 'documents'
        and existing_items.item_id = (select id from scoped_document)
      returning existing_items.item_id
    )
    insert into shelf_folder_items (folder_id, item_id, position)
    select
      scoped_folder.id,
      scoped_document.id,
      coalesce(
        (
          select max(existing.position) + 1
          from shelf_folder_items existing
          where existing.folder_id = scoped_folder.id
        ),
        0
      )
    from scoped_folder, scoped_document
    where (select count(*) from removed_existing) >= 0
    returning
      folder_id as "folderId",
      item_id as "itemId",
      position
  `)) as unknown as DocumentShelfFolderItemRow[];

  if (!row) {
    return err("not_found", "Folder or document was not found", {
      documentId: input.documentId,
      domainSlug,
      folderId: input.folderId,
    });
  }

  return ok(toDocumentShelfFolderItem(row));
}

export async function removeDocumentFromShelfFolders(
  domainSlug: string,
  documentId: string
): Promise<CommandResult<{ id: string }>> {
  const [row] = (await db.execute(sql`
    with scoped_document as (
      select documents.id
      from documents
      join objects on objects.id = documents.id
      join classes on classes.id = objects.class_id
      join object_domain_memberships memberships
        on memberships.object_id = objects.id
      join domains on domains.id = memberships.domain_id
      where documents.id = ${documentId}
        and domains.slug = ${domainSlug}
        and memberships.membership_state = 'member'
        and classes.key = 'document'
      limit 1
    ),
    removed as (
      delete from shelf_folder_items existing_items
      using shelf_folders existing_folders, domains
      where existing_items.folder_id = existing_folders.id
        and existing_folders.domain_id = domains.id
        and domains.slug = ${domainSlug}
        and existing_folders.scope = 'documents'
        and existing_items.item_id = (select id from scoped_document)
      returning existing_items.item_id
    )
    select id from scoped_document
  `)) as unknown as Array<{ id: string }>;

  if (!row) {
    return err("not_found", "Document was not found", {
      documentId,
      domainSlug,
    });
  }

  return ok({ id: row.id });
}

async function loadRowsForClass({
  classKey,
  domainSlug,
  limit,
  mapId,
  searchPattern,
}: {
  classKey: ShelfClassKey;
  domainSlug: string;
  limit: number;
  mapId: string | null;
  searchPattern: string;
}) {
  const subjectMapPresence = mapId
    ? sql`exists (
        select 1
        from domain_map_nodes active_map_nodes
        where active_map_nodes.domain_map_id = ${mapId}
          and active_map_nodes.object_id = subjects.id
      )`
    : sql`false`;
  const relationshipMapPresence = mapId
    ? sql`exists (
        select 1
        from domain_map_relationships active_map_relationships
        where active_map_relationships.domain_map_id = ${mapId}
          and active_map_relationships.relationship_id = relationships.id
      )`
    : sql`false`;

  switch (classKey) {
    case "document":
      return executeRows(sql`
        select documents.id, documents.label as title
        from documents
        join objects on objects.id = documents.id
        join classes on classes.id = objects.class_id
        join object_domain_memberships memberships
          on memberships.object_id = objects.id
        join domains on domains.id = memberships.domain_id
        left join statuses on statuses.id = documents.status_id
        where domains.slug = ${domainSlug}
          and classes.key = 'document'
          and memberships.membership_state = 'member'
          and coalesce(statuses.key, '') <> 'archived'
          and lower(documents.label) like ${searchPattern}
        order by lower(documents.label), documents.id
        limit ${limit}
      `);

    case "subject":
      return executeRows(sql`
        select
          coalesce(taxonomy_parent.id::text, types.id::text, 'untyped') as "groupKey",
          coalesce(taxonomy_parent.canonical_label, types.label, 'Uncategorized') as "groupLabel",
          subjects.id,
          ${subjectMapPresence} as "isOnActiveMap",
          subjects.canonical_label as title,
          (
            coalesce(claim_weight.claim_count, 0) +
            coalesce(relationship_weight.relationship_count, 0)
          )::int as weight
        from subjects
        join objects on objects.id = subjects.id
        join classes on classes.id = objects.class_id
        join object_domain_memberships memberships
          on memberships.object_id = objects.id
        join domains on domains.id = memberships.domain_id
        left join types on types.id = subjects.subject_type_id
        left join statuses on statuses.id = subjects.status_id
        left join lateral (
          select parent_subjects.id, parent_subjects.canonical_label
          from relationships
          join types relationship_types
            on relationship_types.id = relationships.relationship_type_id
          join subjects parent_subjects
            on parent_subjects.id = relationships.target_object_id
          join object_domain_memberships parent_memberships
            on parent_memberships.object_id = parent_subjects.id
            and parent_memberships.domain_id = memberships.domain_id
            and parent_memberships.membership_state = 'member'
          where relationships.source_object_id = subjects.id
            and lower(regexp_replace(relationship_types.label, '[^a-zA-Z0-9]+', '', 'g')) = 'isa'
          order by lower(parent_subjects.canonical_label), parent_subjects.id
          limit 1
        ) taxonomy_parent on true
        left join lateral (
          select count(distinct claims.id)::int as claim_count
          from claim_targets
          join claims on claims.id = claim_targets.claim_id
          join object_domain_memberships claim_memberships
            on claim_memberships.object_id = claims.id
            and claim_memberships.domain_id = domains.id
            and claim_memberships.membership_state = 'member'
          left join statuses claim_statuses on claim_statuses.id = claims.status_id
          where claim_targets.target_object_id = subjects.id
            and coalesce(claim_statuses.key, '') <> 'archived'
        ) claim_weight on true
        left join lateral (
          select count(distinct relationships.id)::int as relationship_count
          from relationships
          join object_domain_memberships relationship_memberships
            on relationship_memberships.object_id = relationships.id
            and relationship_memberships.domain_id = domains.id
            and relationship_memberships.membership_state = 'member'
          left join statuses relationship_statuses
            on relationship_statuses.id = relationships.status_id
          where (
              relationships.source_object_id = subjects.id
              or relationships.target_object_id = subjects.id
            )
            and coalesce(relationship_statuses.key, '') <> 'archived'
        ) relationship_weight on true
        where domains.slug = ${domainSlug}
          and classes.key = 'subject'
          and memberships.membership_state = 'member'
          and coalesce(statuses.key, '') <> 'archived'
          and lower(subjects.canonical_label) like ${searchPattern}
        order by
          lower(coalesce(taxonomy_parent.canonical_label, types.label, 'Uncategorized')),
          lower(subjects.canonical_label),
          subjects.id
        limit ${limit}
      `);

    case "claim":
      return executeRows(sql`
        select
          coalesce(claim_types.id::text, 'untyped') as "groupKey",
          coalesce(claim_types.label, 'Claim') as "groupLabel",
          claims.id,
          concat('CL-', lpad(claims.review_number::text, 5, '0')) as "badgeLabel",
          concat_ws(
            ' - ',
            coalesce(claim_types.label, 'Claim'),
            coalesce(primary_target.target_label, 'Untargeted')
          ) as title
        from claims
        join objects on objects.id = claims.id
        join classes on classes.id = objects.class_id
        join object_domain_memberships memberships
          on memberships.object_id = objects.id
        join domains on domains.id = memberships.domain_id
        left join types claim_types on claim_types.id = claims.claim_type_id
        left join statuses on statuses.id = claims.status_id
        left join lateral (
          select
            coalesce(
              subjects.canonical_label,
              claim_targets.target_object_id::text
            ) as target_label
          from claim_targets
          left join subjects on subjects.id = claim_targets.target_object_id
          where claim_targets.claim_id = claims.id
          order by
            case when claim_targets.target_role = 'about' then 0 else 1 end,
            claim_targets.position,
            lower(subjects.canonical_label),
            claim_targets.target_object_id
          limit 1
        ) primary_target on true
        where domains.slug = ${domainSlug}
          and classes.key = 'claim'
          and memberships.membership_state = 'member'
          and coalesce(statuses.key, '') <> 'archived'
          and (
            lower(concat_ws(
              ' - ',
              coalesce(claim_types.label, 'Claim'),
              coalesce(primary_target.target_label, 'Untargeted')
            )) like ${searchPattern}
            or lower(claims.claim_text) like ${searchPattern}
          )
        order by lower(coalesce(claim_types.label, 'Claim')), lower(coalesce(primary_target.target_label, 'Untargeted')), claims.id
        limit ${limit}
      `);

    case "relationship":
      return executeRows(sql`
        select
          coalesce(relationship_types.id::text, 'untyped') as "groupKey",
          coalesce(relationship_types.label, 'Relationship') as "groupLabel",
          relationships.id,
          ${relationshipMapPresence} as "isOnActiveMap",
          concat_ws(
            ' - ',
            coalesce(source_subjects.canonical_label, relationships.source_object_id::text),
            coalesce(relationship_types.label, 'Relationship'),
            coalesce(target_subjects.canonical_label, relationships.target_object_id::text)
          ) as title
        from relationships
        join objects on objects.id = relationships.id
        join classes on classes.id = objects.class_id
        join object_domain_memberships memberships
          on memberships.object_id = objects.id
        join domains on domains.id = memberships.domain_id
        left join types relationship_types
          on relationship_types.id = relationships.relationship_type_id
        left join subjects source_subjects
          on source_subjects.id = relationships.source_object_id
        left join subjects target_subjects
          on target_subjects.id = relationships.target_object_id
        left join statuses on statuses.id = relationships.status_id
        where domains.slug = ${domainSlug}
          and classes.key = 'relationship'
          and memberships.membership_state = 'member'
          and coalesce(statuses.key, '') <> 'archived'
          and (
            lower(concat_ws(
              ' - ',
              coalesce(source_subjects.canonical_label, relationships.source_object_id::text),
              coalesce(relationship_types.label, 'Relationship'),
              coalesce(target_subjects.canonical_label, relationships.target_object_id::text)
            )) like ${searchPattern}
            or lower(coalesce(nullif(relationships.label, ''), relationships.id::text)) like ${searchPattern}
          )
        order by
          lower(coalesce(relationship_types.label, 'Relationship')),
          lower(coalesce(source_subjects.canonical_label, relationships.source_object_id::text)),
          lower(coalesce(target_subjects.canonical_label, relationships.target_object_id::text)),
          relationships.id
        limit ${limit}
      `);

    case "evidence":
      return executeRows(sql`
        select distinct
          evidence.id,
          coalesce(
            nullif(evidence.summary, ''),
            nullif(evidence.excerpt, ''),
            evidence.source_kind,
            evidence.id::text
          ) as title
        from evidence
        join evidence_links on evidence_links.evidence_id = evidence.id
        join object_domain_memberships memberships
          on memberships.object_id = evidence_links.target_object_id
        join domains on domains.id = memberships.domain_id
        left join statuses on statuses.id = evidence.status_id
        where domains.slug = ${domainSlug}
          and memberships.membership_state = 'member'
          and coalesce(statuses.key, '') <> 'archived'
          and lower(coalesce(
            nullif(evidence.summary, ''),
            nullif(evidence.excerpt, ''),
            evidence.source_kind,
            evidence.id::text
          )) like ${searchPattern}
        order by title, evidence.id
        limit ${limit}
      `);

    case "domain_map":
      return executeRows(sql`
        select domain_maps.id, domain_maps.label as title
        from domain_maps
        join objects on objects.id = domain_maps.id
        join classes on classes.id = objects.class_id
        join object_domain_memberships memberships
          on memberships.object_id = objects.id
        join domains on domains.id = memberships.domain_id
        left join statuses on statuses.id = domain_maps.status_id
        where domains.slug = ${domainSlug}
          and classes.key = 'domain_map'
          and memberships.membership_state = 'member'
          and coalesce(statuses.key, '') <> 'archived'
          and lower(domain_maps.label) like ${searchPattern}
        order by lower(domain_maps.label), domain_maps.id
        limit ${limit}
      `);

    case "bundle":
      return executeRows(sql`
        with package_rows as (
          select
            extraction_bundles.id as bundle_id,
            extraction_bundles.label as bundle_label,
            extraction_bundles.status,
            extraction_bundles.updated_at,
            extraction_claim_mentions.text as subject_text,
            lower(regexp_replace(extraction_claim_mentions.text, '[^a-zA-Z0-9]+', '-', 'g')) as normalized_subject,
            extraction_claims.id as extraction_claim_id
          from extraction_claim_mentions
          join extraction_claims
            on extraction_claims.id = extraction_claim_mentions.claim_row_id
          join extraction_bundles
            on extraction_bundles.id = extraction_claims.bundle_id
          join objects on objects.id = extraction_bundles.id
          join classes on classes.id = objects.class_id
          join object_domain_memberships memberships
            on memberships.object_id = objects.id
          join domains on domains.id = memberships.domain_id
          where domains.slug = ${domainSlug}
            and classes.key = 'bundle'
            and memberships.membership_state = 'member'
            and extraction_bundles.status <> 'archived'
            and extraction_claim_mentions.role = 'g_subject'
        )
        select
          package_rows.status as "groupKey",
          initcap(replace(package_rows.status::text, '_', ' ')) as "groupLabel",
          case
            when workshop_package_decisions.outcome is null then 'Ready'
            else initcap(workshop_package_decisions.outcome)
          end as "badgeLabel",
          concat(package_rows.bundle_id::text, ':', package_rows.normalized_subject) as id,
          concat(min(package_rows.bundle_label), ' / ', count(distinct package_rows.extraction_claim_id), ' claims') as meta,
          min(package_rows.subject_text) as title
        from package_rows
        left join workshop_package_decisions
          on workshop_package_decisions.bundle_id = package_rows.bundle_id
          and workshop_package_decisions.normalized_subject = package_rows.normalized_subject
        where lower(package_rows.bundle_label) like ${searchPattern}
          or lower(package_rows.subject_text) like ${searchPattern}
        group by
          package_rows.bundle_id,
          package_rows.normalized_subject,
          package_rows.status,
          package_rows.updated_at,
          workshop_package_decisions.outcome
        order by package_rows.updated_at desc, lower(min(package_rows.subject_text)), package_rows.bundle_id
        limit ${limit}
      `);

    case "run":
      return executeRows(sql`
        select
          pipeline_runs.status as "groupKey",
          initcap(replace(pipeline_runs.status::text, '_', ' ')) as "groupLabel",
          initcap(replace(pipeline_runs.status::text, '_', ' ')) as "badgeLabel",
          pipeline_runs.id,
          concat_ws(
            ' / ',
            concat('step ', replace(pipeline_runs.current_step::text, '_', ' ')),
            case
              when pipeline_runs.completed_at is not null
                then concat('completed ', to_char(pipeline_runs.completed_at, 'Mon DD HH24:MI'))
              when pipeline_runs.started_at is not null
                then concat('started ', to_char(pipeline_runs.started_at, 'Mon DD HH24:MI'))
              else concat('created ', to_char(pipeline_runs.created_at, 'Mon DD HH24:MI'))
            end
          ) as meta,
          documents.label as title
        from pipeline_runs
        join domains on domains.id = pipeline_runs.domain_id
        join documents on documents.id = pipeline_runs.document_id
        where domains.slug = ${domainSlug}
          and pipeline_runs.status <> 'archived'
          and (
            lower(documents.label) like ${searchPattern}
            or pipeline_runs.id::text like ${searchPattern}
          )
        order by pipeline_runs.updated_at desc, pipeline_runs.created_at desc, pipeline_runs.id
        limit ${limit}
      `);

    case "type":
      return executeRows(sql`
        select
          classes.key as "groupKey",
          concat(classes.label, ' Types') as "groupLabel",
          types.id,
          types.label as title
        from types
        left join domains on domains.id = types.domain_id
        join classes on classes.id = types.class_id
        left join statuses on statuses.id = types.status_id
        where (types.domain_id is null or domains.slug = ${domainSlug})
          and classes.key in ('subject', 'claim', 'relationship')
          and coalesce(statuses.key, '') <> 'archived'
          and lower(types.label) like ${searchPattern}
        order by
          case classes.key
            when 'subject' then 1
            when 'claim' then 2
            when 'relationship' then 3
            else 100
          end,
          lower(types.label),
          types.id
        limit ${limit}
      `);
  }
}

async function executeRows(query: ReturnType<typeof sql>) {
  return (await db.execute(query)) as unknown as ShelfRow[];
}

function toDocumentShelfFolder(
  row: DocumentShelfFolderRow
): DocumentShelfFolder {
  return {
    id: row.id,
    label: row.label,
    position: row.position,
    collapsed: Boolean(row.collapsed),
  };
}

function toDocumentShelfFolderItem(
  row: DocumentShelfFolderItemRow
): DocumentShelfFolderItem {
  return {
    folderId: row.folderId,
    itemId: row.itemId,
    position: row.position,
  };
}

async function deleteObjectBackedShelfItem({
  classKey,
  domainSlug,
  id,
  tableName,
}: {
  classKey: ShelfClassKey;
  domainSlug: string;
  id: string;
  tableName: string;
}) {
  return db.transaction(async (tx) => {
    const [scoped] = (await tx.execute(sql`
      select records.id
      from ${sql.identifier(tableName)} records
      join objects on objects.id = records.id
      join classes on classes.id = objects.class_id
      join object_domain_memberships memberships
        on memberships.object_id = objects.id
      join domains on domains.id = memberships.domain_id
      where records.id = ${id}
        and domains.slug = ${domainSlug}
        and classes.key = ${classKey}
        and memberships.membership_state = 'member'
      limit 1
    `)) as unknown as Array<{ id: string }>;

    if (!scoped) {
      return null;
    }

    if (classKey === "document") {
      await tx.execute(sql`
        delete from evidence
        where evidence.source_document_id = ${scoped.id}
          or evidence.source_unit_id in (
            select source_units.id
            from source_units
            where source_units.document_id = ${scoped.id}
          )
      `);
    }

    if (classKey === "subject") {
      await tx.execute(sql`
        delete from objects
        where objects.id in (
          select relationships.id
          from relationships
          where relationships.source_object_id = ${scoped.id}
             or relationships.target_object_id = ${scoped.id}
        )
      `);
    }

    const [row] = (await tx.execute(sql`
      delete from objects
      where objects.id = ${scoped.id}
      returning objects.id
    `)) as unknown as Array<{ id: string }>;

    return row ?? null;
  });
}

async function deleteTypeShelfItem({
  domainSlug,
  id,
}: {
  domainSlug: string;
  id: string;
}) {
  return db.transaction(async (tx) => {
    const [scoped] = (await tx.execute(sql`
      select types.id
      from types
      join domains on domains.id = types.domain_id
      where types.id = ${id}
        and domains.slug = ${domainSlug}
      limit 1
    `)) as unknown as Array<{ id: string }>;

    if (!scoped) {
      return null;
    }

    await tx.execute(sql`
      update documents
      set document_type_id = null
      where document_type_id = ${scoped.id}
    `);
    await tx.execute(sql`
      update subjects
      set subject_type_id = null
      where subject_type_id = ${scoped.id}
    `);
    await tx.execute(sql`
      update claims
      set claim_type_id = null
      where claim_type_id = ${scoped.id}
    `);
    await tx.execute(sql`
      update relationships
      set relationship_type_id = null
      where relationship_type_id = ${scoped.id}
    `);
    await tx.execute(sql`
      update domain_maps
      set map_kind_type_id = null
      where map_kind_type_id = ${scoped.id}
    `);
    await tx.execute(sql`
      update types
      set parent_type_id = null
      where parent_type_id = ${scoped.id}
    `);

    const [row] = (await tx.execute(sql`
      delete from types
      where types.id = ${scoped.id}
      returning types.id
    `)) as unknown as Array<{ id: string }>;

    return row ?? null;
  });
}

async function deleteEvidenceShelfItem({
  domainSlug,
  id,
}: {
  domainSlug: string;
  id: string;
}) {
  const [row] = (await db.execute(sql`
    with scoped as (
      select distinct evidence.id
      from evidence
      join evidence_links on evidence_links.evidence_id = evidence.id
      join object_domain_memberships memberships
        on memberships.object_id = evidence_links.target_object_id
      join domains on domains.id = memberships.domain_id
      where evidence.id = ${id}
        and domains.slug = ${domainSlug}
        and memberships.membership_state = 'member'
      limit 1
    )
    delete from evidence
    using scoped
    where evidence.id = scoped.id
    returning evidence.id
  `)) as unknown as Array<{ id: string }>;

  return row ?? null;
}

export async function deleteShelfItem(
  domainSlug: string,
  classKey: ShelfClassKey,
  id: string
): Promise<CommandResult<DeletedShelfItem>> {
  const tableName = objectBackedShelfTableFor(classKey);
  const row =
    classKey === "type"
      ? await deleteTypeShelfItem({ domainSlug, id })
      : classKey === "evidence"
        ? await deleteEvidenceShelfItem({ domainSlug, id })
        : tableName
          ? await deleteObjectBackedShelfItem({
              classKey,
              domainSlug,
              id,
              tableName,
            })
          : null;

  if (!row) {
    return err("not_found", "Shelf item was not found", {
      classKey,
      domainSlug,
      id,
    });
  }

  return ok({ classKey, id: row.id });
}
