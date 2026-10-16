# Application Surfaces

This is the map of the Atlas app's UI surface and reusable shell components: what the shell owns, what Workshop is responsible for, and which interaction patterns stay consistent across the app.

## Shell

The Shell is the persistent application container. It holds navigation, shared layout, global context, and the active Workshop surface. The Shell is not itself a Knowledge Distillation phase.

## Shell Components

| Component               | Responsibility                                                                   |
| ----------------------- | -------------------------------------------------------------------------------- |
| Nav Rail                | Thin icon-based navigation for brand entry, Workshop entry, and global actions.  |
| Shelf                   | Universal list/filter/containment surface attached to the nav rail.              |
| Stage                   | Central work area for the selected Workshop mode.                                |
| Inspector               | Universal class/object inspector for the selected item.                          |
| Chrome                  | Shared overlay layer for dialogs, modals, and app-level UI.                      |
| Shared CRUD Form Engine | Shared create/edit path with record-specific field rendering and submit routing. |

## Nav Rail

The Nav Rail is always thin and icon-based. A branded icon at the top links to Landing. The Workshop icon enters the app workspace, and a settings icon may sit at the bottom.

The Shelf is attached to the Nav Rail.

If the app version includes authentication, Landing may use the Nav Rail or surrounding shell behavior as part of sign-in or registration before entering Workshop.

## Shelf

The Shelf is a universal shell component, not a separate left panel for separate phase routes.

In Workshop, the selected class changes what the Shelf filters and displays:

- Documents and document folders for source preparation.
- Runs for extraction and distillation observability.
- Bundles for admission and review work.
- Subjects, claims, relationships, and types for canonical memory and ontology work.

The Shelf provides filtering and containment. Document folders are user-created containers for prepared source material. Other class views may group records by status, type, bundle state, review state, or graph relevance.

## Stage

The Stage is the central work area. It changes by selected class and URL state while preserving the surrounding Shell context.

Workshop Stage modes include:

- Document reader and preparation workflow.
- Run control and extraction observability.
- Bundle review, admission, and claim workspace.
- Domain Map canvas and graph authoring.
- Record management and ontology shaping through shared dialogs and the Inspector.

Phase-to-Workshop mapping:

| Methodology Area | Workshop Mode                                                               |
| ---------------- | --------------------------------------------------------------------------- |
| Preparation      | Documents, import, document reader, source readiness.                       |
| Extraction       | Runs, source-unit selection, model/effort settings, step observability.     |
| Admission        | Bundles, candidate review, claim workspace, dispositions, canonical writes. |
| Materialization  | Domain Maps, graph composition, authored salience, layout.                  |
| Operation        | Inspector, record CRUD, ontology management, curation.                      |

## Inspector

The Inspector is a universal class/object inspector. Whenever the user selects something from the Shelf or Stage, the Inspector shows relevant details and actions for that object.

For documents, the Inspector shows document metadata and outline or table of contents when available. It also exposes observability for preparation steps such as intake, conversion, sharding, classification, status, errors, retry, or reprocessing.

For runs, the Inspector shows run state, current step, costs, token totals, source scope, step output, retry state, and errors.

For bundles and candidate work, the Inspector exposes admission state, extracted claims, candidate context, decisions, and source traceability where available.

For ontology records such as Types, the Inspector shows class scope, domain scope, description, status, usage, and available curation actions.

For knowledge and review records, the Inspector exposes evidence, lexicalizations, provenance, claim targets, admission decisions, lifecycle state, and related review issues where applicable.

## Agent Path

The shipped app does not mount an in-app Composer or agent surface. Agent access runs through the external Memoria MCP server, which calls deterministic app services for approved reads and writes.

Mutations to canonical memory still require user approval at first.

## Landing

Landing is the branded entry surface. It behaves as follows:

- It includes a large hero or brand icon.
- It has no Shelf.
- It introduces the purpose of the app.
- It links selected domains into Workshop.
- It may support authentication or sign-in depending on the app version.

## Workshop

Workshop is the single work surface for the app. It combines source preparation, extraction observability, admission, graph authoring, record management, and ontology management in one URL-driven shell.

Workshop responsibilities:

- Import source material.
- Store and display source documents.
- Capture document metadata, provenance, and classification.
- Convert, clean, normalize, shard, or chunk documents when needed.
- Display prepared documents for user review.
- Select source documents, shards, or source units for Extraction.
- Configure and start extraction runs.
- Observe current run step, elapsed time, retry counts, token totals, costs, and compact failure artifacts.
- Inspect prompts, source data, artifacts, and output created while a run is in progress.
- Load candidate bundles.
- Show candidate or curation work items.
- Allow manual review before canonical writes.
- Stage match, alias, create, possible-same-as, reject, split, duplicate, process, or defer decisions.
- Commit approved decisions through deterministic admission services.
- Surface curation problems such as duplicates, contradictions, stale records, lifecycle transitions, or ontology gaps.
- Manage records through process-heavy review flows.
- Manage class-scoped and domain-scoped Types.
- Create, edit, and author Domain Maps.
- Select subjects and relationships for a map.
- Arrange and lay out subject nodes.
- Persist map layout when the layout itself carries authored meaning.
- Export or retrieve Domain Map context.

Bundles are first-class work objects. Extraction runs can produce candidate bundles, but bundles may also be produced by curation tools, scheduled jobs, ontology tools, or agents.

Domain Maps express authored salience. They do not become canonical truth merely because something is visible, hidden, positioned, grouped, or emphasized on a map.

Workshop does not automatically admit related claims or relationships merely because a parent candidate subject was admitted. Related items need review at the right granularity.

Workshop does not currently provide model-assisted reconciliation, claim-merge assistance, progressive autonomy, or agent-initiated extraction runs. Those remain later capabilities.

## Shared Chrome and Dialogs

The Shell supports shared chrome and dialogs for cross-mode interactions.

Examples:

- Shared create/edit record forms.
- Relationship type dialogs.
- Tool configuration dialogs.
- Model/prompt settings dialogs.
- Ontology management dialogs.
- Confirmation dialogs for mutation.

The shared CRUD form path is a shared CRUD form engine with record-specific field rendering and table-specific submit routing, not a complete universal CRUD framework yet.
