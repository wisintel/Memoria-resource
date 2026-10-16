import { z } from "zod";

import type { domainMaps } from "@/data/schema/domain-maps";

export type DomainMap = typeof domainMaps.$inferSelect;

export type GraphPosition = {
  x: number;
  y: number;
};

export type MapVisibility =
  "visible" | "hidden" | "collapsed" | "metadata_only";

export type DomainMapSummary = {
  defaultRelationshipTypeId: string | null;
  id: string;
  slug: string;
  label: string;
  description: string | null;
  isDefaultWorkspace: boolean;
  isWip: boolean;
  statusKey: string | null;
  statusLabel: string | null;
  mapKindLabel: string | null;
  updatedAt: Date;
};

export type DomainMapNodeView = {
  id: string;
  layoutMetadata: {
    isCollapsed?: boolean;
  };
  objectId: string;
  objectClassKey: string;
  label: string;
  typeLabel: string | null;
  nodeRole: string;
  visibility: MapVisibility;
  position: GraphPosition;
};

export type DomainMapRelationshipView = {
  id: string;
  relationshipId: string;
  sourceObjectId: string;
  targetObjectId: string;
  label: string;
  typeId: string | null;
  typeLabel: string | null;
  visibility: MapVisibility;
};

export type RelationshipTypeOption = {
  id: string;
  label: string;
};

export type DomainMapSnapshot = {
  maps: DomainMapSummary[];
  activeMap: DomainMapSummary | null;
  nodes: DomainMapNodeView[];
  relationships: DomainMapRelationshipView[];
  relationshipTypes: RelationshipTypeOption[];
};

const trimmedString = z.string().trim();

export const graphPositionInput = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const mapVisibilityInput = z.enum([
  "visible",
  "hidden",
  "collapsed",
  "metadata_only",
]);

export const createDomainMapInput = z.object({
  label: trimmedString.min(2),
  slug: trimmedString.min(2).optional(),
  description: trimmedString.optional(),
  mapKindTypeId: z.string().uuid().optional(),
});

export const updateDomainMapInput = z.object({
  defaultRelationshipTypeId: z.string().uuid().nullable().optional(),
  label: trimmedString.min(2).optional(),
  description: trimmedString.optional(),
  statusId: z.string().uuid().optional(),
  mapKindTypeId: z.string().uuid().nullable().optional(),
});

export const addDomainMapObjectInput = z.object({
  objectId: z.string().uuid(),
  nodeRole: trimmedString.min(1).default("member"),
  visibility: mapVisibilityInput.default("visible"),
  position: graphPositionInput.default({ x: 0, y: 0 }),
});

export const addDomainMapRelationshipInput = z.object({
  relationshipId: z.string().uuid(),
  position: graphPositionInput.optional(),
  visibility: mapVisibilityInput.default("visible"),
});

export const connectDomainMapObjectsInput = z.object({
  relationshipTypeId: z.string().uuid(),
  sourceSubjectId: z.string().uuid(),
  targetSubjectId: z.string().uuid(),
});

export const updateDomainMapLayoutInput = z.object({
  nodes: z
    .array(
      z.object({
        isCollapsed: z.boolean().optional(),
        nodeId: z.string().uuid(),
        position: graphPositionInput,
      })
    )
    .min(1),
});

export type CreateDomainMapInput = z.infer<typeof createDomainMapInput>;
export type UpdateDomainMapInput = z.infer<typeof updateDomainMapInput>;
export type AddDomainMapObjectInput = z.infer<typeof addDomainMapObjectInput>;
export type AddDomainMapRelationshipInput = z.infer<
  typeof addDomainMapRelationshipInput
>;
export type ConnectDomainMapObjectsInput = z.infer<
  typeof connectDomainMapObjectsInput
>;
export type UpdateDomainMapLayoutInput = z.infer<
  typeof updateDomainMapLayoutInput
>;
