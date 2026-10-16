import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  type DistillationRunDetail,
  type DistillationStageDefinition,
  type DistillationStageKey,
  type DomainRecord
} from "../../types";

const NO_DOMAIN_ID = "__no_domain__";
export type PipelineToolKey = DistillationStageKey | "domain_context";
type DisplayedPipelineTool = {
  key: PipelineToolKey;
  label: string;
  order: number;
  virtual?: boolean;
};
const RUNNABLE_STAGES = new Set<DistillationStageKey>(["subjects"]);

export function PipelineShelf({
  activeDomain,
  domains,
  isBusy,
  activeStage,
  selectedRun,
  selectedRunId,
  stages,
  onDomainChange,
  onStageChange,
  onRunStage
}: {
  activeDomain: DomainRecord | null;
  domains: DomainRecord[];
  isBusy: boolean;
  activeStage: PipelineToolKey;
  selectedRun: DistillationRunDetail | null;
  selectedRunId: string | null;
  stages: DistillationStageDefinition[];
  onDomainChange: (domainId: string) => void;
  onStageChange: (stage: PipelineToolKey) => void;
  onRunStage: (stage: DistillationStageKey) => void | Promise<void>;
}) {
  const runningStage = selectedRun?.stages.some((stage) => stage.status === "running") ?? false;
  const stageByKey = new Map(selectedRun?.stages.map((stage) => [stage.stage, stage]));
  const domainContextTool: DisplayedPipelineTool = { key: "domain_context", label: "Domain Context", order: -1, virtual: true };
  const displayedStages: DisplayedPipelineTool[] = [
    domainContextTool,
    ...stages
  ].sort((left, right) => {
    if (left.key === "ontology") {
      return 1;
    }

    if (right.key === "ontology") {
      return -1;
    }

    return left.order - right.order;
  });

  return (
    <aside className="pipeline-shelf border-r bg-sidebar text-sidebar-foreground">
      <section className="pipeline-domain-header">
        <div className="flex min-w-0 flex-col gap-3">
          <span className="text-xs font-medium uppercase tracking-[0.28em] text-sidebar-primary">Domain</span>
          <Select
            onValueChange={onDomainChange}
            value={activeDomain?.id ?? NO_DOMAIN_ID}
          >
            <SelectTrigger
              aria-label="Domain"
              className="domain-select-trigger h-auto w-fit max-w-full justify-start gap-2 border-0 bg-transparent p-0 font-semibold leading-none tracking-normal text-foreground shadow-none hover:text-foreground [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate"
            >
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent align="start" className="min-w-56" position="popper">
              <SelectGroup>
                <SelectItem value={NO_DOMAIN_ID}>None</SelectItem>
                {domains.map((domain) => (
                  <SelectItem key={domain.id} value={domain.id}>
                    {domain.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </section>

      <header className="pipeline-shelf-header">
        <div>
          <p>Pipeline</p>
          <h2>Workbench</h2>
        </div>
      </header>

      <section className="pipeline-tool-list" aria-label="Distillation tools">
        {displayedStages.map((stage) => {
          const stageKey = stage.key === "domain_context" ? null : stage.key as DistillationStageKey;
          const stageRun = stageKey ? stageByKey.get(stageKey) : undefined;
          const status = stageRun?.status ?? "pending";
          const isRunnable = stageKey ? RUNNABLE_STAGES.has(stageKey) : false;
          const disabled = !stageKey || !isRunnable || isBusy || runningStage || !selectedRunId || status === "running";
          const isVirtualTool = !stageKey;

          return (
            <div
              className="pipeline-tool-row"
              data-active={activeStage === stage.key}
              data-runnable={isVirtualTool || isRunnable}
              data-status={status}
              data-virtual={isVirtualTool}
              key={stage.key}
            >
              <button
                className="pipeline-tool-select"
                onClick={() => onStageChange(stage.key)}
                type="button"
              >
                <span>{stage.label}</span>
                <small>{!stageKey ? "domain profile" : isRunnable ? statusLabel(status, stageRun?.candidate_count ?? 0) : "not wired"}</small>
              </button>
              {stageKey ? (
                <Button
                  aria-label={`Run ${stage.label}`}
                  className="pipeline-tool-run"
                  disabled={disabled}
                  onClick={(event) => {
                    event.stopPropagation();
                    void onRunStage(stageKey);
                  }}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <Play />
                </Button>
              ) : null}
            </div>
          );
        })}
      </section>
    </aside>
  );
}

function statusLabel(status: string, count: number) {
  if (status === "completed") {
    return `${count} candidate${count === 1 ? "" : "s"}`;
  }

  return status.replaceAll("_", " ");
}
