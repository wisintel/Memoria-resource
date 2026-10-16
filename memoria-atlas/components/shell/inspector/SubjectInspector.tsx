"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  ButtonGroup,
  ButtonGroupSeparator,
} from "@/components/ui/button-group";
import { FieldError } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  deleteLexicalizationShellAction,
  deleteShelfItemShellAction,
} from "@/app/actions";
import {
  RecordCrudDialog,
  type RecordCrudMode,
} from "@/components/shell/record-crud/RecordCrudDialog";
import { InspectorError } from "@/components/shell/inspector/shared";
import {
  AliasCrudDialog,
  RelatedAliases,
  RelatedClaims,
  RelatedRelationships,
  relatedTabLabel,
  RelatedToolbarButton,
  type RelatedTab,
} from "@/components/shell/inspector/related";
import type { ShelfClassKey } from "@/domain/shelf";
import type {
  SubjectAliasRelatedItem,
  SubjectDetail,
} from "@/domain/subjects";

type SubjectDetailState = {
  domainSlug: string;
  error: string | null;
  isLoading: boolean;
  selectedId: string;
  subject: SubjectDetail | null;
};

type RelatedCrudDialog =
  | {
      kind: "alias";
      alias: SubjectAliasRelatedItem | null;
      mode: RecordCrudMode;
    }
  | {
      kind: "claim";
      mode: RecordCrudMode;
      selectedId: string | null;
    }
  | {
      kind: "relationship";
      mode: RecordCrudMode;
      selectedId: string | null;
    };

