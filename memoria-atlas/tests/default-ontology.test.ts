import { expect, it } from "vitest";

import { defaultOntologyTypeSeeds } from "@/lib/ontology/default-ontology";

it("seeds the curated global relationship predicates", () => {
  expect(
    defaultOntologyTypeSeeds
      .filter((type) => type.classKey === "relationship")
      .map((type) => type.slug)
  ).toEqual([
    "instance-of",
    "subtype-of",
    "part-of",
    "located-in",
    "depends-on",
    "causes",
    "uses",
    "implements",
    "interacts-with",
  ]);
});
