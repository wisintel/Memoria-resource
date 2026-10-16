# Capability Model

This is what you, Atlas, must be able to do. It describes capabilities independently from implementation, and lightly maps major capabilities to the Workshop modes where they appear.

## Capability Families

| Family                       | Purpose                                                                                                                                 |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Preparation Capabilities     | Prepare source material for Knowledge Distillation.                                                                                     |
| Distillation Capabilities    | Extract candidate knowledge and admit accepted graph knowledge into canonical memory.                                                   |
| Knowledge Graph Capabilities | Manage, author, view, and materialize accepted relational memory.                                                                       |
| Agent Capabilities           | Provide a context-aware assistant that understands the app, domain, and methodology.                                                    |
| Ontology Capabilities        | Shape domain ontology and manage class-scoped, domain-scoped types used during Extraction, Admission, and authoring.                    |
| Governance Capabilities      | Apply methodology constraints across data collection, review, authoring, admission, evidence, provenance, confidence, and agent action. |

## Surface Mapping

| Surface or Mode                   | Primary Capability Area                                          |
| --------------------------------- | ---------------------------------------------------------------- |
| Workshop documents mode           | Preparation capabilities.                                        |
| Workshop runs mode                | Extraction capabilities and tool visibility.                     |
| Workshop bundles and record modes | Admission, curation, record management, and ontology management. |
| Workshop graph mode               | Domain Mapping and Materialization capabilities.                 |
| Memoria MCP server                | Agent capabilities over app services.                            |

## Preparation Capabilities

Workshop documents mode is where Preparation capabilities happen.

You must be able to:

- Import source material.
- Store source documents.
- Capture document provenance and origin metadata.
- Capture document classification or type metadata when available.
- Convert documents when the source format is not model-ready.
- Clean or normalize converted content.
- Shard or chunk documents when they are too large or need bounded processing units.
- Display documents back to the user for inspection and review.
- Preserve prepared source material as input for Extraction.

## Distillation Capabilities

Distillation covers Extraction and Admission.

### Extraction

You must be able to:

- Process prepared source units.
- Provide relevant domain context to the extractor.
- Run model-backed extraction for subjects, claims, and subject-to-subject relationships.
- Identify candidate subjects.
- Identify candidate claims.
- Identify candidate relationships.
- Capture evidence for extracted claims or labels.
- Normalize evidence into reviewable support, contradiction, qualification, and provenance roles.
- Capture lexicalizations, aliases, and labels.
- Normalize lexicalizations without collapsing identity.
- Package extracted results into candidate bundles.
- Preserve source scope so candidates remain traceable into Admission.
- Retry failed extraction steps within a bounded limit and preserve failed artifacts when retries are exhausted.

In the shipped app, Extraction is the model-backed phase. It produces candidate rows in a bundle and then auto-runs deterministic reconciliation.

### Reconciliation

You must be able to:

- Compare candidates against existing canonical memory.
- Propose exact subject label or alias matches.
- Propose exact claim text matches.
- Flag near-miss subject labels as possible same-as review candidates.
- Resolve relationship endpoint candidates against staged or canonical subjects.
- Defer relationship candidates when endpoint resolution or relationship vocabulary is missing.

In the shipped app, Reconciliation is deterministic and writes staged recommendations only. Model-assisted reconciliation is planned as an on-demand Workshop assist, not part of the automatic pipeline.

### Admission

Admission is manual at first.

You must allow users to review candidate knowledge and:

- Promote candidates into canonical memory.
- Reject candidates.
- Merge candidates with existing canonical records.
- Revise candidates before admission.
- Defer candidates for later decision.
- Resolve semantic identity conservatively.
- Admit relationships independently from endpoint subjects.
- Preserve claim evidence, provenance, contradiction, or review state.
- Propose and curate contexts such as domains, hierarchy, or grouping changes.
- Preserve history through revise, supersede, reject, defer, and promote flows.

Future assisted or agentic admission may be possible after the domain has accumulated enough structure, salience, and reliability.

In the shipped app, all dispositions are staged recommendations until David commits them in Workshop. Claim merge is planned but not implemented as a model-assisted merge operation in this arc.

## Knowledge Graph Capabilities

You must be able to manage accepted relational memory.

You must support:

- Lifecycle-aware management of accepted graph records.
- Manage subjects.
- Manage claims.
- Manage relationships.
- Manage evidence links.
- Manage Domain Maps.
- View the graph.
- Author relationships.
- Create curated Domain Maps.
- Curate salience.
- Export graph or context materializations.
- Revise, supersede, reject, defer, promote, and preserve history for governed records.

Domain Maps and other materializations are read surfaces over canonical memory. They must not silently become the source of truth.

## Agent Capabilities

You are a context-aware app agent, not a detached chatbot.

You must be able to:

- Understand current app state.
- Understand current domain context.
- Understand the Knowledge Distillation Methodology.
- Help the user use Atlas efficiently.
- Create, read, update, and delete application records with user approval.
- Call tools that support governance.
- Call tools that support authoring.
- Call tools that support admission.
- Help manage ontology through a dedicated Ontology Management skill or tool capability.

At first, mutations to canonical memory require user approval.

## Ontology Capabilities

Ontology is cross-cutting.

Each data class has its own classifiers. You must support Subject types, Claim types, and Relationship types.

Ontology Management is the ability to efficiently assign, create, review, revise, and apply available types for use during Extraction, Admission, and authoring. Types give knowledge salience and structure.

You must be able to:

- Track class-scoped and domain-scoped types.
- Define types.
- Generate proposed types.
- Apply types to documents, subjects, claims, relationships, evidence, Domain Maps, and process outputs where appropriate.
- Revise types over time.
- Use Type metadata as capture, review, evidence, preservation, display, and layout guidance.
- Manage broad relationship families and narrower relationship kinds.
- Enable global, built-in, domain-scoped, and custom vocabulary without confusing vocabulary availability with content admission.
- Preserve type history or review state when needed.
- Seed a new domain with an initial ontology.
- Detect ontology quality problems, such as too many knowledge objects grouped under generic types.
- Detect generic `related-to` overuse as a sign that relationship vocabulary may be missing.
- Detect vocabulary drift, duplicate types, over-specialization, and generic type overuse.
- Review ontology health across identity, claims, relationships, evidence expectations, explicit/inferred separation, and projection quality.

Ontology creation is collaborative between user and agent.

### Domain Shaping

Domain Shaping is an authoring activity that creates enough initial domain structure for Knowledge Distillation to work well.

Domain Shaping may include:

- Creating an initial set of Subject types.
- Creating an initial set of Claim types.
- Creating an initial set of Relationship types.
- Capturing core subjects.
- Capturing seed relationships.
- Capturing user, agent, or research context about the domain's expected shape.

Domain Shaping is not a phase in the Knowledge Distillation Cycle. It supports the cycle, especially Extraction and Admission.

## Governance Capabilities

Governance is cross-cutting, not only a separate feature area.

You must be able to:

- Preserve provenance.
- Preserve evidence.
- Preserve candidate versus canonical state.
- Keep Admission explicit.
- Prevent silent mutation of canonical memory.
- Preserve contradiction for review instead of overwriting it.
- Support confidence and weight as developing signals.
- Apply methodology principles to process behavior.
- Keep agent actions approval-gated until the domain is mature enough for more autonomy.
