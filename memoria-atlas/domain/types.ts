import { z } from "zod";

export const editableTypeClassValues = [
  "subject",
  "claim",
  "relationship",
] as const;

export const typeSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const typeMetadataInput = z.object({
  captureGuidance: z.string().trim().max(300).optional(),
});

export const createTypeInput = z.object({
  captureGuidance: z.string().trim().max(300).optional(),
  classKey: z.enum(editableTypeClassValues),
  description: z.string().trim().max(600).optional(),
  label: z.string().trim().min(1).max(160),
  slug: z.string().trim().regex(typeSlugPattern).max(120).optional(),
});

export const updateTypeInput = z.object({
  captureGuidance: z.string().trim().max(300).optional(),
  description: z.string().trim().max(600).optional(),
  label: z.string().trim().min(1).max(160).optional(),
  slug: z.string().trim().min(1).regex(typeSlugPattern).max(120).optional(),
});

export type EditableTypeClassKey = (typeof editableTypeClassValues)[number];
export type TypeMetadataInput = z.infer<typeof typeMetadataInput>;
export type CreateTypeInput = z.infer<typeof createTypeInput>;
export type UpdateTypeInput = z.infer<typeof updateTypeInput>;

export type TypeClassOption = {
  id: EditableTypeClassKey;
  label: string;
};

export type TypeFormOptions = {
  classes: TypeClassOption[];
};

export type TypeDetail = {
  captureGuidance: string;
  classKey: EditableTypeClassKey;
  classLabel: string;
  description: string;
  id: string;
  label: string;
  slug: string;
};

export function parseTypeMetadata(metadata: unknown): TypeMetadataInput {
  const parsed = typeMetadataInput.safeParse(metadata);

  if (!parsed.success) {
    return {};
  }

  return {
    captureGuidance: parsed.data.captureGuidance?.trim() || undefined,
  };
}
