export type WorkshopPackageClaim = {
  assertion: string;
  claimId: string;
  id: string;
  kind: string;
  modality: string;
  text: string;
};

export type WorkshopSubjectPackage = {
  admittedClaimCount: number;
  claimCount: number;
  claims: WorkshopPackageClaim[];
  decision: {
    outcome: string;
    resultingClaimIds: string[];
    resultingSubjectId: string | null;
    targetSubjectId: string | null;
  } | null;
  normalizedSubject: string;
  state: "ready" | "admitted" | "deferred" | "rejected";
  subject: string;
};

export type WorkshopBundleReview = {
  bundle: {
    id: string;
    label: string;
    status: string;
  };
  counts: {
    admitted: number;
    ready: number;
    total: number;
  };
  document: {
    id: string;
    label: string;
  };
  packages: WorkshopSubjectPackage[];
  run: {
    id: string;
    labHref: string;
    status: string;
  };
};
