"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { LabRunDetail, LabRunStepView } from "@/domain/runs";
import {
  DocumentMetric,
  formatDate,
  formatStep,
  InspectorError,
  InspectorMetaRow,
  RunStatusBadge,
  shortHash,
} from "@/components/shell/inspector/shared";

type RunDetailState = {
  domainSlug: string;
  error: string | null;
  isLoading: boolean;
  run: LabRunDetail | null;
  selectedId: string;
};

export function RunInspector({
  domainSlug,
  selectedId,
  stepId,
}: {
  domainSlug: string;
  selectedId: string;
  stepId: string | null;
}) {
  const [state, setState] = useState<RunDetailState>({
    domainSlug,
    error: null,
    isLoading: true,
    run: null,
    selectedId,
  });

  useEffect(() => {
    let controller: AbortController | null = null;

    function loadRun() {
      controller?.abort();
      controller = new AbortController();

      fetch(
        `/api/workshop/runs/${selectedId}?domain=${encodeURIComponent(domainSlug)}`,
        { signal: controller.signal }
      )
        .then(async (response) => {
          const payload = (await response.json()) as {
            error?: string;
            run?: LabRunDetail;
          };

          if (!response.ok || !payload.run) {
            throw new Error(payload.error ?? "Run could not be loaded.");
          }

          return payload.run;
        })
        .then((run) => {
          setState({
            domainSlug,
            error: null,
            isLoading: false,
            run,
            selectedId,
          });
        })
        .catch((error: unknown) => {
          if (controller?.signal.aborted) {
            return;
          }

          setState({
            domainSlug,
            error:
              error instanceof Error
                ? error.message
                : "Run could not be loaded.",
            isLoading: false,
            run: null,
            selectedId,
          });
        });
    }

    loadRun();
    window.addEventListener("memoria:shelf-refresh", loadRun);

    return () => {
      controller?.abort();
      window.removeEventListener("memoria:shelf-refresh", loadRun);
    };
  }, [domainSlug, selectedId]);

  const matchesCurrentRequest =
    state.domainSlug === domainSlug && state.selectedId === selectedId;
  const isLoading = state.isLoading || !matchesCurrentRequest;
  const run = matchesCurrentRequest ? state.run : null;
  const error = matchesCurrentRequest ? state.error : null;

  if (isLoading) {
    return <RunInspectorSkeleton />;
  }

  if (run) {
    const selectedStep = stepId
      ? (run.steps.find((step) => step.id === stepId) ?? null)
      : null;

    return <RunInspectorCard run={run} selectedStep={selectedStep} />;
  }

  return (
    <InspectorError
      title="Run unavailable"
      message={error ?? "Run could not be loaded."}
    />
  );
}

function RunInspectorCard({
  run,
  selectedStep,
}: {
  run: LabRunDetail;
  selectedStep: LabRunStepView | null;
}) {
  return (
    <section className="flex min-h-0 flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-heading text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
            Run
          </p>
          <h2 className="mt-3 truncate font-heading text-xl font-semibold">
            {run.documentLabel}
          </h2>
        </div>
        <RunStatusBadge status={run.status} />
      </div>

      <div className="grid gap-3 rounded-[var(--radius-md)] border border-border bg-card p-3 shadow-sm">
        <InspectorMetaRow label="Domain" value={run.domainSlug} />
        <InspectorMetaRow label="Run" value={shortHash(run.id)} />
        <InspectorMetaRow
          label="Current step"
          value={formatStep(run.currentStep)}
        />
        <InspectorMetaRow label="Created" value={formatDate(run.createdAt)} />
        {run.startedAt ? (
          <InspectorMetaRow label="Started" value={formatDate(run.startedAt)} />
        ) : null}
        {run.completedAt ? (
          <InspectorMetaRow
            label="Completed"
            value={formatDate(run.completedAt)}
          />
        ) : null}
        {run.workshopHref ? (
          <Button asChild size="sm" variant="outline">
            <Link href={run.workshopHref}>
              <ExternalLink data-icon="inline-start" />
              Open bundle
            </Link>
          </Button>
        ) : null}
      </div>

      {run.errorMessage ? (
        <p className="rounded-[var(--radius-md)] border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {run.errorMessage}
        </p>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        <DocumentMetric label="Claims" value={run.totals.claimCount} />
        <DocumentMetric label="Tokens" value={run.totals.tokenTotal} />
        <DocumentMetric
          label="Cost"
          value={formatRunCost(run.totals.costTotal)}
        />
      </div>

      <section className="grid gap-2 rounded-[var(--radius-md)] border border-border bg-card p-3 shadow-sm">
        <h3 className="text-sm font-semibold">Steps</h3>
        <div className="flex flex-wrap gap-2">
          {run.steps.map((step) => (
            <Badge key={step.id} variant="outline">
              {formatStep(step.step)} / {step.status}
            </Badge>
          ))}
        </div>
      </section>

      {selectedStep ? (
        <RunStepInspector step={selectedStep} />
      ) : (
        <p className="rounded-[var(--radius-md)] border border-border bg-card p-3 text-sm text-muted-foreground shadow-sm">
          No step selected.
        </p>
      )}
    </section>
  );
}

function RunStepInspector({ step }: { step: LabRunStepView }) {
  const requestStatus = modelRequestStatus(step.rawOutput);
  const diagnostics = modelObservability(step.rawOutput);

  return (
    <section className="grid gap-3 rounded-[var(--radius-md)] border border-border bg-card p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{formatStep(step.step)}</h3>
        <div className="flex flex-wrap items-center gap-2">
          {requestStatus ? (
            <Badge variant="secondary">{requestStatus}</Badge>
          ) : null}
          <RunStatusBadge status={step.status} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <DocumentMetric label="Claims" value={step.claimCount} />
        <DocumentMetric label="Dropped" value={step.droppedUngrounded} />
        <DocumentMetric label="Tokens" value={step.tokenTotal} />
        <DocumentMetric label="Latency" value={formatLatency(step.latencyMs)} />
      </div>
      {step.errorMessage ? (
        <p className="rounded-[var(--radius-sm)] border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
          {step.errorMessage}
        </p>
      ) : null}
      <RunArtifactBlock label="Input Context" value={step.inputContext} />
      <RunArtifactBlock label="Result Summary" value={step.resultSummary} />
      {diagnostics ? (
        <RunArtifactBlock label="Model Diagnostics" value={diagnostics} />
      ) : null}
      <RunArtifactBlock label="Raw Output" value={step.rawOutput} />
      <RunArtifactBlock label="Token Usage" value={step.tokenUsage} />
      <RunArtifactBlock label="Cost" value={step.cost} />
    </section>
  );
}

function RunArtifactBlock({ label, value }: { label: string; value: unknown }) {
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

function RunInspectorSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-5 w-28 rounded-full" />
      <div className="rounded-[var(--radius-md)] border border-border p-3">
        <div className="grid gap-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  );
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

function formatRunCost(value: number) {
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

  const diagnostics = calls
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
        attempt: call.attempt ?? index + 1,
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

  return diagnostics.length > 0 ? diagnostics : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
