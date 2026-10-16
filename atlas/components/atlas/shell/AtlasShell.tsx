import type { ChatContext } from "@/lib/chat-context";
import {
  getClassTableTemplate,
  isKnownClassTableName,
  type KnownClassTableName,
} from "@/lib/class-table-templates";
import { isAllDomainsFilter } from "@/lib/domain-filter";
import {
  createSupabaseClient,
  type ClassRecord,
  type ClassTableSamples,
  type DocumentRecord,
  type DocumentShelfFolderItemRecord,
  type DocumentShelfFolderRecord,
  type DocumentShardRecord,
  type DomainRecord,
  type SelectedViewRecords,
  type TableRow,
  type ViewRecordCounts,
} from "@/lib/supabase/client";

import { AtlasShellFrame } from "./AtlasShellFrame";

type AtlasShellContext = {
  chatContext: ChatContext;
  classes: ClassRecord[];
  documents: DocumentRecord[];
  documentShelfFolderItems: DocumentShelfFolderItemRecord[];
  documentShelfFolders: DocumentShelfFolderRecord[];
  documentShardsByDocumentId: Record<string, DocumentShardRecord[]>;
  domains: DomainRecord[];
  domainName: string | null;
  isAllDomainsSelected: boolean;
  selectedDomainId: string | null;
  selectedViewId: string | null;
  selectedViewRecords: SelectedViewRecords;
  tableSamples: ClassTableSamples;
  viewRecordCounts: ViewRecordCounts;
};

const sampleLimit = 50;
const tablePageSize = 1000;
const fullShelfTables = new Set<KnownClassTableName>([
  "claims",
  "documents",
  "domains",
  "entities",
  "entity_aliases",
  "relationships",
  "statuses",
  "types",
]);

const emptySelectedViewRecords: SelectedViewRecords = {
  claims: [],
  entities: [],
  relationships: [],
  viewNodes: [],
  viewRelationships: [],
};

async function loadTableSamples(
  classes: ClassRecord[],
  selectedDomainId: string | null,
  isAllDomainsSelected: boolean,
): Promise<ClassTableSamples> {
  const supabase = createSupabaseClient();
  const entries = await Promise.all(
    classes.map(async (classRecord) => {
      const tableName = classRecord.table_name;

      if (!isKnownClassTableName(tableName)) {
        return [
          tableName,
          {
            count: null,
            error: "This table is not registered for Atlas yet.",
            fields: [],
            limit: sampleLimit,
            rows: [],
            tableName,
          },
        ] as const;
      }

      const template = getClassTableTemplate(tableName);

      if (!template) {
        return [
          tableName,
          {
            count: null,
            error: "This table is missing a class table template.",
            fields: [],
            limit: sampleLimit,
            rows: [],
            tableName,
          },
        ] as const;
      }

      const fields = [...template.previewFields];

      if (!selectedDomainId && !isAllDomainsSelected) {
        return [
          tableName,
          {
            count: 0,
            error: null,
            fields,
            limit: sampleLimit,
            rows: [],
            tableName,
          },
        ] as const;
      }

      const rows: TableRow[] = [];
      let count: number | null = null;
      let offset = 0;

      while (true) {
        const pageLimit = fullShelfTables.has(tableName) ? tablePageSize : sampleLimit;
        let query = supabase
          .from(tableName)
          .select(fields.join(","), { count: "exact" })
          .order("updated_at", { ascending: false })
          .range(offset, offset + pageLimit - 1);

        if (selectedDomainId && tableName === "domains") {
          query = query.filter("id", "eq", selectedDomainId);
        } else if (selectedDomainId && tableName === "types") {
          query = query.or(`domain_id.is.null,domain_id.eq.${selectedDomainId}`);
        } else if (selectedDomainId && isDomainFilteredTable(tableName)) {
          query = query.filter("domain_id", "eq", selectedDomainId);
        }

        const { count: pageCount, data, error } = await query;

        if (error) {
          return [
            tableName,
            {
              error: error.message,
              count,
              fields,
              limit: fullShelfTables.has(tableName) ? rows.length : sampleLimit,
              rows,
              tableName,
            },
          ] as const;
        }

        const pageRows = (data ?? []) as unknown as TableRow[];

        count = pageCount ?? count;
        rows.push(...pageRows);

        if (!fullShelfTables.has(tableName) || pageRows.length < pageLimit || (count !== null && rows.length >= count)) {
          break;
        }

        offset += pageLimit;
      }

      return [
        tableName,
        {
          error: null,
          count,
          fields,
          limit: fullShelfTables.has(tableName) ? rows.length : sampleLimit,
          rows,
          tableName,
        },
      ] as const;
    }),
  );

  return Object.fromEntries(entries);
}

