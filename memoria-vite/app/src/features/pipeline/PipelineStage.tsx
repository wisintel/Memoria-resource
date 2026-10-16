import { AlertCircle, FileText, Plus, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  CodexModelOption,
  DistillationCandidateRecord,
  DistillationRunDetail,
  DistillationRunSummary,
  DistillationStageKey,
  DomainRecord,
  DocumentRecord,
  PromptSnapshot,
  SubjectCandidatePackage,
} from "../../types";
import type { PipelineToolKey } from "./PipelineShelf";

const NO_DOCUMENT_ID = "__no_document__";
const NO_RUN_ID = "__no_run__";
const SUBJECTS_PROMPT = `## Task

Extract subject candidates from the provided Memoria document context.

Return only JSON with this shape:

{
  "subjects": [
    {
      "localSubjectId": "subject_001",
      "label": "Subject label",
      "type": "concept",
      "aliases": ["Optional alias"],
      "description": "Short neutral description.",
      "rationale": "Why this should be reviewed as a subject.",
      "evidenceRefs": [
        {
          "sourceUnitId": "source unit id",
          "evidenceText": "Short supporting excerpt"
        }
      ]
    }
  ]
}

Rules:
- Prefer concrete actors, artifacts, concepts, systems, operations, phases, products, and methods.
- Do not create canonical graph records.
- Use only the provided context.
- Keep labels concise.
- Use stable local ids in the form subject_001, subject_002, and so on.
- Include evidence references when the source unit supports the candidate.
- If no subject candidates are supported, return { "subjects": [] }.`;

