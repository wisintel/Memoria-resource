# Process Architecture

This is how work moves through you over time — the operational flow of the Knowledge Distillation Cycle: inputs, outputs, records, state, user actions, tool actions, observability, boundaries, and handoffs.

## Process Spine

The Knowledge Distillation Cycle is:

1. Preparation
2. Extraction
3. Admission
4. Materialization
5. Operation

Operation produces new artifacts, observations, corrections, decisions, or source needs that re-enter Preparation.

The fine-grained methodology operations are:

1. Intake
2. Conversion
3. Subject Extraction
4. Claim Extraction
5. Relationship Extraction
6. Evidence Normalization
7. Lexicalization Normalization
8. Reconciliation
9. Promotion
10. View Creation or Materialization

## Domain Shaping

Domain Shaping is an authoring activity, not a formal phase in the Knowledge Distillation Cycle.

Domain Shaping creates enough initial domain structure for Knowledge Distillation to work well. It may create or refine the domain's ontology, core subjects, seed relationships, and contextual structure.

Do Domain Shaping before high-quality Extraction; repeat it when the domain becomes too generic or insufficiently structured.

Signals that Domain Shaping may be needed:

- Too many knowledge objects grouped under generic Types.
- Extraction producing low-salience candidates.
- Admission repeatedly needing the same missing Type or relationship vocabulary.
- Domain Maps requiring relationship meanings that are not yet represented in ontology.

## Process Boundaries

Preserve strict boundaries between phases:

- Prepared source is not extracted meaning.
- Extracted candidates are not canonical memory.
- Extraction success does not make material canonical.
- Uncertain identity defaults to split-and-review, not silent merge.
- Admission decisions are not merely suggestions; commit accepted decisions through deterministic app services.
- Canonical memory is not the same as projections, maps, summaries, exports, or context packets.
- Operation does not silently mutate canonical memory.

## Phase 1: Preparation

### Purpose

Preparation registers, preserves, converts, cleans, classifies, chunks, and packages source material into model-ready source units without interpreting it as knowledge.

### Inputs

- External files.
- URLs.
- Notes.
- Transcripts.
- Screenshots.
- Exports.
- Source bundles.
- Library scope.
- Source metadata.
- User intent.
- Provenance.

### Outputs

- Raw artifacts.
- Converted text or Markdown.
- Cleaned artifacts.
- Source units or document shards.
- Classification reports.
- Cleaning reports.
- Chunk manifests.
- Preparation manifest.

### Records And State

Preparation may touch:

- Documents.
- Source units or shards.
- Source artifacts.
- Pipeline runs.
- Run steps.
- Prompt turns for cleanup.
- Preparation manifests.
- Failure artifacts.

### User Actions

- Add or import source material.
- Inspect converted material.
- Approve or adjust cleaning, conversion, or chunking when needed.

### Tool And Agent Actions

- Copy or register source material.
- Convert source format.
- Inspect source material.
- Classify source.
- Clean source.
- Chunk or shard source.
- Create sidecars or manifests.
- Prepare bounded Extraction inputs.

### Observability

Expose in Preparation:

- Source identity.
- Artifact paths.
- Checksums.
- Conversion route.
- Classification.
- Chunk count.
- Byte counts.
- Cleanup decisions.
- Prompt-turn metadata when model cleanup is used.
- Failures.

### Completion Criteria

Preparation is complete when source material has stable source units and a manifest that can be replayed or consumed by Extraction.

### Handoff

Preparation hands a **Preparation Manifest** and source-unit artifacts to Extraction.

## Phase 2: Extraction

### Purpose

Extraction produces source-grounded candidate meaning from prepared source units.

### Inputs

- Prepared source units.
- Source context.
- Domain context.
- Prompt contracts.
- Extraction settings.

### Outputs

- Candidate subjects.
- Candidate claims.
- Candidate relationships.
- Evidence.
- Lexicalizations.
- Contradictions.
- Review issues.
- Candidate bundle or ledgers.

### Records And State

Extraction may touch:

- Pipeline runs.
- Pipeline run steps.
- Candidate bundles.
- Candidate rows.
- Step sidecars: input context, raw output, result summary, token usage, latency, cost, retry count, and failure artifact.
- Candidate evidence spans and lexicalizations inside staged payloads.

