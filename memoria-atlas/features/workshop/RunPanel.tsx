"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  CircleX,
  ExternalLink,
  LoaderCircle,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  cancelExtractionRunWorkshopAction,
  createExtractionRunWorkshopAction,
  deleteExtractionRunWorkshopAction,
} from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ButtonGroup,
  ButtonGroupSeparator,
} from "@/components/ui/button-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  LabRunDetail,
  LabRunStartDocumentOption,
  LabRunStartOptions,
  LabRunStepView,
} from "@/domain/runs";
import { cn } from "@/lib/utils";

type RunPanelProps = {
  domainSlug: string;
  selectedRun: LabRunDetail | null;
  selectedRunId: string | null;
  selectedStepId: string | null;
  showHeader?: boolean;
  startOptions: LabRunStartOptions;
};

type PendingAction = "delete" | "extract" | "resume" | "stop" | null;

type PersistedRunControlState = {
  documentId?: string;
  effort?: string;
  model?: string;
  sourceUnitIdsByDocument?: Record<string, string[]>;
};

type RunControlState = {
  documentId: string;
  effort: string;
  model: string;
  selectedSourceUnitIds: string[];
};

type RunRoutePayload = {
  error?: string;
  run?: LabRunDetail;
};

type AdvanceRunRequestResult =
  | {
      ok: true;
      reason: string;
      status: string;
    }
  | {
      code: string | null;
      error: string;
      ok: false;
    };

function runControlStorageKey(domainSlug: string) {
  return `memoria:lab-run-control:${domainSlug}`;
}

function readPersistedRunControlState(
  domainSlug: string
): PersistedRunControlState | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(
    runControlStorageKey(domainSlug)
  );

  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;

    if (typeof parsed === "object" && parsed !== null) {
      return parsed as PersistedRunControlState;
    }
  } catch {
    return null;
  }

  return null;
}

function writePersistedRunControlState(
  domainSlug: string,
  value: PersistedRunControlState
) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    runControlStorageKey(domainSlug),
    JSON.stringify(value)
  );
}

function initialRunControlState(input: {
  defaultDocument: LabRunStartDocumentOption | null;
  defaultModel: LabRunStartOptions["modelOptions"][number] | null;
  documents: LabRunStartDocumentOption[];
  domainSlug: string;
  modelOptions: LabRunStartOptions["modelOptions"];
}): RunControlState {
  const persisted = readPersistedRunControlState(input.domainSlug);
  const persistedDocument =
    input.documents.find((document) => document.id === persisted?.documentId) ??
    null;
  const nextDocument = persistedDocument ?? input.defaultDocument;
  const persistedModel = input.modelOptions.find(
    (option) => option.value === persisted?.model
  );
  const nextModel = persistedModel ?? input.defaultModel;
  const effortOptions = nextModel?.effortOptions ?? [
    { label: "Auto", value: "auto" },
  ];
  const nextEffort = effortOptions.some(
    (option) => option.value === persisted?.effort
  )
    ? (persisted?.effort ?? "auto")
    : (nextModel?.defaultEffort ?? "auto");
  const persistedSourceUnitIds =
    nextDocument && persisted?.sourceUnitIdsByDocument
      ? persisted.sourceUnitIdsByDocument[nextDocument.id]
      : null;
  const sourceUnitIds = nextDocument
    ? new Set(nextDocument.sourceUnits.map((sourceUnit) => sourceUnit.id))
    : new Set<string>();
  const selectedSourceUnitIds =
    nextDocument && persistedSourceUnitIds
      ? persistedSourceUnitIds.filter((sourceUnitId) =>
          sourceUnitIds.has(sourceUnitId)
        )
      : (nextDocument?.sourceUnits.map((sourceUnit) => sourceUnit.id) ?? []);

  return {
    documentId: nextDocument?.id ?? "",
    effort: nextEffort,
    model: nextModel?.value ?? "",
    selectedSourceUnitIds,
  };
}

function labRunRefreshSignature(run: LabRunDetail) {
  return [
    run.status,
    run.currentStep,
    run.updatedAt,
    run.bundleId ?? "",
    run.errorMessage ?? "",
    ...run.steps.map((step) =>
      [
        step.id,
        step.status,
        step.claimCount,
        step.retryCount,
        step.startedAt ?? "",
        step.completedAt ?? "",
        step.errorMessage ?? "",
      ].join(":")
    ),
  ].join("|");
}

