export const queryKeys = {
  codexModels: () => ["codexModels"] as const,
  documents: () => ["documents"] as const,
  graph: (p: { viewId?: string | null; domainId?: string | null }) =>
    ["graph", p.viewId ?? null, p.domainId ?? null] as const
} as const;