Extraction in the shipped app writes candidate rows only. It does not write canonical subjects, claims, relationships, evidence rows, or provenance records.

### User Actions

- Start Extraction.
- Monitor Extraction.
- Inspect candidate output.
- Review Extraction failures or weak evidence.

### Tool And Agent Actions

- Run subject discovery.
- Run claim extraction.
- Run relationship extraction.
- Normalize lexicalizations.
- Normalize evidence links.
- Run semantic evidence extraction.
- Validate output.
- Normalize output.
- Package bundle.

### Observability

Expose in Extraction:

- Current run step.
- Elapsed run time.
- Elapsed stage time.
- Prompt version.
- Model.
- Effort.
- Input sidecar.
- Request sidecar.
- Output sidecar.
- Validation result.
- Token metadata.
- Latency metadata.
- Cost metadata.
- Failure artifact.

### Completion Criteria

Extraction is complete when candidate material is validated, source-linked, and packaged for review without being admitted.

### Handoff

Extraction hands a **Candidate Bundle** or review package to Admission.

## Phase 3: Admission

### Purpose

Admission decides what candidate material belongs in canonical memory and commits accepted knowledge through deterministic app services.

### Inputs

- Candidate bundles.
- Existing canonical memory.
- Domain profile.
- Evidence.
- Provenance.
- Duplicate signals.
- Conflict signals.
- User feedback.
- Review issues.

### Outputs

- Review decisions.
- Admission decisions.
- Canonical writes.
- Merge notes.
- Defer notes.
- Reject notes.
- Cascade plans.
- New review issues.

### Records And State

Admission may touch:

- Candidate state.
- Review issues.
- Admission decision records.
- Library admission feedback.
- Possible match metadata.
- Canonical Subjects.
- Canonical Claims.
- Canonical Relationships.
- Supporting records.
- Admission packages.

### User Actions

- Review candidates.
- Approve promotion.
- Reject candidates.
- Defer candidates.
- Revise candidates.
- Merge candidates.
- Mark possible duplicates.
- Resolve contradictions or ambiguous identities.

### Tool And Agent Actions

- Compare candidates to canonical memory.
- Propose dispositions.
- Resolve semantic identity conservatively.
- Review possible-same-as candidates.
- Review relationship candidates independently from endpoint subjects.
- Propose claim merges without losing evidence, provenance, contradiction, or review state.
- Propose context changes such as domain membership, hierarchy, or grouping.
- Curate context proposals before canonical changes.
- Score relevance.
- Detect duplicates.
- Detect conflicts.
- Detect stale records.
- Prepare cascade plans.
- Execute approved deterministic writes.

### Observability

Expose in Admission:

- Actor.
- Timestamp.
- Decision kind.
- Evidence basis.
- Candidate IDs.
- Resulting canonical targets.
- Rationale.
- Batch or bundle identity.
- Unresolved dependencies.

### Completion Criteria

Admission is complete when reviewed candidates have durable dispositions and accepted knowledge has been committed to canonical memory.

### Handoff

Admission hands updated canonical memory and affected records to Materialization.

## Phase 4: Materialization

### Purpose

Materialization turns canonical memory into usable read surfaces while keeping canonical memory separate from projections.

### Inputs

- Canonical memory.
- Accepted claims.
- Accepted relationships.
- Evidence links.
- Projection rules.
- Domain Map rules.
- Export or summary requests.

### Outputs

- Domain Maps.
- Clusters.
- Graph projections.
- Summaries.
- Context packets.
- Exports.
- Markdown or document read models.
- Projection state.

### Records And State

Materialization may touch:

- Domain Maps.
- Clusters.
- Projection state.
- Export records.
- Summary records.
- Context packets.
- Layout state.
- Stale markers.
- Regeneration jobs.

### User Actions

- Inspect generated surfaces.
- Approve map placement where needed.
- Request exports.
- Request summaries.
- Request context packets.
- Review stale or failed projections.

### Tool And Agent Actions

- Invalidate projections.
- Regenerate projections.
- Generate Domain Maps.
- Generate clusters.
- Generate summaries.
- Generate exports.
- Generate context packets.

