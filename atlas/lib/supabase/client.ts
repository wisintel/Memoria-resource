import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type ClassFieldLayout = {
  columnOrder?: string[];
  hiddenColumnIds?: string[];
};

export type ClassRecord = {
  id: string;
  label: string;
  table_name: string;
  type_id: string | null;
  purpose: string | null;
  field_layout: ClassFieldLayout;
  created_at: number;
  updated_at: number;
};

export type ClassInsert = Omit<ClassRecord, "id" | "field_layout"> & {
  field_layout?: ClassFieldLayout;
};

export type AppContextSessionRecord = {
  session_id: string;
  route: string;
  screen: string;
  domain_id: string | null;
  document_id: string | null;
  active_document_shard_id: string | null;
  mode: string | null;
  selected_record_id: string | null;
  selected_record_table: string | null;
  updated_at: number;
};

export type AppContextSessionInsert = AppContextSessionRecord;

export type ClaimRecord = {
  id: string;
  domain_id: string;
  type_id: string;
  kind_id: string | null;
  target_entity_ids: string[];
  source_document_id: string | null;
  status_id: string | null;
  slug: string;
  label: string;
  claim_text: string;
  created_at: number;
  updated_at: number;
};

export type ClaimInsert = Omit<ClaimRecord, "id" | "label" | "slug"> & {
  label?: string;
  slug?: string;
};

export type DomainRecord = {
  id: string;
  slug: string;
  label: string;
  core_entity_id: string | null;
  domain_type_id: string | null;
  status_id: string | null;
  created_at: number;
  updated_at: number;
};

export type DomainInsert = Omit<DomainRecord, "id">;

export type DocumentRecord = {
  id: string;
  domain_id: string;
  type_id: string | null;
  kind_id: string | null;
  label: string;
  title: string;
  source_type: "markdown" | "paste" | "html" | "url" | "pdf" | "converted_file";
  status: "ready" | "processing" | "failed" | "extracted";
  source_filename: string | null;
  source_url: string | null;
  content_hash: string | null;
  mime_type: string | null;
  size_bytes: number;
  shard_count: number;
  extracted_by_tool_id: string | null;
  error_message: string | null;
  created_at: number;
  updated_at: number;
};

export type DocumentInsert = Omit<DocumentRecord, "id">;

export type DocumentShelfFolderRecord = {
  id: string;
  domain_id: string;
  label: string;
  position: number;
  collapsed: boolean;
  created_at: number;
  updated_at: number;
};

export type DocumentShelfFolderInsert = Omit<DocumentShelfFolderRecord, "id">;

export type DocumentShelfFolderItemRecord = {
  folder_id: string;
  document_id: string;
  domain_id: string;
  position: number;
  created_at: number;
  updated_at: number;
};

export type DocumentShelfFolderItemInsert = DocumentShelfFolderItemRecord;

export type DocumentShardRecord = {
  id: string;
  document_id: string;
  position: number;
  heading_path: string[];
  body: string;
  size_bytes: number;
  created_at: number;
  updated_at: number;
};

export type DocumentShardInsert = Omit<DocumentShardRecord, "id">;

export type DistillationRunStatus =
  | "draft"
  | "running"
  | "needs_review"
  | "approved"
  | "failed"
  | "promoted"
  | "archived";

export type DistillationRunStep =
  | "claims"
  | "entities"
  | "relationships"
  | "bundle"
  | "promotion";

export type DistillationRunRecord = {
  id: string;
  domain_id: string;
  document_id: string;
  status: DistillationRunStatus;
  current_step: DistillationRunStep;
  claim_registry: TableValue;
  entity_registry: TableValue;
  relationship_registry: TableValue;
  bundle: TableValue;
  settings: TableValue;
  error_message: string | null;
  started_at: number | null;
  completed_at: number | null;
  created_at: number;
  updated_at: number;
};

export type DistillationRunInsert = Omit<DistillationRunRecord, "id">;

