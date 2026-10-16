export type LabRunStepStatus =
  "pending" | "running" | "completed" | "failed" | "skipped";

export type LabRunStatus =
  "draft" | "running" | "needs_review" | "completed" | "failed" | "archived";

export type LabRunStepView = {
  id: string;
  step: string;
  stepOrder: number;
  status: LabRunStepStatus;
  model: string | null;
  promptVersion: string | null;
  effort: string | null;
  claimCount: number;
  droppedUngrounded: number;
  retryCount: number;
  tokenTotal: number;
  latencyMs: number | null;
  costTotal: number;
  inputContext: unknown;
  rawOutput: unknown;
  resultSummary: unknown;
  tokenUsage: unknown;
  cost: unknown;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

export type LabRunDetail = {
  id: string;
  domainSlug: string;
  documentId: string;
  documentLabel: string;
  status: LabRunStatus;
  currentStep: string;
  settings: unknown;
  scope: unknown;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  bundleId: string | null;
  bundleLabel: string | null;
  workshopHref: string | null;
  steps: LabRunStepView[];
  totals: {
    claimCount: number;
    costTotal: number;
    tokenTotal: number;
  };
};

export type LabRunOption = {
  id: string;
  label: string;
  status: LabRunStatus;
  currentStep: string;
  documentLabel: string;
  createdAt: string;
  updatedAt: string;
};

export type LabRunStartSourceUnitOption = {
  id: string;
  position: number;
  unitType: string;
  label: string;
  sizeBytes: number;
};

export type LabRunStartDocumentOption = {
  id: string;
  label: string;
  preparationState: string;
  shardCount: number;
  sourceUnits: LabRunStartSourceUnitOption[];
};

export type LabModelProvider = "codex" | "gateway";

export type LabEffortOption = {
  description?: string;
  label: string;
  value: string;
};

export type LabModelOption = {
  defaultEffort: string;
  effortOptions: LabEffortOption[];
  label: string;
  provider: LabModelProvider;
  value: string;
};

export type LabRunStartOptions = {
  activeRunDocumentIds: string[];
  defaultModel: string;
  documents: LabRunStartDocumentOption[];
  modelOptions: LabModelOption[];
  runs: LabRunOption[];
};
