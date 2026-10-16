import { describe, expect, it } from "vitest";

import {
  applyAdmissionPlanInput,
  resolveAdmissionDecisionMetadata,
} from "@/services/workshop";

describe("applyAdmissionPlanInput", () => {
  it("preserves reified claim decisions that reference relationship keys", () => {
    const plan = applyAdmissionPlanInput.parse({
      domainSlug: "solar-system",
      reifiedClaims: [
        {
          claimRowId: "00000000-0000-4000-8000-000000000001",
          note: "Represented by the taxonomic relationship.",
          resultRelationshipKeys: ["earth-terrestrial"],
        },
      ],
    });

    expect(plan).toMatchObject({
      reifiedClaims: [
        {
          claimRowId: "00000000-0000-4000-8000-000000000001",
          resultRelationshipKeys: ["earth-terrestrial"],
        },
      ],
    });
  });

  it("resolves relationship keys into reified decision metadata", () => {
    expect(
      resolveAdmissionDecisionMetadata(
        {
          claimRowId: "00000000-0000-4000-8000-000000000001",
          resultRelationshipIds: ["00000000-0000-4000-8000-000000000010"],
          resultRelationshipKeys: ["earth-terrestrial", "earth-terrestrial"],
        },
        {
          relationshipIdsByKey: new Map([
            ["earth-terrestrial", "00000000-0000-4000-8000-000000000011"],
          ]),
          subjectIdsByKey: new Map(),
        }
      )
    ).toEqual({
      note: undefined,
      resultClaimIds: [],
      resultRecordIds: [],
      resultRelationshipIds: [
        "00000000-0000-4000-8000-000000000010",
        "00000000-0000-4000-8000-000000000011",
      ],
      unresolvedKeys: [],
    });
  });

  it("preserves inline atomic claims on a split decision", () => {
    const plan = applyAdmissionPlanInput.parse({
      domainSlug: "solar-system",
      splitClaims: [
        {
          claimRowId: "00000000-0000-4000-8000-000000000001",
          claims: [
            {
              claimText: "Terrestrial planets formed in warmer regions.",
              claimTypeSlug: "spatial",
              modality: "empirical",
              targetSubjectKeys: ["terrestrial-planet"],
            },
          ],
        },
      ],
    });

    expect(plan).toMatchObject({
      splitClaims: [
        {
          claims: [
            {
              claimText: "Terrestrial planets formed in warmer regions.",
              targetSubjectKeys: ["terrestrial-planet"],
            },
          ],
        },
      ],
    });
  });

  it("merges inline child claim IDs into split decision metadata", () => {
    expect(
      resolveAdmissionDecisionMetadata(
        {
          claimRowId: "00000000-0000-4000-8000-000000000001",
          resultClaimIds: ["00000000-0000-4000-8000-000000000020"],
          resultRelationshipKeys: ["earth-terrestrial"],
        },
        {
          relationshipIdsByKey: new Map([
            ["earth-terrestrial", "00000000-0000-4000-8000-000000000011"],
          ]),
          subjectIdsByKey: new Map(),
        },
        {
          resultClaimIds: [
            "00000000-0000-4000-8000-000000000020",
            "00000000-0000-4000-8000-000000000021",
          ],
        }
      )
    ).toEqual({
      note: undefined,
      resultClaimIds: [
        "00000000-0000-4000-8000-000000000020",
        "00000000-0000-4000-8000-000000000021",
      ],
      resultRecordIds: [],
      resultRelationshipIds: ["00000000-0000-4000-8000-000000000011"],
      unresolvedKeys: [],
    });
  });

  it("resolves subject keys into split result record IDs", () => {
    expect(
      resolveAdmissionDecisionMetadata(
        {
          claimRowId: "00000000-0000-4000-8000-000000000001",
          resultSubjectKeys: ["great-red-spot", "great-red-spot"],
        },
        {
          relationshipIdsByKey: new Map(),
          subjectIdsByKey: new Map([
            ["great-red-spot", "00000000-0000-4000-8000-000000000030"],
          ]),
        }
      )
    ).toEqual({
      note: undefined,
      resultClaimIds: [],
      resultRecordIds: ["00000000-0000-4000-8000-000000000030"],
      resultRelationshipIds: [],
      unresolvedKeys: [],
    });
  });
});
