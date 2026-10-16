"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, ChevronDown, Play, X } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  createShardDistillationRun,
  reviewShardDistillationCandidates,
  runShardDistillationStage,
} from "@/app/atlas/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  createSupabaseClient,
  type DistillationCandidateRecord,
  type DistillationPipelineStage,
  type DistillationShardRunRecord,
  type DistillationStageRunRecord,
  type ClassTypeRecord,
  type ClaimRecord,
  type DocumentRecord,
  type DocumentShardRecord,
  type EntityRecord,
  type RecordSourceRecord,
  type TableValue,
} from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type DistillationStagePanelProps = {
  document: DocumentRecord | null;
  documents: DocumentRecord[];
  onDocumentChange: (documentId: string) => void;
  selectedDocumentId: string | null;
  shards: DocumentShardRecord[];
};

type StageDefinition = {
  id: DistillationPipelineStage;
  label: string;
};

type NoticeState = {
  message: string;
  tone: "info" | "success";
};

type ReviewDecisionAction = "approve" | "approve_canon" | "approve_proposed" | "reject";

type ReviewDecisions = Record<string, ReviewDecisionAction | undefined>;

const stages: StageDefinition[] = [
  { id: "ontology", label: "Ontology" },
  { id: "entities", label: "Subjects" },
  { id: "claims", label: "Claims" },
  { id: "entity_relationships", label: "Subject Relations" },
  { id: "claim_relationships", label: "Claim Relations" },
  { id: "promotion", label: "Promotion" },
];
const autoCommittedStages = new Set<DistillationPipelineStage>([
  "claims",
  "entities",
  "entity_relationships",
  "claim_relationships",
  "promotion",
]);
const externallyManagedStages = new Set<DistillationPipelineStage>(["ontology"]);

const canvasStageClassName =
  "relative z-[1] h-full min-h-full overflow-hidden bg-background before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(100%_88%_at_50%_50%,transparent_62%,color-mix(in_oklch,var(--background)_52%,transparent)_100%)] before:opacity-70 before:content-['']";
const stagePanelClassName =
  "relative z-[1] flex h-full min-h-0 flex-col overflow-hidden p-6 pb-[180px] max-shell:p-3 max-shell:pb-[180px]";

