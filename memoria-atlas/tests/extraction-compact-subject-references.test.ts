import { expect, it } from "vitest";

import { extractionSubjectClaimTextsOutputSchema } from "@/domain/pipeline";
import {
  explicitPassContract,
  resolveSubjectRows,
} from "@/lib/extraction/contracts";

it("accepts compact subject row references for extracted claims", () => {
  expect(
    extractionSubjectClaimTextsOutputSchema.parse({
      claims: [
        {
          subjectRows: [1, 4],
          text: "Earth is the third planet from the Sun.",
        },
      ],
    })
  ).toEqual({
    claims: [
      {
        subjectRows: [1, 4],
        text: "Earth is the third planet from the Sun.",
      },
    ],
  });
});

it("resolves compact subject rows to stable subject names", () => {
  expect(
    resolveSubjectRows(["Solar System", "Earth", "Sun"], [2, 1, 2, 99])
  ).toEqual(["Earth", "Solar System"]);
});

it("numbers the subject registry in claim extraction prompts", () => {
  const prompt = explicitPassContract.buildPrompt({
    document: {
      contentSha256: "sha256",
      documentForm: "reference",
      id: "document-id",
      label: "Solar System",
      structuralNotes: null,
    },
    extractionContext: {},
    sourceUnit: {
      body: "Earth is the third planet from the Sun.",
      contentSha256: "unit-sha256",
      headingPath: [],
      id: "source-unit-id",
      position: 1,
    },
    subjects: ["Solar System", "Earth"],
  });

  expect(prompt).toContain("Identified subjects:\n1. Solar System\n2. Earth");
});
