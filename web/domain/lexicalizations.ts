import { z } from "zod";
import type { lexicalizations } from "@/data/schema";

const lexicalizationMetadataInput = z.record(z.string(), z.unknown());

export const createLexicalizationInput = z.object({
  language: z.string().trim().min(1).max(16).default("en"),
  lexicalType: z.string().trim().min(1).max(80).default("alias"),
  metadata: lexicalizationMetadataInput.optional(),
  objectId: z.string().uuid(),
  statusId: z.string().uuid().optional(),
  value: z.string().trim().min(1).max(240),
});

export const updateLexicalizationInput = z.object({
  language: z.string().trim().min(1).max(16).optional(),
  lexicalType: z.string().trim().min(1).max(80).optional(),
  metadata: lexicalizationMetadataInput.optional(),
  statusId: z.string().uuid().optional(),
  value: z.string().trim().min(1).max(240).optional(),
});

export type CreateLexicalizationInput = z.infer<
  typeof createLexicalizationInput
>;
export type UpdateLexicalizationInput = z.infer<
  typeof updateLexicalizationInput
>;
export type Lexicalization = typeof lexicalizations.$inferSelect;

export type LexicalizationDetail = {
  createdAt: string;
  domainId: string | null;
  id: string;
  language: string;
  lexicalType: string;
  metadata: Record<string, unknown>;
  normalizedValue: string;
  objectId: string;
  status: {
    id: string;
    key: string;
    label: string;
  } | null;
  statusId: string | null;
  updatedAt: string;
  value: string;
};
