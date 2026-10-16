export type DefaultOntologyTypeSeed = {
  classKey: "claim" | "relationship" | "subject";
  description: string;
  label: string;
  metadata: Record<string, unknown>;
  slug: string;
};

const ontologyMetadata = {
  source: "memoria-meta-ontology",
  state: "active",
  stratum: "grammar",
  systemSeed: true,
  versionDate: "2026-07-06",
};

const subjectKinds = [
  {
    definition: "Persists; has agency - can do things.",
    example: "Galileo, NASA",
    label: "Actor",
    slug: "actor",
  },
  {
    definition: "Persists; no agency - has things done to or around it.",
    example: "Jupiter, a telescope",
    label: "Object",
    slug: "object",
  },
  {
    definition: "Exists only as an idea; instantiated, not located.",
    example: "gravity, orbital mechanics",
    label: "Concept",
    slug: "concept",
  },
  {
    definition: "Happens; has temporal extent.",
    example: "the 1610 observations, a transit",
    label: "Event",
    slug: "event",
  },
];

const claimKinds = [
  {
    asserts: "class membership / hierarchy",
    example: "Jupiter is a planet",
    label: "Taxonomic",
    slug: "taxonomic",
  },
  {
    asserts: "part-whole composition",
    example: "Ganymede is a moon of Jupiter",
    label: "Structural",
    slug: "structural",
  },
  {
    asserts: "one thing brings about another",
    example: "Solar wind causes aurorae",
    label: "Causal",
    slug: "causal",
  },
  {
    asserts: "use, role, implementation",
    example: "Galileo used a refracting telescope",
    label: "Functional",
    slug: "functional",
  },
  {
    asserts: "location, position, distance",
    example: "Jupiter lies beyond the asteroid belt",
    label: "Spatial",
    slug: "spatial",
  },
  {
    asserts: "when; duration; ordering",
    example: "The orbit takes 11.86 years",
    label: "Temporal",
    slug: "temporal",
  },
  {
    asserts: "property / measurement of a thing",
    example: "Jupiter's mass is 1.9 x 10^27 kg",
    label: "Attributive",
    slug: "attributive",
  },
  {
    asserts: "relative difference between things",
    example: "Earth has a greater mass than Mars",
    label: "Comparative",
    slug: "comparative",
  },
];

export const defaultOntologyTypeSeeds: DefaultOntologyTypeSeed[] = [
  ...subjectKinds.map((kind) => ({
    classKey: "subject" as const,
    description: kind.definition,
    label: kind.label,
    metadata: {
      ...ontologyMetadata,
      dimension: "subject_kind",
      example: kind.example,
    },
    slug: kind.slug,
  })),
  ...claimKinds.flatMap((kind) => [
    {
      classKey: "claim" as const,
      description: kind.asserts,
      label: kind.label,
      metadata: {
        ...ontologyMetadata,
        dimension: "claim_kind",
        example: kind.example,
      },
      slug: kind.slug,
    },
    {
      classKey: "relationship" as const,
      description: kind.asserts,
      label: kind.label,
      metadata: {
        ...ontologyMetadata,
        dimension: "relationship_kind",
        example: kind.example,
      },
      slug: kind.slug,
    },
  ]),
];
