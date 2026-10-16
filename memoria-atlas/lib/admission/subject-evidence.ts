export type CanonicalSubjectEvidenceInput = {
  aliases?: string[];
  canonicalLabel: string;
  claimCount: number;
  description: string;
  id: string;
  relationshipCount: number;
  typeLabel: string | null;
};

export type CanonicalSubjectMatchKind =
  | "alias"
  | "candidate_contains_label"
  | "description_tokens"
  | "exact_label"
  | "normalized_label";

export type CanonicalSubjectMatch = {
  canonicalLabel: string;
  claimCount: number;
  id: string;
  matchKinds: CanonicalSubjectMatchKind[];
  relationshipCount: number;
  typeLabel: string | null;
};

export function normalizeAdmissionSubjectLabel(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizedTokens(value: string) {
  return normalizeAdmissionSubjectLabel(value)
    .split("-")
    .filter(Boolean)
    .map((token) => {
      if (token.endsWith("ies") && token.length > 3) {
        return `${token.slice(0, -3)}y`;
      }

      if (token.endsWith("s") && !token.endsWith("ss") && token.length > 3) {
        return token.slice(0, -1);
      }

      return token;
    });
}

function containsEveryToken(container: Set<string>, values: string[]) {
  return values.length > 0 && values.every((value) => container.has(value));
}

export function findCanonicalSubjectMatches(
  candidateLabel: string,
  subjects: CanonicalSubjectEvidenceInput[]
): CanonicalSubjectMatch[] {
  const compactCandidate = candidateLabel.replace(/\s+/g, " ").trim();
  const normalizedCandidate = normalizeAdmissionSubjectLabel(compactCandidate);
  const candidateTokens = normalizedTokens(compactCandidate);
  const candidateTokenSet = new Set(candidateTokens);

  return subjects
    .flatMap((subject) => {
      const normalizedCanonical = normalizeAdmissionSubjectLabel(
        subject.canonicalLabel
      );
      const exactLabel =
        subject.canonicalLabel.toLowerCase() === compactCandidate.toLowerCase();
      const normalizedLabel = normalizedCanonical === normalizedCandidate;
      const aliasMatch = (subject.aliases ?? []).some(
        (alias) => normalizeAdmissionSubjectLabel(alias) === normalizedCandidate
      );
      const canonicalTokens = normalizedTokens(subject.canonicalLabel);
      const candidateContainsLabel = containsEveryToken(
        candidateTokenSet,
        canonicalTokens
      );
      const descriptionTokens = containsEveryToken(
        new Set(
          normalizedTokens(`${subject.canonicalLabel} ${subject.description}`)
        ),
        candidateTokens
      );

      const matchKinds: CanonicalSubjectMatchKind[] = exactLabel
        ? [
            "exact_label",
            ...(normalizedLabel ? ["normalized_label" as const] : []),
          ]
        : aliasMatch
          ? ["alias"]
          : [
              ...(candidateContainsLabel
                ? (["candidate_contains_label"] as const)
                : []),
              ...(descriptionTokens ? (["description_tokens"] as const) : []),
            ];

      if (matchKinds.length === 0) {
        return [];
      }

      return [
        {
          canonicalLabel: subject.canonicalLabel,
          claimCount: subject.claimCount,
          id: subject.id,
          matchKinds,
          relationshipCount: subject.relationshipCount,
          typeLabel: subject.typeLabel,
        },
      ];
    })
    .sort((left, right) => {
      const priority = (match: CanonicalSubjectMatch) =>
        match.matchKinds.includes("exact_label")
          ? 0
          : match.matchKinds.includes("alias")
            ? 1
            : match.matchKinds.includes("candidate_contains_label")
              ? 2
              : 3;

      return (
        priority(left) - priority(right) ||
        left.canonicalLabel.localeCompare(right.canonicalLabel) ||
        left.id.localeCompare(right.id)
      );
    });
}