export type DistillationShardRunStatus =
  | "draft"
  | "running"
  | "needs_review"
  | "completed"
  | "failed"
  | "archived";

export type DistillationPipelineStage =
  | "ontology"
  | "entities"
  | "claims"
  | "entity_relationships"
  | "claim_relationships"
  | "promotion";

export type DistillationShardRunStage = DistillationPipelineStage | "complete";

export type DistillationStageRunStatus =
  | "pending"
  | "running"
  | "needs_review"
  | "completed"
  | "failed"
  | "skipped";

export type DistillationCandidateKind =
  | "entity_type"
  | "claim_type"
  | "relationship_type"
  | "entity"
  | "claim"
  | "entity_relationship"
  | "claim_relationship"
  | "promotion";

export type DistillationCandidateStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "superseded"
  | "failed";

export type RecordSourceEvidenceKind =
  | "generated_from"
  | "supports"
  | "mentions"
  | "inferred_from"
  | "reviewed_from";

export type DistillationShardRunRecord = {
  id: string;
  domain_id: string;
  document_id: string;
  shard_id: string;
  status: DistillationShardRunStatus;
  current_stage: DistillationShardRunStage;
  settings: TableValue;
  error_message: string | null;
  started_at: number | null;
  completed_at: number | null;
  created_at: number;
  updated_at: number;
};

export type DistillationShardRunInsert = Omit<DistillationShardRunRecord, "id">;

export type DistillationStageRunRecord = {
  id: string;
  shard_run_id: string;
  stage: DistillationPipelineStage;
  stage_order: number;
  status: DistillationStageRunStatus;
  candidate_count: number;
  approved_count: number;
  rejected_count: number;
  input_context: TableValue;
  result_summary: TableValue;
  error_message: string | null;
  started_at: number | null;
  completed_at: number | null;
  created_at: number;
  updated_at: number;
};

export type DistillationStageRunInsert = Omit<DistillationStageRunRecord, "id">;

export type DistillationCandidateRecord = {
  id: string;
  shard_run_id: string;
  stage_run_id: string;
  stage: DistillationPipelineStage;
  candidate_kind: DistillationCandidateKind;
  status: DistillationCandidateStatus;
  approval_action: string | null;
  target_class_id: string | null;
  target_record_id: string | null;
  dedupe_key: string | null;
  payload: TableValue;
  evidence: TableValue;
  error_message: string | null;
  generated_at: number;
  reviewed_at: number | null;
  created_at: number;
  updated_at: number;
};

export type DistillationCandidateInsert = Omit<DistillationCandidateRecord, "id">;

export type RecordSourceRecord = {
  id: string;
  domain_id: string;
  document_id: string;
  shard_id: string;
  source_class_id: string;
  source_record_id: string;
  evidence_kind: RecordSourceEvidenceKind;
  candidate_id: string | null;
  metadata: TableValue;
  created_at: number;
  updated_at: number;
};

export type RecordSourceInsert = Omit<RecordSourceRecord, "id">;

export type DomainTypeRecord = {
  id: string;
  slug: string;
  label: string;
  source_reference: string | null;
  guidance_path: string | null;
  created_at: number;
  updated_at: number;
};

export type DomainTypeInsert = Omit<DomainTypeRecord, "id">;

export type StatusRecord = {
  id: string;
  class_id: string;
  slug: string;
  label: string;
  created_at: number;
  updated_at: number;
};

export type StatusInsert = Omit<StatusRecord, "id">;

export type ClassTypeRecord = {
  id: string;
  domain_id: string | null;
  class_id: string;
  slug: string;
  label: string;
  status_id: string | null;
  created_at: number;
  updated_at: number;
};

export type ClassTypeInsert = Omit<ClassTypeRecord, "id">;

export type KindRecord = {
  id: string;
  type_id: string;
  slug: string;
  label: string;
  status_id: string | null;
  created_at: number;
  updated_at: number;
};

export type KindInsert = Omit<KindRecord, "id">;