async function loadViewRecordCounts(selectedViewId: string | null): Promise<ViewRecordCounts> {
  if (!selectedViewId) {
    return {
      edges: null,
      nodes: null,
    };
  }

  const supabase = createSupabaseClient();
  const [nodesResult, edgesResult] = await Promise.all([
    supabase
      .from("view_nodes")
      .select("id", { count: "exact", head: true })
      .eq("view_id", selectedViewId),
    supabase
      .from("view_relationships")
      .select("id", { count: "exact", head: true })
      .eq("view_id", selectedViewId),
  ]);

  if (nodesResult.error) {
    throw new Error(nodesResult.error.message);
  }

  if (edgesResult.error) {
    throw new Error(edgesResult.error.message);
  }

  return {
    edges: edgesResult.count ?? null,
    nodes: nodesResult.count ?? null,
  };
}

async function loadSelectedViewRecords(
  classes: ClassRecord[],
  selectedViewId: string | null,
): Promise<SelectedViewRecords> {
  if (!selectedViewId) {
    return emptySelectedViewRecords;
  }

  const supabase = createSupabaseClient();
  const classTableNameById = new Map(classes.map((classRecord) => [classRecord.id, classRecord.table_name]));
  const [viewNodesResult, viewRelationshipsResult] = await Promise.all([
    supabase
      .from("view_nodes")
      .select(fieldsForTable("view_nodes"))
      .eq("view_id", selectedViewId)
      .order("created_at", { ascending: true }),
    supabase
      .from("view_relationships")
      .select(fieldsForTable("view_relationships"))
      .eq("view_id", selectedViewId)
      .order("created_at", { ascending: true }),
  ]);

  if (viewNodesResult.error) {
    throw new Error(viewNodesResult.error.message);
  }

  if (viewRelationshipsResult.error) {
    throw new Error(viewRelationshipsResult.error.message);
  }

  const viewNodes = (viewNodesResult.data ?? []) as unknown as TableRow[];
  const viewRelationships = (viewRelationshipsResult.data ?? []) as unknown as TableRow[];
  const entityIds: string[] = [];
  const claimIds: string[] = [];

  for (const viewNode of viewNodes) {
    const tableName = classTableNameById.get(stringRowValue(viewNode, "record_class_id"));
    const recordId = stringRowValue(viewNode, "record_id");

    if (tableName === "entities" && recordId) {
      entityIds.push(recordId);
    } else if (tableName === "claims" && recordId) {
      claimIds.push(recordId);
    }
  }

  const relationshipIds = viewRelationships
    .map((viewRelationship) => stringRowValue(viewRelationship, "relationship_id"))
    .filter(Boolean);

  const [entities, claims, relationships] = await Promise.all([
    loadRowsByIds("entities", entityIds),
    loadRowsByIds("claims", claimIds),
    loadRowsByIds("relationships", relationshipIds),
  ]);

  return {
    claims,
    entities,
    relationships,
    viewNodes,
    viewRelationships,
  };
}

async function loadAtlasContext(
  domainParam: string | undefined,
  viewParam: string | undefined,
): Promise<AtlasShellContext> {
  const supabase = createSupabaseClient();
  const { data: domains, error: domainsError } = await supabase
    .from("domains")
    .select("id,slug,label,core_entity_id,domain_type_id,status_id,created_at,updated_at")
    .order("label", { ascending: true });

  if (domainsError) {
    throw new Error(domainsError.message);
  }

  const domainRecords = (domains ?? []) as DomainRecord[];
  const isAllDomainsSelected = isAllDomainsFilter(domainParam);
  const defaultDomainId = domainParam ? null : (domainRecords[0]?.id ?? null);
  const selectedDomainId = isAllDomainsSelected
    ? null
    : (domainRecords.find((domain) => domain.id === domainParam)?.id ?? defaultDomainId);

  const domainResult = selectedDomainId
    ? await supabase.from("domains").select("label").eq("id", selectedDomainId).maybeSingle()
    : { data: null, error: null };

  if (domainResult.error) {
    throw new Error(domainResult.error.message);
  }

  const { data: classes, error: classesError } = await supabase
    .from("classes")
    .select("id,label,table_name,type_id,purpose,field_layout,created_at,updated_at")
    .order("label", { ascending: true });

  if (classesError) {
    throw new Error(classesError.message);
  }

  const classRecords = (classes ?? []) as ClassRecord[];
  const tableSamples = await loadTableSamples(
    classRecords,
    selectedDomainId,
    isAllDomainsSelected,
  );
  const viewRows = tableSamples.views?.rows ?? [];
  const selectedViewFromSample =
    selectedDomainId && typeof viewParam === "string"
      ? viewRows.find((view) => view.id === viewParam)
      : null;
  const selectedViewResult =
    selectedDomainId && typeof viewParam === "string" && !selectedViewFromSample
      ? await supabase
          .from("views")
          .select(fieldsForTable("views"))
          .eq("domain_id", selectedDomainId)
          .eq("id", viewParam)
          .maybeSingle()
      : { data: null, error: null };

  if (selectedViewResult.error) {
    throw new Error(selectedViewResult.error.message);
  }

  const selectedViewId =
    selectedViewFromSample || selectedViewResult.data ? viewParam ?? null : null;
  const selectedViewRow = selectedViewFromSample ?? selectedViewResult.data ?? null;

  if (selectedViewResult.data && tableSamples.views) {
    tableSamples.views.rows = [
      selectedViewResult.data as unknown as TableRow,
      ...tableSamples.views.rows.filter((view) => view.id !== viewParam),
    ];
  }

  const viewRecordCounts = await loadViewRecordCounts(selectedViewId);
  const selectedViewRecords = await loadSelectedViewRecords(classRecords, selectedViewId);
  const documentRecords = (tableSamples.documents?.rows ?? []) as unknown as DocumentRecord[];
  const { folderItems: documentShelfFolderItems, folders: documentShelfFolders } =
    await loadDocumentShelfFolders(selectedDomainId);
  const documentIds = [...new Set(documentRecords.map((document) => document.id))];
  const { data: documentShards, error: documentShardsError } =
    documentIds.length > 0
      ? await supabase
          .from("document_shards")
          .select("id,document_id,position,heading_path,body,size_bytes,created_at,updated_at")
          .in("document_id", documentIds)
          .order("position", { ascending: true })
      : { data: [], error: null };

  if (documentShardsError) {
    throw new Error(documentShardsError.message);
  }

  const documentShardsByDocumentId = ((documentShards ?? []) as DocumentShardRecord[]).reduce<
    Record<string, DocumentShardRecord[]>
  >((groups, shard) => {
    groups[shard.document_id] = [...(groups[shard.document_id] ?? []), shard];
    return groups;
  }, {});
  const domainName = domainResult.data?.label ?? null;
  const chatContext: ChatContext = {
    activeDocumentShardId: null,
    documentId: null,
    documentTitle: null,
    domainId: selectedDomainId,
    domainName,
    mode: null,
    route: "/atlas",
    screen: "atlas",
    selectedRecordId: null,
    selectedRecordTable: null,
    viewId: selectedViewId,
    viewName: selectedViewRow ? stringRowValue(selectedViewRow as TableRow, "label") : null,
  };
  return {
    chatContext,
    classes: classRecords,
    documents: documentRecords,
    documentShelfFolderItems,
    documentShelfFolders,
    documentShardsByDocumentId,
    domains: domainRecords,
    domainName,
    isAllDomainsSelected,
    selectedDomainId,
    selectedViewId,
    selectedViewRecords,
    tableSamples,
    viewRecordCounts,
  };
}