async function advanceRunRequest(
  domainSlug: string,
  runId: string
): Promise<AdvanceRunRequestResult> {
  const response = await fetch(
    `/api/workshop/runs/${encodeURIComponent(runId)}/advance`,
    {
      body: JSON.stringify({ domainSlug }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }
  );
  const payload = (await response.json().catch(() => ({}))) as {
    advance?: {
      reason?: unknown;
      run?: {
        status?: unknown;
      };
    };
    code?: unknown;
    error?: unknown;
  };

  if (!response.ok) {
    return {
      code: typeof payload.code === "string" ? payload.code : null,
      error:
        typeof payload.error === "string"
          ? payload.error
          : "Extraction execution failed",
      ok: false,
    };
  }

  return {
    ok: true,
    reason:
      typeof payload.advance?.reason === "string"
        ? payload.advance.reason
        : "advanced",
    status:
      typeof payload.advance?.run?.status === "string"
        ? payload.advance.run.status
        : "running",
  };
}

async function advanceRunUntilTerminal(
  domainSlug: string,
  runId: string,
  onAdvance: () => void
): Promise<AdvanceRunRequestResult> {
  for (let index = 0; index < 8; index += 1) {
    const result = await advanceRunRequest(domainSlug, runId);

    onAdvance();

    if (!result.ok) {
      return result;
    }

    if (result.status !== "running" || result.reason !== "advanced") {
      return result;
    }
  }

  return {
    code: "advance_limit_reached",
    error: "Run did not reach a terminal state.",
    ok: false,
  };
}

export function RunPanel({
  domainSlug,
  selectedRun,
  selectedRunId,
  selectedStepId,
  showHeader = true,
  startOptions,
}: RunPanelProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialDocumentId =
    selectedRun?.documentId ?? startOptions.documents[0]?.id ?? "";
  const initialDocument =
    startOptions.documents.find(
      (document) => document.id === initialDocumentId
    ) ?? null;
  const initialModel =
    startOptions.modelOptions.find(
      (option) => option.value === startOptions.defaultModel
    ) ??
    startOptions.modelOptions[0] ??
    null;
  const buildInitialControlState = () =>
    initialRunControlState({
      defaultDocument: initialDocument,
      defaultModel: initialModel,
      documents: startOptions.documents,
      domainSlug,
      modelOptions: startOptions.modelOptions,
    });
  const [controlState, setControlState] = useState(buildInitialControlState);
  const { documentId, effort, model } = controlState;
  const setDocumentId = (nextDocumentId: string) =>
    setControlState((current) => ({
      ...current,
      documentId: nextDocumentId,
    }));
  const setModel = (nextModel: string) =>
    setControlState((current) => ({
      ...current,
      model: nextModel,
    }));
  const setEffort = (nextEffort: string) =>
    setControlState((current) => ({
      ...current,
      effort: nextEffort,
    }));
  const [selectedSourceUnitIds, setSelectedSourceUnitIds] = useState<string[]>(
    () => controlState.selectedSourceUnitIds
  );
  const [message, setMessage] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [now, setNow] = useState(() => Date.now());
  const runRefreshSignatureRef = useRef(
    selectedRun ? labRunRefreshSignature(selectedRun) : ""
  );
  const [isPending, startTransition] = useTransition();
  const busy = isPending || pendingAction !== null;
  const selectedDocument = useMemo(
    () =>
      startOptions.documents.find((document) => document.id === documentId) ??
      null,
    [documentId, startOptions.documents]
  );
  const modelOptions = startOptions.modelOptions;
  const selectedModel = modelOptions.find((option) => option.value === model);
  const selectedEffortOptions = selectedModel?.effortOptions ?? [
    { label: "Auto", value: "auto" },
  ];
  const effortEnabled = selectedEffortOptions.length > 1;
  const activeRunDocumentIds = useMemo(
    () => new Set(startOptions.activeRunDocumentIds),
    [startOptions.activeRunDocumentIds]
  );
  const selectedDocumentHasActiveRun = activeRunDocumentIds.has(documentId);

  useEffect(() => {
    if (!documentId) {
      return;
    }

    const persisted = readPersistedRunControlState(domainSlug) ?? {};

    writePersistedRunControlState(domainSlug, {
      ...persisted,
      documentId,
      effort,
      model,
      sourceUnitIdsByDocument: {
        ...persisted.sourceUnitIdsByDocument,
        [documentId]: selectedSourceUnitIds,
      },
    });
  }, [documentId, domainSlug, effort, model, selectedSourceUnitIds]);

  useEffect(() => {
    runRefreshSignatureRef.current = selectedRun
      ? labRunRefreshSignature(selectedRun)
      : "";
  }, [selectedRun]);

  useEffect(() => {
    if (selectedRun?.status !== "running") {
      return;
    }

    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [selectedRun?.id, selectedRun?.status]);

  useEffect(() => {
    if (selectedRun?.status !== "running") {
      return;
    }

    const runId = selectedRun.id;
    let stopped = false;
    let timeoutId: number | null = null;

    async function pollRun() {
      const controller = new AbortController();

      try {
        const response = await fetch(
          `/api/workshop/runs/${encodeURIComponent(runId)}?${new URLSearchParams(
            { domain: domainSlug }
          ).toString()}`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );

        if (response.ok) {
          const payload = (await response.json()) as RunRoutePayload;
          const nextSignature = payload.run
            ? labRunRefreshSignature(payload.run)
            : "";

          if (
            nextSignature &&
            runRefreshSignatureRef.current &&
            nextSignature !== runRefreshSignatureRef.current
          ) {
            runRefreshSignatureRef.current = nextSignature;
            window.dispatchEvent(new Event("memoria:shelf-refresh"));
            router.refresh();
          }
        }
      } catch {
      } finally {
        if (!stopped) {
          timeoutId = window.setTimeout(pollRun, 5000);
        }
      }
    }

    void pollRun();

    return () => {
      stopped = true;

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [domainSlug, router, selectedRun?.id, selectedRun?.status]);

  function replaceSelection(nextRunId: string, nextStepId?: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("domain", domainSlug);
    params.set("class", "run");
    params.set("sel", nextRunId);

    if (nextStepId) {
      params.set("step", nextStepId);
    } else {
      params.delete("step");
    }

    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function clearRunSelection() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("domain", domainSlug);
    params.set("class", "run");
    params.delete("sel");
    params.delete("step");

    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function handleRunChange(nextRunId: string) {
    replaceSelection(nextRunId);
  }

  function handleResetRunSetup() {
    const nextState = buildInitialControlState();

    setMessage(null);
    setControlState(nextState);
    setSelectedSourceUnitIds(nextState.selectedSourceUnitIds);
    clearRunSelection();
  }

  function selectStep(stepId: string) {
    if (!selectedRun) {
      return;
    }

    replaceSelection(selectedRun.id, stepId);
  }

  function handleDocumentChange(nextDocumentId: string) {
    const nextDocument = startOptions.documents.find(
      (document) => document.id === nextDocumentId
    );
    const persistedSourceUnitIds =
      readPersistedRunControlState(domainSlug)?.sourceUnitIdsByDocument?.[
        nextDocumentId
      ];
    const sourceUnitIds = nextDocument
      ? new Set(nextDocument.sourceUnits.map((sourceUnit) => sourceUnit.id))
      : new Set<string>();

    setMessage(null);
    setDocumentId(nextDocumentId);
    setSelectedSourceUnitIds(
      nextDocument && persistedSourceUnitIds
        ? persistedSourceUnitIds.filter((sourceUnitId) =>
            sourceUnitIds.has(sourceUnitId)
          )
        : (nextDocument?.sourceUnits.map((sourceUnit) => sourceUnit.id) ?? [])
    );
  }

  function handleModelChange(nextModel: string) {
    const nextModelOption = modelOptions.find(
      (option) => option.value === nextModel
    );

    setModel(nextModel);
    setEffort(nextModelOption?.defaultEffort ?? "auto");
  }

  function toggleSourceUnit(sourceUnitId: string, checked: boolean) {
    setSelectedSourceUnitIds((current) =>
      checked
        ? Array.from(new Set([...current, sourceUnitId]))
        : current.filter((id) => id !== sourceUnitId)
    );
  }

  function handleSelectAllSourceUnits(document: LabRunStartDocumentOption) {
    setSelectedSourceUnitIds(
      document.sourceUnits.map((sourceUnit) => sourceUnit.id)
    );
  }

  async function handleStartRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedDocument || busy) {
      return;
    }

    if (selectedSourceUnitIds.length === 0) {
      setMessage("Select at least one source unit.");
      return;
    }

    const trimmedModel = model.trim();
    const settings = {
      ...(trimmedModel ? { model: trimmedModel } : {}),
      ...(effort !== "auto" ? { effort } : {}),
      ...(selectedSourceUnitIds.length === selectedDocument.sourceUnits.length
        ? {}
        : { sourceUnitIds: selectedSourceUnitIds }),
    };

    setMessage(null);
    setPendingAction("extract");
    startTransition(async () => {
      const result = await createExtractionRunWorkshopAction(
        domainSlug,
        selectedDocument.id,
        settings
      );

      setPendingAction(null);
      window.dispatchEvent(new Event("memoria:shelf-refresh"));

      if (result.ok) {
        replaceSelection(result.data.runId);
        router.refresh();
        void advanceRunUntilTerminal(domainSlug, result.data.runId, () => {
          window.dispatchEvent(new Event("memoria:shelf-refresh"));
          router.refresh();
        })
          .then((advanceResult) => {
            window.dispatchEvent(new Event("memoria:shelf-refresh"));

            if (
              !advanceResult.ok &&
              advanceResult.code !== "extraction_stopped"
            ) {
              setMessage(advanceResult.error);
            }

            router.refresh();
          })
          .catch((error: unknown) => {
            setMessage(error instanceof Error ? error.message : String(error));
            router.refresh();
          });
        return;
      }

      setMessage(result.error.message);
      router.refresh();
    });
  }

  function handleStopRun() {
    if (!selectedRun || selectedRun.status !== "running" || pendingAction) {
      return;
    }

    setMessage(null);
    setPendingAction("stop");
    startTransition(async () => {
      const result = await cancelExtractionRunWorkshopAction(
        domainSlug,
        selectedRun.id
      );

      setPendingAction(null);
      window.dispatchEvent(new Event("memoria:shelf-refresh"));

      if (!result.ok) {
        setMessage(result.error.message);
      }

      router.refresh();
    });
  }

  async function handleDeleteRun() {
    if (!selectedRunId || pendingAction) {
      return;
    }

    if (!window.confirm("Delete this run and its data?")) {
      return;
    }

    setMessage(null);
    setPendingAction("delete");
    const result = await deleteExtractionRunWorkshopAction(
      domainSlug,
      selectedRunId
    );

    setPendingAction(null);

    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }

    window.dispatchEvent(new Event("memoria:shelf-refresh"));
    clearRunSelection();
    router.refresh();
  }

  function handleResumeRun() {
    if (!selectedRun || pendingAction) {
      return;
    }

    setMessage(null);
    setPendingAction("resume");
    void advanceRunUntilTerminal(domainSlug, selectedRun.id, () => {
      window.dispatchEvent(new Event("memoria:shelf-refresh"));
      router.refresh();
    })
      .then((advanceResult) => {
        setPendingAction(null);
        window.dispatchEvent(new Event("memoria:shelf-refresh"));

        if (!advanceResult.ok) {
          setMessage(advanceResult.error);
        }

        router.refresh();
      })
      .catch((error: unknown) => {
        setPendingAction(null);
        setMessage(error instanceof Error ? error.message : String(error));
        router.refresh();
      });
  }

  return (
    <>
      <section
        className={cn(
          "flex h-full min-h-0 flex-col overflow-hidden",
          showHeader &&
            "rounded-[var(--radius)] border border-border bg-card/50"
        )}
      >
        {showHeader ? (
          <header className="border-b border-border px-3 py-2">
            <div className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
              Run Control
            </div>
          </header>
        ) : null}

        <div className="min-h-0 flex-1 overflow-hidden p-3">
          <div className="grid h-full min-h-0 gap-3 lg:grid-cols-[minmax(24rem,30rem)_minmax(0,1fr)]">
            <div className="min-h-0 overflow-hidden rounded-[var(--radius)] border border-dashed border-border/80 bg-background/30 lg:order-2">
              {selectedRun ? (
                <RunDetail
                  now={now}
                  onSelectStep={selectStep}
                  selectedStepId={selectedStepId}
                  run={selectedRun}
                />
              ) : selectedRunId ? (
                <Empty className="h-full rounded-none border-0 bg-transparent">
                  <EmptyHeader>
                    <EmptyTitle>Run not found</EmptyTitle>
                    <EmptyDescription>{selectedRunId}</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <Empty className="h-full rounded-none border-0 bg-transparent">
                  <EmptyHeader>
                    <EmptyTitle>No run selected</EmptyTitle>
                    <EmptyDescription>
                      Select a prepared document, then start an extraction run.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </div>

            <div className="flex min-h-0 flex-col gap-3 overflow-hidden lg:order-1">
              <ButtonGroup className="w-full overflow-hidden rounded-[var(--radius-md)] border border-border bg-input">
                <Select
                  disabled={busy || startOptions.runs.length === 0}
                  value={selectedRunId ?? undefined}
                  onValueChange={handleRunChange}
                >
                  <SelectTrigger
                    aria-label="Select previous run"
                    className="min-w-0 flex-1 border-0 bg-transparent font-sans text-sm font-medium tracking-normal normal-case text-foreground [&_[data-slot=select-value]]:font-sans [&_[data-slot=select-value]]:font-medium [&_[data-slot=select-value]]:tracking-normal [&_[data-slot=select-value]]:normal-case"
                  >
                    <SelectValue
                      placeholder={
                        startOptions.runs.length === 0
                          ? "No previous runs"
                          : "Previous runs"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent
                    align="start"
                    className="max-h-[min(32rem,var(--radix-select-content-available-height))] min-w-72 font-sans"
                    position="popper"
                  >
                    <SelectGroup>
                      {startOptions.runs.map((run) => (
                        <SelectItem
                          key={run.id}
                          value={run.id}
                          className="font-sans tracking-normal normal-case"
                        >
                          {run.label} - {formatStatus(run.status)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <ButtonGroupSeparator className="bg-border" />
                <Button
                  aria-label="Reset run setup"
                  disabled={busy}
                  onClick={handleResetRunSetup}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <Plus />
                </Button>
                <ButtonGroupSeparator className="bg-border" />
                <Button
                  aria-label="Delete selected run"
                  disabled={!selectedRunId || busy}
                  onClick={handleDeleteRun}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 />
                </Button>
              </ButtonGroup>

              <Card
                className="flex min-h-0 flex-1 flex-col rounded-[var(--radius)]"
                size="sm"
              >
                <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
                  <form className="grid gap-3" onSubmit={handleStartRun}>
                    <Field className="gap-2">
                      <FieldLabel>Prepared Document</FieldLabel>
                      <Select
                        disabled={startOptions.documents.length === 0 || busy}
                        value={documentId}
                        onValueChange={handleDocumentChange}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="No prepared documents" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {startOptions.documents.map((document) => (
                              <SelectItem key={document.id} value={document.id}>
                                {document.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>

                    <div className="grid grid-cols-2 gap-3">
                      <Field className="min-w-0 gap-2">
                        <FieldLabel>Model</FieldLabel>
                        <Select
                          disabled={busy || modelOptions.length === 0}
                          value={model}
                          onValueChange={handleModelChange}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {modelOptions.map((option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>

                      <Field className="min-w-0 gap-2">
                        <FieldLabel>Effort</FieldLabel>
                        <Select
                          disabled={busy || !effortEnabled}
                          value={effort}
                          onValueChange={setEffort}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {selectedEffortOptions.map((option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>

                    <Button
                      className="w-full"
                      disabled={
                        !selectedDocument ||
                        selectedDocumentHasActiveRun ||
                        busy
                      }
                      type="submit"
                    >
                      <Play data-icon="inline-start" />
                      {selectedDocumentHasActiveRun
                        ? "Running"
                        : pendingAction === "extract"
                          ? "Starting"
                          : "Start"}
                    </Button>
                  </form>

                  {selectedDocument ? (
                    <SourceUnitPicker
                      disabled={busy}
                      document={selectedDocument}
                      onClear={() => setSelectedSourceUnitIds([])}
                      onSelectAll={() =>
                        handleSelectAllSourceUnits(selectedDocument)
                      }
                      onToggle={toggleSourceUnit}
                      selectedIds={selectedSourceUnitIds}
                      className="min-h-0 flex-1"
                    />
                  ) : null}
                </CardContent>
              </Card>

              {selectedRun ? (
                <Card className="rounded-[var(--radius)]" size="sm">
                  <CardHeader>
                    <CardTitle className="font-heading text-sm">
                      Run Actions
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-2">
                    {canResumeRun(selectedRun) ? (
                      <Button
                        disabled={pendingAction !== null}
                        onClick={handleResumeRun}
                        type="button"
                        variant="outline"
                      >
                        <Play data-icon="inline-start" />
                        {pendingAction === "resume" ? "Resuming" : "Resume"}
                      </Button>
                    ) : null}
                    {selectedRun.status === "running" ? (
                      <Button
                        disabled={pendingAction !== null}
                        onClick={handleStopRun}
                        type="button"
                        variant="destructive"
                      >
                        <CircleX data-icon="inline-start" />
                        {pendingAction === "stop" ? "Stopping" : "Stop"}
                      </Button>
                    ) : null}
                    {selectedRun.workshopHref ? (
                      <Button asChild type="button" variant="outline">
                        <Link href={selectedRun.workshopHref}>
                          <ExternalLink data-icon="inline-start" />
                          Workshop
                        </Link>
                      </Button>
                    ) : null}
                    {!canResumeRun(selectedRun) &&
                    selectedRun.status !== "running" &&
                    !selectedRun.workshopHref ? (
                      <p className="text-sm text-muted-foreground">
                        No run actions available.
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              ) : null}

              {message ? (
                <p
                  className="flex items-center gap-2 text-sm text-destructive"
                  role="alert"
                >
                  <AlertTriangle className="size-4" />
                  {message}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {selectedRun && shouldShowRunOverlay(selectedRun) ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-background/45 p-6 backdrop-blur-sm">
          <LabRunStatusOverlay
            isStopping={pendingAction === "stop"}
            now={now}
            onStopRun={handleStopRun}
            run={selectedRun}
          />
        </div>
      ) : null}
    </>
  );
}

function SourceUnitPicker({
  className,
  disabled,
  document,
  onClear,
  onSelectAll,
  onToggle,
  selectedIds,
}: {
  className?: string;
  disabled: boolean;
  document: LabRunStartDocumentOption;
  onClear: () => void;
  onSelectAll: () => void;
  onToggle: (sourceUnitId: string, checked: boolean) => void;
  selectedIds: string[];
}) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-col rounded-[var(--radius)] border border-border bg-muted/20",
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline">{selectedIds.length}</Badge>
          <span className="text-sm font-medium">Source Units</span>
          <span className="text-xs text-muted-foreground">
            {document.sourceUnits.length} total
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            disabled={disabled}
            onClick={onSelectAll}
            size="xs"
            type="button"
            variant="outline"
          >
            All
          </Button>
          <Button
            disabled={disabled}
            onClick={onClear}
            size="xs"
            type="button"
            variant="outline"
          >
            Clear
          </Button>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1 border-t border-border">
        <div className="grid gap-0.5 p-2">
          {document.sourceUnits.map((sourceUnit) => (
            <label
              key={sourceUnit.id}
              className="flex min-w-0 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 hover:bg-muted"
            >
              <Checkbox
                checked={selectedIds.includes(sourceUnit.id)}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  onToggle(sourceUnit.id, checked === true)
                }
              />
              <span className="min-w-0 flex-1 truncate text-sm">
                {sourceUnit.label}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {sourceUnit.unitType}
              </span>
            </label>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function RunDetail({
  now,
  onSelectStep,
  selectedStepId,
  run,
}: {
  now: number;
  onSelectStep: (stepId: string) => void;
  selectedStepId: string | null;
  run: LabRunDetail;
}) {
  return (
    <Card className="flex h-full min-h-0 flex-col rounded-[var(--radius)]">
      <CardHeader className="px-4 py-2.5">
        <div className="grid gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <StatusBadge status={run.status} />
            <CardTitle className="min-w-0 flex-1 truncate font-heading text-base">
              {run.documentLabel}
            </CardTitle>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5 font-mono text-[11px] text-muted-foreground">
              <HeaderMetric
                value={`${formatCompactNumber(run.totals.claimCount)}c`}
              />
              <HeaderMetric
                value={`${formatCompactNumber(run.totals.tokenTotal)} tok`}
              />
              <HeaderMetric value={formatElapsedTime(elapsedMs(run, now))} />
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-muted-foreground">
            <span className="truncate">{formatStep(run.currentStep)}</span>
            <span className="text-border">/</span>
            <span className="truncate">
              {formatDate(run.startedAt) ?? formatDate(run.createdAt)}
            </span>
          </div>
        </div>
        {run.errorMessage ? (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="size-4" />
            {run.errorMessage}
          </p>
        ) : null}
      </CardHeader>
      <Separator />
      <div className="relative min-h-0 flex-1">
        <ScrollArea className="h-full">
          <div className="grid gap-3 p-4">
            {run.steps.map((step) => (
              <StepRow
                key={step.id}
                active={selectedStepId === step.id}
                onSelect={() => onSelectStep(step.id)}
                step={step}
              />
            ))}
          </div>
        </ScrollArea>
      </div>
    </Card>
  );
}

function LabRunStatusOverlay({
  isStopping,
  now,
  onStopRun,
  run,
}: {
  isStopping: boolean;
  now: number;
  onStopRun: () => void;
  run: LabRunDetail;
}) {
  const rows = buildRunStageRows(run);
  const activeRow =
    rows.find((row) => row.status === "running") ??
    rows.find((row) => row.step === run.currentStep);
  const sourceCount = sourceUnitCount(run.scope);

  return (
    <section
      aria-live="polite"
      className="w-full max-w-5xl rounded-[var(--radius)] border border-border bg-card p-4 text-card-foreground shadow-lg"
    >
      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
          <RunStateIcon status={run.status} />
          <div className="grid min-w-0 gap-1 text-center sm:text-left">
            <div className="grid min-w-0 items-start gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0 truncate font-heading text-base font-semibold">
                {runOverlayTitle(run, activeRow?.label)}
              </div>
              <div className="grid justify-items-center gap-2 sm:justify-items-end">
                <div className="flex flex-wrap items-center justify-center gap-1.5 font-mono text-[11px] text-muted-foreground sm:justify-end">
                  <HeaderMetric
                    value={`${formatCompactNumber(run.totals.claimCount)}c`}
                  />
                  <HeaderMetric
                    value={`${formatCompactNumber(run.totals.tokenTotal)} tok`}
                  />
                  <HeaderMetric
                    value={formatElapsedTime(elapsedMs(run, now))}
                  />
                </div>
                <Button
                  disabled={isStopping}
                  onClick={onStopRun}
                  size="sm"
                  type="button"
                  variant="destructive"
                >
                  <CircleX data-icon="inline-start" />
                  {isStopping ? "Stopping" : "Stop run"}
                </Button>
              </div>
            </div>
            <div className="truncate text-sm text-muted-foreground">
              {run.documentLabel}
            </div>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <StatusMetric label="Status">
            <StatusBadge status={run.status} />
          </StatusMetric>
          <StatusMetric label="Elapsed">
            {formatElapsedTime(elapsedMs(run, now))}
          </StatusMetric>
          <StatusMetric label="Source">
            {sourceCount === null
              ? "Unknown"
              : `${sourceCount} ${sourceCount === 1 ? "shard" : "shards"}`}
          </StatusMetric>
        </div>

        <Separator />

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {rows.map((row) => (
            <StageMetric key={row.step} row={row} />
          ))}
        </div>
      </div>
    </section>
  );
}

function StatusMetric({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="grid min-w-0 gap-1 rounded-[var(--radius-sm)] border border-border bg-background px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="min-w-0 font-mono text-sm tabular-nums">{children}</div>
    </div>
  );
}

function StageMetric({ row }: { row: RunStageRow }) {
  const active = row.status === "running";

  return (
    <div
      className={cn(
        "grid min-w-0 gap-2 rounded-[var(--radius-sm)] border border-border bg-background px-3 py-2",
        active && "border-primary bg-primary/10"
      )}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="truncate text-xs text-muted-foreground">
          {row.label}
        </span>
        <StageStateIcon status={row.status} />
      </div>
      <div className="font-mono text-base font-semibold tabular-nums">
        {row.count}
      </div>
    </div>
  );
}

type RunStageRow = {
  count: number;
  label: string;
  status: LabRunStepView["status"];
  step: string;
};

function shouldShowRunOverlay(run: LabRunDetail) {
  return run.status === "running";
}

function canResumeRun(run: LabRunDetail) {
  const hasRunningStep = run.steps.some((step) => step.status === "running");
  const hasOpenStep = run.steps.some(
    (step) => step.status === "pending" || step.status === "failed"
  );

  return (
    hasOpenStep &&
    ((run.status === "failed" && run.errorMessage === "Stopped by user") ||
      (run.status === "running" && !hasRunningStep))
  );
}

function buildRunStageRows(run: LabRunDetail): RunStageRow[] {
  const stepsByName = new Map(run.steps.map((step) => [step.step, step]));
  const stageConfigs = [
    { label: "Subjects", step: "subject_discovery" },
    { label: "Explicit", step: "explicit_pass" },
    { label: "Inferred", step: "inferred_pass" },
    { label: "Type", step: "type_assignment" },
    { label: "Modality", step: "modality_classification" },
  ];

  return stageConfigs.map((stage) => {
    const step = stepsByName.get(stage.step);

    return {
      count: step?.claimCount ?? 0,
      label: stage.label,
      status: step?.status ?? "pending",
      step: stage.step,
    };
  });
}

function RunStateIcon({ status }: { status: LabRunDetail["status"] }) {
  const className =
    "grid size-12 place-items-center rounded-[var(--radius)] bg-primary/10 text-primary";

  if (status === "failed") {
    return (
      <div className="grid size-12 place-items-center rounded-[var(--radius)] bg-destructive/10 text-destructive">
        <CircleX className="size-5" />
      </div>
    );
  }

  if (status === "needs_review" || status === "completed") {
    return (
      <div className={className}>
        <CheckCircle2 className="size-5" />
      </div>
    );
  }

  return (
    <div className={className}>
      <LoaderCircle className="size-5 animate-spin" />
    </div>
  );
}

function StageStateIcon({ status }: { status: LabRunStepView["status"] }) {
  if (status === "running") {
    return (
      <LoaderCircle className="size-3.5 shrink-0 animate-spin text-primary" />
    );
  }

  if (status === "completed" || status === "skipped") {
    return <CheckCircle2 className="size-3.5 shrink-0 text-primary" />;
  }

  if (status === "failed") {
    return <CircleX className="size-3.5 shrink-0 text-destructive" />;
  }

  return <CircleDashed className="size-3.5 shrink-0 text-muted-foreground" />;
}

function runOverlayTitle(run: LabRunDetail, activeLabel: string | undefined) {
  if (run.status === "failed") {
    return "Run needs attention";
  }

  if (run.status === "needs_review") {
    return "Ready for review";
  }

  if (run.status === "completed") {
    return "Run complete";
  }

  return `Running ${activeLabel ?? formatStep(run.currentStep)}`;
}

function sourceUnitCount(scope: unknown) {
  if (
    typeof scope === "object" &&
    scope !== null &&
    "sourceUnitIds" in scope &&
    Array.isArray(scope.sourceUnitIds)
  ) {
    return scope.sourceUnitIds.length;
  }

  return null;
}

function elapsedMs(run: LabRunDetail, now: number) {
  const startedAt = Date.parse(run.startedAt ?? run.createdAt);

  if (!Number.isFinite(startedAt)) {
    return 0;
  }

  if (run.status === "running") {
    return Math.max(0, now - startedAt);
  }

  const endedAt = Date.parse(run.completedAt ?? run.updatedAt);

  return Number.isFinite(endedAt) ? Math.max(0, endedAt - startedAt) : 0;
}

function formatElapsedTime(value: number) {
  const seconds = Math.floor(value / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }

  return `${seconds}s`;
}

function formatCompactNumber(value: number) {
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}m`;
  }

  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }

  return String(value);
}

function StepRow({
  active,
  onSelect,
  step,
}: {
  active: boolean;
  onSelect: () => void;
  step: LabRunStepView;
}) {
  const requestStatus = modelRequestStatus(step.rawOutput);
  const diagnostics = modelObservability(step.rawOutput);
  const claims = stepOutputClaims(step.rawOutput, step.inputContext);

  return (
    <div
      className={cn(
        "rounded-[var(--radius)] border bg-background/60 transition-colors",
        active
          ? "border-primary shadow-[0_0_0_1px_var(--primary)]"
          : "border-border"
      )}
    >
      <button
        className="grid w-full gap-3 p-3 text-left lg:grid-cols-[minmax(12rem,1fr)_auto]"
        onClick={onSelect}
        type="button"
      >
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={step.status} />
            <span className="font-heading text-sm font-medium">
              {formatStep(step.step)}
            </span>
            {step.promptVersion ? (
              <Badge variant="outline">{step.promptVersion}</Badge>
            ) : null}
            {requestStatus ? (
              <Badge variant="secondary">{requestStatus}</Badge>
            ) : null}
          </div>
          <div className="min-w-0 truncate font-mono text-xs text-muted-foreground">
            {step.model ?? "no model"}
          </div>
          {step.errorMessage ? (
            <div className="text-sm text-destructive">{step.errorMessage}</div>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-2 text-right font-mono text-xs text-muted-foreground sm:grid-cols-6">
          <Metric
            label={step.step === "subject_discovery" ? "Subjects" : "Claims"}
            value={step.claimCount}
          />
          <Metric label="Dropped" value={step.droppedUngrounded} />
          <Metric label="Retries" value={step.retryCount} />
          <Metric label="Tokens" value={step.tokenTotal} />
          <Metric label="Latency" value={formatLatency(step.latencyMs)} />
          <Metric label="Cost" value={formatCost(step.costTotal)} />
        </div>
      </button>
      {claims.length > 0 ? (
        <ClaimsList claims={claims} step={step.step} />
      ) : null}
      <details className="border-t border-border px-3 py-2">
        <summary className="cursor-pointer font-mono text-xs text-muted-foreground">
          Sidecars
        </summary>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <ArtifactBlock label="Input Context" value={step.inputContext} />
          <ArtifactBlock label="Result Summary" value={step.resultSummary} />
          {diagnostics ? (
            <ArtifactBlock label="Model Diagnostics" value={diagnostics} />
          ) : null}
          <ArtifactBlock label="Raw Output" value={step.rawOutput} />
          <ArtifactBlock label="Token Usage" value={step.tokenUsage} />
          <ArtifactBlock label="Cost" value={step.cost} />
        </div>
      </details>
    </div>
  );
}

type ClaimListItem = {
  assertion?: string;
  claimType?: string;
  modality?: string;
  text: string;
};

function ClaimsList({
  claims,
  step,
}: {
  claims: ClaimListItem[];
  step: string;
}) {
  return (
    <div className="border-t border-border px-3 py-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-medium text-muted-foreground">
          {claimListLabel(step)}
        </span>
        <Badge variant="outline">{claims.length}</Badge>
      </div>
      <ol className="grid max-h-96 gap-2 overflow-auto pr-2">
        {claims.map((claim, index) => (
          <li
            key={`${index}-${claim.text}`}
            className="grid gap-1 rounded-[var(--radius-sm)] border border-border bg-background px-3 py-2"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                {String(index + 1).padStart(3, "0")}
              </span>
              {claim.assertion ? (
                <Badge variant="outline">{claim.assertion}</Badge>
              ) : null}
              {claim.claimType ? (
                <Badge variant="secondary">{claim.claimType}</Badge>
              ) : null}
              {claim.modality ? (
                <Badge variant="outline">{claim.modality}</Badge>
              ) : null}
            </div>
            <p className="text-sm leading-6 text-foreground">{claim.text}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function claimListLabel(step: string) {
  if (step === "subject_discovery") {
    return "Subjects";
  }

  if (step === "modality_classification") {
    return "Final Claims";
  }

  if (step === "type_assignment") {
    return "Typed Claims";
  }

  return "Claims";
}

function ArtifactBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0 rounded-[var(--radius-sm)] border border-border bg-muted/20">
      <div className="border-b border-border px-2 py-1 font-mono text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </div>
      <pre className="max-h-52 overflow-auto p-2 text-xs leading-5 whitespace-pre-wrap text-muted-foreground">
        {prettyJson(value)}
      </pre>
    </div>
  );
}

function HeaderMetric({ value }: { value: string }) {
  return (
    <span className="rounded-full border border-border/80 bg-background/70 px-2 py-0.5 tabular-nums">
      {value}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-[10px] uppercase">{label}</div>
      <div className="font-semibold text-foreground tabular-nums">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      className={cn(
        status === "failed" &&
          "border-destructive/30 bg-destructive/10 text-destructive",
        status === "running" && "border-primary/30 bg-primary/10 text-primary",
        status === "needs_review" && "bg-secondary text-secondary-foreground",
        status === "completed" && "bg-primary text-primary-foreground",
        status === "skipped" && "border-border bg-muted text-muted-foreground",
        status === "pending" &&
          "border-border bg-background text-muted-foreground"
      )}
      variant="outline"
    >
      {formatStatus(status)}
    </Badge>
  );
}

function formatStatus(value: string) {
  const labels: Record<string, string> = {
    archived: "Archived",
    completed: "Complete",
    draft: "Draft",
    failed: "Needs attention",
    needs_review: "Ready for review",
    pending: "Queued",
    running: "Running",
    skipped: "Not used",
  };

  return labels[value] ?? value.replaceAll("_", " ");
}

function formatStep(value: string) {
  return value.replaceAll("_", " ");
}

function formatDate(value: string | null) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatLatency(value: number | null) {
  if (value === null) {
    return "0 ms";
  }

  if (value < 1000) {
    return `${value} ms`;
  }

  return `${(value / 1000).toFixed(1)} s`;
}

function formatCost(value: number) {
  if (value === 0) {
    return "$0";
  }

  return `$${value.toFixed(6)}`;
}

function prettyJson(value: unknown) {
  if (value === undefined) {
    return "{}";
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function stepOutputClaims(
  rawOutput: unknown,
  inputContext?: unknown
): ClaimListItem[] {
  if (!isRecord(rawOutput) || !Array.isArray(rawOutput.calls)) {
    return [];
  }

  const draftRows =
    isRecord(inputContext) && Array.isArray(inputContext.draftClaimRows)
      ? inputContext.draftClaimRows
      : [];
  const draftRowsByRow = new Map(
    draftRows.flatMap((row) => {
      if (
        !isRecord(row) ||
        typeof row.row !== "number" ||
        typeof row.text !== "string"
      ) {
        return [];
      }

      return [[row.row, row]];
    })
  );

  return rawOutput.calls.flatMap((call) => {
    if (!isRecord(call) || !isRecord(call.output)) {
      return [];
    }

    const subjects = call.output.subjects;

    if (Array.isArray(subjects)) {
      return subjects.flatMap((subject) => {
        if (typeof subject === "string" && subject.trim()) {
          return [{ text: subject.trim() }];
        }

        return [];
      });
    }

    const claims = call.output.claims;

    if (!Array.isArray(claims)) {
      return [];
    }

    return claims.flatMap((claim) => {
      if (typeof claim === "string" && claim.trim()) {
        return [{ text: claim.trim() }];
      }

      if (!isRecord(claim) || typeof claim.text !== "string") {
        if (!isRecord(claim) || typeof claim.row !== "number") {
          return [];
        }

        const draftRow = draftRowsByRow.get(claim.row);

        if (!isRecord(draftRow) || typeof draftRow.text !== "string") {
          return [];
        }

        return [
          {
            assertion: stringValue(draftRow.assertion),
            claimType: stringValue(claim.claimType),
            modality: stringValue(claim.modality),
            text: draftRow.text.trim(),
          },
        ];
      }

      const text = claim.text.trim();

      if (!text) {
        return [];
      }

      return [
        {
          assertion: stringValue(claim.assertion),
          claimType: stringValue(claim.claimType),
          modality: stringValue(claim.modality),
          text,
        },
      ];
    });
  });
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function modelRequestStatus(rawOutput: unknown) {
  if (!isRecord(rawOutput)) {
    return null;
  }

  if (rawOutput.status === "awaiting_model_response") {
    return "Awaiting model response";
  }

  const calls = rawOutput.calls;

  if (!Array.isArray(calls) || calls.length === 0) {
    return null;
  }

  const lastCall = calls.at(-1);

  if (isRecord(lastCall) && lastCall.status === "awaiting_response") {
    return "Awaiting model response";
  }

  return null;
}

function modelObservability(rawOutput: unknown) {
  if (!isRecord(rawOutput)) {
    return null;
  }

  const calls = rawOutput.calls;

  if (!Array.isArray(calls) || calls.length === 0) {
    return null;
  }

  return calls
    .map((call, index) => {
      if (!isRecord(call) || !isRecord(call.raw)) {
        return null;
      }

      const diagnostics = isRecord(call.raw.codexExec)
        ? call.raw.codexExec
        : call.raw.codex;

      if (!isRecord(diagnostics)) {
        return null;
      }

      return {
        attempt: isRecord(call) ? (call.attempt ?? index + 1) : index + 1,
        error: call.error,
        path: isRecord(call.raw.codexExec) ? "codex exec" : "app server",
        promptMetrics: diagnostics.promptMetrics,
        sourceUnitId: call.sourceUnitId,
        status: call.status,
        timing: diagnostics.timing,
        tokenUsage: diagnostics.tokenUsage,
      };
    })
    .filter(Boolean);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
