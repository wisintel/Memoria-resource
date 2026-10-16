import { z } from "zod";

export const claimModalityValues = [
  "empirical",
  "normative",
  "projection",
  "reported",
  "rhetorical",
] as const;

export const claimModalityInput = z.enum(claimModalityValues);

export const claimAtomicReviewInput = z.object({
  rationale: z.string().trim().max(300).optional(),
  state: z.literal("atomic"),
});

export const createClaimInput = z.object({
  claimText: z.string().trim().min(1),
  claimTypeId: z.string().uuid(),
  modality: claimModalityInput.optional(),
  sourceClaimId: z.string().uuid().optional(),
  targetSubjectId: z.string().uuid(),
  targetSubjectIds: z.array(z.string().uuid()).min(1).optional(),
});

export const updateClaimInput = z.object({
  atomicReview: claimAtomicReviewInput.optional(),
  claimText: z.string().trim().min(1).optional(),
  claimTypeId: z.string().uuid().optional(),
  modality: claimModalityInput.nullable().optional(),
  targetSubjectId: z.string().uuid().optional(),
  targetSubjectIds: z.array(z.string().uuid()).min(1).optional(),
});

export type ClaimAtomicReviewInput = z.infer<typeof claimAtomicReviewInput>;
export type ClaimModality = z.infer<typeof claimModalityInput>;
export type CreateClaimInput = z.infer<typeof createClaimInput>;
export type UpdateClaimInput = z.infer<typeof updateClaimInput>;

export type ClaimTargetDetail = {
  id: string;
  label: string;
  position: number;
  targetObjectId: string;
  targetRole: string;
};

export type ClaimDetail = {
  assertionState: string;
  claimText: string;
  claimType: {
    id: string;
    label: string;
  } | null;
  claimTypeId: string | null;
  confidence: string | null;
  displayTitle: string;
  id: string;
  modality: ClaimModality | null;
  primaryTarget: ClaimTargetDetail | null;
  reviewId: string;
  reviewNumber: number;
  source: string | null;
  targets: ClaimTargetDetail[];
};

export type ClaimTypeOption = {
  id: string;
  label: string;
  slug: string;
};

export type ClaimTargetOption = {
  id: string;
  label: string;
};

export type ClaimFormOptions = {
  targets: ClaimTargetOption[];
  types: ClaimTypeOption[];
};
