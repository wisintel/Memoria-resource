# Knowledge Model

This is your conceptual model for knowledge, process, and materialized graph objects. It separates target model concepts from existing Atlas and Memoria table names.

## Model Layers

Use a hybrid model:

- Strong semantic classes for methodology-critical knowledge objects.
- Class-aware universal UI for Shelf, Inspector, forms, and reference selection.
- Operational records for tool runs, logs, prompts, model settings, artifacts, and internal process state.
- Promotable records when operational records become domain knowledge through Admission.

A thing becomes a knowledge class when users need to reason over it as domain knowledge. Otherwise, it can remain operational metadata, tooling configuration, or app infrastructure.

## Ontology Principle

Ontology defines your governed vocabulary and structural rules. It is not a folder system, view layout, graph canvas, or export format.

Ontology stabilizes meaning without freezing interpretation. You need durable base units, governed type vocabulary, explicit relationship semantics, and boundaries between identity, claims, evidence, lexicalization, domains, maps, and layout. At the same time, domains need room to enable, specialize, alias, or extend vocabulary without corrupting canonical identity.

## Structural Roles

Some concepts are structural roles over deeper records rather than peer base ontology classes.

| Term | Structural Role |
| --- | --- |
| Domain | Curated salience boundary and context role. |
| Cluster | Reusable, inferred, or curated grouping role in a Domain Map. |
| Node | Presentation role for an object inside a Domain Map. |
| Edge | Presentation role for a relationship or connection inside a Domain Map. |

A Subject can appear as a concept, cluster anchor, Domain Map node, or domain anchor depending on use. That role must not overwrite canonical Subject identity.

## Model Categories

### Knowledge Objects

Knowledge Objects are primary domain objects that can become part of canonical memory or directly shape domain meaning.

Target Knowledge Objects include:

- Domain
- Document
- Subject
- Claim
- Relationship

Treat Candidate as a lifecycle or review state of a Knowledge Object, not as a separate target class.

Canonical Memory is the admitted durable knowledge layer for a Domain.

Candidate is the state of proposed knowledge before Admission. Candidates can be promoted, merged, rejected, deferred, or marked as possible matches.

Subject Registry and Claim Registry are conceptual registries for identity-bearing Subjects and atomic Claims. They may be implemented as explicit tables plus object registry rows, but conceptually they represent the canonical set available for matching, review, and reuse.

### Supporting Records

Supporting Records qualify, explain, support, or record decisions about Knowledge Objects.

Target Supporting Records include:

- Evidence
- Evidence Link
- Claim Attachment
- Lexicalization or Alias
- Admission Decision

Evidence Link records preserve support, contradiction, qualification, and provenance roles.

Admission Decision records preserve who or what decided, what outcome was chosen, what evidence or rationale supported it, and which records were affected.

### Graph Constructs

Graph Constructs are map and graph objects used to materialize, compose, and author visible meaning.

Target Graph Constructs include:

- Node
- Edge
- Cluster
- Domain Map

Domain Map is one level above Cluster. A Cluster is a reusable graph composition. A Domain Map is a saved graph composition for domain meaning.

Cluster has two meanings that stay distinct:

- Claim or discovery cluster: a group of claims or candidate signals that appear to share a referent before identity is settled.
- Map or materialized cluster: a reusable visual graph composition saved for Domain Map authoring.

### Operational Classes

Operational Records support the app or process but are not domain knowledge by default.

Examples:

- Shards.
- Bundles.
- Prompt versions.
- Tool runs.
- Logs.
- Model settings.
- Low-level artifacts.
- Assistant events.
- Run stage internals.

Operational records may become domain knowledge only if the user or process explicitly admits them into a domain.

### Ontology and Lifecycle Records

Ontology and Lifecycle Records govern how objects are typed, displayed, filtered, and transitioned.

Examples:

- Type.
- Kind.
- Status.
- Lifecycle state.
- Class metadata.

Types are class-scoped and domain-scoped. A Type describes the classifier options available for a given class in a given domain or globally.

Types are behavior-bearing vocabulary, not just labels. A Type may guide capture, review, relationship expectations, evidence expectations, preservation rules, display behavior, layout hints, and domain availability.

## Visibility Modes

Classes and records can have different visibility modes.

