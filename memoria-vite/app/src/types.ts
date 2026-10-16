export type ItemClass = {
  name: string;
};

export type DomainRecord = {
  id: string;
  slug: string;
  label: string;
  description: string;
  domain_context_last_run: DomainContextRunRecord | null;
  domain_context_profile: string | null;
  type_id: string | null;
  created: string;
  updated: string;
};

export type DomainContextRunRecord = {
  context_summary?: Record<string, unknown>;
  generated_at?: string;
  model?: string;
  profile?: string;
  prompt?: string;
  prompt_version_id?: string | null;
  raw_output?: Record<string, unknown>;
  status?: string;
};

export type PromptRecord = {
  id: string;
  domain_id: string | null;
  tool_key: string;
  label: string;
  status: string;
  created: string;
  updated: string;
};

export type PromptVersionRecord = {
  id: string;
  prompt_id: string;
  version_number: number;
  body: string;
  notes: string;
  content_sha256: string;
  created: string;
  updated: string;
};

export type PromptBindingRecord = {
  id: string;
  domain_id: string | null;
  scope_key: string;
  tool_key: string;
  active_prompt_version_id: string;
  created: string;
  updated: string;
};

export type PromptSnapshot = {
  activeBinding: PromptBindingRecord | null;
  prompts: PromptRecord[];
  selectedPromptId: string | null;
  selectedVersionId: string | null;
  toolKey: string;
  versions: PromptVersionRecord[];
};

export type CodexModelOption = {
  description: string;
  isDefault: boolean;
  label: string;
  value: string;
};

export type CodexModelSnapshot = {
  models: CodexModelOption[];
  source: string;
};

export type TypeRecord = {
  id: string;
  domain_id: string | null;
  item_table: string;
  slug: string;
  label: string;
  created: string;
  updated: string;
};

export type GraphItemRecord = {
  id: string;
  domain_id: string | null;
  item_table: string;
  label: string;
  type_id: string | null;
  type: string;
  role: string;
  description: string;
  aliases: string;
  tags: string;
  normalized: string;
  last_updated: string;
  content_sha256: string | null;
  body_sha256: string | null;
  size_bytes: number | null;
  intake_profile: string | null;
  extraction_stage: string | null;
  source: string | null;
  claim_text: string | null;
  source_id: string | null;
  source_label?: string | null;
  target_id: string | null;
  target_label?: string | null;
  created: string;
  updated: string;
};

export type GraphEdgeRecord = {
  id: string;
  domain_id: string | null;
  source_id: string;
  target_id: string;
  type_id: string | null;
  type: string;
  label: string;
  source: string | null;
  source_label: string | null;
  target_label: string | null;
  created: string;
  updated: string;
};

export type GraphView = {
  id: string;
  domain_id: string | null;
  slug: string;
  label: string;
  description: string | null;
  created: string;
  updated: string;
};

export type ViewItemRecord = GraphItemRecord & {
  view_item_id: string;
  view_id: string;
  item_id: string;
  x: number;
  y: number;
  visibility: "visible" | "hidden" | "collapsed" | "metadata_only";
  view_created: string;
  view_updated: string;
};

export type ViewEdgeRecord = GraphEdgeRecord & {
  view_edge_id: string;
  view_id: string;
  edge_id: string;
  visibility: "visible" | "hidden" | "collapsed" | "metadata_only";
  view_created: string;
  view_updated: string;
};

export type GraphSnapshot = {
  activeDomain: DomainRecord | null;
  activeView: GraphView | null;
  domains: DomainRecord[];
  edges: GraphEdgeRecord[];
  itemClasses: ItemClass[];
  items: GraphItemRecord[];
  shelfItems: GraphItemRecord[];
  types: TypeRecord[];
  views: GraphView[];
  viewEdges: ViewEdgeRecord[];
  viewItems: ViewItemRecord[];
};

export type DocumentRecord = {
  id: string;
  domain_id: string | null;
  label: string;
  type: string;
  source_type: "html" | "markdown";
  status: "ready" | "processing" | "failed";
  extraction_stage: string;
  description: string;
  aliases: string;
  tags: string;
  content_sha256: string;
  body_sha256: string;
  size_bytes: number;
  intake_profile: string;
  source_filename: string | null;
  source_url: string | null;
  mime_type: string | null;
  shard_count: number;
  error_message: string | null;
  source: string | null;
  created: string;
  updated: string;
};

export type DocumentShardRecord = {
  id: string;
  document_id: string;
  position: number;
  heading_path: string[];
  body: string;
  size_bytes: number;
  created: string;
  updated: string;
};

export type ShelfFolderRecord = {
  id: string;
  scope: string;
  label: string;
  position: number;
  collapsed: boolean;
  created: string;
  updated: string;
};

export type ShelfFolderItemRecord = {
  folder_id: string;
  item_id: string;
  position: number;
  created: string;
  updated: string;
};

export type DiscoveryReport = {
  anchor_review_due: boolean;
  anchor_review_interval: number;
  anchor_review_next_document_count: number;
  db_path: string;
  document_count: number;
  edge_count: number;
  error_count: number;
  errors: unknown[];
  generated_at: string;
  node_count: number;
  scanned_count: number;
  valid_count: number;
  vault_root: string;
  write: boolean;
};