### Observability

Expose in Materialization:

- Projection hash.
- Stale markers.
- Last projection error.
- Regeneration job status.
- Layout state.
- Export status.

### Completion Criteria

Materialization is complete when affected projections are current, marked stale, or queued for regeneration with visible status.

### Handoff

Materialization hands readable, queryable, exportable, or agent-usable context to Operation.

## Phase 5: Operation

### Purpose

Operation uses materialized knowledge in real work and captures new material for the next cycle.

### Inputs

- Domain Maps.
- Clusters.
- Summaries.
- Context packets.
- Exports.
- Canonical memory.
- Candidate overlays.
- Agent context.

### Outputs

- Answers.
- Decisions.
- Documents.
- Corrections.
- Discoveries.
- Source-gap lists.
- Repair tasks.
- New source material.

### Records And State

Operation may touch:

- Usage artifacts.
- Agent actions.
- Tool actions.
- Review issues.
- Source needs.
- Correction records.
- Future intake tasks.

### User Actions

- Ask questions.
- Use graph or context in work.
- Correct memory.
- Mark stale knowledge.
- Request follow-up research.
- Request source intake.

### Tool And Agent Actions

- Retrieval walks.
- Context activation.
- Export generation.
- Gap detection.
- Scheduled curation or linting where approved.

### Observability

Expose in Operation:

- Context used.
- Canon, candidate, and stale distinctions.
- Agent actions.
- Approvals.
- Generated outputs.
- Source gaps.
- Corrections.

### Completion Criteria

Operation is complete when work output is produced and any new material or correction is routed back into Preparation or review instead of silently mutating canonical memory.

### Handoff

Operation hands new artifacts, observations, corrections, source gaps, or source needs back to Preparation.

## Lifecycle State Separation

Keep lifecycle states separated by concern.

| State Area | Purpose |
| --- | --- |
| Run state | Tracks execution of a process or tool run. |
| Work-item state | Tracks individual work items inside a bundle or queue. |
| Prompt-turn state | Tracks one model-backed attempt and its artifacts. |
| Candidate state | Tracks candidate lifecycle before Admission. |
| Admission state | Tracks review and admission decision lifecycle. |
| Promotion state | Tracks canonical write or promotion lifecycle. |
| Projection state | Tracks freshness and regeneration of read models. |
| Claim state | Tracks claim acceptance, contradiction, scope, revision, or supersession. |
| Map membership state | Tracks membership of records in Domain Maps or Clusters. |
| Layout state | Tracks node, edge, and cluster layout in graph constructs. |

## Review Issues

Review Issues are structured work items for uncertainty, contradiction, weak evidence, duplicate risk, stale material, or required human judgment.

For conflict, duplicate, stale-record, weak-evidence, and merge-cascade review, create structured Review Issues rather than silently mutating canonical memory.

## Retry, Reprocess, And Quarantine

Retry and reprocess behavior covers:

- Retry counts on pipeline run steps.
- Quarantine of failed step artifacts on the step row.
- Failed run state with visible error summary.
- Supersede and rerun behavior for unresolved candidates from failed runs.
- Reprocess lineage through runs, steps, candidates, decisions, and provenance.
- Manual recovery through rerunning Extraction or reviewing deferred candidates.

## Lineage Spine

Provenance follows a lineage spine:

Source → Run → Source Unit → Extraction Claim → Canonical Record → Projection or Export

This lineage makes source provenance, evidence, run state, artifacts, prompt inputs, prompt outputs, validation results, failures, decisions, and projections inspectable.

In the shipped extraction spine, this is represented by `pipeline_runs`, `pipeline_run_steps`, `extraction_bundles`, `extraction_claims`, `extraction_claim_mentions`, `extraction_claim_provenance`, `extraction_claim_inferred_from`, and `record_provenance`. Claim evidence is materialized downstream when a later review flow admits canonical memory.

## Agent Approval Gates

You and other models may propose, compare, prepare, and execute approved deterministic app services. Do not directly mutate canonical memory.

Approval gates are required for:

- Canonical mutation.
- Bulk changes.
- Destructive actions.
- Ambiguous merges.
- Promotion into user domains.
- Scheduled curation that can affect canonical memory.
