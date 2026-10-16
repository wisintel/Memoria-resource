import { z } from "zod";
import type { subjects } from "@/data/schema";

export const createSubjectInput = z.object({
  canonicalLabel: z.string().trim().min(1).max(240),
  description: z.string().trim().optional(),
  statusId: z.string().uuid().optional(),
  subjectTypeId: z.string().uuid(),
});

export const updateSubjectInput = z.object({
  canonicalLabel: z.string().trim().min(1).max(240).optional(),
  description: z.string().trim().optional(),
  statusId: z.string().uuid().optional(),
  subjectTypeId: z.string().uuid().optional(),
});

export type CreateSubjectInput = z.infer<typeof createSubjectInput>;
export type UpdateSubjectInput = z.infer<typeof updateSubjectInput>;
export type Subject = typeof subjects.$inferSelect;

export type SubjectTypeOption = {
  id: string;
  label: string;
};

export type SubjectStatusOption = {
  id: string;
  isDefault: boolean;
  key: string;
  label: string;
};

export type SubjectFormOptions = {
  statuses: SubjectStatusOption[];
  types: SubjectTypeOption[];
};

export type SubjectAliasRelatedItem = {
  id: string;
  language: string;
  lexicalType: string;
  value: string;
};

export type SubjectClaimRelatedItem = {
  assertionState: string;
  claimText: string;
  claimTypeLabel: string | null;
  id: string;
  reviewId: string;
  reviewNumber: number;
  targetRole: string;
};

export type SubjectRelationshipRelatedItem = {
  assertionState: string;
  direction: "incoming" | "outgoing";
  id: string;
  label: string;
  otherSubjectId: string | null;
  otherSubjectLabel: string | null;
  relationshipTypeLabel: string | null;
};

export type SubjectRelated = {
  aliases: SubjectAliasRelatedItem[];
  claims: SubjectClaimRelatedItem[];
  relationships: SubjectRelationshipRelatedItem[];
};

export type SubjectDetail = {
  id: string;
  canonicalLabel: string;
  description: string;
  related: SubjectRelated;
  source: string | null;
  status: {
    id: string;
    key: string;
    label: string;
  } | null;
  statusId: string | null;
  subjectType: {
    id: string;
    label: string;
  } | null;
  subjectTypeId: string | null;
};
