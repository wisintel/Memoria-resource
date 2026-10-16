---
name: admission
description: "Use when Atlas reviews extracted claim groups for admission into Project Memoria canon: compare candidates against existing subjects, claims, relationships, and map context; propose admit, duplicate, split, reject, defer, and relationship decisions; write approved canonical records with provenance; and mark extracted claims with explicit outcomes."
---

# Admission Guidance

Admission turns extracted candidates into canonical records. Extraction answers “what did the source say?” Admission answers “what should enter canon, and how?”

## Review Loop

1. Read the selected claim group and current canon.
2. Compare every extracted claim against existing subjects, claims, relationships, and visible map nodes.
3. Propose a concise plan before creating records.
4. Apply only approved changes.
5. Mark each reviewed extracted claim with the outcome that actually happened.

## Decisions

- Admit as claim when the extracted claim is atomic, useful, and not already represented.
- Create subject when a needed canonical target is missing.
- Create relationship when the assertion is best represented as a durable graph edge between subjects.
- Mark duplicate when canon already covers the candidate.
- Mark split when one extracted candidate becomes multiple canonical claims or relationships.
- Mark rejected when the candidate should not enter canon.
- Mark deferred when the candidate may matter later but does not have a clear place yet.

## Canon Rules

- Do not admit duplicates.
- Do not admit a compound extracted claim as one canon claim.
- Preserve qualifiers in claim text: dates, quantities, units, scope, conditions, comparison class, and source posture.
- Attach all relevant targets. Comparative claims usually target both compared subjects and any third reference subject.
- Use `comparative` for greater than, lower than, stronger than, warmer than, closer than, shorter than, or similar comparisons.
- Prefer relationships for `is a`, `located in`, `contains`, and other direct subject-to-subject facts.
- Prefer claims for measurements, descriptive facts, quantities, functions, temporal assertions, comparisons, and assertions that need exact wording.
- Target claims that apply to all members of a class to the class subject only. Instances inherit those claims through accepted `is a` relationships.
- When reviewing an instance, include direct claims, accepted outgoing `is a` relationships, and claims targeting parent class subjects as inherited context.
- Target individual instances only when the source specifically names those instances, introduces an exception, comparison, list membership, provenance posture, or a fact that does not apply to the whole class.

## Tooling

Use the Project Memoria MCP tools when available:

- `get_admission_claim_groups`: list unprocessed claim groups.
- `create_subject`: create missing canon subjects.
- `create_relationship`: create approved graph relationships.
- `admit_extracted_claim_as_claim`: create or reuse a canon claim from an extracted row, attach targets, preserve provenance, and mark it admitted.
- `mark_extracted_claim_duplicate`: mark a duplicate extracted row and optionally point to the canonical record.
- `mark_extracted_claim_split`: mark a split extracted row and optionally point to resulting records.
- `mark_extracted_claim_rejected`: mark an extracted row rejected.
- `mark_extracted_claim_deferred`: move an extracted row into the deferred group.
- `apply_admission_plan`: apply a reviewed batch with subjects, relationships, admitted claims, duplicates, splits, rejections, and deferrals.

If a needed operation is missing from tools, stop and explain the limitation instead of writing ad hoc database code.