export function DistillationStagePanel({
  document,
  documents,
  onDocumentChange,
  selectedDocumentId,
  shards,
}: DistillationStagePanelProps) {
  const router = useRouter();
  const [selectedShardId, setSelectedShardId] = useState<string | null>(null);
  const [shardRun, setShardRun] = useState<DistillationShardRunRecord | null>(null);
  const [shardRuns, setShardRuns] = useState<DistillationShardRunRecord[]>([]);
  const [stageRuns, setStageRuns] = useState<DistillationStageRunRecord[]>([]);
  const [candidates, setCandidates] = useState<DistillationCandidateRecord[]>([]);
  const [types, setTypes] = useState<ClassTypeRecord[]>([]);
  const [recordLabels, setRecordLabels] = useState<Map<string, string>>(new Map());
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyStage, setBusyStage] = useState<DistillationPipelineStage | null>(null);
  const [busyReviewStage, setBusyReviewStage] = useState<DistillationPipelineStage | null>(null);
  const [busyRun, setBusyRun] = useState(false);
  const [lockElapsedSeconds, setLockElapsedSeconds] = useState(0);
  const [reviewDecisions, setReviewDecisions] = useState<ReviewDecisions>({});
  const [isPending, startTransition] = useTransition();
  const stageSectionRefs = useRef<Partial<Record<DistillationPipelineStage, HTMLElement | null>>>({});
  const appLocked = busyRun || Boolean(busyStage);
  const lockTitle = busyStage ? `${stageLabel(busyStage)} is running` : "Preparing shard run";
  const lockMessage = busyStage
    ? "Atlas is processing this shard and saving candidates as the stage completes. Keep this tab open so the request can finish."
    : "Atlas is creating the shard run before distillation starts. Keep this tab open until setup finishes.";
  const effectiveSelectedShardId =
    selectedShardId && shards.some((shard) => shard.id === selectedShardId)
      ? selectedShardId
      : shards[0]?.id ?? null;
  const selectedShard = useMemo(
    () => shards.find((shard) => shard.id === effectiveSelectedShardId) ?? null,
    [effectiveSelectedShardId, shards],
  );
  const shardRunByShardId = useMemo(
    () => new Map(shardRuns.map((run) => [run.shard_id, run] as const)),
    [shardRuns],
  );
  const stageRunByStage = useMemo(
    () => new Map(stageRuns.map((stageRun) => [stageRun.stage, stageRun] as const)),
    [stageRuns],
  );
  const candidatesByStage = useMemo(() => {
    const grouped = new Map<DistillationPipelineStage, DistillationCandidateRecord[]>();

    for (const candidate of candidates) {
      grouped.set(candidate.stage, [...(grouped.get(candidate.stage) ?? []), candidate]);
    }

    return grouped;
  }, [candidates]);
  const typeLabels = useMemo(
    () => new Map(types.map((type) => [type.id, type.label] as const)),
    [types],
  );

  const loadShardRun = useCallback(async (shardId: string | null, clearMessages = true) => {
    if (clearMessages) {
      setError(null);
      setNotice(null);
    }

    if (clearMessages) {
      setShardRun(null);
      setStageRuns([]);
      setCandidates([]);
    }

    if (!shardId) {
      return;
    }

    const supabase = createSupabaseClient();
    const { data: run, error: runError } = await supabase
      .from("distillation_shard_runs")
      .select("*")
      .eq("shard_id", shardId)
      .maybeSingle();

    if (runError) {
      setError(runError.message);
      return;
    }

    if (!run) {
      return;
    }

    setShardRun(run);
    setShardRuns((currentRuns) => upsertShardRun(currentRuns, run));

    const [{ data: stagesData, error: stagesError }, { data: candidateData, error: candidateError }] =
      await Promise.all([
        supabase
          .from("distillation_stage_runs")
          .select("*")
          .eq("shard_run_id", run.id)
          .order("stage_order", { ascending: true }),
        supabase
          .from("distillation_candidates")
          .select("*")
          .eq("shard_run_id", run.id)
          .order("created_at", { ascending: false }),
      ]);

    if (stagesError || candidateError) {
      setError(stagesError?.message ?? candidateError?.message ?? "Could not load shard run.");
      return;
    }

    const nextStageRuns = stagesData ?? [];
    let nextCandidates = candidateData ?? [];
    const entityStageRun = nextStageRuns.find((item) => item.stage === "entities") ?? null;
    const hasEntityCandidates = nextCandidates.some((candidate) => candidate.stage === "entities");

    if (entityStageRun && !hasEntityCandidates) {
      const { data: sourceData, error: sourceError } = await supabase
        .from("record_sources")
        .select("*")
        .eq("shard_id", run.shard_id)
        .contains("metadata", { stageRunId: entityStageRun.id })
        .order("created_at", { ascending: false });

      if (sourceError) {
        setError(sourceError.message);
        return;
      }

      nextCandidates = [
        ...nextCandidates,
        ...(sourceData ?? [])
          .map((source) => entityCandidateFromRecordSource(source, entityStageRun, run.id))
          .filter((candidate): candidate is DistillationCandidateRecord => Boolean(candidate)),
      ];
    }

    setStageRuns(nextStageRuns);
    setCandidates(nextCandidates);
  }, []);

  const loadTypes = useCallback(async () => {
    const supabase = createSupabaseClient();
    const { data, error } = await supabase
      .from("types")
      .select("*")
      .order("label", { ascending: true });

    if (error) {
      setError(error.message);
      return;
    }

    setTypes(data ?? []);
  }, []);

  const loadShardRuns = useCallback(async (documentId: string | null | undefined) => {
    if (!documentId) {
      setShardRuns([]);
      return;
    }

    const supabase = createSupabaseClient();
    const { data, error } = await supabase
      .from("distillation_shard_runs")
      .select("*")
      .eq("document_id", documentId);

    if (error) {
      setError(error.message);
      return;
    }

    setShardRuns(data ?? []);
  }, []);

  const loadRecordLabels = useCallback(async (domainId: string | null | undefined) => {
    if (!domainId) {
      setRecordLabels(new Map());
      return;
    }

    const supabase = createSupabaseClient();
    const [{ data: entityData, error: entityError }, { data: claimData, error: claimError }] = await Promise.all([
      supabase
        .from("entities")
        .select("id,label")
        .eq("domain_id", domainId),
      supabase
        .from("claims")
        .select("id,label,claim_text")
        .eq("domain_id", domainId),
    ]);

    if (entityError || claimError) {
      setError(entityError?.message ?? claimError?.message ?? "Could not load record labels.");
      return;
    }

    const nextLabels = new Map<string, string>();

    for (const entity of (entityData ?? []) as Pick<EntityRecord, "id" | "label">[]) {
      nextLabels.set(entity.id, entity.label);
    }

    for (const claim of (claimData ?? []) as Pick<ClaimRecord, "id" | "label" | "claim_text">[]) {
      nextLabels.set(claim.id, claim.label || claim.claim_text);
    }

    setRecordLabels(nextLabels);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadShardRun(effectiveSelectedShardId);
      void loadShardRuns(document?.id);
      void loadTypes();
      void loadRecordLabels(document?.domain_id);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [document?.domain_id, document?.id, effectiveSelectedShardId, loadRecordLabels, loadShardRun, loadShardRuns, loadTypes]);

  useEffect(() => {
    if (!appLocked) {
      return;
    }

    const timer = window.setInterval(() => {
      setLockElapsedSeconds((currentSeconds) => currentSeconds + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [appLocked]);

  function startAppLockTimer() {
    setLockElapsedSeconds(0);
  }

  function stopAppLockTimer() {
    setLockElapsedSeconds(0);
  }

  function createRun() {
    if (!document || !effectiveSelectedShardId || isPending) {
      return;
    }

    setError(null);
    setNotice(null);
    startAppLockTimer();
    setBusyRun(true);

    startTransition(async () => {
      const result = await createShardDistillationRun({
        documentId: document.id,
        domainId: document.domain_id,
        shardId: effectiveSelectedShardId,
      });

      if (!result.ok || !result.run) {
        setBusyRun(false);
        stopAppLockTimer();
        setError(result.error ?? "Could not create shard run.");
        return;
      }

      const createdRun = result.run;

      setShardRun(createdRun);
      setShardRuns((currentRuns) => upsertShardRun(currentRuns, createdRun));
      setStageRuns(result.stages);
      setCandidates([]);
      await loadShardRun(effectiveSelectedShardId, false);
      await loadShardRuns(document.id);
      router.refresh();
      setNotice({
        message: "Shard run ready. Ontology is managed through Eve; run Entities when the domain ontology is ready.",
        tone: "info",
      });
      setBusyRun(false);
      stopAppLockTimer();
    });
  }

  function runStage(stage: DistillationPipelineStage) {
    if (!document || !effectiveSelectedShardId || isPending) {
      return;
    }

    setError(null);
    setNotice(null);
    startAppLockTimer();
    setBusyStage(stage);

    startTransition(async () => {
      const runResult = shardRun
        ? { ok: true, run: shardRun, stages: stageRuns, error: null }
        : await createShardDistillationRun({
          documentId: document.id,
          domainId: document.domain_id,
          shardId: effectiveSelectedShardId,
        });

      if (!runResult.ok || !runResult.run) {
        setBusyStage(null);
        stopAppLockTimer();
        setError(runResult.error ?? "Could not create shard run.");
        return;
      }

      const result = await runShardDistillationStage({
        runId: runResult.run.id,
        stage,
      });

      if (!result.ok) {
        setBusyStage(null);
        stopAppLockTimer();
        setError(result.error ?? "Stage failed.");
        await loadShardRun(effectiveSelectedShardId, false);
        return;
      }

      setNotice({
        message: `${stageLabel(stage)} processed ${result.candidateCount} item${result.candidateCount === 1 ? "" : "s"}.`,
        tone: "success",
      });
      setBusyStage(null);
      stopAppLockTimer();
      await loadShardRun(effectiveSelectedShardId, false);
      await loadShardRuns(document.id);
      await loadRecordLabels(document.domain_id);
      router.refresh();
      scrollToStage(stage);
    });
  }

  function setReviewDecision(candidateId: string, action: ReviewDecisionAction) {
    setReviewDecisions((currentDecisions) => {
      const nextDecisions = { ...currentDecisions };

      if (currentDecisions[candidateId] === action) {
        delete nextDecisions[candidateId];
      } else {
        nextDecisions[candidateId] = action;
      }

      return nextDecisions;
    });
  }

  function submitStageReview(stage: DistillationPipelineStage) {
    if (isPending) {
      return;
    }

    const decisions = Object.entries(reviewDecisions)
      .filter(([candidateId]) => candidates.some((candidate) => candidate.id === candidateId && candidate.stage === stage))
      .flatMap(([candidateId, action]) => (action ? [{ action, candidateId }] : []));

    if (decisions.length === 0) {
      setError("Select at least one candidate decision before submitting.");
      return;
    }

    setError(null);
    setNotice(null);
    setBusyReviewStage(stage);

    startTransition(async () => {
      const result = await reviewShardDistillationCandidates({ decisions });

      if (result.reviewedCount === 0 && !result.ok) {
        setBusyReviewStage(null);
        setError(result.error ?? "Review failed.");
        return;
      }

      setBusyReviewStage(null);
      setNotice({
        message: `${result.reviewedCount} candidate${result.reviewedCount === 1 ? "" : "s"} reviewed.`,
        tone: "success",
      });
      setReviewDecisions((currentDecisions) => {
        const failedCandidateIds = new Set(result.failed.map((failure) => failure.candidateId));
        const nextDecisions = { ...currentDecisions };

        for (const decision of decisions) {
          if (!failedCandidateIds.has(decision.candidateId)) {
            delete nextDecisions[decision.candidateId];
          }
        }

        return nextDecisions;
      });
      if (!result.ok) {
        setError(result.error ?? "Some candidates could not be reviewed.");
      }
      await loadShardRun(effectiveSelectedShardId, false);
      await loadShardRuns(document?.id);
      await loadRecordLabels(document?.domain_id);
      router.refresh();
      scrollToStage(stage);
    });
  }

  function scrollToStage(stage: DistillationPipelineStage) {
    stageSectionRefs.current[stage]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  return (
    <div className={canvasStageClassName}>
      {appLocked ? (
        <DistillationAppLock elapsedSeconds={lockElapsedSeconds} message={lockMessage} title={lockTitle} />
      ) : null}
      <div className={stagePanelClassName}>
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3 border-b border-border/70 bg-background/85 pb-4 backdrop-blur">
            <FieldGroup className="max-w-[340px] flex-1">
              <Field>
                <FieldLabel>Document</FieldLabel>
                <Select
                  value={selectedDocumentId ?? ""}
                  onValueChange={(value) => {
                    if (value) {
                      onDocumentChange(value);
                    }
                  }}
                >
                  <SelectTrigger aria-label="Distillation document" className="min-w-0 w-full">
                    <SelectValue className="min-w-0" placeholder="Select document">
                      {(value: string | null) => {
                        const selectedDocument = documents.find((candidate) => candidate.id === value) ?? null;

                        return (
                          <span className="min-w-0 truncate">
                            {selectedDocument ? documentLabel(selectedDocument) : "Select document"}
                          </span>
                        );
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {documents.map((documentOption) => (
                        <SelectItem key={documentOption.id} value={documentOption.id}>
                          {documentLabel(documentOption)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>

            <FieldGroup className="max-w-[320px] flex-1">
              <Field>
                <FieldLabel>Shard</FieldLabel>
                <Select
                  disabled={shards.length === 0}
                  value={effectiveSelectedShardId ?? ""}
                  onValueChange={(value) => {
                    setSelectedShardId(value);
                    void loadShardRun(value);
                  }}
                >
                  <SelectTrigger aria-label="Distillation shard" className="min-w-0 w-full">
                    <SelectValue className="min-w-0" placeholder="Select shard">
                      {(value: string | null) => {
                        const selectedShardOption = shards.find((candidate) => candidate.id === value) ?? null;
                        const selectedShardRun = selectedShardOption ? shardRunByShardId.get(selectedShardOption.id) ?? null : null;
                        const statusLabel = shardStatusLabel(selectedShardRun);

                        return (
                          <span className="min-w-0 truncate">
                            {selectedShardOption
                              ? [shardLabel(selectedShardOption), statusLabel].filter(Boolean).join(" · ")
                              : "Select shard"}
                          </span>
                        );
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {shards.map((shard) => (
                        <SelectItem key={shard.id} value={shard.id}>
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="min-w-0 truncate">{shardLabel(shard)}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {shardStatusLabel(shardRunByShardId.get(shard.id) ?? null)}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>

            <Button disabled={!document || !effectiveSelectedShardId || isPending} onClick={createRun}>
              {busyRun ? <Spinner /> : <Play />}
              {shardRun ? "Refresh Run" : "Start Shard Run"}
            </Button>
          </div>

          {notice ? (
            <div
              className={cn(
                "rounded-md border px-3 py-2 text-sm",
                notice.tone === "success"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-border/70 bg-muted/45 text-muted-foreground",
              )}
            >
              {notice.message}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {!document ? (
            <Empty className="min-h-[360px]">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Play />
                </EmptyMedia>
                <EmptyTitle>Select a Document</EmptyTitle>
                <EmptyDescription>Choose a document to work through its shards.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : shards.length === 0 ? (
            <Empty className="min-h-[360px]">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Play />
                </EmptyMedia>
                <EmptyTitle>No Shards</EmptyTitle>
                <EmptyDescription>This document needs shards before distillation can run.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="grid min-h-0 flex-1 grid-cols-[minmax(220px,280px)_minmax(0,1fr)] gap-4 max-shell:grid-cols-1">
              <div className="min-h-0 overflow-auto rounded-md border border-border/70 bg-background/70">
                {stages.map((stage, index) => {
                  const stageRun = stageRunByStage.get(stage.id);
                  const stageCandidates = candidatesByStage.get(stage.id) ?? [];
                  const pendingCount = stageCandidates.filter((candidate) => candidate.status === "pending").length;
                  const canRun = Boolean(
                    selectedShard &&
                    !externallyManagedStages.has(stage.id) &&
                    canRunStage(index, stageRunByStage, candidatesByStage),
                  );

                  return (
                    <div
                      className="cursor-pointer border-b border-border/70 p-3 outline-none transition-colors last:border-b-0 hover:bg-muted/40 focus-visible:bg-muted/40"
                      key={stage.id}
                      onClick={() => scrollToStage(stage.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          scrollToStage(stage.id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{stage.label}</div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            <Badge variant={stageRun?.status === "failed" ? "destructive" : "secondary"}>
                              {stageRun?.status ?? "pending"}
                            </Badge>
                            {pendingCount > 0 ? <Badge>{pendingCount} review</Badge> : null}
                          </div>
                          {stageRun?.status === "failed" && stageRun.error_message ? (
                            <p className="mt-2 line-clamp-2 text-xs text-destructive">
                              {stageRun.error_message}
                            </p>
                          ) : null}
                        </div>
                        <Button
                          aria-label={`Run ${stage.label}`}
                          disabled={!canRun || isPending}
                          onClick={(event) => {
                            event.stopPropagation();
                            runStage(stage.id);
                          }}
                          size="icon"
                          variant="ghost"
                        >
                          {busyStage === stage.id ? <Spinner /> : <Play />}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="min-h-0 overflow-auto rounded-md border border-border/70 bg-background/80">
                <div className="border-b border-border/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold">{selectedShard ? shardLabel(selectedShard) : "Shard"}</h2>
                      {selectedShard ? (
                        <p className="mt-1 text-sm text-muted-foreground">
                          Shard size {formatBytes(selectedShard.size_bytes)}
                        </p>
                      ) : (
                        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                          Select a shard to begin.
                        </p>
                      )}
                    </div>
                    {shardRun ? <Badge>{shardRun.status}</Badge> : <Badge variant="secondary">not started</Badge>}
                  </div>
                </div>

                <div className="divide-y divide-border/70">
                  {stages.map((stage) => (
                    <StageCandidateSection
                      busy={busyReviewStage === stage.id}
                      candidates={candidatesByStage.get(stage.id) ?? []}
                      decisions={reviewDecisions}
                      key={stage.id}
                      label={stage.label}
                      onDecision={setReviewDecision}
                      onSubmit={() => submitStageReview(stage.id)}
                      recordLabels={recordLabels}
                      sectionRef={(node) => {
                        stageSectionRefs.current[stage.id] = node;
                      }}
                      stage={stage.id}
                      stageRun={stageRunByStage.get(stage.id) ?? null}
                      typeLabels={typeLabels}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DistillationAppLock({
  elapsedSeconds,
  message,
  title,
}: {
  elapsedSeconds: number;
  message: string;
  title: string;
}) {
  return (
    <div
      aria-live="polite"
      aria-modal="true"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-transparent p-6"
      role="dialog"
    >
      <div className="flex w-full max-w-md items-start gap-3 rounded-lg border border-border bg-background px-4 py-3 shadow-lg">
        <Spinner />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium">{title}</div>
            <div className="rounded-md border border-border bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
              {formatElapsedDuration(elapsedSeconds)}
            </div>
          </div>
          <div className="mt-1 text-sm text-muted-foreground">{message}</div>
        </div>
      </div>
    </div>
  );
}

function formatElapsedDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function StageCandidateSection({
  busy,
  candidates,
  decisions,
  label,
  onDecision,
  onSubmit,
  recordLabels,
  sectionRef,
  stage,
  stageRun,
  typeLabels,
}: {
  busy: boolean;
  candidates: DistillationCandidateRecord[];
  decisions: ReviewDecisions;
  label: string;
  onDecision: (candidateId: string, action: ReviewDecisionAction) => void;
  onSubmit: () => void;
  recordLabels: Map<string, string>;
  sectionRef: (node: HTMLElement | null) => void;
  stage: DistillationPipelineStage;
  stageRun: DistillationStageRunRecord | null;
  typeLabels: Map<string, string>;
}) {
  const autoCommitted = autoCommittedStages.has(stage);
  const externallyManaged = externallyManagedStages.has(stage);
  const [expanded, setExpanded] = useState(false);
  const pendingCandidates = candidates.filter((candidate) => candidate.status === "pending");
  const visibleCandidates = expanded ? candidates : pendingCandidates;
  const decidedCount = pendingCandidates.filter((candidate) => Boolean(decisions[candidate.id])).length;
  const canonCount = pendingCandidates.filter((candidate) => decisions[candidate.id] === "approve_canon").length;
  const proposedCount = pendingCandidates.filter((candidate) => decisions[candidate.id] === "approve_proposed").length;
  const approvedCount = pendingCandidates.filter((candidate) => decisions[candidate.id] === "approve").length;
  const rejectedCount = pendingCandidates.filter((candidate) => decisions[candidate.id] === "reject").length;
  const undecidedCount = pendingCandidates.length - decidedCount;
  const committedCount = (stageRun?.approved_count ?? 0) + (stageRun?.rejected_count ?? 0);
  const stageSummary = stageRunSummaryText(stage, stageRun);
  const submittedCount = candidates.length;
  const displayCount = submittedCount || committedCount || stageSummary.count;
  const hasSubmittedItems = submittedCount > 0;
  const emptyText = committedCount > 0
    ? `${committedCount} item${committedCount === 1 ? "" : "s"} committed.`
    : externallyManaged
      ? "Managed through Eve."
    : stageSummary.text ?? "No candidates.";

  return (
    <section className="scroll-mt-4 p-4" ref={sectionRef}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <Button
          aria-expanded={expanded}
          aria-disabled={!hasSubmittedItems}
          className="h-auto min-w-0 justify-start gap-2 px-0 py-0 text-left text-sm font-semibold hover:bg-transparent"
          onClick={() => {
            if (hasSubmittedItems) {
              setExpanded((current) => !current);
            }
          }}
          variant="ghost"
        >
          <ChevronDown
            aria-hidden={true}
            className={cn("size-4 shrink-0 transition-transform", !expanded && "-rotate-90")}
          />
          <span className="min-w-0 truncate">{label}</span>
        </Button>
        <div className="flex shrink-0 items-center gap-2">
          {hasSubmittedItems ? (
            <Badge variant="outline">
              {expanded ? "hide" : "show"}
            </Badge>
          ) : null}
          <Badge variant={pendingCandidates.length > 0 ? "default" : "secondary"}>
            {displayCount}
          </Badge>
        </div>
      </div>
      {stageRun?.status === "failed" && stageRun.error_message ? (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {stageRun.error_message}
        </div>
      ) : null}
      <p className="text-sm text-muted-foreground">
        {pendingCandidates.length > 0
          ? `${pendingCandidates.length} item${pendingCandidates.length === 1 ? "" : "s"} pending review.`
          : emptyText}
      </p>
      {hasSubmittedItems && expanded ? (
        <div className="space-y-2">
          {autoCommitted && pendingCandidates.length > 0 ? (
            <p className="rounded-md border border-border/70 bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
              {pendingCandidates.length} item{pendingCandidates.length === 1 ? "" : "s"} waiting to commit. Run this stage again to finish.
            </p>
          ) : null}
          {visibleCandidates.map((candidate) => (
            <div key={candidate.id} className="rounded-md border border-border/70 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={candidate.status === "pending" ? "default" : "secondary"}>
                      {candidate.status}
                    </Badge>
                    <span className="text-sm font-medium">{candidateTitle(candidate, recordLabels)}</span>
                  </div>
                  <CandidateDetails candidate={candidate} recordLabels={recordLabels} typeLabels={typeLabels} />
                </div>
                {candidate.status === "pending" && !autoCommitted ? (
                  <CandidateDecisionControls
                    candidate={candidate}
                    decision={decisions[candidate.id] ?? null}
                    disabled={busy}
                    onDecision={onDecision}
                  />
                ) : null}
              </div>
            </div>
          ))}
          {!autoCommitted ? <div className="sticky bottom-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background/95 px-3 py-2 shadow-lg backdrop-blur">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{decidedCount} selected</span>
              {canonCount > 0 ? <Badge>{canonCount} canon</Badge> : null}
              {proposedCount > 0 ? <Badge variant="secondary">{proposedCount} proposed</Badge> : null}
              {approvedCount > 0 ? <Badge>{approvedCount} approve</Badge> : null}
              {rejectedCount > 0 ? <Badge variant="outline">{rejectedCount} reject</Badge> : null}
              <span>{undecidedCount} undecided</span>
            </div>
            <Button disabled={busy || decidedCount === 0} onClick={onSubmit} size="sm">
              {busy ? <Spinner /> : <Check />}
              Submit reviewed
            </Button>
          </div> : null}
        </div>
      ) : null}
    </section>
  );
}

function stageRunSummaryText(
  stage: DistillationPipelineStage,
  stageRun: DistillationStageRunRecord | null,
) {
  if (!stageRun || stageRun.status === "pending" || stageRun.status === "failed") {
    return { count: 0, text: null };
  }

  const summary = tableObject(stageRun.result_summary);

  if (!summary) {
    return { count: 0, text: null };
  }

  if (stage === "entities") {
    const entityCount = numberValue(summary.entityCount);
    const createdCount = numberValue(summary.createdCount);
    const linkedCount = numberValue(summary.linkedCount);

    if (entityCount > 0) {
      return {
        count: entityCount,
        text: `${entityCount} ${pluralize("entity", entityCount)} processed: ${createdCount} created, ${linkedCount} linked.`,
      };
    }
  }

  const promotedCount = numberValue(summary.promotedCount);

  if (stage === "promotion" && promotedCount > 0) {
    return {
      count: promotedCount,
      text: `${promotedCount} ${pluralize("record", promotedCount)} promoted.`,
    };
  }

  return { count: 0, text: null };
}

function CandidateDecisionControls({
  candidate,
  decision,
  disabled,
  onDecision,
}: {
  candidate: DistillationCandidateRecord;
  decision: ReviewDecisionAction | null;
  disabled: boolean;
  onDecision: (candidateId: string, action: ReviewDecisionAction) => void;
}) {
  if (candidate.candidate_kind === "entity") {
    return (
      <div className="flex flex-wrap gap-2">
        <DecisionButton
          action="approve_canon"
          candidateId={candidate.id}
          decision={decision}
          disabled={disabled}
          label="Canon"
          onDecision={onDecision}
        />
        <DecisionButton
          action="approve_proposed"
          candidateId={candidate.id}
          decision={decision}
          disabled={disabled}
          label="Proposed"
          onDecision={onDecision}
        />
        <DecisionButton
          action="reject"
          candidateId={candidate.id}
          decision={decision}
          disabled={disabled}
          label="Reject"
          onDecision={onDecision}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <DecisionButton
        action="approve"
        candidateId={candidate.id}
        decision={decision}
        disabled={disabled}
        label="Approve"
        onDecision={onDecision}
      />
      <DecisionButton
        action="reject"
        candidateId={candidate.id}
        decision={decision}
        disabled={disabled}
        label="Reject"
        onDecision={onDecision}
      />
    </div>
  );
}

function DecisionButton({
  action,
  candidateId,
  decision,
  disabled,
  label,
  onDecision,
}: {
  action: ReviewDecisionAction;
  candidateId: string;
  decision: ReviewDecisionAction | null;
  disabled: boolean;
  label: string;
  onDecision: (candidateId: string, action: ReviewDecisionAction) => void;
}) {
  const selected = decision === action;

  return (
    <Button
      aria-pressed={selected}
      disabled={disabled}
      onClick={() => onDecision(candidateId, action)}
      size="sm"
      variant={selected ? "default" : "outline"}
    >
      {selected ? <Check /> : action === "reject" ? <X /> : null}
      {label}
    </Button>
  );
}

function canRunStage(
  stageIndex: number,
  stageRunByStage: Map<DistillationPipelineStage, DistillationStageRunRecord>,
  candidatesByStage: Map<DistillationPipelineStage, DistillationCandidateRecord[]>,
) {
  const stage = stages[stageIndex];
  const stageRun = stageRunByStage.get(stage.id);
  const pendingCount = (candidatesByStage.get(stage.id) ?? []).filter((candidate) => candidate.status === "pending").length;

  if (externallyManagedStages.has(stage.id)) {
    return false;
  }

  if ((pendingCount > 0 && !autoCommittedStages.has(stage.id)) || stageRun?.status === "running") {
    return false;
  }

  for (const priorStage of stages.slice(0, stageIndex)) {
    if (externallyManagedStages.has(priorStage.id)) {
      continue;
    }

    const priorStageRun = stageRunByStage.get(priorStage.id);

    if (priorStageRun?.status !== "completed" && priorStageRun?.status !== "skipped") {
      return false;
    }
  }

  return true;
}

function documentLabel(document: DocumentRecord) {
  return document.title || document.label || "Untitled document";
}

function shardLabel(shard: DocumentShardRecord) {
  const heading = shard.heading_path.at(-1)?.trim();

  return heading ? `${shard.position}. ${heading}` : `Shard ${shard.position}`;
}

function shardStatusLabel(run: DistillationShardRunRecord | null) {
  if (!run) {
    return "not started";
  }

  if (run.current_stage === "complete" || run.status === "completed" || run.completed_at) {
    return "processed";
  }

  if (run.status === "needs_review") {
    return "needs review";
  }

  if (run.status === "running") {
    return "running";
  }

  if (run.status === "failed") {
    return "failed";
  }

  return "started";
}

function upsertShardRun(
  runs: DistillationShardRunRecord[],
  nextRun: DistillationShardRunRecord,
) {
  const existingIndex = runs.findIndex((run) => run.id === nextRun.id);

  if (existingIndex === -1) {
    return [...runs, nextRun];
  }

  return runs.map((run, index) => (index === existingIndex ? nextRun : run));
}

function entityCandidateFromRecordSource(
  source: RecordSourceRecord,
  stageRun: DistillationStageRunRecord,
  shardRunId: string,
): DistillationCandidateRecord | null {
  const metadata = tableObject(source.metadata);

  if (!metadata) {
    return null;
  }

  const label = stringValue(metadata.candidateLabel);
  const typeId = stringValue(metadata.typeId);

  if (!label || !typeId) {
    return null;
  }

  return {
    approval_action: stringValue(metadata.status) === "canon" ? "approve_canon" : "approve_proposed",
    candidate_kind: "entity",
    created_at: source.created_at,
    dedupe_key: `source:${source.id}`,
    error_message: null,
    evidence: {
      shardId: source.shard_id,
    },
    generated_at: source.created_at,
    id: `source:${source.id}`,
    payload: {
      aliases: stringArrayValue(metadata.aliases),
      existingEntityId: stringValue(metadata.existingEntityId),
      label,
      rationale: stringValue(metadata.rationale),
      typeId,
    },
    reviewed_at: source.updated_at,
    shard_run_id: shardRunId,
    stage: "entities",
    stage_run_id: stageRun.id,
    status: "approved",
    target_class_id: source.source_class_id,
    target_record_id: source.source_record_id,
    updated_at: source.updated_at,
  };
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"] as const;
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** unitIndex;
  const fractionDigits = value >= 10 || unitIndex === 0 ? 0 : 1;

  return `${value.toFixed(fractionDigits)} ${units[unitIndex]}`;
}

function stageLabel(stage: DistillationPipelineStage) {
  return stages.find((item) => item.id === stage)?.label ?? stage;
}

function candidateTitle(candidate: DistillationCandidateRecord, recordLabels: Map<string, string>) {
  const payload = tableObject(candidate.payload);

  if (candidate.candidate_kind === "entity_relationship" || candidate.candidate_kind === "claim_relationship") {
    const sourceRecordId = stringValue(payload?.sourceRecordId);
    const targetRecordId = stringValue(payload?.targetRecordId);

    if (sourceRecordId && targetRecordId) {
      return `${recordLabels.get(sourceRecordId) ?? sourceRecordId} -> ${recordLabels.get(targetRecordId) ?? targetRecordId}`;
    }
  }

  return (
    stringValue(payload?.label) ||
    stringValue(payload?.statement) ||
    stringValue(payload?.slug) ||
    `${candidate.candidate_kind.replaceAll("_", " ")} candidate`
  );
}

function CandidateDetails({
  candidate,
  recordLabels,
  typeLabels,
}: {
  candidate: DistillationCandidateRecord;
  recordLabels: Map<string, string>;
  typeLabels: Map<string, string>;
}) {
  const payload = tableObject(candidate.payload);

  if (!payload) {
    return <p className="mt-2 text-sm text-muted-foreground">{candidate.candidate_kind.replaceAll("_", " ")}</p>;
  }

  if (candidate.candidate_kind === "entity") {
    const typeId = stringValue(payload.typeId);
    const aliases = stringArrayValue(payload.aliases);
    const existingEntityId = stringValue(payload.existingEntityId);
    const rationale = stringValue(payload.rationale);

    return (
      <div className="mt-2 space-y-1 text-sm text-muted-foreground">
        <CandidateDetailRow label="Suggested type" value={typeLabels.get(typeId) ?? (typeId || "Unknown")} />
        <CandidateDetailRow label="Match" value={existingEntityId ? `Existing subject ${existingEntityId}` : "New subject"} />
        {aliases.length > 0 ? <CandidateDetailRow label="Aliases" value={aliases.join(", ")} /> : null}
        {rationale ? <CandidateDetailRow label="Why" value={rationale} /> : null}
      </div>
    );
  }

  return <p className="mt-2 text-sm text-muted-foreground">{candidateDetails(candidate, typeLabels, recordLabels)}</p>;
}

function CandidateDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[120px_minmax(0,1fr)]">
      <span className="text-muted-foreground/75">{label}</span>
      <span className="min-w-0 text-foreground/80">{value}</span>
    </div>
  );
}

function candidateDetails(
  candidate: DistillationCandidateRecord,
  typeLabels: Map<string, string>,
  recordLabels: Map<string, string>,
) {
  const payload = tableObject(candidate.payload);

  if (!payload) {
    return candidate.candidate_kind.replaceAll("_", " ");
  }

  if (candidate.candidate_kind === "entity_type" || candidate.candidate_kind === "claim_type" || candidate.candidate_kind === "relationship_type") {
    return [
      stringValue(payload.classTableName),
      stringValue(payload.slug),
      stringValue(payload.rationale),
    ].filter(Boolean).join(" · ");
  }

  if (candidate.candidate_kind === "entity") {
    const typeId = stringValue(payload.typeId);

    return [
      `type ${typeLabels.get(typeId) ?? typeId}`,
      stringValue(payload.existingEntityId) ? `matches ${stringValue(payload.existingEntityId)}` : "new subject",
      stringArrayValue(payload.aliases).join(", "),
      stringValue(payload.rationale),
    ].filter(Boolean).join(" · ");
  }

  if (candidate.candidate_kind === "claim") {
    const typeId = stringValue(payload.typeId);

    return [
      stringValue(payload.sourceType),
      `type ${typeLabels.get(typeId) ?? typeId}`,
      `targets ${stringArrayValue(payload.targetEntityIds).map((id) => recordLabels.get(id) ?? id).join(", ")}`,
    ].filter(Boolean).join(" · ");
  }

  if (candidate.candidate_kind === "entity_relationship" || candidate.candidate_kind === "claim_relationship") {
    const typeId = stringValue(payload.typeId);

    return [
      `${recordLabel(payload.sourceRecordId, recordLabels)} -> ${recordLabel(payload.targetRecordId, recordLabels)}`,
      `type ${typeLabels.get(typeId) ?? typeId}`,
      stringValue(payload.rationale),
    ].filter(Boolean).join(" · ");
  }

  if (candidate.candidate_kind === "promotion") {
    return [
      `${numberValue(payload.claimCount)} claims`,
      `${numberValue(payload.relationshipCount)} relationships`,
    ].join(" · ");
  }

  return String(candidate.candidate_kind).replaceAll("_", " ");
}

function recordLabel(value: TableValue | undefined, recordLabels: Map<string, string>) {
  const id = stringValue(value);

  return id ? recordLabels.get(id) ?? id : "";
}

function tableObject(value: TableValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function stringValue(value: TableValue | undefined) {
  return typeof value === "string" ? value : "";
}

function stringArrayValue(value: TableValue | undefined) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function numberValue(value: TableValue | undefined) {
  return typeof value === "number" ? value : 0;
}

function pluralize(label: string, count: number) {
  return count === 1 ? label : `${label}s`;
}
