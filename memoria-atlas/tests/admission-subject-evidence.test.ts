import { describe, expect, it } from "vitest";

import { findCanonicalSubjectMatches } from "@/lib/admission/subject-evidence";

describe("findCanonicalSubjectMatches", () => {
  it("matches a more specific candidate label to a canonical label by normalized token containment", () => {
    expect(
      findCanonicalSubjectMatches("inner terrestrial planets", [
        {
          canonicalLabel: "terrestrial planet",
          claimCount: 1,
          description:
            "A rocky planet class represented in this bundle by Earth and other inner planets.",
          id: "subject-terrestrial-planet",
          relationshipCount: 1,
          typeLabel: "Concept",
        },
        {
          canonicalLabel: "Earth",
          claimCount: 12,
          description: "Terrestrial planet in the Solar System.",
          id: "subject-earth",
          relationshipCount: 2,
          typeLabel: "Object",
        },
      ])
    ).toEqual([
      {
        canonicalLabel: "terrestrial planet",
        claimCount: 1,
        id: "subject-terrestrial-planet",
        matchKinds: ["candidate_contains_label", "description_tokens"],
        relationshipCount: 1,
        typeLabel: "Concept",
      },
    ]);
  });
});