type AtlasShellProps = {
  domainParam?: string;
  viewParam?: string;
};

export async function AtlasShell({
  domainParam,
  viewParam,
}: AtlasShellProps) {
  const context = await loadAtlasContext(
    domainParam,
    viewParam,
  );

  return <AtlasShellFrame {...context} />;
}

function isDomainFilteredTable(tableName: KnownClassTableName) {
  return ["claims", "documents", "entities", "entity_aliases", "relationships", "views"].includes(tableName);
}

function fieldsForTable(tableName: KnownClassTableName) {
  return getClassTableTemplate(tableName)?.previewFields.join(",") ?? "id";
}

async function loadRowsByIds(
  tableName: Extract<KnownClassTableName, "claims" | "entities" | "relationships">,
  ids: string[],
) {
  const uniqueIds = [...new Set(ids)];

  if (uniqueIds.length === 0) {
    return [];
  }

  const supabase = createSupabaseClient();
  const chunks = chunkArray(uniqueIds, 200);
  const results = await Promise.all(
    chunks.map((chunk) =>
      supabase
        .from(tableName)
        .select(fieldsForTable(tableName))
        .in("id", chunk),
    ),
  );
  const rows: TableRow[] = [];

  for (const result of results) {
    if (result.error) {
      throw new Error(result.error.message);
    }

    rows.push(...((result.data ?? []) as unknown as TableRow[]));
  }

  return rows;
}

async function loadDocumentShelfFolders(selectedDomainId: string | null) {
  if (!selectedDomainId) {
    return {
      folderItems: [],
      folders: [],
    };
  }

  const supabase = createSupabaseClient();
  const [foldersResult, folderItemsResult] = await Promise.all([
    supabase
      .from("document_shelf_folders")
      .select("id,domain_id,label,position,collapsed,created_at,updated_at")
      .eq("domain_id", selectedDomainId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("document_shelf_folder_items")
      .select("folder_id,document_id,domain_id,position,created_at,updated_at")
      .eq("domain_id", selectedDomainId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (isMissingDocumentShelfFolderTableError(foldersResult.error ?? folderItemsResult.error ?? null)) {
    return {
      folderItems: [],
      folders: [],
    };
  }

  if (foldersResult.error) {
    throw new Error(foldersResult.error.message);
  }

  if (folderItemsResult.error) {
    throw new Error(folderItemsResult.error.message);
  }

  return {
    folderItems: (folderItemsResult.data ?? []) as DocumentShelfFolderItemRecord[],
    folders: (foldersResult.data ?? []) as DocumentShelfFolderRecord[],
  };
}

function isMissingDocumentShelfFolderTableError(error: { code?: string; message: string } | null) {
  if (!error) {
    return false;
  }

  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.message.includes("document_shelf_folder")
  );
}

function chunkArray<T>(values: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function stringRowValue(row: TableRow, fieldName: string) {
  const value = row[fieldName];

  return typeof value === "string" ? value : "";
}