export function SubjectInspector({
  domainSlug,
  selectedId,
}: {
  domainSlug: string;
  selectedId: string;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState<SubjectDetailState>({
    domainSlug,
    error: null,
    isLoading: true,
    selectedId,
    subject: null,
  });

  useEffect(() => {
    const controller = new AbortController();

    fetch(
      `/api/subjects/${selectedId}?domain=${encodeURIComponent(domainSlug)}`,
      {
        signal: controller.signal,
      }
    )
      .then(async (response) => {
        const payload = (await response.json()) as {
          error?: string;
          subject?: SubjectDetail;
        };

        if (!response.ok || !payload.subject) {
          throw new Error(payload.error ?? "Subject could not be loaded.");
        }

        return payload.subject;
      })
      .then((subject) => {
        setState({
          domainSlug,
          error: null,
          isLoading: false,
          selectedId,
          subject,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          domainSlug,
          error:
            error instanceof Error
              ? error.message
              : "Subject could not be loaded.",
          isLoading: false,
          selectedId,
          subject: null,
        });
      });

    return () => controller.abort();
  }, [domainSlug, refreshKey, selectedId]);

  const matchesCurrentRequest =
    state.domainSlug === domainSlug && state.selectedId === selectedId;
  const isLoading = state.isLoading || !matchesCurrentRequest;
  const subject = matchesCurrentRequest ? state.subject : null;
  const error = matchesCurrentRequest ? state.error : null;

  if (isLoading) {
    return <SubjectInspectorSkeleton />;
  }

  if (subject) {
    return (
      <SubjectInspectorCard
        domainSlug={domainSlug}
        onRelatedChange={() => setRefreshKey((current) => current + 1)}
        subject={subject}
      />
    );
  }

  return (
    <InspectorError
      title="Subject unavailable"
      message={error ?? "Subject could not be loaded."}
    />
  );
}

function SubjectInspectorCard({
  domainSlug,
  onRelatedChange,
  subject,
}: {
  domainSlug: string;
  onRelatedChange: () => void;
  subject: SubjectDetail;
}) {
  const description = subject.description.trim();

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-heading text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
            Subject
          </p>
          <h2 className="mt-3 truncate font-heading text-xl font-semibold">
            {subject.canonicalLabel}
          </h2>
        </div>
        {subject.subjectType ? (
          <Badge
            variant="outline"
            className="border-primary/40 bg-primary/10 text-primary"
          >
            {subject.subjectType.label}
          </Badge>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {subject.source ? (
          <Badge variant="outline">{subject.source}</Badge>
        ) : null}
      </div>
      {description ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : (
        <p className="text-sm leading-relaxed text-muted-foreground">
          No description.
        </p>
      )}
      <Separator />
      <SubjectRelatedPanel
        domainSlug={domainSlug}
        onChange={onRelatedChange}
        subject={subject}
      />
    </section>
  );
}

function SubjectRelatedPanel({
  domainSlug,
  onChange,
  subject,
}: {
  domainSlug: string;
  onChange: () => void;
  subject: SubjectDetail;
}) {
  const { related } = subject;
  const [dialog, setDialog] = useState<RelatedCrudDialog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const defaultTab = related.claims.length
    ? "claims"
    : related.relationships.length
      ? "relationships"
      : "aliases";
  const [activeTab, setActiveTab] = useState<RelatedTab>(defaultTab);
  const [selectedByTab, setSelectedByTab] = useState<
    Partial<Record<RelatedTab, string>>
  >({});
  const selectedId = selectedByTab[activeTab] ?? null;
  const selectedAlias =
    activeTab === "aliases"
      ? (related.aliases.find((alias) => alias.id === selectedId) ?? null)
      : null;

  async function deleteRelated(
    kind: "alias" | "claim" | "relationship",
    id: string
  ) {
    setPendingDeleteId(id);
    setError(null);

    try {
      const result =
        kind === "alias"
          ? await deleteLexicalizationShellAction(id, domainSlug)
          : await deleteShelfItemShellAction(
              domainSlug,
              kind as Extract<ShelfClassKey, "claim" | "relationship">,
              id
            );

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      window.dispatchEvent(new Event("memoria:shelf-refresh"));
      onChange();
    } catch (caught: unknown) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Related record could not be deleted."
      );
    } finally {
      setPendingDeleteId(null);
    }
  }

  function closeDialog() {
    setDialog(null);
  }

  function finishDialog() {
    setDialog(null);
    window.dispatchEvent(new Event("memoria:shelf-refresh"));
    onChange();
  }

  function selectRelated(tab: RelatedTab, id: string) {
    setSelectedByTab((current) => ({ ...current, [tab]: id }));
  }

  function createSelectedRelated() {
    if (activeTab === "claims") {
      setDialog({ kind: "claim", mode: "create", selectedId: null });
      return;
    }

    if (activeTab === "relationships") {
      setDialog({ kind: "relationship", mode: "create", selectedId: null });
      return;
    }

    setDialog({ alias: null, kind: "alias", mode: "create" });
  }

  function editSelectedRelated() {
    if (!selectedId) {
      return;
    }

    if (activeTab === "claims") {
      setDialog({ kind: "claim", mode: "edit", selectedId });
      return;
    }

    if (activeTab === "relationships") {
      setDialog({ kind: "relationship", mode: "edit", selectedId });
      return;
    }

    if (selectedAlias) {
      setDialog({ alias: selectedAlias, kind: "alias", mode: "edit" });
    }
  }

  function deleteSelectedRelated() {
    if (!selectedId) {
      return;
    }

    const kind =
      activeTab === "claims"
        ? "claim"
        : activeTab === "relationships"
          ? "relationship"
          : "alias";

    void deleteRelated(kind, selectedId);
  }

  return (
    <section className="flex h-[48rem] min-h-0 flex-col overflow-hidden rounded-[var(--radius-md)] border border-border bg-card p-3 shadow-sm">
      <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Related</h3>
        <ButtonGroup>
          <RelatedToolbarButton
            label={`Add ${relatedTabLabel(activeTab)}`}
            onClick={createSelectedRelated}
          >
            <Plus />
          </RelatedToolbarButton>
          <ButtonGroupSeparator />
          <RelatedToolbarButton
            disabled={!selectedId}
            label={`Edit ${relatedTabLabel(activeTab)}`}
            onClick={editSelectedRelated}
          >
            <Pencil />
          </RelatedToolbarButton>
          <ButtonGroupSeparator />
          <RelatedToolbarButton
            disabled={!selectedId || pendingDeleteId === selectedId}
            label={`Delete ${relatedTabLabel(activeTab)}`}
            onClick={deleteSelectedRelated}
          >
            <Trash2 />
          </RelatedToolbarButton>
        </ButtonGroup>
      </div>
      {error ? <FieldError className="mb-2">{error}</FieldError> : null}
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as RelatedTab)}
        className="min-h-0 flex-1 overflow-hidden"
      >
        <TabsList className="grid w-full shrink-0 grid-cols-3 rounded-[var(--radius-sm)]">
          <TabsTrigger
            value="claims"
            className="min-w-0 gap-1 rounded-[calc(var(--radius-sm)-2px)] px-1 text-xs"
          >
            <span className="truncate">Claims</span>
            <Badge variant="secondary" className="px-1 tabular-nums">
              {related.claims.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="aliases"
            className="min-w-0 gap-1 rounded-[calc(var(--radius-sm)-2px)] px-1 text-xs"
          >
            <span className="truncate">Aliases</span>
            <Badge variant="secondary" className="px-1 tabular-nums">
              {related.aliases.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="relationships"
            className="min-w-0 gap-1 rounded-[calc(var(--radius-sm)-2px)] px-1 text-xs"
          >
            <span className="truncate">Relations</span>
            <Badge variant="secondary" className="px-1 tabular-nums">
              {related.relationships.length}
            </Badge>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="claims" className="min-h-0 overflow-y-auto pr-1">
          <RelatedClaims
            claims={related.claims}
            selectedId={selectedByTab.claims ?? null}
            onSelect={(claimId) => selectRelated("claims", claimId)}
          />
        </TabsContent>
        <TabsContent value="aliases" className="min-h-0 overflow-y-auto pr-1">
          <RelatedAliases
            aliases={related.aliases}
            selectedId={selectedByTab.aliases ?? null}
            onSelect={(aliasId) => selectRelated("aliases", aliasId)}
          />
        </TabsContent>
        <TabsContent
          value="relationships"
          className="min-h-0 overflow-y-auto pr-1"
        >
          <RelatedRelationships
            relationships={related.relationships}
            selectedId={selectedByTab.relationships ?? null}
            onSelect={(relationshipId) =>
              selectRelated("relationships", relationshipId)
            }
          />
        </TabsContent>
      </Tabs>
      {dialog?.kind === "claim" ? (
        <RecordCrudDialog
          classKey="claim"
          domainSlug={domainSlug}
          initialClaimTargetSubjectId={subject.id}
          mode={dialog.mode}
          onClose={closeDialog}
          onDone={finishDialog}
          open
          selectedId={dialog.selectedId}
        />
      ) : null}
      {dialog?.kind === "relationship" ? (
        <RecordCrudDialog
          classKey="relationship"
          domainSlug={domainSlug}
          initialRelationshipSourceSubjectId={subject.id}
          mode={dialog.mode}
          onClose={closeDialog}
          onDone={finishDialog}
          open
          selectedId={dialog.selectedId}
        />
      ) : null}
      {dialog?.kind === "alias" ? (
        <AliasCrudDialog
          alias={dialog.alias}
          domainSlug={domainSlug}
          mode={dialog.mode}
          objectId={subject.id}
          onClose={closeDialog}
          onDone={finishDialog}
          open
        />
      ) : null}
    </section>
  );
}

function SubjectInspectorSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-5 w-24 rounded-full" />
      <Skeleton className="h-16 w-full" />
      <Separator />
      <div className="rounded-[var(--radius-md)] border border-border p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <div className="grid gap-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
    </div>
  );
}
