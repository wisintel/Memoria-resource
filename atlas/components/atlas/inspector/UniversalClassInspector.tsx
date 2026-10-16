"use client";

import {
  createClassTableRow,
  deleteClassTableRow,
  updateClassTableRow,
  type ClassTableRowMutationState,
} from "@/app/atlas/actions";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import {
  formatTableValue,
  type ReferenceLabels,
} from "@/components/atlas/utils/table-formatting";
import {
  InspectorField,
  InspectorFields,
  InspectorForm,
  InspectorFormFooter,
} from "./InspectorBlocks";
import { InspectorRail, InspectorRailSection } from "./InspectorRail";
import { InspectorFieldList } from "./fields/InspectorFieldList";
import {
  buildReferenceOptions,
  type ReferenceOptions,
} from "./fields/reference-options";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldTitle,
} from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow as UiTableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  getClassTableTemplate,
  getMutableClassTableTemplate,
  isKnownClassTableName,
  rowTemplateTitle,
  type ClassTableFieldTemplate,
  type ClassTableTemplate,
  type KnownClassTableName,
} from "@/lib/class-table-templates";
import { deriveToc, type TocEntry } from "@/lib/document-toc";
import type {
  ClassRecord,
  ClassTableSamples,
  DocumentShardRecord,
  TableRow,
  TableValue,
  ViewRecordCounts,
} from "@/lib/supabase/client";
import { createSupabaseClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import {
  type ComponentProps,
  useCallback,
  useActionState,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";

type UniversalClassInspectorProps = {
  classes: ClassRecord[];
  createTargetTableName: string | null;
  documentShardsByDocumentId: Record<string, DocumentShardRecord[]>;
  domainName: string | null;
  editing: boolean;
  onCreateTargetChange: (tableName: string | null) => void;
  onEditingChange: (editing: boolean) => void;
  selectedDomainId: string | null;
  selectedClassTableName: string | null;
  selectedRecordId: string | null;
  selectedViewId: string | null;
  tableSamples: ClassTableSamples;
  viewRecordCounts: ViewRecordCounts;
};

type SelectedRecordState = {
  error: string | null;
  recordId: string;
  row: TableRow | null;
  tableName: KnownClassTableName;
};

export function UniversalClassInspector({
  classes,
  createTargetTableName,
  documentShardsByDocumentId,
  domainName,
  editing,
  onCreateTargetChange,
  onEditingChange,
  selectedDomainId,
  selectedClassTableName,
  selectedRecordId,
  selectedViewId,
  tableSamples,
  viewRecordCounts,
}: UniversalClassInspectorProps) {
  const selectedClass =
    classes.find(
      (classRecord) => classRecord.table_name === selectedClassTableName,
    ) ?? null;
  const selectedSample = selectedClass
    ? (tableSamples[selectedClass.table_name] ?? null)
    : null;
  const selectedTableName =
    selectedClass && isKnownClassTableName(selectedClass.table_name)
      ? selectedClass.table_name
      : null;
  const selectedSampleRow =
    selectedSample?.rows.find(
      (row) => stringValue(row.id) === selectedRecordId,
    ) ?? null;
  const [selectedRecordState, setSelectedRecordState] =
    useState<SelectedRecordState | null>(null);
  const selectedExactRow =
    selectedRecordState?.tableName === selectedTableName &&
    selectedRecordState.recordId === selectedRecordId
      ? selectedRecordState.row
      : null;
  const selectedRow = selectedExactRow ?? selectedSampleRow;
  const referenceLabels = buildReferenceLabels(tableSamples);
  const referenceOptions = useMemo(
    () => buildReferenceOptions(tableSamples),
    [tableSamples],
  );
  const createTargetClass =
    classes.find(
      (classRecord) => classRecord.table_name === createTargetTableName,
    ) ?? null;
  const createTargetTemplate = createTargetClass
    ? getMutableClassTableTemplate(createTargetClass.table_name)
    : null;
  const domainClass =
    classes.find((classRecord) => classRecord.table_name === "domains") ?? null;
  const domainTemplate = getMutableClassTableTemplate("domains");
  const selectedDomainRow =
    selectedDomainId && domainClass
      ? (tableSamples.domains?.rows.find(
          (row) => stringValue(row.id) === selectedDomainId,
        ) ?? null)
      : null;

  useEffect(() => {
    if (!selectedTableName || !selectedRecordId) {
      return;
    }

    const template = getClassTableTemplate(selectedTableName);

    if (!template) {
      return;
    }

    const tableName = selectedTableName;
    const recordId = selectedRecordId;
    let cancelled = false;
    const fields = mergeFields(
      [...template.previewFields],
      selectedSample?.fields ?? [],
    );

    async function loadSelectedRecord() {
      const { data, error } = await createSupabaseClient()
        .from(tableName)
        .select(fields.join(","))
        .eq("id", recordId)
        .maybeSingle();

      if (cancelled) {
        return;
      }

      setSelectedRecordState({
        error: error?.message ?? null,
        recordId,
        row: (data ?? null) as unknown as TableRow | null,
        tableName,
      });
    }

    void loadSelectedRecord();

    return () => {
      cancelled = true;
    };
  }, [selectedRecordId, selectedSample?.fields, selectedTableName]);

  if (createTargetClass && createTargetTemplate?.createFields?.length) {
    return (
      <CreateInspector
        onCancel={() => onCreateTargetChange(null)}
        onSaved={() => onCreateTargetChange(null)}
        referenceOptions={referenceOptions}
        selectedClass={createTargetClass}
        selectedDomainId={selectedDomainId}
        template={createTargetTemplate}
      />
    );
  }

  if (selectedClass && selectedRow) {
    const template = getClassTableTemplate(selectedClass.table_name);
    const mutableTemplate = getMutableClassTableTemplate(
      selectedClass.table_name,
    );
    const orderedFields = mergeFields(
      selectedSample?.fields ?? [],
      Object.keys(selectedRow),
    );
    const title = template
      ? rowTemplateTitle(selectedRow, template)
      : rowTitle(selectedRow);

    if (selectedClass.table_name === "entities") {
      const selectedEntityId = stringValue(selectedRow.id);
      const aliasClass =
        classes.find(
          (classRecord) => classRecord.table_name === "entity_aliases",
        ) ?? null;
      const claimClass =
        classes.find((classRecord) => classRecord.table_name === "claims") ??
        null;
      const relationshipClass =
        classes.find(
          (classRecord) => classRecord.table_name === "relationships",
        ) ?? null;
      const targetClaims = (tableSamples.claims?.rows ?? []).filter((claim) => {
        const targetEntityIds = claim.target_entity_ids;

        return (
          Array.isArray(targetEntityIds) &&
          targetEntityIds.includes(selectedEntityId)
        );
      });
      const entityAliases = (tableSamples.entity_aliases?.rows ?? []).filter(
        (alias) => stringValue(alias.entity_id) === selectedEntityId,
      );
      const entityRelationships = (
        tableSamples.relationships?.rows ?? []
      ).filter(
        (relationship) =>
          stringValue(relationship.source_record_id) === selectedEntityId ||
          stringValue(relationship.target_record_id) === selectedEntityId,
      );

      return (
        <CompactInspector
          editing={editing}
          eyebrow={classDisplayLabel(selectedClass)}
          onEditingChange={onEditingChange}
          referenceLabels={referenceLabels}
          referenceOptions={referenceOptions}
          row={selectedRow}
          rows={[
            [
              { field: "domain_id", label: "Domain" },
              { field: "status_id", label: "Status" },
              { field: "type_id", label: "Type" },
            ],
          ]}
          selectedClass={selectedClass}
          template={mutableTemplate}
          title={title}
        >
          <EntityRelatedRecordsBox
            aliasClass={aliasClass}
            aliases={entityAliases}
            claimClass={claimClass}
            claims={targetClaims}
            referenceLabels={referenceLabels}
            referenceOptions={referenceOptions}
            relationshipClass={relationshipClass}
            relationships={entityRelationships}
            selectedEntity={selectedRow}
          />
        </CompactInspector>
      );
    }

    if (selectedClass.table_name === "claims") {
      return (
        <CompactInspector
          editing={editing}
          eyebrow={classDisplayLabel(selectedClass)}
          onEditingChange={onEditingChange}
          referenceLabels={referenceLabels}
          referenceOptions={referenceOptions}
          row={selectedRow}
          rows={[
            [
              { field: "domain_id", label: "Domain" },
              { field: "status_id", label: "Status" },
            ],
            [
              { field: "type_id", label: "Type" },
              { field: "slug", label: "Slug" },
            ],
            [
              { field: "source_document_id", label: "Source" },
              { field: "target_entity_ids", label: "Targets" },
            ],
          ]}
          selectedClass={selectedClass}
          template={mutableTemplate}
          title={title}
        >
          <InspectorNote
            label="Claim"
            value={stringValue(selectedRow.claim_text)}
          />
        </CompactInspector>
      );
    }

    if (selectedClass.table_name === "documents") {
      const documentShards =
        documentShardsByDocumentId[stringValue(selectedRow.id)] ?? [];
      const documentToc = deriveToc(documentShards);

      return (
        <CompactInspector
          editing={editing}
          eyebrow={classDisplayLabel(selectedClass)}
          onEditingChange={onEditingChange}
          referenceLabels={referenceLabels}
          referenceOptions={referenceOptions}
          row={selectedRow}
          rows={[
            [
              { field: "domain_id", label: "Domain" },
              { field: "status", label: "Status" },
            ],
            [
              { field: "type_id", label: "Type" },
              { field: "source_type", label: "Source" },
            ],
            [
              { field: "source_type", label: "Source" },
              { field: "shard_count", label: "Shards" },
            ],
          ]}
          selectedClass={selectedClass}
          template={mutableTemplate}
          title={title}
        >
          <InspectorNote
            label="Document title"
            value={stringValue(selectedRow.title)}
          />
          {stringValue(selectedRow.source_filename) ? (
            <InspectorNote
              label="Filename"
              value={stringValue(selectedRow.source_filename)}
            />
          ) : null}
          <DocumentToc toc={documentToc} />
        </CompactInspector>
      );
    }

    if (selectedClass.table_name === "domains") {
      return (
        <DomainInspector
          documentShardsByDocumentId={documentShardsByDocumentId}
          domainClass={selectedClass}
          domainTemplate={mutableTemplate}
          editing={editing}
          onEditingChange={onEditingChange}
          referenceLabels={referenceLabels}
          referenceOptions={referenceOptions}
          selectedDomainRow={selectedRow}
          selectedViewId={selectedViewId}
          tableSamples={tableSamples}
          viewRecordCounts={viewRecordCounts}
        />
      );
    }

    if (selectedClass.table_name === "relationships") {
      return (
        <CompactInspector
          editing={editing}
          eyebrow={classDisplayLabel(selectedClass)}
          onEditingChange={onEditingChange}
          referenceLabels={referenceLabels}
          referenceOptions={referenceOptions}
          row={selectedRow}
          rows={[
            [
              { field: "domain_id", label: "Domain" },
              { field: "status_id", label: "Status" },
            ],
            [
              { field: "type_id", label: "Type" },
              { field: "label", label: "Label" },
            ],
            [
              { field: "source_record_id", label: "Source" },
              { field: "target_record_id", label: "Target" },
            ],
          ]}
          selectedClass={selectedClass}
          template={mutableTemplate}
          title={title}
        />
      );
    }

    if (selectedClass.table_name === "entity_aliases") {
      return (
        <CompactInspector
          editing={editing}
          eyebrow={classDisplayLabel(selectedClass)}
          onEditingChange={onEditingChange}
          referenceLabels={referenceLabels}
          referenceOptions={referenceOptions}
          row={selectedRow}
          rows={[
            [
              { field: "domain_id", label: "Domain" },
              { field: "status_id", label: "Status" },
            ],
            [
              { field: "entity_id", label: "Subject" },
              { field: "source_document_id", label: "Source" },
            ],
            [{ field: "normalized_alias", label: "Normalized" }],
          ]}
          selectedClass={selectedClass}
          template={mutableTemplate}
          title={title}
        />
      );
    }

    if (selectedClass.table_name === "kinds") {
      return (
        <CompactInspector
          editing={editing}
          eyebrow={classDisplayLabel(selectedClass)}
          onEditingChange={onEditingChange}
          referenceLabels={referenceLabels}
          referenceOptions={referenceOptions}
          row={selectedRow}
          rows={[
            [
              { field: "domain_id", label: "Domain" },
              { field: "status_id", label: "Status" },
            ],
            [
              { field: "class_id", label: "Class" },
              { field: "type_id", label: "Type" },
            ],
            [{ field: "slug", label: "Slug" }],
          ]}
          selectedClass={selectedClass}
          template={mutableTemplate}
          title={title}
        />
      );
    }

    if (selectedClass.table_name === "types") {
      return (
        <CompactInspector
          editing={editing}
          eyebrow={classDisplayLabel(selectedClass)}
          onEditingChange={onEditingChange}
          referenceLabels={referenceLabels}
          referenceOptions={referenceOptions}
          row={selectedRow}
          rows={[
            [
              { field: "class_id", label: "Class" },
              { field: "status_id", label: "Status" },
            ],
            [{ field: "slug", label: "Slug" }],
          ]}
          selectedClass={selectedClass}
          template={mutableTemplate}
          title={title}
        />
      );
    }

    if (selectedClass.table_name === "statuses") {
      return (
        <CompactInspector
          editing={editing}
          eyebrow={classDisplayLabel(selectedClass)}
          onEditingChange={onEditingChange}
          referenceLabels={referenceLabels}
          referenceOptions={referenceOptions}
          row={selectedRow}
          rows={[
            [
              { field: "class_id", label: "Class" },
              { field: "slug", label: "Slug" },
            ],
          ]}
          selectedClass={selectedClass}
          template={mutableTemplate}
          title={title}
        />
      );
    }

    return (
      <InspectorRail>
        <InspectorRailSection eyebrow={classDisplayLabel(selectedClass)} title={title}>
          <InspectorFields>
            {orderedFields.map((field) => (
              <InspectorField
                key={field}
                label={field}
                value={formatTableValue(
                  selectedRow[field],
                  field,
                  referenceLabels,
                )}
              />
            ))}
          </InspectorFields>
        </InspectorRailSection>
      </InspectorRail>
    );
  }

  if (domainClass && selectedDomainRow) {
    return (
      <DomainInspector
        documentShardsByDocumentId={documentShardsByDocumentId}
        domainClass={domainClass}
        domainTemplate={domainTemplate}
        editing={editing}
        onEditingChange={onEditingChange}
        referenceLabels={referenceLabels}
        referenceOptions={referenceOptions}
        selectedDomainRow={selectedDomainRow}
        selectedViewId={selectedViewId}
        tableSamples={tableSamples}
        viewRecordCounts={viewRecordCounts}
      />
    );
  }

  return (
    <InspectorRail>
      <InspectorRailSection
        eyebrow="Domain"
        lede
        title={domainName ?? "No domain selected"}
      >
        <p>Select a domain to inspect its details.</p>
      </InspectorRailSection>
    </InspectorRail>
  );
}

type InspectorField = {
  field: string;
  label: string;
};

type DomainMetricItem = {
  label: string;
  value: number;
};

type DomainTokenEstimate = {
  differenceTokens: number;
  graphTokens: number;
  sourceTokens: number;
};

function DomainInspector({
  documentShardsByDocumentId,
  domainClass,
  domainTemplate,
  editing,
  onEditingChange,
  referenceLabels,
  referenceOptions,
  selectedDomainRow,
  selectedViewId,
  tableSamples,
  viewRecordCounts,
}: {
  documentShardsByDocumentId: Record<string, DocumentShardRecord[]>;
  domainClass: ClassRecord;
  domainTemplate: ClassTableTemplate | null;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  referenceLabels: ReferenceLabels;
  referenceOptions: ReferenceOptions;
  selectedDomainRow: TableRow;
  selectedViewId: string | null;
  tableSamples: ClassTableSamples;
  viewRecordCounts: ViewRecordCounts;
}) {
  const domainId = stringValue(selectedDomainRow.id);
  const domainInventory = [
    {
      label: "Views",
      value: sampleCount(tableSamples.views, domainId),
    },
    {
      label: "Subjects",
      value: sampleCount(tableSamples.entities, domainId),
    },
    {
      label: "Claims",
      value: sampleCount(tableSamples.claims, domainId),
    },
    {
      label: "Relationships",
      value: sampleCount(tableSamples.relationships, domainId),
    },
    {
      label: "Documents",
      value: sampleCount(tableSamples.documents, domainId),
    },
  ];
  const tokenEstimate = estimateDomainTokens({
    documentShardsByDocumentId,
    domainId,
    tableSamples,
  });
  const currentViewInventory = selectedViewId
    ? [
        {
          label: "Nodes",
          value:
            viewRecordCounts.nodes ??
            viewCount(tableSamples.view_nodes?.rows, selectedViewId),
        },
        {
          label: "Edges",
          value:
            viewRecordCounts.edges ??
            viewCount(tableSamples.view_relationships?.rows, selectedViewId),
        },
      ]
    : [];
  const selectedViewRow = selectedViewId
    ? (tableSamples.views?.rows.find(
        (row) => stringValue(row.id) === selectedViewId,
      ) ?? null)
    : null;
  const selectedViewTemplate = getClassTableTemplate("views");
  const selectedViewTitle = selectedViewRow
    ? selectedViewTemplate
      ? rowTemplateTitle(selectedViewRow, selectedViewTemplate)
      : rowTitle(selectedViewRow)
    : "Selected view";

  return (
    <CompactInspector
      editing={editing}
      eyebrow={domainClass.label}
      onEditingChange={onEditingChange}
      referenceLabels={referenceLabels}
      referenceOptions={referenceOptions}
      row={selectedDomainRow}
      rows={[
        [
          { field: "core_entity_id", label: "Core subject" },
          { field: "domain_type_id", label: "Domain type" },
          { field: "status_id", label: "Status" },
        ],
      ]}
      selectedClass={domainClass}
      template={domainTemplate}
      title={
        domainTemplate
          ? rowTemplateTitle(selectedDomainRow, domainTemplate)
          : rowTitle(selectedDomainRow)
      }
    >
      <DomainInventoryPanel items={domainInventory} />
      <DomainTokenEstimatePanel estimate={tokenEstimate} />
      {currentViewInventory.length > 0 ? (
        <DomainCurrentViewPanel
          items={currentViewInventory}
          title={selectedViewTitle}
        />
      ) : null}
    </CompactInspector>
  );
}

function DomainInventoryPanel({ items }: { items: DomainMetricItem[] }) {
  const maxValue = Math.max(...items.map((item) => item.value), 1);
  const totalValue = items.reduce((total, item) => total + item.value, 0);

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Inventory</CardTitle>
        <CardAction>
          <Badge variant="secondary">{totalValue}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col">
        {items.map((item) => (
          <FieldGroup
            className="grid min-h-12 grid-cols-[minmax(84px,0.88fr)_minmax(78px,1fr)_2rem] items-center gap-3 border-b border-border last:border-b-0"
            key={item.label}
          >
            <FieldTitle className="min-w-0 truncate text-sm font-semibold text-foreground">
              {item.label}
            </FieldTitle>
            <Progress
              aria-label={`${item.label} inventory`}
              className="w-full"
              value={
                item.value > 0 ? Math.max(12, (item.value / maxValue) * 100) : 0
              }
            />
            <FieldTitle className="justify-self-end text-right font-mono text-lg font-semibold text-primary tabular-nums">
              {item.value}
            </FieldTitle>
          </FieldGroup>
        ))}
      </CardContent>
    </Card>
  );
}

function DomainTokenEstimatePanel({
  estimate,
}: {
  estimate: DomainTokenEstimate;
}) {
  const differenceTone =
    estimate.differenceTokens >= 0 ? "text-primary" : "text-destructive";

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Token estimate</CardTitle>
        <CardAction>
          <Badge variant="outline">Approx.</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col">
        <TokenEstimateRow label="Source docs" value={estimate.sourceTokens} />
        <TokenEstimateRow label="Graph data" value={estimate.graphTokens} />
        <FieldGroup className="grid min-h-12 grid-cols-[minmax(120px,1fr)_auto] items-center gap-3 border-t border-border">
          <div className="min-w-0">
            <FieldTitle className="text-sm font-semibold text-foreground">
              Difference
            </FieldTitle>
            <FieldDescription>Source docs minus graph data</FieldDescription>
          </div>
          <FieldTitle
            className={cn(
              "justify-self-end text-right font-mono text-lg font-semibold tabular-nums",
              differenceTone,
            )}
          >
            {formatSignedTokenEstimate(estimate.differenceTokens)}
          </FieldTitle>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

function TokenEstimateRow({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <FieldGroup className="grid min-h-12 grid-cols-[minmax(120px,1fr)_auto] items-center gap-3 border-b border-border last:border-b-0">
      <FieldTitle className="min-w-0 truncate text-sm font-semibold text-foreground">
        {label}
      </FieldTitle>
      <FieldTitle className="justify-self-end text-right font-mono text-lg font-semibold text-primary tabular-nums">
        {formatTokenEstimate(value)}
      </FieldTitle>
    </FieldGroup>
  );
}

function DomainCurrentViewPanel({
  items,
  title,
}: {
  items: DomainMetricItem[];
  title: string;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardAction>
          <Badge variant="outline">Current view</Badge>
        </CardAction>
      </CardHeader>
      <Separator />
      <CardContent>
        <FieldGroup className="grid grid-cols-2">
          {items.map((item) => (
            <Field
              className="grid min-w-0 gap-2 border-l border-border pl-5 first:border-l-0 first:pl-0"
              key={item.label}
            >
              <FieldTitle className="text-3xl font-semibold leading-none text-foreground tabular-nums">
                {item.value}
              </FieldTitle>
              <FieldDescription className="font-mono text-[11px] font-medium tracking-[0.2em] text-muted-foreground uppercase">
                {item.label}
              </FieldDescription>
            </Field>
          ))}
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

function InspectorActionButton({
  "aria-label": ariaLabel,
  children,
  disabled,
  tooltip,
  ...props
}: Omit<ComponentProps<typeof Button>, "title"> & {
  tooltip: string;
}) {
  const button = (
    <Button aria-label={ariaLabel ?? tooltip} disabled={disabled} {...props}>
      {children}
    </Button>
  );

  return (
    <Tooltip>
      {disabled ? (
        <TooltipTrigger render={<span className="inline-flex" />}>
          {button}
        </TooltipTrigger>
      ) : (
        <TooltipTrigger render={button} />
      )}
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function sampleCount(
  sample: ClassTableSamples[string] | undefined,
  domainId: string,
) {
  if (typeof sample?.count === "number") {
    return sample.count;
  }

  return (sample?.rows ?? []).filter((row) => {
    const rowDomainId = stringValue(row.domain_id);

    return !rowDomainId || !domainId || rowDomainId === domainId;
  }).length;
}

function viewCount(rows: TableRow[] | undefined, viewId: string) {
  return (rows ?? []).filter((row) => stringValue(row.view_id) === viewId)
    .length;
}

function estimateDomainTokens({
  documentShardsByDocumentId,
  domainId,
  tableSamples,
}: {
  documentShardsByDocumentId: Record<string, DocumentShardRecord[]>;
  domainId: string;
  tableSamples: ClassTableSamples;
}): DomainTokenEstimate {
  const documents = domainRows(tableSamples.documents, domainId);
  const sourceCharacterCount = documents.reduce((total, document) => {
    const documentId = stringValue(document.id);
    const shards = documentShardsByDocumentId[documentId] ?? [];

    if (shards.length > 0) {
      return total + shards.reduce((sum, shard) => sum + shard.body.length, 0);
    }

    return total + numberValue(document.size_bytes);
  }, 0);
  const graphCharacterCount = [
    ...serializedGraphRows(
      "entities",
      domainRows(tableSamples.entities, domainId),
    ),
    ...serializedGraphRows("claims", domainRows(tableSamples.claims, domainId)),
    ...serializedGraphRows(
      "relationships",
      domainRows(tableSamples.relationships, domainId),
    ),
  ].join("\n").length;
  const sourceTokens = estimateTokensFromCharacters(sourceCharacterCount);
  const graphTokens = estimateTokensFromCharacters(graphCharacterCount);

  return {
    differenceTokens: sourceTokens - graphTokens,
    graphTokens,
    sourceTokens,
  };
}

function domainRows(
  sample: ClassTableSamples[string] | undefined,
  domainId: string,
) {
  return (sample?.rows ?? []).filter((row) => {
    const rowDomainId = stringValue(row.domain_id);

    return !rowDomainId || rowDomainId === domainId;
  });
}

function serializedGraphRows(tableName: string, rows: TableRow[]) {
  return rows.map((row) =>
    JSON.stringify({
      table: tableName,
      ...compactGraphRow(row),
    }),
  );
}

function compactGraphRow(row: TableRow) {
  return Object.fromEntries(
    Object.entries(row)
      .filter(([key, value]) => {
        if (key === "created_at" || key === "updated_at" || key === "domain_id") {
          return false;
        }

        if (value === null || value === undefined || value === "") {
          return false;
        }

        return !Array.isArray(value) || value.length > 0;
      })
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function estimateTokensFromCharacters(characterCount: number) {
  return Math.ceil(characterCount / 4);
}

function numberValue(value: TableValue | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatTokenEstimate(value: number) {
  if (value >= 100_000) {
    return `${Math.round(value / 1000).toLocaleString()}k`;
  }

  if (value >= 10_000) {
    return `${(value / 1000).toFixed(1)}k`;
  }

  return value.toLocaleString();
}

function formatSignedTokenEstimate(value: number) {
  if (value === 0) {
    return "0";
  }

  return `${value > 0 ? "+" : "-"}${formatTokenEstimate(Math.abs(value))}`;
}

function CompactInspector({
  children,
  editing,
  eyebrow,
  onEditingChange,
  referenceLabels,
  referenceOptions,
  row,
  rows,
  selectedClass,
  template,
  title,
}: {
  children?: React.ReactNode;
  editing: boolean;
  eyebrow: string;
  onEditingChange: (editing: boolean) => void;
  referenceLabels: ReferenceLabels;
  referenceOptions: ReferenceOptions;
  row: TableRow;
  rows: InspectorField[][];
  selectedClass: ClassRecord;
  template: ClassTableTemplate | null;
  title: string;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();
  const canEdit = Boolean(template?.editFields?.length);
  const canDelete = Boolean(template?.deleteEnabled);
  const rowId = stringValue(row.id);

  function deleteInspectedRecord() {
    if (!template || !rowId) {
      return;
    }

    const formData = new FormData();
    formData.set("table_name", template.tableName);
    formData.set("id", rowId);

    startDeleteTransition(async () => {
      const result = await deleteClassTableRow(
        initialRowMutationState,
        formData,
      );

      if (!result.ok) {
        setDeleteError(result.error ?? "Record could not be deleted.");
        return;
      }

      setConfirmOpen(false);
      setDeleteError(null);
      onEditingChange(false);
      router.refresh();
    });
  }

  return (
    <>
      <InspectorRail>
        <InspectorRailSection
          eyebrow={eyebrow}
          meta={
            canEdit || canDelete ? (
              <>
                {canEdit ? (
                  <InspectorActionButton
                    aria-label={`Edit ${classDisplayLabel(selectedClass)}`}
                    onClick={() => onEditingChange(true)}
                    size="icon-xs"
                    tooltip={`Edit ${classDisplayLabel(selectedClass)}`}
                    type="button"
                    variant="ghost"
                  >
                    <Pencil aria-hidden={true} />
                  </InspectorActionButton>
                ) : null}
                {canDelete ? (
                  <InspectorActionButton
                    aria-label={`Delete ${classDisplayLabel(selectedClass)}`}
                    onClick={() => {
                      setDeleteError(null);
                      setConfirmOpen(true);
                    }}
                    size="icon-xs"
                    tooltip={`Delete ${classDisplayLabel(selectedClass)}`}
                    type="button"
                    variant="destructive"
                  >
                    <Trash2 aria-hidden={true} />
                  </InspectorActionButton>
                ) : null}
              </>
            ) : null
          }
          title={title}
        >
          {editing && canEdit && template ? (
            <ClassRecordEditForm
              key={rowId}
              referenceOptions={referenceOptions}
              row={row}
              selectedClass={selectedClass}
              template={template}
              onCancel={() => onEditingChange(false)}
              onSaved={() => onEditingChange(false)}
            />
          ) : (
            <FieldGroup>
              {rows.length > 0 ? (
                <InspectorAttributeGrid
                  referenceLabels={referenceLabels}
                  row={row}
                  rows={rows}
                />
              ) : null}
              {children}
            </FieldGroup>
          )}
        </InspectorRailSection>
      </InspectorRail>
      <ConfirmDialog
        confirmLabel={`Delete ${classDisplayLabel(selectedClass)}`}
        description={
          <>
            This will permanently remove{" "}
            <span className="text-foreground">{title}</span>.
          </>
        }
        isPending={isDeleting}
        onCancel={() => {
          if (!isDeleting) {
            setConfirmOpen(false);
            setDeleteError(null);
          }
        }}
        onConfirm={deleteInspectedRecord}
        open={confirmOpen}
        pendingLabel="Deleting..."
        title={`Delete ${classDisplayLabel(selectedClass)}?`}
        tone="destructive"
      >
        {deleteError ? <FieldError>{deleteError}</FieldError> : null}
      </ConfirmDialog>
    </>
  );
}

function CreateInspector({
  onCancel,
  onSaved,
  referenceOptions,
  selectedClass,
  selectedDomainId,
  template,
}: {
  onCancel: () => void;
  onSaved: () => void;
  referenceOptions: ReferenceOptions;
  selectedClass: ClassRecord;
  selectedDomainId: string | null;
  template: ClassTableTemplate;
}) {
  return (
    <InspectorRail>
      <InspectorRailSection
        eyebrow={classDisplayLabel(selectedClass)}
        title={`New ${classDisplayLabel(selectedClass)}`}
      >
        <ClassRecordCreateForm
          onCancel={onCancel}
          onSaved={onSaved}
          referenceOptions={referenceOptions}
          selectedClass={selectedClass}
          selectedDomainId={selectedDomainId}
          template={template}
        />
      </InspectorRailSection>
    </InspectorRail>
  );
}

type TocGroup = TocEntry & {
  children: TocEntry[];
};

function DocumentToc({ toc }: { toc: TocEntry[] }) {
  const groups = useMemo(() => groupTocByHeading(toc), [toc]);
  const [openGroupKeys, setOpenGroupKeys] = useState<Set<string>>(
    () => new Set(),
  );

  function toggleGroup(groupKey: string) {
    setOpenGroupKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);

      if (nextKeys.has(groupKey)) {
        nextKeys.delete(groupKey);
      } else {
        nextKeys.add(groupKey);
      }

      return nextKeys;
    });
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Outline</CardTitle>
        <CardAction>
          <Badge variant="secondary">{toc.length}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        {groups.length > 0 ? (
          <ScrollArea className="h-72">
            <nav aria-label="Document sections" className="pr-3">
              <ol className="grid gap-2">
                {groups.map((group) => {
                  const groupKey = group.anchorId;
                  const isOpen = openGroupKeys.has(groupKey);
                  const childListId = `atlas-toc-group-${group.anchorId}`;

                  return (
                    <li key={groupKey}>
                      <div className="flex items-start gap-1 rounded-lg border border-transparent hover:border-border/60 hover:bg-muted/35">
                        <a
                          className="min-w-0 flex-1 rounded-md px-2 py-2 text-sm leading-5 font-medium text-foreground transition hover:text-primary"
                          href={`#${group.anchorId}`}
                        >
                          {group.label}
                        </a>
                        {group.children.length > 0 ? (
                          <Button
                            aria-controls={childListId}
                            aria-expanded={isOpen}
                            aria-label={`${isOpen ? "Collapse" : "Expand"} ${group.label}`}
                            className="mt-1 text-muted-foreground"
                            onClick={() => toggleGroup(groupKey)}
                            size="icon-xs"
                            type="button"
                            variant="ghost"
                          >
                            <ChevronDown
                              className={cn(
                                "transition-transform",
                                isOpen && "rotate-180",
                              )}
                            />
                          </Button>
                        ) : null}
                      </div>
                      {group.children.length > 0 && isOpen ? (
                        <ol
                          className="mt-1 grid gap-1 border-l border-border/70 pl-3"
                          id={childListId}
                        >
                          {group.children.map((child) => (
                            <li key={child.anchorId}>
                              <a
                                className="block rounded-md px-2 py-1.5 text-xs leading-5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                                href={`#${child.anchorId}`}
                              >
                                {child.label}
                              </a>
                            </li>
                          ))}
                        </ol>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </nav>
          </ScrollArea>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No sections</EmptyTitle>
              <EmptyDescription>
                Sections appear when a document has Markdown headings.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  );
}

const initialRowMutationState: ClassTableRowMutationState = {
  error: null,
  ok: false,
};
const emptyEditFields: readonly ClassTableFieldTemplate[] = [];

function ClassRecordEditForm({
  onCancel,
  onSaved,
  referenceOptions,
  row,
  selectedClass,
  template,
}: {
  onCancel: () => void;
  onSaved: () => void;
  referenceOptions: ReferenceOptions;
  row: TableRow;
  selectedClass: ClassRecord;
  template: ClassTableTemplate;
}) {
  const router = useRouter();
  const editFields = template.editFields ?? emptyEditFields;
  const initialValues = useMemo(
    () => buildEditableValues(editFields, row, referenceOptions, template.tableName),
    [editFields, referenceOptions, row, template.tableName],
  );
  const [fieldValues, setFieldValues] =
    useState<Record<string, string>>(initialValues);
  const [state, formAction, pending] = useActionState(
    updateClassTableRow,
    initialRowMutationState,
  );

  useEffect(() => {
    if (!state.ok) {
      return;
    }

    router.refresh();
    onSaved();
  }, [onSaved, router, state.ok]);

  function updateFieldValue(fieldName: string, value: string) {
    setFieldValues((values) => ({
      ...values,
      [fieldName]: value,
      ...(template.tableName === "kinds"
        ? nextKindContextValues(fieldName, value, values, referenceOptions)
        : {}),
    }));
  }

  return (
    <form action={formAction}>
      <input name="table_name" type="hidden" value={template.tableName} />
      <input name="id" type="hidden" value={stringValue(row.id)} />
      <FieldGroup>
        <InspectorFieldList
          fieldValues={fieldValues}
          fields={editFields}
          optionContextValues={{ class_id: selectedClass.id }}
          onFieldValueChange={updateFieldValue}
          referenceOptions={referenceOptions}
          tableName={template.tableName}
          variant="compact"
        />
        <FieldError>{state.error}</FieldError>
        {state.ok ? <FieldDescription>Saved.</FieldDescription> : null}
        <InspectorFormFooter>
          <Button
            disabled={pending}
            onClick={onCancel}
            size="sm"
            type="button"
            variant="ghost"
          >
            Cancel
          </Button>
          <Button disabled={pending} size="sm" type="submit">
            {pending ? "Saving..." : "Save"}
          </Button>
        </InspectorFormFooter>
      </FieldGroup>
    </form>
  );
}

function ClassRecordCreateForm({
  onCancel,
  onSaved,
  referenceOptions,
  selectedClass,
  selectedDomainId,
  template,
}: {
  onCancel: () => void;
  onSaved: () => void;
  referenceOptions: ReferenceOptions;
  selectedClass: ClassRecord;
  selectedDomainId: string | null;
  template: ClassTableTemplate;
}) {
  const router = useRouter();
  const createFields = template.createFields ?? emptyEditFields;
  const initialValues = useMemo(
    () => buildCreateValues(createFields, selectedClass, selectedDomainId, referenceOptions),
    [createFields, referenceOptions, selectedClass, selectedDomainId],
  );
  const [fieldValues, setFieldValues] =
    useState<Record<string, string>>(initialValues);
  const [state, formAction, pending] = useActionState(
    createClassTableRow,
    initialRowMutationState,
  );

  useEffect(() => {
    if (!state.ok) {
      return;
    }

    router.refresh();
    onSaved();
  }, [onSaved, router, state.ok]);

  function updateFieldValue(fieldName: string, value: string) {
    setFieldValues((values) => {
      const nextValues = {
        ...values,
        [fieldName]: value,
      };

      if (template.tableName === "kinds") {
        Object.assign(
          nextValues,
          nextKindContextValues(fieldName, value, values, referenceOptions),
        );
      }

      if (fieldName === "source_class_id") {
        nextValues.source_record_id = "";
      }

      if (fieldName === "target_class_id") {
        nextValues.target_record_id = "";
      }

      return nextValues;
    });
  }

  return (
    <form action={formAction}>
      <input name="table_name" type="hidden" value={template.tableName} />
      <FieldGroup>
        <InspectorFieldList
          fieldValues={fieldValues}
          fields={createFields}
          optionContextValues={{ class_id: selectedClass.id }}
          onFieldValueChange={updateFieldValue}
          referenceOptions={referenceOptions}
          tableName={template.tableName}
          variant="compact"
        />
        <FieldError>{state.error}</FieldError>
        {state.ok ? <FieldDescription>Saved.</FieldDescription> : null}
        <InspectorFormFooter>
          <Button
            disabled={pending}
            onClick={onCancel}
            size="sm"
            type="button"
            variant="ghost"
          >
            Cancel
          </Button>
          <Button disabled={pending} size="sm" type="submit">
            {pending ? "Creating..." : "Create"}
          </Button>
        </InspectorFormFooter>
      </FieldGroup>
    </form>
  );
}

function InspectorAttributeGrid({
  referenceLabels,
  row,
  rows,
}: {
  referenceLabels: ReferenceLabels;
  row: TableRow;
  rows: InspectorField[][];
}) {
  return (
    <Card size="sm">
      <CardContent className="px-0">
        <Table>
          <TableBody>
            {rows.map((fields, index) => (
              <UiTableRow
                key={`${index}:${fields.map((field) => field.field).join(":")}`}
              >
                {fields.map((field) => (
                  <TableCell
                    className="min-w-0 whitespace-normal border-l border-border px-3 py-2 first:border-l-0"
                    key={field.field}
                  >
                    <InspectorField
                      compact={true}
                      label={field.label}
                      value={formatInspectorValue(
                        row[field.field],
                        field.field,
                        referenceLabels,
                      )}
                    />
                  </TableCell>
                ))}
              </UiTableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function InspectorNote({ label, value }: { label: string; value: string }) {
  if (!value) {
    return null;
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <FieldDescription className="text-foreground/90">
          {value}
        </FieldDescription>
      </CardContent>
    </Card>
  );
}

type EntityRelatedMode = "aliases" | "claims" | "relationships";

const entityRelatedModes = ["claims", "aliases", "relationships"] as const;

function isEntityRelatedMode(value: unknown): value is EntityRelatedMode {
  return entityRelatedModes.includes(value as EntityRelatedMode);
}

type EntityRelatedSelection = {
  id: string;
  mode: EntityRelatedMode;
};

type EntityRelatedRecordState = {
  aliases: TableRow[];
  claims: TableRow[];
  entityId: string;
  error: string | null;
  relationships: TableRow[];
};

async function fetchEntityRelatedRecords(
  entityId: string,
): Promise<EntityRelatedRecordState> {
  const supabase = createSupabaseClient();
  const [aliasResult, claimResult, relationshipResult] = await Promise.all([
    supabase
      .from("entity_aliases")
      .select("id,domain_id,entity_id,alias,normalized_alias,status_id,source_document_id,created_at,updated_at")
      .eq("entity_id", entityId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("claims")
      .select("id,domain_id,type_id,kind_id,status_id,slug,label,claim_text,target_entity_ids,source_document_id,created_at,updated_at")
      .contains("target_entity_ids", [entityId])
      .order("updated_at", { ascending: false }),
    supabase
      .from("relationships")
      .select("id,domain_id,type_id,kind_id,status_id,source_class_id,source_record_id,target_class_id,target_record_id,label,created_at,updated_at")
      .or(`source_record_id.eq.${entityId},target_record_id.eq.${entityId}`)
      .order("updated_at", { ascending: false }),
  ]);
  const error =
    aliasResult.error?.message ??
    claimResult.error?.message ??
    relationshipResult.error?.message ??
    null;

  return {
    aliases: (aliasResult.data ?? []) as unknown as TableRow[],
    claims: (claimResult.data ?? []) as unknown as TableRow[],
    entityId,
    error,
    relationships: (relationshipResult.data ?? []) as unknown as TableRow[],
  };
}

function EntityRelatedRecordsBox({
  aliasClass,
  aliases,
  claimClass,
  claims,
  referenceLabels,
  referenceOptions,
  relationshipClass,
  relationships,
  selectedEntity,
}: {
  aliasClass: ClassRecord | null;
  aliases: TableRow[];
  claimClass: ClassRecord | null;
  claims: TableRow[];
  referenceLabels: ReferenceLabels;
  referenceOptions: ReferenceOptions;
  relationshipClass: ClassRecord | null;
  relationships: TableRow[];
  selectedEntity: TableRow;
}) {
  const router = useRouter();
  const selectedEntityId = stringValue(selectedEntity.id);
  const [activeMode, setActiveMode] = useState<EntityRelatedMode>("claims");
  const [creatingMode, setCreatingMode] = useState<EntityRelatedMode | null>(
    null,
  );
  const [editingSelection, setEditingSelection] =
    useState<EntityRelatedSelection | null>(null);
  const [relatedRecordState, setRelatedRecordState] =
    useState<EntityRelatedRecordState | null>(null);
  const [selected, setSelected] = useState<EntityRelatedSelection | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();
  const loadedRelatedRecords =
    relatedRecordState?.entityId === selectedEntityId
      ? relatedRecordState
      : null;
  const loadedAliases = loadedRelatedRecords?.aliases ?? aliases;
  const loadedClaims = loadedRelatedRecords?.claims ?? claims;
  const loadedRelationships =
    loadedRelatedRecords?.relationships ?? relationships;
  const loadRelatedRecords = useCallback(async () => {
    if (!selectedEntityId) {
      setRelatedRecordState(null);
      return;
    }

    setRelatedRecordState(await fetchEntityRelatedRecords(selectedEntityId));
  }, [selectedEntityId]);

  useEffect(() => {
    if (!selectedEntityId) {
      return;
    }

    let cancelled = false;

    void fetchEntityRelatedRecords(selectedEntityId).then((state) => {
      if (!cancelled) {
        setRelatedRecordState(state);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [selectedEntityId]);

  const isLoadingRelatedRecords =
    Boolean(selectedEntityId) && relatedRecordState?.entityId !== selectedEntityId;
  const activeRows =
    activeMode === "aliases"
      ? loadedAliases
      : activeMode === "claims"
        ? loadedClaims
        : loadedRelationships;
  const activeClass =
    activeMode === "aliases"
      ? aliasClass
      : activeMode === "claims"
        ? claimClass
        : relationshipClass;
  const selectedRow =
    selected?.mode === activeMode
      ? (activeRows.find((row) => stringValue(row.id) === selected.id) ?? null)
      : null;
  const editingRow =
    editingSelection?.mode === activeMode
      ? (activeRows.find(
          (row) => stringValue(row.id) === editingSelection.id,
        ) ?? null)
      : null;
  const modeLabels: Record<EntityRelatedMode, string> = {
    aliases: "Aliases",
    claims: "Claims",
    relationships: "Relations",
  };
  const modeCounts: Record<EntityRelatedMode, number> = {
    aliases: loadedAliases.length,
    claims: loadedClaims.length,
    relationships: loadedRelationships.length,
  };

  function selectMode(mode: EntityRelatedMode) {
    setActiveMode(mode);
    setCreatingMode(null);
    setEditingSelection(null);
    setDeleteError(null);
    setConfirmOpen(false);
    setSelected(null);
  }

  function handleRelatedModeChange(mode: unknown) {
    if (isEntityRelatedMode(mode)) {
      selectMode(mode);
    }
  }

  function selectedLabel(row: TableRow | null) {
    if (!row) {
      return "";
    }

    if (activeMode === "aliases") {
      return stringValue(row.alias) || rowTitle(row);
    }

    if (activeMode === "claims") {
      return stringValue(row.claim_text) || rowTitle(row);
    }

    return relationshipTitle(row, referenceLabels);
  }

  function deleteSelectedRecord() {
    if (!activeClass || !selectedRow) {
      return;
    }

    const formData = new FormData();
    formData.set("table_name", activeClass.table_name);
    formData.set("id", stringValue(selectedRow.id));

    startDeleteTransition(async () => {
      const result = await deleteClassTableRow(
        initialRowMutationState,
        formData,
      );

      if (!result.ok) {
        setDeleteError(result.error ?? "Record could not be deleted.");
        return;
      }

      setConfirmOpen(false);
      setDeleteError(null);
      setSelected(null);
      void loadRelatedRecords();
      router.refresh();
    });
  }

  function renderForm(mode: EntityRelatedMode, row?: TableRow) {
    if (mode === "aliases" && aliasClass) {
      return (
        <AliasInlineForm
          alias={row}
          aliasClass={aliasClass}
          mode={row ? "edit" : "create"}
          referenceOptions={referenceOptions}
          selectedEntity={selectedEntity}
          onCancel={() => {
            setCreatingMode(null);
            setEditingSelection(null);
          }}
          onSaved={() => {
            setCreatingMode(null);
            setEditingSelection(null);
            void loadRelatedRecords();
            router.refresh();
          }}
        />
      );
    }

    if (mode === "claims" && claimClass) {
      return (
        <ClaimInlineForm
          claim={row}
          claimClass={claimClass}
          mode={row ? "edit" : "create"}
          referenceOptions={referenceOptions}
          selectedEntity={selectedEntity}
          onCancel={() => {
            setCreatingMode(null);
            setEditingSelection(null);
          }}
          onSaved={() => {
            setCreatingMode(null);
            setEditingSelection(null);
            void loadRelatedRecords();
            router.refresh();
          }}
        />
      );
    }

    if (mode === "relationships" && relationshipClass) {
      return (
        <RelationshipInlineForm
          mode={row ? "edit" : "create"}
          referenceOptions={referenceOptions}
          relationship={row}
          relationshipClass={relationshipClass}
          selectedEntity={selectedEntity}
          onCancel={() => {
            setCreatingMode(null);
            setEditingSelection(null);
          }}
          onSaved={() => {
            setCreatingMode(null);
            setEditingSelection(null);
            void loadRelatedRecords();
            router.refresh();
          }}
        />
      );
    }

    return null;
  }

  return (
    <>
      <Card className="min-h-0 max-h-[min(32rem,calc(100vh-18rem))]" size="sm">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Related</CardTitle>
          {activeClass ? (
            <div className="flex shrink-0 items-center gap-1">
              <InspectorActionButton
                aria-label={`Add ${modeLabels[activeMode].toLowerCase()}`}
                onClick={() => {
                  setCreatingMode((mode) =>
                    mode === activeMode ? null : activeMode,
                  );
                  setEditingSelection(null);
                  setSelected(null);
                }}
                size="icon-sm"
                tooltip={`Add ${modeLabels[activeMode].toLowerCase()}`}
                type="button"
                variant="ghost"
              >
                {creatingMode === activeMode ? (
                  <X aria-hidden={true} />
                ) : (
                  <Plus aria-hidden={true} />
                )}
              </InspectorActionButton>
              <InspectorActionButton
                aria-label={`Edit selected ${modeLabels[activeMode].toLowerCase()}`}
                disabled={!selectedRow}
                onClick={() => {
                  if (selectedRow) {
                    setCreatingMode(null);
                    setEditingSelection({
                      id: stringValue(selectedRow.id),
                      mode: activeMode,
                    });
                  }
                }}
                size="icon-sm"
                tooltip={`Edit selected ${modeLabels[activeMode].toLowerCase()}`}
                type="button"
                variant="ghost"
              >
                <Pencil aria-hidden={true} />
              </InspectorActionButton>
              <InspectorActionButton
                aria-label={`Delete selected ${modeLabels[activeMode].toLowerCase()}`}
                disabled={!selectedRow}
                onClick={() => {
                  setDeleteError(null);
                  setConfirmOpen(true);
                }}
                size="icon-sm"
                tooltip={`Delete selected ${modeLabels[activeMode].toLowerCase()}`}
                type="button"
                variant="destructive"
              >
                <Trash2 aria-hidden={true} />
              </InspectorActionButton>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="min-h-0 flex flex-1 flex-col overflow-hidden">
          {isLoadingRelatedRecords ? (
            <p className="mb-3 text-xs text-muted-foreground">Loading related records...</p>
          ) : null}
          {loadedRelatedRecords?.error ? (
            <FieldError>{loadedRelatedRecords.error}</FieldError>
          ) : null}
          <Tabs
            className="min-h-0 flex-1 overflow-hidden"
            onValueChange={handleRelatedModeChange}
            value={activeMode}
          >
            <TabsList className="grid w-full grid-cols-3">
              {entityRelatedModes.map((mode) => (
                <TabsTrigger
                  className="min-w-0 gap-1 px-1"
                  key={mode}
                  value={mode}
                >
                  <span className="min-w-0 truncate">{modeLabels[mode]}</span>
                  <Badge
                    className="min-w-5 px-1 tabular-nums"
                    variant="secondary"
                  >
                    {modeCounts[mode]}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>
            {entityRelatedModes.map((mode) => (
              <TabsContent
                className="min-h-0 overflow-y-auto pr-3"
                key={mode}
                value={mode}
              >
                <div className="flex flex-col gap-4">
                  {creatingMode === mode ? renderForm(mode) : null}
                  {editingRow && activeMode === mode
                    ? renderForm(mode, editingRow)
                    : null}
                  <div>
                    <RelatedRecordsTable
                      activeMode={activeMode}
                      mode={mode}
                      modeLabel={modeLabels[mode]}
                      referenceLabels={referenceLabels}
                      rows={
                        mode === "aliases"
                          ? loadedAliases
                          : mode === "claims"
                            ? loadedClaims
                            : loadedRelationships
                      }
                      selected={selected}
                      selectedEntity={selectedEntity}
                      onSelect={(rowId) => {
                        setCreatingMode(null);
                        setEditingSelection(null);
                        setSelected({ id: rowId, mode });
                      }}
                    />
                  </div>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
        <ConfirmDialog
          confirmLabel={`Delete ${modeLabels[activeMode].toLowerCase()}`}
          description={
            <>
              This will permanently remove{" "}
              <span className="text-foreground">
                {selectedLabel(selectedRow) || "this record"}
              </span>
              .
            </>
          }
          isPending={isDeleting}
          onCancel={() => {
            if (!isDeleting) {
              setConfirmOpen(false);
              setDeleteError(null);
            }
          }}
          onConfirm={deleteSelectedRecord}
          open={confirmOpen}
          pendingLabel="Deleting..."
          title={`Delete ${modeLabels[activeMode].toLowerCase()}?`}
          tone="destructive"
        >
          {deleteError ? <FieldError>{deleteError}</FieldError> : null}
        </ConfirmDialog>
      </Card>
      {selectedRow ? (
        <SelectedRelatedRecordCard
          mode={activeMode}
          referenceLabels={referenceLabels}
          row={selectedRow}
          selectedEntity={selectedEntity}
        />
      ) : null}
    </>
  );
}

function SelectedRelatedRecordCard({
  mode,
  referenceLabels,
  row,
  selectedEntity,
}: {
  mode: EntityRelatedMode;
  referenceLabels: ReferenceLabels;
  row: TableRow;
  selectedEntity: TableRow;
}) {
  const title = selectedRelatedRecordTitle(mode, row, referenceLabels);
  const body = selectedRelatedRecordBody(mode, row, selectedEntity, referenceLabels);
  const detailRows = selectedRelatedRecordDetails(mode);

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardAction>
          <Badge variant="secondary">{selectedRelatedRecordLabel(mode)}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {body ? (
          <p className="text-sm leading-6 text-foreground/90">
            {body}
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          {detailRows.map((detail) => (
            <Field className="min-w-0 gap-1" key={detail.field}>
              <FieldTitle className="text-xs font-medium text-muted-foreground">
                {detail.label}
              </FieldTitle>
              <FieldDescription className="min-w-0 break-words text-sm text-foreground">
                {formatInspectorValue(row[detail.field], detail.field, referenceLabels)}
              </FieldDescription>
            </Field>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function selectedRelatedRecordLabel(mode: EntityRelatedMode) {
  if (mode === "aliases") {
    return "Alias";
  }

  if (mode === "claims") {
    return "Claim";
  }

  return "Relationship";
}

function selectedRelatedRecordTitle(
  mode: EntityRelatedMode,
  row: TableRow,
  referenceLabels: ReferenceLabels,
) {
  if (mode === "aliases") {
    return stringValue(row.alias) || rowTitle(row);
  }

  if (mode === "claims") {
    return formatInspectorValue(row.type_id, "type_id", referenceLabels);
  }

  return relationshipTitle(row, referenceLabels);
}

function selectedRelatedRecordBody(
  mode: EntityRelatedMode,
  row: TableRow,
  selectedEntity: TableRow,
  referenceLabels: ReferenceLabels,
) {
  if (mode === "claims") {
    return stringValue(row.claim_text) || stringValue(row.label);
  }

  if (mode === "relationships") {
    return relationshipDirection(row, selectedEntity, referenceLabels);
  }

  return "";
}

function selectedRelatedRecordDetails(mode: EntityRelatedMode) {
  if (mode === "aliases") {
    return [
      { field: "status_id", label: "Status" },
      { field: "source_document_id", label: "Source" },
      { field: "normalized_alias", label: "Normalized" },
      { field: "updated_at", label: "Updated" },
    ];
  }

  if (mode === "claims") {
    return [
      { field: "type_id", label: "Type" },
      { field: "status_id", label: "Status" },
      { field: "source_document_id", label: "Source" },
      { field: "target_entity_ids", label: "Targets" },
    ];
  }

  return [
    { field: "type_id", label: "Type" },
    { field: "status_id", label: "Status" },
    { field: "source_record_id", label: "Source" },
    { field: "target_record_id", label: "Target" },
  ];
}

function RelatedRecordsTable({
  activeMode,
  mode,
  modeLabel,
  onSelect,
  referenceLabels,
  rows,
  selected,
  selectedEntity,
}: {
  activeMode: EntityRelatedMode;
  mode: EntityRelatedMode;
  modeLabel: string;
  onSelect: (rowId: string) => void;
  referenceLabels: ReferenceLabels;
  rows: TableRow[];
  selected: EntityRelatedSelection | null;
  selectedEntity: TableRow;
}) {
  if (rows.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No {modeLabel.toLowerCase()}</EmptyTitle>
          <EmptyDescription>
            This subject does not have records in this class yet.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Table>
      <TableHeader>
        <UiTableRow>
          <TableHead>Record</TableHead>
          {mode === "claims" ? null : <TableHead>Context</TableHead>}
        </UiTableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const rowId = stringValue(row.id);
          const isSelected = selected?.mode === mode && selected.id === rowId;
          const cells = relatedRecordCells(
            mode,
            row,
            selectedEntity,
            referenceLabels,
          );

          return (
            <UiTableRow
              aria-pressed={isSelected}
              className={cn(
                activeMode === mode && "cursor-pointer",
                activeMode === mode && isSelected && "bg-muted",
              )}
              data-state={isSelected ? "selected" : undefined}
              key={rowId}
              onClick={() => onSelect(rowId)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(rowId);
                }
              }}
              role="button"
              tabIndex={activeMode === mode ? 0 : -1}
            >
              <TableCell className="min-w-0 whitespace-normal font-medium">
                {cells.primary}
              </TableCell>
              {mode === "claims" ? null : (
                <TableCell className="whitespace-normal text-muted-foreground">
                  {cells.secondary}
                </TableCell>
              )}
            </UiTableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function relatedRecordCells(
  mode: EntityRelatedMode,
  row: TableRow,
  selectedEntity: TableRow,
  referenceLabels: ReferenceLabels,
) {
  if (mode === "aliases") {
    return {
      primary: stringValue(row.alias) || rowTitle(row),
      secondary: formatInspectorValue(
        row.status_id,
        "status_id",
        referenceLabels,
      ),
    };
  }

  if (mode === "claims") {
    return {
      primary: stringValue(row.claim_text) || rowTitle(row),
      secondary: null,
    };
  }

  return {
    primary: relationshipTitle(row, referenceLabels),
    secondary: relationshipDirection(row, selectedEntity, referenceLabels),
  };
}

function relationshipTitle(row: TableRow, referenceLabels: ReferenceLabels) {
  return (
    stringValue(row.label) ||
    formatInspectorValue(row.type_id, "type_id", referenceLabels) ||
    formatInspectorValue(row.kind_id, "kind_id", referenceLabels) ||
    rowTitle(row)
  );
}

function relationshipDirection(
  row: TableRow,
  selectedEntity: TableRow,
  referenceLabels: ReferenceLabels,
) {
  const selectedEntityId = stringValue(selectedEntity.id);
  const sourceLabel = formatInspectorValue(
    row.source_record_id,
    "source_record_id",
    referenceLabels,
  );
  const targetLabel = formatInspectorValue(
    row.target_record_id,
    "target_record_id",
    referenceLabels,
  );

  if (stringValue(row.source_record_id) === selectedEntityId) {
    return `To ${targetLabel}`;
  }

  if (stringValue(row.target_record_id) === selectedEntityId) {
    return `From ${sourceLabel}`;
  }

  return `${sourceLabel} -> ${targetLabel}`;
}

function AliasInlineForm({
  alias,
  aliasClass,
  mode,
  onCancel,
  onSaved,
  referenceOptions,
  selectedEntity,
}: {
  alias?: TableRow;
  aliasClass: ClassRecord;
  mode: "create" | "edit";
  onCancel: () => void;
  onSaved: () => void;
  referenceOptions: ReferenceOptions;
  selectedEntity: TableRow;
}) {
  const router = useRouter();
  const action = mode === "create" ? createClassTableRow : updateClassTableRow;
  const [state, formAction, pending] = useActionState(
    action,
    initialRowMutationState,
  );
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({
    alias: stringValue(alias?.alias),
    domain_id: stringValue(selectedEntity.domain_id),
    entity_id: stringValue(selectedEntity.id),
    source_document_id: stringValue(alias?.source_document_id),
    status_id: stringValue(alias?.status_id),
  });
  const fields: ClassTableFieldTemplate[] = [
    {
      label: "Alias",
      name: "alias",
      required: true,
    },
    {
      label: "Status",
      name: "status_id",
      placeholder: "Optional",
      referenceTable: "statuses",
    },
    {
      label: "Source",
      name: "source_document_id",
      placeholder: "Optional",
      referenceTable: "documents",
    },
  ];

  useEffect(() => {
    if (!state.ok) {
      return;
    }

    router.refresh();
    onSaved();
  }, [onSaved, router, state.ok]);

  function updateFieldValue(fieldName: string, value: string) {
    setFieldValues((values) => ({
      ...values,
      [fieldName]: value,
    }));
  }

  return (
    <InspectorForm action={formAction}>
      <input name="table_name" type="hidden" value={aliasClass.table_name} />
      {mode === "edit" ? (
        <input name="id" type="hidden" value={stringValue(alias?.id)} />
      ) : null}
      <input name="domain_id" type="hidden" value={fieldValues.domain_id} />
      <input name="entity_id" type="hidden" value={fieldValues.entity_id} />
      <InspectorFieldList
        fieldValues={fieldValues}
        fields={fields}
        optionContextValues={{ class_id: aliasClass.id }}
        onFieldValueChange={updateFieldValue}
        referenceOptions={referenceOptions}
        tableName={aliasClass.table_name}
        variant="compact"
      />
      {state.error ? <FieldError>{state.error}</FieldError> : null}
      <FieldGroup className="flex-row justify-end gap-2">
        <InspectorActionButton
          disabled={pending}
          onClick={onCancel}
          size="icon-sm"
          tooltip="Cancel"
          type="button"
          variant="ghost"
        >
          <X aria-hidden={true} />
        </InspectorActionButton>
        <InspectorActionButton
          disabled={pending || !fieldValues.alias.trim()}
          size="icon-sm"
          tooltip="Save alias"
          type="submit"
        >
          <Check aria-hidden={true} />
        </InspectorActionButton>
      </FieldGroup>
    </InspectorForm>
  );
}

function ClaimInlineForm({
  claim,
  claimClass,
  mode,
  onCancel,
  onSaved,
  referenceOptions,
  selectedEntity,
}: {
  claim?: TableRow;
  claimClass: ClassRecord;
  mode: "create" | "edit";
  onCancel: () => void;
  onSaved: () => void;
  referenceOptions: ReferenceOptions;
  selectedEntity: TableRow;
}) {
  const router = useRouter();
  const action = mode === "create" ? createClassTableRow : updateClassTableRow;
  const [state, formAction, pending] = useActionState(
    action,
    initialRowMutationState,
  );
  const classification = defaultClassifiedRecordValues({
    classRecord: claimClass,
    referenceOptions,
  });
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({
    claim_text: stringValue(claim?.claim_text),
    domain_id: stringValue(selectedEntity.domain_id),
    source_document_id: stringValue(claim?.source_document_id),
    status_id: stringValue(claim?.status_id),
    target_entity_ids: stringValue(selectedEntity.id),
    type_id: stringValue(claim?.type_id) || classification.typeId,
  });
  const fields: ClassTableFieldTemplate[] = [
    {
      label: "Claim",
      name: "claim_text",
      required: true,
    },
    {
      label: "Type",
      name: "type_id",
      referenceTable: "types",
      required: true,
    },
    {
      label: "Status",
      name: "status_id",
      placeholder: "Optional",
      referenceTable: "statuses",
    },
    {
      label: "Source",
      name: "source_document_id",
      placeholder: "Optional",
      referenceTable: "documents",
    },
  ];

  useEffect(() => {
    if (!state.ok) {
      return;
    }

    router.refresh();
    onSaved();
  }, [onSaved, router, state.ok]);

  function updateFieldValue(fieldName: string, value: string) {
    setFieldValues((values) => {
      const nextValues = {
        ...values,
        [fieldName]: value,
      };

      return nextValues;
    });
  }

  return (
    <InspectorForm action={formAction}>
      <input name="table_name" type="hidden" value={claimClass.table_name} />
      {mode === "edit" ? (
        <input name="id" type="hidden" value={stringValue(claim?.id)} />
      ) : null}
      <input name="domain_id" type="hidden" value={fieldValues.domain_id} />
      <input
        name="target_entity_ids"
        type="hidden"
        value={fieldValues.target_entity_ids}
      />
      <InspectorFieldList
        fieldValues={fieldValues}
        fields={fields}
        optionContextValues={{ class_id: claimClass.id }}
        onFieldValueChange={updateFieldValue}
        referenceOptions={referenceOptions}
        tableName={claimClass.table_name}
        variant="compact"
      />
      {state.error ? <FieldError>{state.error}</FieldError> : null}
      <FieldGroup className="flex-row justify-end gap-2">
        <InspectorActionButton
          disabled={pending}
          onClick={onCancel}
          size="icon-sm"
          tooltip="Cancel"
          type="button"
          variant="ghost"
        >
          <X aria-hidden={true} />
        </InspectorActionButton>
        <InspectorActionButton
          disabled={
            pending ||
            !fieldValues.claim_text.trim() ||
            !fieldValues.type_id
          }
          size="icon-sm"
          tooltip="Save claim"
          type="submit"
        >
          <Check aria-hidden={true} />
        </InspectorActionButton>
      </FieldGroup>
    </InspectorForm>
  );
}

function RelationshipInlineForm({
  mode,
  onCancel,
  onSaved,
  referenceOptions,
  relationship,
  relationshipClass,
  selectedEntity,
}: {
  mode: "create" | "edit";
  onCancel: () => void;
  onSaved: () => void;
  referenceOptions: ReferenceOptions;
  relationship?: TableRow;
  relationshipClass: ClassRecord;
  selectedEntity: TableRow;
}) {
  const router = useRouter();
  const action = mode === "create" ? createClassTableRow : updateClassTableRow;
  const [state, formAction, pending] = useActionState(
    action,
    initialRowMutationState,
  );
  const classification = defaultClassifiedRecordValues({
    classRecord: relationshipClass,
    referenceOptions,
  });
  const sourceClassId =
    stringValue(relationship?.source_class_id) ||
    referenceOptions.classes?.find(
      (option) => stringValue(option.row.table_name) === "entities",
    )?.value ||
    "";
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({
    domain_id:
      stringValue(relationship?.domain_id) ||
      stringValue(selectedEntity.domain_id),
    source_class_id: sourceClassId,
    source_record_id:
      stringValue(relationship?.source_record_id) ||
      stringValue(selectedEntity.id),
    status_id: stringValue(relationship?.status_id),
    target_class_id:
      stringValue(relationship?.target_class_id) || sourceClassId,
    target_record_id: stringValue(relationship?.target_record_id),
    type_id: stringValue(relationship?.type_id) || classification.typeId,
  });
  const fields: ClassTableFieldTemplate[] = [
    {
      label: "Type",
      name: "type_id",
      referenceTable: "types",
      required: true,
    },
    {
      label: "Status",
      name: "status_id",
      placeholder: "Optional",
      referenceTable: "statuses",
    },
    {
      label: "Source class",
      name: "source_class_id",
      referenceTable: "classes",
      required: true,
    },
    {
      label: "Source record",
      name: "source_record_id",
      referenceTable: "records",
      required: true,
    },
    {
      label: "Target class",
      name: "target_class_id",
      referenceTable: "classes",
      required: true,
    },
    {
      label: "Target record",
      name: "target_record_id",
      referenceTable: "records",
      required: true,
    },
  ];

  useEffect(() => {
    if (!state.ok) {
      return;
    }

    router.refresh();
    onSaved();
  }, [onSaved, router, state.ok]);

  function updateFieldValue(fieldName: string, value: string) {
    setFieldValues((values) => {
      const nextValues = {
        ...values,
        [fieldName]: value,
      };

      if (fieldName === "source_class_id") {
        nextValues.source_record_id = "";
      }

      if (fieldName === "target_class_id") {
        nextValues.target_record_id = "";
      }

      return nextValues;
    });
  }

  return (
    <InspectorForm action={formAction}>
      <input
        name="table_name"
        type="hidden"
        value={relationshipClass.table_name}
      />
      {mode === "edit" ? (
        <input name="id" type="hidden" value={stringValue(relationship?.id)} />
      ) : null}
      <input name="domain_id" type="hidden" value={fieldValues.domain_id} />
      <InspectorFieldList
        fieldValues={fieldValues}
        fields={fields}
        optionContextValues={{ class_id: relationshipClass.id }}
        onFieldValueChange={updateFieldValue}
        referenceOptions={referenceOptions}
        tableName={relationshipClass.table_name}
        variant="compact"
      />
      {state.error ? <FieldError>{state.error}</FieldError> : null}
      <FieldGroup className="flex-row justify-end gap-2">
        <InspectorActionButton
          disabled={pending}
          onClick={onCancel}
          size="icon-sm"
          tooltip="Cancel"
          type="button"
          variant="ghost"
        >
          <X aria-hidden={true} />
        </InspectorActionButton>
        <InspectorActionButton
          disabled={
            pending ||
            !fieldValues.type_id ||
            !fieldValues.source_class_id ||
            !fieldValues.source_record_id ||
            !fieldValues.target_class_id ||
            !fieldValues.target_record_id
          }
          size="icon-sm"
          tooltip="Save relationship"
          type="submit"
        >
          <Check aria-hidden={true} />
        </InspectorActionButton>
      </FieldGroup>
    </InspectorForm>
  );
}

function buildEditableValues(
  fields: readonly ClassTableFieldTemplate[],
  row: TableRow,
  referenceOptions: ReferenceOptions,
  tableName: string,
) {
  return Object.fromEntries(
    fields.map((field) => {
      if (tableName === "kinds" && field.name === "class_id") {
        return [field.name, classIdForType(fieldValue(row.type_id), referenceOptions)];
      }

      return [field.name, fieldValue(row[field.name])];
    }),
  );
}

function buildCreateValues(
  fields: readonly ClassTableFieldTemplate[],
  selectedClass: ClassRecord,
  selectedDomainId: string | null,
  referenceOptions: ReferenceOptions,
) {
  return Object.fromEntries(
    fields.map((field) => {
      if (field.name === "class_id") {
        if (selectedClass.table_name === "types") {
          return [field.name, classIdForTableName("entities", referenceOptions)];
        }

        return [field.name, selectedClass.table_name === "kinds" ? "" : selectedClass.id];
      }

      if (field.name === "domain_id") {
        return [field.name, selectedDomainId ?? ""];
      }

      if (field.name === "status_id" && selectedClass.table_name === "entities") {
        return [field.name, defaultStatusId(referenceOptions, selectedClass.id, "canon")];
      }

      return [field.name, ""];
    }),
  );
}

function defaultStatusId(
  referenceOptions: ReferenceOptions,
  classId: string,
  statusSlug: string,
) {
  return (
    referenceOptions.statuses?.find(
      (option) =>
        stringValue(option.row.class_id) === classId &&
        stringValue(option.row.slug) === statusSlug,
    )?.value ?? ""
  );
}

function fieldValue(value: TableValue | undefined) {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .join(",");
  }

  if (typeof value === "string") {
    return value;
  }

  return "";
}

function groupTocByHeading(toc: TocEntry[]): TocGroup[] {
  const groups: TocGroup[] = [];

  for (const entry of toc) {
    if (entry.depth === 0 || groups.length === 0) {
      groups.push({ ...entry, children: [] });
      continue;
    }

    groups[groups.length - 1].children.push(entry);
  }

  return groups;
}

function buildReferenceLabels(
  tableSamples: ClassTableSamples,
): ReferenceLabels {
  return Object.fromEntries(
    Object.values(tableSamples).flatMap((sample) =>
      sample.rows
        .map((row) => {
          const id = stringValue(row.id);

          return id ? ([id, rowTitle(row)] as const) : null;
        })
        .filter((entry): entry is readonly [string, string] => entry !== null),
    ),
  );
}

function mergeFields(primaryFields: string[], fallbackFields: string[]) {
  return [
    ...primaryFields,
    ...fallbackFields.filter((field) => !primaryFields.includes(field)),
  ];
}

function defaultClassifiedRecordValues({
  classRecord,
  referenceOptions,
}: {
  classRecord: ClassRecord;
  referenceOptions: ReferenceOptions;
}) {
  return {
    typeId: firstTypeValueForClass(classRecord, referenceOptions),
  };
}

function firstTypeValueForClass(
  classRecord: ClassRecord,
  referenceOptions: ReferenceOptions,
) {
  return (
    (referenceOptions.types ?? []).find((option) => {
      return stringValue(option.row.class_id) === classRecord.id;
    })?.value ?? ""
  );
}

function classIdForTableName(
  tableName: KnownClassTableName,
  referenceOptions: ReferenceOptions,
) {
  return (
    referenceOptions.classes?.find(
      (option) => stringValue(option.row.table_name) === tableName,
    )?.value ?? ""
  );
}

function nextKindContextValues(
  fieldName: string,
  value: string,
  currentValues: Record<string, string>,
  referenceOptions: ReferenceOptions,
): Record<string, string> {
  if (fieldName === "class_id") {
    const currentTypeClassId = classIdForType(currentValues.type_id ?? "", referenceOptions);

    return currentTypeClassId && currentTypeClassId !== value ? { type_id: "" } : {};
  }

  if (fieldName === "type_id") {
    const typeClassId = classIdForType(value, referenceOptions);

    return typeClassId ? { class_id: typeClassId } : {};
  }

  return {};
}

function classIdForType(
  typeId: string,
  referenceOptions: ReferenceOptions,
) {
  const classId = (referenceOptions.types ?? []).find(
    (option) => option.value === typeId,
  )?.row.class_id;

  return stringValue(classId);
}

function classDisplayLabel(classRecord: ClassRecord) {
  return classRecord.table_name === "entities" ? "Subjects" : classRecord.label;
}

function rowTitle(row: TableRow) {
  return (
    stringValue(row.label) ||
    stringValue(row.title) ||
    stringValue(row.name) ||
    stringValue(row.slug) ||
    stringValue(row.id) ||
    "Untitled"
  );
}

function formatInspectorValue(
  value: TableValue | undefined,
  fieldName: string,
  referenceLabels: ReferenceLabels,
) {
  if (value === undefined || value === null || value === "") {
    return "None";
  }

  if (Array.isArray(value) && value.length === 0) {
    return "None";
  }

  return formatTableValue(value, fieldName, referenceLabels);
}

function stringValue(value: TableValue | undefined) {
  return typeof value === "string" ? value : "";
}