export type EntityRecord = {
  id: string;
  description: string | null;
  domain_id: string;
  type_id: string;
  kind_id: string | null;
  status_id: string | null;
  slug: string;
  label: string;
  created_at: number;
  updated_at: number;
};

export type EntityInsert = Omit<EntityRecord, "id">;

export type EntityAliasRecord = {
  id: string;
  domain_id: string;
  entity_id: string;
  alias: string;
  normalized_alias: string;
  status_id: string | null;
  source_document_id: string | null;
  created_at: number;
  updated_at: number;
};

export type EntityAliasInsert = Omit<EntityAliasRecord, "id" | "normalized_alias"> & {
  normalized_alias?: string;
};

export type RelationshipRecord = {
  id: string;
  domain_id: string;
  type_id: string;
  kind_id: string | null;
  status_id: string | null;
  source_class_id: string;
  source_record_id: string;
  target_class_id: string;
  target_record_id: string;
  label: string;
  created_at: number;
  updated_at: number;
};

export type RelationshipInsert = Omit<RelationshipRecord, "id" | "label">;

export type ViewRecord = {
  id: string;
  domain_id: string;
  slug: string;
  label: string;
  view_kind: "semantic" | "working" | "presentation";
  status_id: string | null;
  created_at: number;
  updated_at: number;
};

export type ViewInsert = Omit<ViewRecord, "id" | "slug"> & {
  slug?: string;
};

export type ViewNodeRecord = {
  id: string;
  view_id: string;
  record_class_id: string;
  record_id: string;
  visibility: "visible" | "hidden" | "collapsed" | "metadata_only";
  x: number | null;
  y: number | null;
  pinned: boolean;
  created_at: number;
  updated_at: number;
};

export type ViewNodeInsert = Omit<ViewNodeRecord, "id">;

export type ViewRelationshipRecord = {
  id: string;
  view_id: string;
  relationship_id: string;
  visibility: "visible" | "hidden" | "collapsed" | "metadata_only";
  created_at: number;
  updated_at: number;
};

export type ViewRelationshipInsert = Omit<ViewRelationshipRecord, "id">;

export type ToolRecord = {
  id: string;
  slug: string;
  label: string;
  tool_kind: "extractor" | "sharder" | "launcher" | "workflow";
  purpose: string | null;
  asset_path: string | null;
  metadata_path: string | null;
  entrypoint: string | null;
  launch_url: string | null;
  env_contract: TableValue;
  config: TableValue;
  status: "active" | "inactive" | "archived";
  created_at: number;
  updated_at: number;
};

export type ToolInsert = Omit<ToolRecord, "id">;

export type TableValue =
  | string
  | number
  | boolean
  | null
  | TableValue[]
  | { [key: string]: TableValue };

export type TableRow = Record<string, TableValue | undefined>;

export type ClassTableSample = {
  count: number | null;
  error: string | null;
  fields: string[];
  limit: number;
  rows: TableRow[];
  tableName: string;
};

export type ClassTableSamples = Record<string, ClassTableSample>;

export type ViewRecordCounts = {
  edges: number | null;
  nodes: number | null;
};

export type SelectedViewRecords = {
  claims: TableRow[];
  entities: TableRow[];
  relationships: TableRow[];
  viewNodes: TableRow[];
  viewRelationships: TableRow[];
};

