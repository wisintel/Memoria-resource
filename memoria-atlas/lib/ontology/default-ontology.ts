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
  versionDate: "2026-07-09",
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
    definition: "A place, region, or spatial container where things are located or events happen.",
    example: "Asteroid Belt, Kuiper Belt",
    label: "Location",
    slug: "location",
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

const relationshipPredicates = [
  {
    definition: "Connects an individual subject to the class it instantiates.",
    example: "Earth instance of terrestrial planet",
    label: "Instance of",
    slug: "instance-of",
  },
  {
    definition: "Connects a narrower class to a broader class.",
    example: "terrestrial planet subtype of planet",
    label: "Subtype of",
    slug: "subtype-of",
  },
  {
    definition: "Connects a component or constituent to the whole it belongs to.",
    example: "Sun part of Solar System",
    label: "Part of",
    slug: "part-of",
  },
  {
    definition: "Connects a subject to the place or spatial container containing it.",
    example: "Olympus Mons located in Mars",
    label: "Located in",
    slug: "located-in",
  },
  {
    definition: "Indicates that one subject requires or relies on another.",
    example: "photosynthesis depends on sunlight",
    label: "Depends on",
    slug: "depends-on",
  },
  {
    definition: "Indicates that one subject brings about another.",
    example: "solar wind causes aurorae",
    label: "Causes",
    slug: "causes",
  },
  {
    definition: "Indicates that one subject employs another.",
    example: "mission uses spacecraft",
    label: "Uses",
    slug: "uses",
  },
  {
    definition: "Indicates that one subject realizes or carries out another.",
    example: "service implements protocol",
    label: "Implements",
    slug: "implements",
  },
  {
    definition: "Indicates that two subjects act on or affect one another.",
    example: "solar wind interacts with magnetosphere",
    label: "Interacts with",
    slug: "interacts-with",
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
  ...claimKinds.map((kind) => ({
    classKey: "claim" as const,
    description: kind.asserts,
    label: kind.label,
    metadata: {
      ...ontologyMetadata,
      dimension: "claim_kind",
      example: kind.example,
    },
    slug: kind.slug,
  })),
  ...relationshipPredicates.map((predicate) => ({
    classKey: "relationship" as const,
    description: predicate.definition,
    label: predicate.label,
    metadata: {
      ...ontologyMetadata,
      dimension: "relationship_predicate",
      example: predicate.example,
    },
    slug: predicate.slug,
  })),
];
