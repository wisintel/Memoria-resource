import { z } from "zod";

export const createRelationshipInput = z.object({
  relationshipTypeId: z.string().uuid(),
  sourceSubjectId: z.string().uuid(),
  targetSubjectId: z.string().uuid(),
});

export const updateRelationshipInput = z.object({
  relationshipTypeId: z.string().uuid().optional(),
  sourceSubjectId: z.string().uuid().optional(),
  targetSubjectId: z.string().uuid().optional(),
});

export type CreateRelationshipInput = z.infer<typeof createRelationshipInput>;
export type UpdateRelationshipInput = z.infer<typeof updateRelationshipInput>;

export type RelationshipEndpointDetail = {
  id: string;
  label: string;
};

export type RelationshipDetail = {
  assertionState: string;
  displayTitle: string;
  id: string;
  relationshipType: {
    id: string;
    label: string;
  } | null;
  relationshipTypeId: string | null;
  source: RelationshipEndpointDetail;
  target: RelationshipEndpointDetail;
};

export type RelationshipTypeOption = {
  id: string;
  label: string;
};

export type RelationshipSubjectOption = {
  id: string;
  label: string;
};

export type RelationshipFormOptions = {
  subjects: RelationshipSubjectOption[];
  types: RelationshipTypeOption[];
};