type Database = {
  public: {
    Tables: {
      classes: {
        Row: ClassRecord;
        Insert: ClassInsert;
        Update: Partial<ClassRecord>;
        Relationships: [];
      };
      app_context_sessions: {
        Row: AppContextSessionRecord;
        Insert: AppContextSessionInsert;
        Update: Partial<AppContextSessionRecord>;
        Relationships: [];
      };
      claims: {
        Row: ClaimRecord;
        Insert: ClaimInsert;
        Update: Partial<ClaimRecord>;
        Relationships: [];
      };
      domains: {
        Row: DomainRecord;
        Insert: DomainInsert;
        Update: Partial<DomainRecord>;
        Relationships: [];
      };
      domain_types: {
        Row: DomainTypeRecord;
        Insert: DomainTypeInsert;
        Update: Partial<DomainTypeRecord>;
        Relationships: [];
      };
      documents: {
        Row: DocumentRecord;
        Insert: DocumentInsert;
        Update: Partial<DocumentRecord>;
        Relationships: [];
      };
      document_shards: {
        Row: DocumentShardRecord;
        Insert: DocumentShardInsert;
        Update: Partial<DocumentShardRecord>;
        Relationships: [];
      };
      document_shelf_folders: {
        Row: DocumentShelfFolderRecord;
        Insert: DocumentShelfFolderInsert;
        Update: Partial<DocumentShelfFolderRecord>;
        Relationships: [];
      };
      document_shelf_folder_items: {
        Row: DocumentShelfFolderItemRecord;
        Insert: DocumentShelfFolderItemInsert;
        Update: Partial<DocumentShelfFolderItemRecord>;
        Relationships: [];
      };
      distillation_runs: {
        Row: DistillationRunRecord;
        Insert: DistillationRunInsert;
        Update: Partial<DistillationRunRecord>;
        Relationships: [];
      };
      distillation_shard_runs: {
        Row: DistillationShardRunRecord;
        Insert: DistillationShardRunInsert;
        Update: Partial<DistillationShardRunRecord>;
        Relationships: [];
      };
      distillation_stage_runs: {
        Row: DistillationStageRunRecord;
        Insert: DistillationStageRunInsert;
        Update: Partial<DistillationStageRunRecord>;
        Relationships: [];
      };
      distillation_candidates: {
        Row: DistillationCandidateRecord;
        Insert: DistillationCandidateInsert;
        Update: Partial<DistillationCandidateRecord>;
        Relationships: [];
      };
      entities: {
        Row: EntityRecord;
        Insert: EntityInsert;
        Update: Partial<EntityRecord>;
        Relationships: [];
      };
      entity_aliases: {
        Row: EntityAliasRecord;
        Insert: EntityAliasInsert;
        Update: Partial<EntityAliasRecord>;
        Relationships: [];
      };
      relationships: {
        Row: RelationshipRecord;
        Insert: RelationshipInsert;
        Update: Partial<RelationshipRecord>;
        Relationships: [];
      };
      record_sources: {
        Row: RecordSourceRecord;
        Insert: RecordSourceInsert;
        Update: Partial<RecordSourceRecord>;
        Relationships: [];
      };
      views: {
        Row: ViewRecord;
        Insert: ViewInsert;
        Update: Partial<ViewRecord>;
        Relationships: [];
      };
      view_nodes: {
        Row: ViewNodeRecord;
        Insert: ViewNodeInsert;
        Update: Partial<ViewNodeRecord>;
        Relationships: [];
      };
      view_relationships: {
        Row: ViewRelationshipRecord;
        Insert: ViewRelationshipInsert;
        Update: Partial<ViewRelationshipRecord>;
        Relationships: [];
      };
      kinds: {
        Row: KindRecord;
        Insert: KindInsert;
        Update: Partial<KindRecord>;
        Relationships: [];
      };
      statuses: {
        Row: StatusRecord;
        Insert: StatusInsert;
        Update: Partial<StatusRecord>;
        Relationships: [];
      };
      tools: {
        Row: ToolRecord;
        Insert: ToolInsert;
        Update: Partial<ToolRecord>;
        Relationships: [];
      };
      types: {
        Row: ClassTypeRecord;
        Insert: ClassTypeInsert;
        Update: Partial<ClassTypeRecord>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

declare global {
  var atlasSupabaseBrowserClient: SupabaseClient<Database> | undefined;
}

export function createSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase environment variables are not configured.");
  }

  if (typeof window !== "undefined") {
    globalThis.atlasSupabaseBrowserClient ??= createClient<Database>(
      supabaseUrl,
      supabaseAnonKey,
    );

    return globalThis.atlasSupabaseBrowserClient;
  }

  return createClient<Database>(supabaseUrl, supabaseAnonKey);
}
