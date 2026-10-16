import { z } from "zod";
import type { domains } from "@/data/schema";

export const domainSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const createDomainInput = z.object({
  label: z.string().trim().min(1).max(200),
  slug: z.string().trim().regex(domainSlugPattern).optional(),
  description: z.string().trim().optional(),
});

export const updateDomainInput = z.object({
  label: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().optional(),
  status: z.enum(["active", "archived"]).optional(),
});

export type CreateDomainInput = z.infer<typeof createDomainInput>;
export type UpdateDomainInput = z.infer<typeof updateDomainInput>;
export type Domain = typeof domains.$inferSelect;

export type DomainInventoryKey =
  "domain_map" | "subject" | "claim" | "relationship" | "document" | "type";

export type DomainInventoryItem = {
  key: DomainInventoryKey;
  label: string;
  count: number;
};

export type DomainOverview = {
  domain: Domain;
  status: {
    id: string;
    key: string;
    label: string;
  } | null;
  inventory: DomainInventoryItem[];
  total: number;
};