| Mode | Meaning |
| --- | --- |
| Shelf-visible | Can appear as a primary browsable list for a surface. |
| Inspectable | Can be loaded into the Inspector. |
| Reference-selectable | Can be selected or linked as a reference while editing or reviewing another object. |
| Graph-visible | Can appear on a Domain Map as a node, edge, cluster, or map component. |

Define these modes independently. A record can be inspectable without being Shelf-visible. A record can be reference-selectable without being graph-visible.

## Core Classes

### Domain

A Domain is the selected scope for knowledge, work, and retrieval context.

Domain does not need to be Shelf-visible. The Shelf is filtered by selected Domain, and Domain selection is global context rather than a browsed class.

Domain must still be inspectable. Selecting or clicking the Domain context control should load the selected Domain record into the Inspector.

Domain membership scopes visibility, retrieval, and work context. A Domain is a salience boundary, not a folder, topic, or identity container. Domain membership may behave like containment for filtering, but it must not imply identity, hierarchy, or semantic equivalence.

### Document

A Document is a registered source artifact managed by Atlas for intake, preparation, review, extraction, and retrieval.

Make Document Shelf-visible by default in Library. Documents are also globally accessible. Some document types may be Graph-visible as nodes on a Domain Map.

Treat prompts and agent instructions as document types, not separate knowledge classes, unless future needs prove otherwise.

### Source Unit and Shard

The boundary between Source Unit, Shard, document type, and document lifecycle is not fully settled. Current direction:

- Source may be a document type or source classification, not necessarily a separate class.
- Shard may be a type of source unit or document unit.
- Document lifecycle states may include raw, converted, cleaned, or sharded.
- If a document is sharded, the shard may take over downstream processing lifecycle.

### Subject

Subject is the canonical target term for the knowledge object formerly called entity in some implementations.

Subject is:

- Shelf-visible in Observatory.
- Inspectable.
- Reference-selectable.
- Graph-visible as a node.

### Claim

A Claim is an atomic, truth-bearing proposition about a target. A Claim can be independently confirmed, denied, scoped, or revised. If a statement can be challenged in separable parts, split it into multiple Claims.

Claims must have a target to exist. Do not normally wire Claims directly on a Domain Map as graph nodes. Keep them attached to their target subjects or records, surfaced through Inspector, Bundle, search, and review contexts.

Claims are the primary unit of faithful extracted meaning. A Claim preserves what is asserted; it does not by itself decide why that assertion is salient.

Claim records may carry predicate semantics, provenance, contradiction state, temporal qualifiers, confidence, and review status.

Claim is:

- Inspectable.
- Reference-selectable.
- Reviewable in Bundles.

Claim Shelf visibility is not yet settled.

### Claim Attachment

A Claim Attachment is the non-structural link between a Claim and the object it concerns.

Claim Attachments allow one Claim to target one or more Subjects, Documents, Relationships, or other referenceable objects without forcing those targets into pairwise graph relationships.

A Claim Attachment says "this Claim is about this object." It does not say "these objects are structurally related in the domain."

Claim Attachments are:

- Supporting Records.
- Inspectable through the attached Claim or target object.
- Created or updated through Extraction, Admission, or curation workflows.
- Distinct from Relationships and Domain Map Edges.

### Relationship

Relationship is a durable graph object.

Relationship is:

- Shelf-visible.
- Inspectable.
- Graph-visible as an edge.

Keep Relationships universal enough to connect members of graph-visible classes when that connection carries domain meaning.

Relationships express admitted or authored domain meaning. Do not treat them as the same thing as Claim Attachments, evidence links, or incidental co-occurrence.

Relationship candidates extracted from source are local candidate signals. Admitted or authored structural Relationships are durable graph objects. The transition between the two requires Admission and stays independent from endpoint Subject admission.

Relationship Types have broad families and optional narrower kinds.

Potential relation families:

| Family | Purpose |
| --- | --- |
| Identity | Same, possible-same, distinct, or externally identified referents. |
| Typing | Instance, subtype, or role-playing relations. |
| Structural | Parts, members, containment, sequence, topology, and context membership. |
| Semantic | Meaningful non-hierarchical association. |
| Referential | Topic, source, context, mention, provenance, or attribution. |
| Causal | Cause, enablement, production, prevention, or directed influence. |
| Evidential | Support, contradiction, observation, validity, and source grounding. |
| Supersession | Revision, correction, deprecation, or replacement over time. |

The family provides stable behavior. The kind provides domain-specific precision.

### Type

Type is an Ontology Record used to classify records within a class and domain.

Types are:

