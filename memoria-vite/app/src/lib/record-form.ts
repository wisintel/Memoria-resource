import { parseListValue, serializeListInput } from "@/lib/list-values";
import type {
  DocumentRecord,
  GraphEdgeRecord,
  GraphItemRecord,
  ViewEdgeRecord,
  ViewItemRecord
} from "@/types";

export const NO_DOMAIN_ID = "__no_domain__";
export const SUBJECT_ROLE_OPTIONS = ["Anchor"] as const;

export type InspectorEditInput = {
  aliases: string;
  claimText?: string | null;
  description: string;
  domainId: string;
  extractionStage: string;
  intakeProfile?: string;
  label: string;
  lastUpdated: string;
  mimeType?: string | null;
  role: string;
  source: string | null;
  sourceFilename?: string | null;
  sourceId?: string | null;
  sourceUrl?: string | null;
  targetId?: string | null;
  type: string;
};

type RecordFormDetails =
  | {
      domainId: string | null;
      kind: "item";
      record: { item: GraphItemRecord | ViewItemRecord };
    }
  | {
      domainId: string | null;
      kind: "edge";
      record: { edge: GraphEdgeRecord | ViewEdgeRecord };
      source: string | null;
      typeLabel: string;
    };

export function emptyInspectorForm(domainId: string | null): InspectorEditInput {
  return {
    aliases: "",
    claimText: null,
    description: "",
    domainId: domainId ?? NO_DOMAIN_ID,
    extractionStage: "not_started",
    intakeProfile: "",
    label: "",
    lastUpdated: "",
    mimeType: null,
    role: "",
    source: null,
    sourceFilename: null,
    sourceId: null,
    sourceUrl: null,
    targetId: null,
    type: ""
  };
}

export function formFromDetails(
  details: RecordFormDetails,
  activeDomainId: string | null
): InspectorEditInput {
  const fallbackDomainId = details.domainId ?? activeDomainId ?? null;

  if (details.kind === "edge") {
    return {
      ...emptyInspectorForm(fallbackDomainId),
      domainId: fallbackDomainId ?? NO_DOMAIN_ID,
      source: details.source,
      sourceId: details.record.edge.source_id,
      targetId: details.record.edge.target_id,
      type: details.typeLabel
    };
  }

  const item = details.record.item;

  return {
    ...emptyInspectorForm(fallbackDomainId),
    aliases: listInputText(item.aliases),
    claimText: item.claim_text,
    description: item.description,
    domainId: fallbackDomainId ?? NO_DOMAIN_ID,
    intakeProfile: item.intake_profile ?? "",
    label: item.label,
    lastUpdated: item.last_updated,
    role: item.role,
    source: item.source,
    targetId: item.target_id,
    type: item.type
  };
}

export function formFromDocument(document: DocumentRecord): InspectorEditInput {
  return {
    ...emptyInspectorForm(document.domain_id ?? null),
    aliases: listInputText(document.aliases),
    description: document.description,
    domainId: document.domain_id ?? NO_DOMAIN_ID,
    extractionStage: document.extraction_stage || "not_started",
    intakeProfile: document.intake_profile,
    label: document.label,
    mimeType: document.mime_type,
    source: document.source,
    sourceFilename: document.source_filename,
    sourceUrl: document.source_url,
    type: document.type
  };
}

export function normalizeInspectorForm(form: InspectorEditInput): InspectorEditInput {
  return {
    ...form,
    aliases: form.aliases.trim(),
    claimText: form.claimText?.trim() || null,
    description: form.description.trim(),
    extractionStage: form.extractionStage.trim() || "not_started",
    intakeProfile: form.intakeProfile?.trim() || "",
    label: form.label.trim(),
    lastUpdated: form.lastUpdated.trim(),
    mimeType: form.mimeType?.trim() || null,
    role: form.role.trim(),
    source: form.source?.trim() || null,
    sourceFilename: form.sourceFilename?.trim() || null,
    sourceId: form.sourceId?.trim() || null,
    sourceUrl: form.sourceUrl?.trim() || null,
    targetId: form.targetId?.trim() || null,
    type: form.type.trim()
  };
}

export function selectedDomainValue(domainId: string | null | undefined) {
  return !domainId || domainId === NO_DOMAIN_ID ? null : domainId;
}

function listInputText(value: string | null | undefined) {
  return parseListValue(value).join("\n");
}

export function defaultTypeForItemClass(itemTable: string) {
  const types: Record<string, string> = {
    claims: "claim",
    documents: "document",
    edges: "relationship"
  };

  return types[itemTable] ?? "unspecified";
}

export function buildCreateItemInput(
  input: InspectorEditInput,
  options: {
    domainFilterId: string | null;
    itemTable: string;
    viewId: string | null;
  }
) {
  return {
    aliases: serializeListInput(input.aliases),
    claim_text: input.claimText,
    description: input.description,
    domain_filter_id: options.domainFilterId,
    domain_id: selectedDomainValue(input.domainId),
    item_table: options.itemTable,
    label: options.itemTable === "claims" ? input.label || "Claim" : input.label,
    role: input.role,
    source: input.source,
    target_id: input.targetId,
    type: input.type,
    view_id: options.viewId
  };
}

export function buildUpdateItemInput(
  input: InspectorEditInput,
  options: {
    domainFilterId: string | null;
    viewId: string | null;
  }
) {
  return {
    aliases: serializeListInput(input.aliases),
    claim_text: input.claimText,
    description: input.description,
    domain_id: selectedDomainValue(input.domainId),
    domain_filter_id: options.domainFilterId,
    intake_profile: input.intakeProfile,
    label: input.label,
    last_updated: input.lastUpdated,
    mime_type: input.mimeType,
    role: input.role,
    source: input.source,
    source_filename: input.sourceFilename,
    source_url: input.sourceUrl,
    target_id: input.targetId,
    type: input.type,
    view_id: options.viewId
  };
}

export function buildCreateEdgeInput(
  input: InspectorEditInput,
  options: {
    domainFilterId: string | null;
    viewId: string | null;
  }
) {
  return {
    domain_filter_id: options.domainFilterId,
    domain_id: selectedDomainValue(input.domainId),
    source: input.source,
    source_id: input.sourceId ?? "",
    target_id: input.targetId ?? "",
    type: input.type,
    view_id: options.viewId
  };
}

export function buildUpdateEdgeInput(
  input: InspectorEditInput,
  options: {
    domainFilterId: string | null;
    viewId: string | null;
  }
) {
  return {
    domain_id: selectedDomainValue(input.domainId),
    domain_filter_id: options.domainFilterId,
    source: input.source,
    source_id: input.sourceId,
    target_id: input.targetId,
    type: input.type,
    view_id: options.viewId
  };
}

export { serializeListInput };