export function PipelineStage({
  activeDomain,
  documents,
  isBusy,
  runs,
  selectedDocumentId,
  selectedDocument,
  selectedRun,
  selectedRunId,
  selectedStage,
  selectedSubjectId,
  selectedModel,
  selectedPromptId,
  selectedPromptVersionId,
  onCreateRun,
  onDocumentChange,
  onResetRun,
  onRunChange,
  domainContextOutput,
  domainContextPrompt,
  modelOptions,
  promptSnapshot,
  onDomainContextOutputChange,
  onDomainContextPromptChange,
  onCreatePrompt,
  onPromptChange,
  onPromptVersionChange,
  onSavePromptVersion,
  onSetActivePromptVersion,
  onModelChange,
  onSubjectSelect
}: {
  activeDomain: DomainRecord | null;
  documents: DocumentRecord[];
  isBusy: boolean;
  runs: DistillationRunSummary[];
  selectedDocumentId: string | null;
  selectedDocument: DocumentRecord | null;
  selectedRun: DistillationRunDetail | null;
  selectedRunId: string | null;
  selectedStage: PipelineToolKey;
  selectedSubjectId: string | null;
  onCreateRun: () => void | Promise<void>;
  onDocumentChange: (documentId: string | null) => void;
  onResetRun: () => void | Promise<void>;
  onRunChange: (runId: string | null) => void;
  domainContextOutput: string;
  domainContextPrompt: string;
  modelOptions: CodexModelOption[];
  promptSnapshot: PromptSnapshot | null;
  onDomainContextOutputChange: (output: string) => void;
  onDomainContextPromptChange: (prompt: string) => void;
  onCreatePrompt: (label: string) => void | Promise<void>;
  onPromptChange: (promptId: string | null) => void;
  onPromptVersionChange: (versionId: string | null) => void;
  onSavePromptVersion: () => void | Promise<void>;
  onSetActivePromptVersion: () => void | Promise<void>;
  onModelChange: (model: string) => void;
  onSubjectSelect: (localSubjectId: string) => void;
  selectedModel: string;
  selectedPromptId: string | null;
  selectedPromptVersionId: string | null;
}) {
  const documentRuns = runs.filter((run) => run.document_id === selectedDocumentId);

  return (
    <section className="pipeline-stage">
      {selectedStage !== "domain_context" ? (
        <PipelineRunManagementPanel
          documents={documents}
          documentRuns={documentRuns}
          isBusy={isBusy}
          selectedDocumentId={selectedDocumentId}
          selectedRun={selectedRun}
          selectedRunId={selectedRunId}
          onCreateRun={onCreateRun}
          onDocumentChange={onDocumentChange}
          onResetRun={onResetRun}
          onRunChange={onRunChange}
        />
      ) : null}

      {selectedStage === "domain_context" ? (
        <>
          <header className="pipeline-stage-header">
            <div>
              <p>{activeDomain?.label ?? "No domain selected"}</p>
              <h1>Domain Context workbench</h1>
            </div>
            <WorkbenchHeaderControls
              isBusy={isBusy}
              modelOptions={modelOptions}
              selectedModel={selectedModel}
              status={activeDomain?.domain_context_profile ? "saved" : "draft"}
              statusValue={activeDomain?.domain_context_profile ? "completed" : "pending"}
              onModelChange={onModelChange}
            />
          </header>

          <DomainContextWorkbench
            activeDomain={activeDomain}
            outputDraft={domainContextOutput}
            promptDraft={domainContextPrompt}
            promptSnapshot={promptSnapshot}
            onOutputChange={onDomainContextOutputChange}
            onPromptChange={onDomainContextPromptChange}
            onCreatePrompt={onCreatePrompt}
            onStoredPromptChange={onPromptChange}
            onStoredPromptVersionChange={onPromptVersionChange}
            onSavePromptVersion={onSavePromptVersion}
            onSetActivePromptVersion={onSetActivePromptVersion}
            selectedPromptId={selectedPromptId}
            selectedPromptVersionId={selectedPromptVersionId}
          />
        </>
      ) : !selectedDocument ? (
        <Empty className="pointer-events-none absolute inset-0 z-10 grid place-items-center text-muted-foreground">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileText />
            </EmptyMedia>
            <EmptyTitle>Select a document</EmptyTitle>
            <EmptyDescription>Choose a source before starting a document-level distillation run.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : !selectedRun ? (
        <Empty className="pointer-events-none absolute inset-0 z-10 grid place-items-center text-muted-foreground">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileText />
            </EmptyMedia>
            <EmptyTitle>Create a run</EmptyTitle>
            <EmptyDescription>{selectedDocument.label} is ready for a document-level workbench run.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <header className="pipeline-stage-header">
            <div>
              <p>{selectedDocument.label}</p>
              <h1>{stageLabel(selectedStage)} workbench</h1>
            </div>
            <WorkbenchHeaderControls
              isBusy={isBusy}
              modelOptions={modelOptions}
              selectedModel={selectedModel}
              status={selectedRun.run.status.replaceAll("_", " ")}
              statusValue={selectedRun.run.status}
              onModelChange={onModelChange}
            />
          </header>

          {selectedRun.run.error_message ? (
            <div className="pipeline-error">
              <AlertCircle />
              <span>{selectedRun.run.error_message}</span>
            </div>
          ) : null}

          <div className="pipeline-workbench-grid">
            <PipelineRegistry
              selectedRun={selectedRun}
              selectedStage={selectedStage}
              selectedSubjectId={selectedSubjectId}
              onSubjectSelect={onSubjectSelect}
            />
            <PipelineToolCard
              selectedDocument={selectedDocument}
              selectedRun={selectedRun}
              selectedStage={selectedStage}
            />
          </div>
        </>
      )}
    </section>
  );
}

function WorkbenchHeaderControls({
  isBusy,
  modelOptions,
  selectedModel,
  status,
  statusValue,
  onModelChange
}: {
  isBusy: boolean;
  modelOptions: CodexModelOption[];
  selectedModel: string;
  status: string;
  statusValue: string;
  onModelChange: (model: string) => void;
}) {
  return (
    <div className="pipeline-stage-header-controls">
      <Select disabled={isBusy || modelOptions.length === 0} value={selectedModel} onValueChange={onModelChange}>
        <SelectTrigger aria-label="Workbench model" className="h-8 min-w-52 justify-start gap-2 rounded-md border-sidebar-border bg-background/60 px-2">
          <span className="text-xs font-bold uppercase text-muted-foreground">Model</span>
          <SelectValue placeholder="Model" />
        </SelectTrigger>
        <SelectContent align="end" position="popper" className="min-w-64">
          <SelectGroup>
            {modelOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <span className="pipeline-status-pill" data-status={statusValue}>
        {status}
      </span>
    </div>
  );
}

function PipelineRunManagementPanel({
  documents,
  documentRuns,
  isBusy,
  selectedDocumentId,
  selectedRun,
  selectedRunId,
  onCreateRun,
  onDocumentChange,
  onResetRun,
  onRunChange
}: {
  documents: DocumentRecord[];
  documentRuns: DistillationRunSummary[];
  isBusy: boolean;
  selectedDocumentId: string | null;
  selectedRun: DistillationRunDetail | null;
  selectedRunId: string | null;
  onCreateRun: () => void | Promise<void>;
  onDocumentChange: (documentId: string | null) => void;
  onResetRun: () => void | Promise<void>;
  onRunChange: (runId: string | null) => void;
}) {
  return (
    <div className="pipeline-run-panel">
      <div className="pipeline-run-controls">
        <Select
          disabled={documents.length === 0 || isBusy}
          onValueChange={(documentId) => {
            if (documentId === NO_DOCUMENT_ID) {
              onDocumentChange(null);
              return;
            }

            onDocumentChange(documentId);
          }}
          value={selectedDocumentId ?? NO_DOCUMENT_ID}
        >
          <SelectTrigger aria-label="Document" className="h-8 min-w-72 justify-start gap-2 rounded-md border-sidebar-border bg-background/60 px-2">
            <span className="text-xs font-bold uppercase text-muted-foreground">Document</span>
            <SelectValue placeholder="Document" />
          </SelectTrigger>
          <SelectContent align="start" position="popper" className="min-w-64">
            <SelectGroup>
              {documents.length === 0 ? (
                <SelectItem disabled value={NO_DOCUMENT_ID}>
                  No documents
                </SelectItem>
              ) : (
                <SelectItem value={NO_DOCUMENT_ID}>No document</SelectItem>
              )}
              {documents.map((document) => (
                <SelectItem key={document.id} value={document.id}>
                  {document.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <Select
          disabled={documentRuns.length === 0 || isBusy}
          onValueChange={(runId) => onRunChange(runId === NO_RUN_ID ? null : runId)}
          value={selectedRunId ?? NO_RUN_ID}
        >
          <SelectTrigger aria-label="Run" className="h-8 min-w-56 justify-start gap-2 rounded-md border-sidebar-border bg-background/60 px-2">
            <span className="text-xs font-bold uppercase text-muted-foreground">Run</span>
            <SelectValue placeholder="Run" />
          </SelectTrigger>
          <SelectContent align="start" position="popper" className="min-w-64">
            <SelectGroup>
              {documentRuns.length === 0 ? (
                <SelectItem disabled value={NO_RUN_ID}>
                  No runs
                </SelectItem>
              ) : (
                <SelectItem value={NO_RUN_ID}>No run selected</SelectItem>
              )}
              {documentRuns.map((run) => (
                <SelectItem key={run.id} value={run.id}>
                  {runLabel(run)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">{documents.length} document{documents.length === 1 ? "" : "s"}</span>
        <div className="flex-1" />
        <Button
          disabled={isBusy || !selectedDocumentId}
          onClick={() => void onCreateRun()}
          size="sm"
          type="button"
          variant="outline"
        >
          <Plus />
          New run
        </Button>
        <Button
          aria-label="Reset distillation run"
          className="size-8 rounded-md border border-sidebar-border text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-primary"
          disabled={isBusy || !selectedRunId}
          onClick={() => void onResetRun()}
          size="icon-sm"
          title="Reset run"
          type="button"
          variant="ghost"
        >
          <RotateCcw />
        </Button>
      </div>

      <div className="pipeline-overview-grid">
        <Metric label="Pending" value={selectedRun?.candidateCounts.pending ?? 0} />
        <Metric label="Admitted" value={selectedRun?.candidateCounts.admitted ?? 0} />
        <Metric label="Merged" value={selectedRun?.candidateCounts.merged ?? 0} />
        <Metric label="Rejected" value={selectedRun?.candidateCounts.rejected ?? 0} />
      </div>
    </div>
  );
}

function DomainContextWorkbench({
  activeDomain,
  outputDraft,
  promptDraft,
  promptSnapshot,
  onOutputChange,
  onPromptChange,
  onCreatePrompt,
  onStoredPromptChange,
  onStoredPromptVersionChange,
  onSavePromptVersion,
  onSetActivePromptVersion,
  selectedPromptId,
  selectedPromptVersionId
}: {
  activeDomain: DomainRecord | null;
  outputDraft: string;
  promptDraft: string;
  promptSnapshot: PromptSnapshot | null;
  onOutputChange: (output: string) => void;
  onPromptChange: (prompt: string) => void;
  onCreatePrompt: (label: string) => void | Promise<void>;
  onStoredPromptChange: (promptId: string | null) => void;
  onStoredPromptVersionChange: (versionId: string | null) => void;
  onSavePromptVersion: () => void | Promise<void>;
  onSetActivePromptVersion: () => void | Promise<void>;
  selectedPromptId: string | null;
  selectedPromptVersionId: string | null;
}) {
  return (
    <article className="pipeline-tool-card pipeline-domain-context-card">
      <header>
        <div>
          <p>domain-attached context profile</p>
          <h2>{activeDomain ? activeDomain.label : "Domain Context"} tool</h2>
        </div>
        <span className="pipeline-status-pill" data-status={activeDomain?.domain_context_profile ? "completed" : "pending"}>
          {activeDomain?.domain_context_profile ? "saved profile" : "draft profile"}
        </span>
      </header>

      <div className="pipeline-domain-context-editor">
        <div className="pipeline-prompt-editor-row">
          <section className="pipeline-tool-section pipeline-tool-prompt">
            <header>
              <h3>Prompt</h3>
              <span>domain context generator</span>
            </header>
            <Textarea
              aria-label="Domain context prompt"
              disabled={!activeDomain}
              value={promptDraft}
              onChange={(event) => onPromptChange(event.target.value)}
            />
          </section>
          <PromptLibraryPanel
            disabled={!activeDomain}
            promptSnapshot={promptSnapshot}
            selectedPromptId={selectedPromptId}
            selectedPromptVersionId={selectedPromptVersionId}
            onCreatePrompt={onCreatePrompt}
            onPromptChange={onStoredPromptChange}
            onPromptVersionChange={onStoredPromptVersionChange}
            onSavePromptVersion={onSavePromptVersion}
            onSetActivePromptVersion={onSetActivePromptVersion}
          />
        </div>

        <section className="pipeline-tool-section pipeline-tool-output">
          <header>
            <h3>Generated output</h3>
            <span>{activeDomain?.domain_context_profile ? "saved context exists" : "not saved"}</span>
          </header>
          <Textarea
            aria-label="Domain context profile"
            disabled={!activeDomain}
            placeholder="No generated output yet."
            value={outputDraft}
            onChange={(event) => onOutputChange(event.target.value)}
          />
        </section>
      </div>
    </article>
  );
}

const NO_PROMPT_ID = "__no_prompt__";
const NO_PROMPT_VERSION_ID = "__no_prompt_version__";

function PromptLibraryPanel({
  disabled,
  promptSnapshot,
  selectedPromptId,
  selectedPromptVersionId,
  onCreatePrompt,
  onPromptChange,
  onPromptVersionChange,
  onSavePromptVersion,
  onSetActivePromptVersion
}: {
  disabled: boolean;
  promptSnapshot: PromptSnapshot | null;
  selectedPromptId: string | null;
  selectedPromptVersionId: string | null;
  onCreatePrompt: (label: string) => void | Promise<void>;
  onPromptChange: (promptId: string | null) => void;
  onPromptVersionChange: (versionId: string | null) => void;
  onSavePromptVersion: () => void | Promise<void>;
  onSetActivePromptVersion: () => void | Promise<void>;
}) {
  const [newPromptLabel, setNewPromptLabel] = useState("Domain Context Generator");
  const prompts = promptSnapshot?.prompts ?? [];
  const versions = (promptSnapshot?.versions ?? []).filter((version) => version.prompt_id === selectedPromptId);
  const activeVersionId = promptSnapshot?.activeBinding?.active_prompt_version_id ?? null;

  return (
    <aside className="pipeline-prompt-library" aria-label="Prompt library">
      <header>
        <div>
          <h3>Prompt Library</h3>
          <span>{prompts.length} prompt{prompts.length === 1 ? "" : "s"}</span>
        </div>
      </header>

      <div className="pipeline-prompt-library-controls">
        <Select
          disabled={disabled || prompts.length === 0}
          value={selectedPromptId ?? NO_PROMPT_ID}
          onValueChange={(value) => onPromptChange(value === NO_PROMPT_ID ? null : value)}
        >
          <SelectTrigger aria-label="Stored prompt">
            <SelectValue placeholder="Prompt" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {prompts.length === 0 ? (
                <SelectItem disabled value={NO_PROMPT_ID}>
                  No prompts
                </SelectItem>
              ) : null}
              {prompts.map((prompt) => (
                <SelectItem key={prompt.id} value={prompt.id}>
                  {prompt.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <Select
          disabled={disabled || versions.length === 0}
          value={selectedPromptVersionId ?? NO_PROMPT_VERSION_ID}
          onValueChange={(value) => onPromptVersionChange(value === NO_PROMPT_VERSION_ID ? null : value)}
        >
          <SelectTrigger aria-label="Prompt version">
            <SelectValue placeholder="Version" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {versions.length === 0 ? (
                <SelectItem disabled value={NO_PROMPT_VERSION_ID}>
                  No versions
                </SelectItem>
              ) : null}
              {versions.map((version) => (
                <SelectItem key={version.id} value={version.id}>
                  v{version.version_number}{version.id === activeVersionId ? " active" : ""}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <Input
          aria-label="New prompt name"
          disabled={disabled}
          value={newPromptLabel}
          onChange={(event) => setNewPromptLabel(event.target.value)}
        />
      </div>

      <div className="pipeline-prompt-library-actions">
        <Button
          disabled={disabled || !newPromptLabel.trim()}
          onClick={() => void onCreatePrompt(newPromptLabel)}
          size="sm"
          type="button"
          variant="outline"
        >
          New Prompt
        </Button>
        <Button
          disabled={disabled || !selectedPromptId}
          onClick={() => void onSavePromptVersion()}
          size="sm"
          type="button"
        >
          Save Version
        </Button>
        <Button
          disabled={disabled || !selectedPromptVersionId || selectedPromptVersionId === activeVersionId}
          onClick={() => void onSetActivePromptVersion()}
          size="sm"
          type="button"
          variant="outline"
        >
          Set Active
        </Button>
      </div>
    </aside>
  );
}

function PipelineToolCard({
  selectedDocument,
  selectedRun,
  selectedStage
}: {
  selectedDocument: DocumentRecord;
  selectedRun: DistillationRunDetail;
  selectedStage: DistillationStageKey;
}) {
  const stageRun = selectedRun.stages.find((stage) => stage.stage === selectedStage) ?? null;
  const [promptDraft, setPromptDraft] = useState(() => promptForStage(selectedStage));
  const contextLines = useMemo(
    () => sourceContextLines(selectedDocument, selectedRun, selectedStage),
    [selectedDocument, selectedRun, selectedStage]
  );

  useEffect(() => {
    setPromptDraft(promptForStage(selectedStage));
  }, [selectedStage]);

  return (
    <article className="pipeline-tool-card">
      <header>
        <div>
          <p>{stageRun?.prompt_ref ?? promptPath(selectedStage)}</p>
          <h2>{stageLabel(selectedStage)} tool</h2>
        </div>
        <span className="pipeline-status-pill" data-status={stageRun?.status ?? "pending"}>
          {(stageRun?.status ?? "pending").replaceAll("_", " ")}
        </span>
      </header>

      <div className="pipeline-tool-card-grid">
        <section className="pipeline-tool-section pipeline-tool-prompt">
          <header>
            <h3>Prompt</h3>
            <span>run-local draft</span>
          </header>
          <Textarea
            aria-label={`${stageLabel(selectedStage)} prompt`}
            value={promptDraft}
            onChange={(event) => setPromptDraft(event.target.value)}
          />
        </section>

        <section className="pipeline-tool-section pipeline-tool-context">
          <header>
            <h3>Source context</h3>
            <span>{selectedDocument.shard_count} shards</span>
          </header>
          <div>
            {contextLines.map((line) => (
              <p key={line.label}>
                <span>{line.label}</span>
                <strong>{line.value}</strong>
              </p>
            ))}
          </div>
        </section>

        <section className="pipeline-tool-section pipeline-tool-output">
          <header>
            <h3>Last output</h3>
            <span>{stageRun?.candidate_count ?? 0} candidates</span>
          </header>
          <p>{stageRun?.error_message || stageSummary(stageRun?.result_summary ?? {})}</p>
        </section>
      </div>
    </article>
  );
}

function PipelineRegistry({
  selectedRun,
  selectedStage,
  selectedSubjectId,
  onSubjectSelect
}: {
  selectedRun: DistillationRunDetail;
  selectedStage: DistillationStageKey;
  selectedSubjectId: string | null;
  onSubjectSelect: (localSubjectId: string) => void;
}) {
  const selectedStageRun = selectedRun.stages.find((stage) => stage.stage === selectedStage);

  if (selectedStage === "subjects") {
    return (
      <RegistrySection
        count={selectedRun.subjectPackages.length}
        description={stageSummary(selectedStageRun?.result_summary ?? {})}
        emptyText="No subject candidates yet."
        title="Subjects"
      >
        {selectedRun.subjectPackages.map((candidatePackage) => (
          <SubjectRegistryRow
            candidatePackage={candidatePackage}
            isSelected={candidatePackage.localSubjectId === selectedSubjectId}
            key={candidatePackage.localSubjectId}
            onSelect={onSubjectSelect}
          />
        ))}
      </RegistrySection>
    );
  }

  if (selectedStage === "claims") {
    const claims = selectedRun.candidates.filter((candidate) => candidate.candidate_kind === "claim");

    return (
      <CandidateRegistry
        candidates={claims}
        description={stageSummary(selectedStageRun?.result_summary ?? {})}
        emptyText="No claim candidates yet."
        title="Claims"
      />
    );
  }

  if (selectedStage === "subject_relations") {
    const relationships = selectedRun.candidates.filter((candidate) => candidate.candidate_kind === "subject_relationship");

    return (
      <CandidateRegistry
        candidates={relationships}
        description={stageSummary(selectedStageRun?.result_summary ?? {})}
        emptyText="No subject relationship candidates yet."
        title="Subject relations"
      />
    );
  }

  if (selectedStage === "claim_relations") {
    const relationships = selectedRun.candidates.filter((candidate) => candidate.candidate_kind === "claim_relationship");

    return (
      <CandidateRegistry
        candidates={relationships}
        description={stageSummary(selectedStageRun?.result_summary ?? {})}
        emptyText="No claim relationship candidates yet."
        title="Claim relations"
      />
    );
  }

  if (selectedStage === "promotion") {
    const promotions = selectedRun.candidates.filter((candidate) => candidate.candidate_kind === "promotion");

    return (
      <CandidateRegistry
        candidates={promotions}
        description={stageSummary(selectedStageRun?.result_summary ?? {})}
        emptyText="Promotion candidates will appear after the promotion stage runs."
        title="Promotions"
      />
    );
  }

  return (
    <RegistrySection
      count={0}
      description="This stage is present in the workflow shell but not wired to a registry yet."
      emptyText="No ontology registry yet."
      title="Ontology"
    />
  );
}

function RegistrySection({
  children,
  count,
  description,
  emptyText,
  title
}: {
  children?: ReactNode;
  count: number;
  description: string;
  emptyText: string;
  title: string;
}) {
  return (
    <section className="pipeline-registry">
      <header>
        <div>
          <p>{description}</p>
          <h2>{title}</h2>
        </div>
        <span>{count} candidate{count === 1 ? "" : "s"}</span>
      </header>
      {count > 0 ? <div className="pipeline-registry-list">{children}</div> : <p className="pipeline-registry-empty">{emptyText}</p>}
    </section>
  );
}

function CandidateRegistry({
  candidates,
  description,
  emptyText,
  title
}: {
  candidates: DistillationCandidateRecord[];
  description: string;
  emptyText: string;
  title: string;
}) {
  return (
    <RegistrySection count={candidates.length} description={description} emptyText={emptyText} title={title}>
      {candidates.map((candidate) => (
        <CandidateRegistryRow candidate={candidate} key={candidate.id} />
      ))}
    </RegistrySection>
  );
}

function SubjectRegistryRow({
  candidatePackage,
  isSelected,
  onSelect
}: {
  candidatePackage: SubjectCandidatePackage;
  isSelected: boolean;
  onSelect: (localSubjectId: string) => void;
}) {
  return (
    <button
      className="pipeline-registry-row"
      data-active={isSelected}
      onClick={() => onSelect(candidatePackage.localSubjectId)}
      type="button"
    >
      <div>
        <strong>{textValue(candidatePackage.subject.payload.label, "Untitled subject")}</strong>
        <small>{textValue(candidatePackage.subject.payload.type, "subject")} · {candidatePackage.status}</small>
      </div>
      <dl>
        <div>
          <dt>Aliases</dt>
          <dd>{candidatePackage.aliases.length}</dd>
        </div>
        <div>
          <dt>Claims</dt>
          <dd>{candidatePackage.claims.length}</dd>
        </div>
        <div>
          <dt>Rels</dt>
          <dd>{candidatePackage.relationships.length}</dd>
        </div>
      </dl>
    </button>
  );
}

function CandidateRegistryRow({ candidate }: { candidate: DistillationCandidateRecord }) {
  return (
    <article className="pipeline-registry-row">
      <div>
        <strong>{candidateTitle(candidate)}</strong>
        <small>{candidate.candidate_kind.replaceAll("_", " ")} · {candidate.status}</small>
      </div>
      <span className="pipeline-status-pill" data-status={candidate.status}>
        {candidate.status}
      </span>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="pipeline-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function promptForStage(stage: DistillationStageKey) {
  if (stage === "subjects") {
    return SUBJECTS_PROMPT;
  }

  return `${stageLabel(stage)} is not wired to an editable prompt in this workbench yet.`;
}

function promptPath(stage: DistillationStageKey) {
  const filenames: Record<DistillationStageKey, string> = {
    claim_relations: "claim-relations.md",
    claims: "claims.md",
    ontology: "ontology.md",
    promotion: "promotion.md",
    subject_relations: "subject-relations.md",
    subjects: "subjects.md"
  };

  return `distillation/prompts/${filenames[stage]}`;
}

function sourceContextLines(
  selectedDocument: DocumentRecord,
  selectedRun: DistillationRunDetail,
  selectedStage: DistillationStageKey
) {
  const bundleContext = selectedRun.bundle?.source_context ?? {};
  const promptModel = selectedRun.stages.find((stage) => stage.stage === selectedStage)?.model ?? "not recorded";

  return [
    { label: "Document", value: selectedDocument.label },
    { label: "Source", value: selectedDocument.source_filename || selectedDocument.source_url || "local document" },
    { label: "Document status", value: selectedDocument.status },
    { label: "Shards", value: String(selectedDocument.shard_count) },
    { label: "Run", value: selectedRun.run.status.replaceAll("_", " ") },
    { label: "Stage", value: selectedStage.replaceAll("_", " ") },
    { label: "Model last used", value: promptModel },
    { label: "Bundle", value: selectedRun.bundle?.id ?? "not created" },
    { label: "Context keys", value: Object.keys(bundleContext).length ? Object.keys(bundleContext).join(", ") : "none recorded" }
  ];
}

function runLabel(run: DistillationRunSummary) {
  return `${run.document_label ?? "Run"} · ${run.status.replaceAll("_", " ")}`;
}

function stageLabel(stage: string) {
  return stage
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function stageSummary(summary: Record<string, unknown>) {
  const count = typeof summary.candidate_count === "number" ? summary.candidate_count : null;

  if (count !== null) {
    return `${count} normalized candidate${count === 1 ? "" : "s"}`;
  }

  return "No output yet.";
}

function candidateTitle(candidate: DistillationCandidateRecord) {
  if (candidate.candidate_kind === "claim") {
    return textValue(candidate.payload.claimText, "Claim candidate");
  }

  if (candidate.candidate_kind === "subject_relationship") {
    return `${textValue(candidate.payload.sourceLocalSubjectId, "source")} -> ${textValue(candidate.payload.targetLocalSubjectId, "target")}`;
  }

  if (candidate.candidate_kind === "claim_relationship") {
    return `${textValue(candidate.payload.sourceLocalClaimId, "source")} -> ${textValue(candidate.payload.targetLocalClaimId, "target")}`;
  }

  return textValue(candidate.payload.label, "Candidate");
}

function textValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