export type DocumentWorkbenchSnapshot = {
  containsEdgeCount: number;
  discoveryReport: DiscoveryReport | null;
  documents: DocumentRecord[];
  folderCount: number;
  shelfFolderItems: ShelfFolderItemRecord[];
  shelfFolders: ShelfFolderRecord[];
  shardsByDocumentId: Record<string, DocumentShardRecord[]>;
};

export type ImportDocumentResult = DocumentWorkbenchSnapshot & {
  deduped: boolean;
  documentId: string;
};

export type DistillationStageKey =
  | "ontology"
  | "subjects"
  | "claims"
  | "subject_relations"
  | "claim_relations"
  | "promotion";

export type DistillationRunStatus =
  | "draft"
  | "running"
  | "needs_admission"
  | "partially_admitted"
  | "admitted"
  | "failed"
  | "archived";

export type DistillationCandidateStatus =
  | "pending"
  | "admitted"
  | "merged"
  | "rejected"
  | "waiting"
  | "failed";

export type DistillationStageDefinition = {
  key: DistillationStageKey;
  label: string;
  order: number;
};

export type DistillationRunRecord = {
  id: string;
  domain_id: string | null;
  document_id: string;
  document_label?: string;
  status: DistillationRunStatus;
  current_stage: DistillationStageKey | "complete";
  settings: Record<string, unknown>;
  summary: Record<string, unknown>;
  error_message: string | null;
  created: string;
  updated: string;
};

export type DistillationRunSummary = DistillationRunRecord & {
  admitted_count: number;
  bundle_id: string | null;
  candidate_count: number;
  merged_count: number;
  pending_count: number;
  rejected_count: number;
};

export type DistillationStageRunRecord = {
  id: string;
  run_id: string;
  stage: DistillationStageKey;
  stage_order: number;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  candidate_count: number;
  result_summary: Record<string, unknown>;
  raw_output: Record<string, unknown>;
  prompt_ref: string | null;
  model: string | null;
  error_message: string | null;
  started: string | null;
  completed: string | null;
  created: string;
  updated: string;
};

export type CandidateBundleRecord = {
  id: string;
  domain_id: string | null;
  distillation_run_id: string | null;
  bundle_kind: string;
  status: string;
  source_context: Record<string, unknown>;
  payload: Record<string, unknown>;
  created: string;
  updated: string;
};

export type DistillationCandidateRecord = {
  id: string;
  bundle_id: string;
  candidate_kind:
    | "ontology_type"
    | "subject"
    | "alias"
    | "claim"
    | "subject_relationship"
    | "claim_relationship"
    | "promotion";
  target_kind: string | null;
  target_id: string | null;
  status: DistillationCandidateStatus;
  dedupe_key: string | null;
  payload: Record<string, unknown>;
  review: Record<string, unknown>;
  created: string;
  updated: string;
};

export type AdmissionDecisionRecord = {
  id: string;
  candidate_id: string;
  disposition: "admit" | "merge" | "reject";
  target_kind: string | null;
  target_id: string | null;
  rationale: string;
  decided_by: string;
  decided_at: string;
  metadata: Record<string, unknown>;
  created: string;
  updated: string;
};

export type SubjectCandidatePackage = {
  aliases: DistillationCandidateRecord[];
  claims: DistillationCandidateRecord[];
  claimRelationships: DistillationCandidateRecord[];
  evidenceRefs: unknown[];
  localSubjectId: string;
  relationships: DistillationCandidateRecord[];
  status: DistillationCandidateStatus;
  subject: DistillationCandidateRecord;
};

export type DistillationRunDetail = {
  bundle: CandidateBundleRecord | null;
  candidates: DistillationCandidateRecord[];
  candidateCounts: Record<string, number>;
  decisions: AdmissionDecisionRecord[];
  run: DistillationRunRecord;
  stages: DistillationStageRunRecord[];
  subjectPackages: SubjectCandidatePackage[];
};

export type DistillationSnapshot = {
  documents: DocumentRecord[];
  runs: DistillationRunSummary[];
  selectedDocumentId: string | null;
  selectedRunId: string | null;
  selectedRun: DistillationRunDetail | null;
  stages: DistillationStageDefinition[];
};

export type AdmissionSnapshot = {
  groupedRuns: Record<string, DistillationRunSummary[]>;
  runs: DistillationRunSummary[];
  selectedRunId: string | null;
  selectedRun: DistillationRunDetail | null;
};

export type AssistantEvent = {
  created: string;
  id: string;
  payload: Record<string, unknown>;
  sequence?: number;
  type:
    | "assistant.message.delta"
    | "assistant.message.completed"
    | "tool.started"
    | "tool.completed"
    | "tool.failed"
    | "turn.started"
    | "turn.completed"
    | "turn.failed"
    | "user.message"
    | string;
};

export type AssistantThread = {
  codex_thread_id: string | null;
  context: Record<string, unknown>;
  created: string;
  events?: AssistantEvent[];
  id: string;
  title: string;
  updated: string;
};

export type AssistantStatus = {
  model: string;
  ready: boolean;
  transport: string;
};

export type SelectedRecord =
  | { kind: "item"; id: string }
  | { kind: "edge"; id: string }
  | null;
