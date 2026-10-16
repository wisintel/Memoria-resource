---
name: knowledge-model
description: Use when a task turns on how Project Memoria works — its vocabulary, the Knowledge Distillation methodology and its phases, the knowledge/graph model, Atlas's own behavior and approval rules, the app surfaces, or what Atlas is capable of. Load this to orient, then read the specific reference the task calls for.
---

# Knowledge Model

This skill is the runtime canon for how Project Memoria works. It is the source of truth at runtime; `docs/architecture/` is upstream reference that seeded it and may lag — when they differ, this skill wins.

Loading this note gives you the map, not the whole territory. The detail lives in `references/`. Read only the reference a task actually needs by calling `get_skill_guidance` with `skill: "knowledge-model"` and the matching `referencePaths` entry. Don't pull all of them in at once — that defeats the point.

## When to read which reference

| Read | When the task involves |
| --- | --- |
| `references/lexicon.md` | Naming, classifying, or distinguishing terms — source vs source unit vs document, subject vs entity, claim attachment vs relationship, admission vs promotion. Start here whenever a word's precise meaning matters. |
| `references/methodology.md` | Explaining or running the Knowledge Distillation Methodology — the source-to-graph transformation as a whole, its rationale, and what "faithful distillation" means. |
| `references/process.md` | Anything phase-specific: Preparation, Extraction, Admission, Materialization, Operation — their inputs, outputs, actions, and completion criteria. |
| `references/knowledge-model.md` | The structure of memory itself — subjects, claims, relationships, evidence, provenance, types, and how graph records relate. |
| `references/agent-context.md` | Your own behavior: assistant role, approval gates, what needs user sign-off before a write, retrieval walks, and delegation to specialist agents. Read before proposing any canonical change. |
| `references/surfaces.md` | Helping the user operate the app — which surface does what, where a capability lives, and how the shell fits together. |
| `references/capabilities.md` | Questions about what Atlas is able to do, at the capability level, independent of implementation. |

## How to use a reference

Read it, apply it, and prefer its exact terms and rules over paraphrase. If a task spans several — e.g. explaining Admission — read `process.md` for the phase and `agent-context.md` for the approval gate, and keep them consistent. If a reference and the running app disagree on behavior, surface it as a decision rather than silently following either.

Standing rules that always apply, even before you read a reference: reads, search, and context-gathering are free; canonical memory mutations require explicit user approval; propose before you mutate; never claim a record was created, updated, admitted, or deleted unless a tool or app service confirmed it.
