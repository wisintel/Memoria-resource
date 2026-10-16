import { Inspect, Plus, X } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  RecordInspectorContent,
  RecordInspectorField,
  RecordInspectorHero,
  RecordInspectorList,
  RecordInspectorListItem,
  RecordInspectorRelatedEmpty,
  RecordInspectorRelatedCard,
  RecordInspectorSection,
  RecordInspectorShell,
  RecordInspectorStub
} from "@/components/RecordInspector";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@/components/ui/empty";
import { parseListValue } from "@/lib/list-values";
import { classLabel } from "@/lib/semantic-display";
import { cn } from "@/lib/utils";
import type {
  DocumentRecord,
  DocumentShardRecord,
  DomainRecord,
  GraphEdgeRecord,
  GraphItemRecord,
  ViewEdgeRecord,
  ViewItemRecord
} from "../../types";

export function DocumentInspector({
  document,
  domains,
  isLoading,
  shards
}: {
  document: DocumentRecord | null;
  domains: DomainRecord[];
  isLoading: boolean;
  shards: DocumentShardRecord[];
}) {
  const domainLabel = document ? domains.find((domain) => domain.id === document.domain_id)?.label ?? "No domain" : "";

  return (
    <RecordInspectorShell>
      {document ? (
        <RecordInspectorContent>
          <InspectorHero
            canClear={false}
            eyebrow="DOCUMENT"
            title={document.label}
            onClear={() => undefined}
          />
          <InspectorSection title="Overview" variant="triple">
            <InspectorReadField label="Domain" value={domainLabel} />
            <InspectorReadField label="Class" value="Document" />
            <InspectorReadField label="Type" value={displayTypeLabel(document.type)} />
          </InspectorSection>
          {document.description ? (
            <InspectorSection title="Description" variant="single">
              <InspectorReadField label="Description" value={document.description} wide />
            </InspectorSection>
          ) : null}
          <InspectorSection title="Processing">
            <InspectorReadField label="Status" value={displayTypeLabel(document.status)} />
            <InspectorReadField label="Extraction" value={displayTypeLabel(document.extraction_stage || "not_started")} />
            <InspectorReadField label="Size" value={formatBytes(document.size_bytes)} />
            <InspectorReadField label="Chunks" value={String(document.shard_count || shards.length)} />
          </InspectorSection>
          <InspectorSection title="Source">
            <InspectorReadField label="Format" value={humanizeSourceType(document.source_type)} />
            {document.source_filename ? <InspectorReadField label="Filename" value={document.source_filename} /> : null}
            {document.source_url ? <InspectorReadField label="URL" value={document.source_url} wide /> : null}
            {displayList(document.aliases) !== "None" ? (
              <InspectorReadField label="Aliases" value={displayList(document.aliases)} wide />
            ) : null}
          </InspectorSection>
          <InspectorShardSection shards={shards} />
        </RecordInspectorContent>
      ) : (
        <Empty className="h-full p-4">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Inspect />
            </EmptyMedia>
            <EmptyTitle>{isLoading ? "Loading documents" : "Select a document"}</EmptyTitle>
            <EmptyDescription>
              {isLoading ? "Document details are loading." : "Choose a source document to inspect its metadata and chunks."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </RecordInspectorShell>
  );
}

export function Inspector({
  details,
  domains,
  isBusy,
  onAddRelatedClaim,
  onAddRelatedRelation,
  onClear
}: {
  details: SelectedDetails;
  domains: DomainRecord[];
  isBusy: boolean;
  onAddRelatedClaim: (targetId: string) => void;
  onAddRelatedRelation: (sourceId: string) => void;
  onClear: () => void;
}) {
  const selectedKindLabel = details ? (details.kind === "item" ? classLabel(details.itemTable) : "Edge") : "Inspector";
  const selectedEyebrow = selectedKindLabel.toUpperCase();
  const domainLabel = details ? domains.find((domain) => domain.id === details.domainId)?.label ?? "No domain" : "";

  return (
    <RecordInspectorShell>
      {details ? (
        <RecordInspectorContent>
          <InspectorHero
            eyebrow={selectedEyebrow}
            title={details.title}
            onClear={onClear}
          />
          <InspectorSection
            title="Overview"
            variant={
              details.kind === "edge"
                ? "triple"
                : details.kind === "item" && details.itemTable === "claims"
                  ? "triple"
                  : details.kind === "item" && isKnowledgeCard(details.itemTable)
                    ? "compact"
                    : "grid"
            }
          >
            <InspectorReadField label="Domain" value={domainLabel} />
            <InspectorReadField label="Class" value={details.kind === "item" ? singularClassLabel(details.itemTable) : "Edge"} />
            <InspectorReadField label="Type" value={displayTypeLabel(details.typeLabel)} />
            {details.kind === "item" && isKnowledgeCard(details.itemTable) ? (
              <InspectorReadField label="Role" value={details.record.item.role || "None"} />
            ) : null}
            {details.kind === "edge" ? (
              <>
                <InspectorReadField label="Source" value={details.sourceLabel} />
                <InspectorReadField label="Target" value={details.targetLabel} />
              </>
            ) : null}
          </InspectorSection>
          {details.kind === "edge" && details.record.edge.label ? (
            <InspectorSection title="Relationship" variant="single">
              <InspectorReadField label="Label" value={details.record.edge.label} wide />
            </InspectorSection>
          ) : null}
          {details.kind === "item" && details.record.item.description ? (
            <InspectorSection title="Description" variant="single">
              <InspectorReadField label="Description" value={details.record.item.description} wide />
            </InspectorSection>
          ) : null}
          {details.kind === "item" ? <ItemMetadataSections details={details} /> : null}
          {details.kind === "item" && details.itemTable === "claims" ? <ClaimTargetPanels details={details} /> : null}
          {details.kind === "item" && hasRelatedInspector(details.itemTable) ? (
            <NodeRelatedPanels
              details={details}
              isBusy={isBusy}
              onAddClaim={() => onAddRelatedClaim(details.id)}
              onAddRelation={() => onAddRelatedRelation(details.id)}
            />
          ) : null}
        </RecordInspectorContent>
      ) : (
        <Empty className="h-full p-4">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Inspect />
            </EmptyMedia>
            <EmptyTitle>Nothing selected</EmptyTitle>
            <EmptyDescription>Select an item or edge to inspect its graph data.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </RecordInspectorShell>
  );
}

function InspectorHero({
  canClear = true,
  eyebrow,
  title,
  onClear
}: {
  canClear?: boolean;
  eyebrow: string;
  title: string;
  onClear: () => void;
}) {
  return (
    <RecordInspectorHero
      action={
        canClear ? (
          <Button aria-label="Clear selection" onClick={onClear} size="icon-sm" type="button" variant="ghost">
            <X />
          </Button>
        ) : null
      }
      eyebrow={eyebrow}
      title={title}
    />
  );
}

function InspectorSection({
  children,
  title,
  variant = "grid"
}: {
  children: ReactNode;
  title: string;
  variant?: "grid" | "single" | "compact" | "triple";
}) {
  return (
    <RecordInspectorSection title={title} variant={variant}>
      {children}
    </RecordInspectorSection>
  );
}

function InspectorReadField({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return <RecordInspectorField label={label} value={value} wide={wide} />;
}

function ItemMetadataSections({ details }: { details: Extract<SelectedDetails, { kind: "item" }> }) {
  const item = details.record.item;

  if (details.itemTable === "claims") {
    return item.claim_text ? (
      <InspectorSection title="Claim text" variant="single">
        <InspectorReadField label="Claim text" value={item.claim_text} wide />
      </InspectorSection>
    ) : null;
  }

  if (details.itemTable === "documents") {
    return (
      <InspectorSection title="Document">
        <InspectorReadField label="Aliases" value={displayList(item.aliases)} />
        {item.intake_profile ? <InspectorReadField label="Intake profile" value={item.intake_profile} /> : null}
        {item.size_bytes !== null ? <InspectorReadField label="Size" value={formatBytes(item.size_bytes)} /> : null}
        {item.source ? <InspectorReadField label="Source" value={item.source} wide /> : null}
      </InspectorSection>
    );
  }

  if (!isKnowledgeCard(details.itemTable)) {
    return details.summary ? (
      <InspectorSection title="Source">
        <InspectorReadField label="Source" value={details.summary} wide />
      </InspectorSection>
    ) : null;
  }

  return item.source || item.last_updated ? (
    <InspectorSection title="Source">
      {item.source ? <InspectorReadField label="Source" value={item.source} wide /> : null}
      {item.last_updated ? <InspectorReadField label="Last updated" value={item.last_updated} /> : null}
    </InspectorSection>
  ) : null;
}

function InspectorShardSection({ shards }: { shards: DocumentShardRecord[] }) {
  return (
    <InspectorSection title="Shards">
      {shards.length > 0 ? (
        <RecordInspectorList>
          {shards.map((shard) => (
            <RecordInspectorListItem key={shard.id} title={`Chunk ${shard.position + 1}`}>
              <>
                {formatBytes(shard.size_bytes)}
                {shard.heading_path.length > 0 ? ` - ${shard.heading_path.join(" / ")}` : ""}
              </>
            </RecordInspectorListItem>
          ))}
        </RecordInspectorList>
      ) : (
        <RecordInspectorStub>No readable shards found.</RecordInspectorStub>
      )}
    </InspectorSection>
  );
}

type RelatedMode = "aliases" | "claims" | "relations";

function NodeRelatedPanels({
  details,
  isBusy,
  onAddClaim,
  onAddRelation
}: {
  details: Extract<SelectedDetails, { kind: "item" }>;
  isBusy: boolean;
  onAddClaim: () => void;
  onAddRelation: () => void;
}) {
  const aliases = parseListValue(details.record.item.aliases);
  const [activeMode, setActiveMode] = useState<RelatedMode>("claims");
  const modes = [
    { id: "claims" as const, label: "Claims", count: details.relatedClaims.length },
    { id: "aliases" as const, label: "Aliases", count: aliases.length },
    { id: "relations" as const, label: "Relations", count: details.relatedEdges.length }
  ];
  const canAdd = activeMode === "claims" || activeMode === "relations";
  const addLabel = activeMode === "claims" ? "Add claim" : "Add relation";

  return (
    <RecordInspectorRelatedCard
      action={
        canAdd ? (
          <Button
            aria-label={addLabel}
            disabled={isBusy}
            onClick={activeMode === "claims" ? onAddClaim : onAddRelation}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <Plus />
          </Button>
        ) : null
      }
      title="Related"
    >
      <RelatedTabs activeMode={activeMode} label="Related records" modes={modes} onChange={setActiveMode} />
      <div className="min-h-0 overflow-y-auto pr-1" role="tabpanel">
        {activeMode === "claims" ? <RelatedClaims claims={details.relatedClaims} /> : null}
        {activeMode === "aliases" ? <RelatedAliases aliases={aliases} itemTable={details.itemTable} /> : null}
        {activeMode === "relations" ? <RelatedRelations edges={details.relatedEdges} /> : null}
      </div>
    </RecordInspectorRelatedCard>
  );
}

function ClaimTargetPanels({ details }: { details: Extract<SelectedDetails, { kind: "item" }> }) {
  const [activeMode, setActiveMode] = useState<"targets" | "relations">("targets");
  const modes = [
    { id: "targets" as const, label: "Targets", count: details.relatedTargets.length },
    { id: "relations" as const, label: "Relations", count: details.relatedEdges.length }
  ];

  return (
    <RecordInspectorRelatedCard title="Claim targets">
      <RelatedTabs activeMode={activeMode} label="Claim target records" modes={modes} onChange={setActiveMode} />
      <div className="min-h-0 overflow-y-auto pr-1" role="tabpanel">
        {activeMode === "targets" ? <RelatedTargets targets={details.relatedTargets} /> : null}
        {activeMode === "relations" ? <RelatedRelations edges={details.relatedEdges} /> : null}
      </div>
    </RecordInspectorRelatedCard>
  );
}

function RelatedTabs<TMode extends string>({
  activeMode,
  label,
  modes,
  onChange
}: {
  activeMode: TMode;
  label: string;
  modes: { count: number; id: TMode; label: string }[];
  onChange: (mode: TMode) => void;
}) {
  return (
    <div className={cn("grid gap-1 rounded-lg bg-muted/40 p-1", modes.length === 2 ? "grid-cols-2" : "grid-cols-3")} role="tablist" aria-label={label}>
      {modes.map((mode) => (
        <button
          aria-selected={activeMode === mode.id}
          className={cn(
            "inline-flex h-7 min-w-0 items-center justify-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground",
            activeMode === mode.id && "bg-background text-foreground shadow-sm"
          )}
          key={mode.id}
          onClick={() => onChange(mode.id)}
          role="tab"
          type="button"
        >
          <span className="truncate">{mode.label}</span>
          <strong className="font-semibold">{mode.count}</strong>
        </button>
      ))}
    </div>
  );
}

function RelatedAliases({ aliases, itemTable }: { aliases: string[]; itemTable: string }) {
  if (aliases.length === 0) {
    return (
      <RecordInspectorRelatedEmpty title="No aliases">
        This {singularItemLabel(itemTable).toLowerCase()} does not have records in this class yet.
      </RecordInspectorRelatedEmpty>
    );
  }

  return (
    <RecordInspectorList>
      {aliases.map((alias, index) => (
        <RecordInspectorListItem key={`${alias}-${index}`} title={alias} />
      ))}
    </RecordInspectorList>
  );
}

function RelatedTargets({ targets }: { targets: GraphItemRecord[] }) {
  if (targets.length === 0) {
    return (
      <RecordInspectorRelatedEmpty title="No targets">This claim does not have any target records yet.</RecordInspectorRelatedEmpty>
    );
  }

  return (
    <RecordInspectorList>
      {targets.map((target) => (
        <RecordInspectorListItem key={target.id} title={target.label}>
          <>
            {singularClassLabel(target.item_table)}
            {target.type ? ` - ${displayTypeLabel(target.type)}` : ""}
          </>
        </RecordInspectorListItem>
      ))}
    </RecordInspectorList>
  );
}

function RelatedClaims({ claims }: { claims: GraphItemRecord[] }) {
  if (claims.length === 0) {
    return (
      <RecordInspectorRelatedEmpty title="No claims">No claims target this record yet.</RecordInspectorRelatedEmpty>
    );
  }

  return (
    <RecordInspectorList>
      {claims.map((claim) => (
        <RecordInspectorListItem key={claim.id} title={claim.type}>
          {claim.claim_text}
        </RecordInspectorListItem>
      ))}
    </RecordInspectorList>
  );
}

function RelatedRelations({ edges }: { edges: GraphEdgeRecord[] }) {
  if (edges.length === 0) {
    return (
      <RecordInspectorRelatedEmpty title="No relations">No relationships are linked to this record yet.</RecordInspectorRelatedEmpty>
    );
  }

  return (
    <RecordInspectorList>
      {edges.map((edge) => (
        <RecordInspectorListItem key={edge.id} title={edge.type}>
          <>
            {edge.source_label ?? edge.source_id} {"->"} {edge.target_label ?? edge.target_id}
          </>
        </RecordInspectorListItem>
      ))}
    </RecordInspectorList>
  );
}

export type SelectedDetails =
  | {
      claimText: string | null;
      color: string;
      domainId: string | null;
      id: string;
      itemTable: string;
      kind: "item";
      relatedClaims: GraphItemRecord[];
      relatedEdges: GraphEdgeRecord[];
      relatedTargets: GraphItemRecord[];
      record: { item: GraphItemRecord | ViewItemRecord; viewItem: ViewItemRecord | null };
      source: string | null;
      summary: string | null;
      title: string;
      typeLabel: string;
    }
  | {
      color: string;
      domainId: string | null;
      id: string;
      itemTable: string;
      kind: "edge";
      record: { edge: GraphEdgeRecord | ViewEdgeRecord; viewEdge: ViewEdgeRecord | null };
      source: string | null;
      sourceLabel: string;
      summary: string | null;
      targetLabel: string;
      title: string;
      typeLabel: string;
    }
  | null;

function singularClassLabel(itemTable: string) {
  const labels: Record<string, string> = {
    claims: "Claim",
    clusters: "Cluster",
    concepts: "Concept",
    documents: "Document",
    domains: "Domain",
    edges: "Edge",
    entities: "Entity",
    nodes: "Subject",
    references: "Reference",
    types: "Type"
  };

  return labels[itemTable] ?? classLabel(itemTable).replace(/s$/i, "");
}

function displayTypeLabel(type: string | null | undefined) {
  const normalized = type?.trim();

  if (!normalized) {
    return "None";
  }

  return normalized.replace(/[_-]/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function hasRelatedInspector(itemTable: string) {
  return itemTable === "nodes";
}

function singularItemLabel(itemTable: string) {
  const labels: Record<string, string> = {
    concepts: "Concept",
    entities: "Entity",
    nodes: "Subject"
  };

  return labels[itemTable] ?? classLabel(itemTable).replace(/s$/i, "");
}

function isKnowledgeCard(itemTable: string) {
  return ["concepts", "entities", "clusters", "domains", "references", "nodes"].includes(itemTable);
}

function displayList(value: string | null | undefined) {
  const items = parseListValue(value);

  return items.length > 0 ? items.join(", ") : "None";
}

function humanizeSourceType(sourceType: DocumentRecord["source_type"]) {
  return sourceType === "html" ? "HTML" : "Markdown";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
