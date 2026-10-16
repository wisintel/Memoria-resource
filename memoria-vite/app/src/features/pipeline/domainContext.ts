import type { DomainRecord } from "../../types";

export const DOMAIN_CONTEXT_PROMPT = `## Task

Create a reusable Memoria domain context packet from the provided domain graph context.

Return only JSON with this shape:

{
  "profile": "Markdown context packet for future extraction tools"
}

The profile should include:
- Domain summary
- Expected subjects
- Expected claims
- Expected relationships
- Reuse guidance

Rules:
- Use only the provided domain context.
- Keep the packet compact enough to send with extraction tools.
- Describe expected extraction targets, not UI behavior.
- Do not create canonical records.
- Do not include speculation that is unsupported by the domain context.`;

export type DomainContextStats = {
  claim_count: number;
  document_count: number;
  relationship_count: number;
  subject_count: number;
  type_count: number;
};

export function buildDomainContextProfile(activeDomain: DomainRecord | null) {
  const label = activeDomain?.label ?? "Selected domain";

  return [
    `# ${label} Domain Context`,
    "",
    "## Domain Summary",
    "Describe what this domain is about and what extraction tools should assume.",
    "",
    "## Expected Subjects",
    "- Concepts, actors, artifacts, systems, phases, processes, operations, principles, and steps that are meaningful in this domain.",
    "",
    "## Expected Claims",
    "- Definitions, classifications, requirements, constraints, principles, properties, states, and relationships supported by source evidence.",
    "",
    "## Expected Relationships",
    "- part of",
    "- uses",
    "- produces",
    "- governs",
    "- supports",
    "- precedes",
    "",
    "## Reuse Guidance",
    "- Prefer existing domain vocabulary and canonical subject labels when the source appears to describe the same idea.",
    "- Create candidates only when source evidence supports them.",
    "- Do not write canonical records during extraction."
  ].join("\n");
}

export function domainContextLines(activeDomain: DomainRecord | null, domainContextStats: DomainContextStats) {
  const summary = {
    ...domainContextStats,
    ...(activeDomain?.domain_context_last_run?.context_summary ?? {})
  };

  return [
    { label: "Domain", value: activeDomain?.label ?? "No domain selected" },
    { label: "Subjects", value: String(numberValue(summary.subject_count)) },
    { label: "Claims", value: String(numberValue(summary.claim_count)) },
    { label: "Relationships", value: String(numberValue(summary.relationship_count)) },
    { label: "Types", value: String(numberValue(summary.type_count)) },
    { label: "Storage", value: "Domain metadata" },
    { label: "Use", value: "Included with extraction tool context." }
  ];
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
