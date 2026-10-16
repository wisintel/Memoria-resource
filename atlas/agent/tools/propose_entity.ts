import { defineTool } from "eve/tools";
import { z } from "zod";

const entityProposalSchema = z.object({
  confidence: z.enum(["low", "medium", "high"]),
  domainId: z.string().min(1),
  evidence: z
    .array(
      z.object({
        claimId: z.string().optional(),
        documentId: z.string().optional(),
        note: z.string().min(1),
        shardId: z.string().optional(),
      }),
    )
    .default([]),
  label: z.string().min(1),
  questions: z.array(z.string().min(1)).default([]),
  rationale: z.string().min(1),
  statusId: z.string().optional(),
  statusLabel: z.string().optional(),
  typeId: z.string().optional(),
  typeLabel: z.string().optional(),
});

export default defineTool({
  description:
    "Create a typed, non-mutating Atlas entity proposal for user review. Use this when drafting a candidate entity; it does not write to the database.",
  inputSchema: entityProposalSchema,
  outputSchema: entityProposalSchema.extend({
    proposalKind: z.literal("entity"),
  }),
  async execute(input) {
    return {
      ...input,
      label: input.label.trim(),
      proposalKind: "entity" as const,
      questions: input.questions.map((question) => question.trim()).filter(Boolean),
      rationale: input.rationale.trim(),
    };
  },
  toModelOutput(output) {
    return {
      type: "json",
      value: {
        confidence: output.confidence,
        label: output.label,
        proposalKind: output.proposalKind,
        questions: output.questions,
        rationale: output.rationale,
        statusLabel: output.statusLabel,
        typeLabel: output.typeLabel,
      },
    };
  },
});