- Class-scoped.
- Domain-scoped, with possible global defaults.
- Inspectable.
- Shelf-visible where ontology work is happening, especially Workshop.
- Usable during Extraction, Admission, and authoring.

Subject types, Claim types, and Relationship types are core ontology concerns.

Treat overuse of generic Types as a signal that the ontology may need shaping.

Type metadata may define:

- stable key
- display name
- description
- family
- kind
- capture guidance
- expected fields
- common relationship patterns
- evidence expectations
- preservation rules
- display behavior
- layout hints
- domain availability
- aliases or local display labels

Consult Type metadata instead of hardcoding ontology behavior across prompts and UI code.

Type availability supports:

- global defaults
- built-in reusable vocabulary
- domain-scoped vocabulary
- custom vocabulary that remains local until promoted

Enabling a Type for a Domain does not admit content, place anything on a Domain Map, or imply identity.

### Evidence

Evidence supports, contradicts, or qualifies specific claims or labels.

Do not make Evidence a primary Shelf class. Surface it inside Claim, Bundle, Admission, or Inspector contexts.

Attach Evidence through workflows rather than making it generally reference-selectable.

### Lexicalization and Alias

Do not show Lexicalization or Alias records on the Shelf.

Surface them in the Inspector of the record they are attached to. There should not normally be a reason to create or edit an alias independently of a canonical Subject or attached record.

### Bundle

Bundle is a first-class work object for Workshop.

Make Bundle Shelf-visible primarily or only in Workshop. Bundles are process context, not normally Graph-visible.

Bundle examples:

- Extraction candidate bundle.
- Conflict review bundle.
- Merge candidate bundle.
- Stale record review bundle.
- Lifecycle transition bundle.
- Ontology review bundle.
- Governance or audit bundle.

The exact Bundle lifecycle belongs in the lifecycle model.

### Domain Map

Domain Map is the canonical target term for a saved visual map of domain meaning.

Domain Map is:

- Managed from the Observatory Stage rather than default Shelf-visible.
- Inspectable.
- Materialized rather than canonical memory.

A Domain Map can contain nodes, edges, clusters, layout state, visible relationship filters, and purpose-scoped selection.

Domain Map is still an object-backed, inspectable graph construct even when hidden from default Shelf navigation. Select or create the active map through the graph stage's map controls so selection, layout, and authored salience remain in the canvas context.

### Cluster

Cluster is a first-class materialized object.

A Cluster is a reusable graph composition that can contain nodes, relationships, layout, and an anchor. It can be built on an ephemeral graph stage, saved, and dragged onto another Domain Map.

Cluster enables composition of larger maps from smaller meaningful units.

Cluster is:

- Shelf-visible in Observatory.
- Inspectable.
- Graph-visible as a reusable map component.
- Materialized rather than canonical memory.

Treat Anchor as a contextual role on the subject or node membership in a Cluster or Domain Map, not a global field on Subject.

## Graph Primitives

Graph primitives are presentation or map primitives, not the same as knowledge records.

| Primitive | Meaning |
| --- | --- |
| Node | A visual primitive representing a subject, claim, bundle item, document, cluster, or other mappable record. |
| Edge | A visual primitive representing a relationship or other connection between nodes. |
| Cluster | A reusable visual/materialized grouping of nodes and edges. |

## Existing Implementation Evidence

Atlas currently includes tables such as:

- `documents`
- `document_shards`
- `domains`
- `entities`
- `entity_aliases`
- `claims`
- `relationships`
- `record_sources`
- `views`
- `view_nodes`
- `view_relationships`
- `distillation_candidates`
- `distillation_runs`
- `distillation_shard_runs`
- `distillation_stage_runs`
- `types`
- `kinds`
- `statuses`
- `classes`
- `tools`

Memoria currently includes tables such as:

- `documents`
- `source_units`
- `domains`
- `subjects`
- `claims`
- `claim_targets`
- `claim_relationships`
- `relationships`
- `evidence`
- `evidence_links`
- `lexicalizations`
- `extraction_bundles`
- `extraction_claims`
- `extraction_claim_mentions`
- `extraction_claim_provenance`
- `extraction_claim_inferred_from`
- `views`
- `view_subjects`
- `view_relationships`
- `type_cards`
- `prompts`
- `prompt_versions`
- `prompt_bindings`
- `assistant_threads`
- `assistant_events`

These tables are evidence, not final target architecture.
