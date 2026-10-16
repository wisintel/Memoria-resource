"use client";

import { Clock3, CopyCheck, Link2, Plus, Scissors, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  markWorkshopClaimDeferredAction,
  markWorkshopClaimDuplicateAction,
  markWorkshopClaimRejectedAction,
  markWorkshopClaimSplitAction,
} from "@/app/(shell)/workshop/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  WorkshopPackageClaim,
  WorkshopSubjectPackage,
} from "@/domain/workshop";
import type { ClaimFormOptions, ClaimTargetOption } from "@/domain/claims";

type WorkshopClaimWorkspaceProps = {
  packages: WorkshopSubjectPackage[];
  selectedClaimId: string | null;
  selectedPackage: WorkshopSubjectPackage | null;
};

export function WorkshopClaimWorkspace({
  packages,
  selectedClaimId,
  selectedPackage,
}: WorkshopClaimWorkspaceProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const domainSlug = searchParams.get("domain")?.trim() ?? "";
  const selectedAdmitTargetId = searchParams.get("admitTarget") ?? "";
  const [message, setMessage] = useState<string | null>(null);
  const [targetOptions, setTargetOptions] = useState<ClaimTargetOption[]>([]);
  const [targetLoadError, setTargetLoadError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selectedClaim = useMemo(
    () => findSelectedClaim(packages, selectedClaimId),
    [packages, selectedClaimId]
  );
  const visibleTargetOptions = domainSlug ? targetOptions : [];
  const visibleTargetLoadError = domainSlug ? targetLoadError : null;

  useEffect(() => {
    if (!domainSlug) {
      return;
    }

    const controller = new AbortController();

    fetch(`/api/claims?domain=${encodeURIComponent(domainSlug)}&include=options`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          error?: string;
          options?: ClaimFormOptions;
        };

        if (!response.ok || !payload.options) {
          throw new Error(payload.error ?? "Claim targets could not be loaded.");
        }

        return payload.options.targets;
      })
      .then((targets) => {
        setTargetLoadError(null);
        setTargetOptions(targets);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setTargetOptions([]);
        setTargetLoadError(
          caught instanceof Error
            ? caught.message
            : "Claim targets could not be loaded."
        );
      });

    return () => controller.abort();
  }, [domainSlug]);

  function claimHref(claimId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("claim", claimId);

    return `${pathname}?${params.toString()}`;
  }

  function handlePackageChange(normalizedSubject: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("pkg", normalizedSubject);
    params.delete("claim");

    router.replace(`${pathname}?${params.toString()}`);
  }

  function handleAdmitTargetChange(targetSubjectId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("admitTarget", targetSubjectId);

    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function handleDeferred() {
    handleClaimDecision("deferred");
  }

  function handleDuplicate() {
    handleClaimDecision("duplicate");
  }

  function handleRejected() {
    handleClaimDecision("rejected");
  }

  function handleSplit() {
    handleClaimDecision("split");
  }

  function selectedResultMetadata() {
    const selectedClass = searchParams.get("class");
    const selectedRecordId = searchParams.get("sel");

    if (!selectedRecordId) {
      return {};
    }

    if (selectedClass === "claim") {
      return {
        resultClaimIds: [selectedRecordId],
        resultRecordIds: [selectedRecordId],
      };
    }

    if (selectedClass === "relationship") {
      return {
        resultRecordIds: [selectedRecordId],
        resultRelationshipIds: [selectedRecordId],
      };
    }

    if (selectedClass === "subject") {
      return {
        resultRecordIds: [selectedRecordId],
      };
    }

    return {};
  }

  function handleClaimDecision(
    outcome: "deferred" | "duplicate" | "rejected" | "split"
  ) {
    if (!selectedClaim || isPending) {
      return;
    }

    setMessage(null);
    startTransition(async () => {
      const result = await (outcome === "deferred"
        ? markWorkshopClaimDeferredAction(selectedClaim.claim.id)
        : outcome === "duplicate"
          ? markWorkshopClaimDuplicateAction(
              selectedClaim.claim.id,
              selectedResultMetadata()
            )
          : outcome === "split"
            ? markWorkshopClaimSplitAction(
                selectedClaim.claim.id,
                selectedResultMetadata()
              )
            : markWorkshopClaimRejectedAction(selectedClaim.claim.id));

      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }

      const params = new URLSearchParams(searchParams.toString());
      params.delete("claim");
      router.replace(`${pathname}?${params.toString()}`);
      router.refresh();
    });
  }

  function openCreateDialog(
    classKey: "claim" | "subject",
    options: {
      includeSelectedSubjectTarget?: boolean;
      markProcessedOnCreate?: boolean;
    } = {}
  ) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("class", classKey);
    params.set("dialog", "record-crud");
    params.set("mode", "create");

    if (classKey === "claim") {
      if (selectedClaim) {
        params.set("claimText", selectedClaim.claim.text);
        params.set("claimModality", selectedClaim.claim.modality);
        params.set("claimType", selectedClaim.claim.kind);
        if (options.markProcessedOnCreate) {
          params.set("processClaimId", selectedClaim.claim.id);
        } else {
          params.delete("processClaimId");
        }
      }

      const admitTargetId = searchParams.get("admitTarget");
      const selectedSubjectId =
        admitTargetId ||
        (searchParams.get("class") !== "claim" ? searchParams.get("sel") : null);

      if (
        options.includeSelectedSubjectTarget !== false &&
        selectedSubjectId
      ) {
        params.set("targetSubjectId", selectedSubjectId);
      } else {
        params.delete("targetSubjectId");
      }
    } else {
      params.delete("claimText");
      params.delete("claimModality");
      params.delete("claimType");
      params.delete("processClaimId");
      params.delete("targetSubjectId");
    }

    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-card/50">
      <header className="border-b border-border px-3 py-2">
        <div className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
          Claim Workspace
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden p-3">
        {selectedPackage ? (
          <div className="grid h-full min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(24rem,30rem)]">
            <div className="min-h-0 overflow-auto rounded-[var(--radius)] border border-dashed border-border/80 bg-background/30 p-3">
              <div className="grid content-start gap-3">
                {selectedPackage?.claims.map((claim) => (
                  <Link href={claimHref(claim.id)} key={claim.id}>
                    <Card
                      className={`rounded-[var(--radius)] transition-colors hover:border-primary/35 ${
                        selectedClaimId === claim.id
                          ? "border-primary/60 bg-primary/10"
                          : ""
                      }`}
                      size="sm"
                    >
                      <CardHeader className="gap-2">
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant="outline">{claim.claimId}</Badge>
                          <Badge variant="secondary">{claim.kind}</Badge>
                          <Badge variant="outline">{claim.modality}</Badge>
                        </div>
                        <p className="text-sm leading-6 text-foreground">
                          {claim.text}
                        </p>
                      </CardHeader>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>

            <div className="grid content-start gap-3">
              <Card className="rounded-[var(--radius)]" size="sm">
                <CardHeader>
                  <CardTitle className="font-heading text-sm">
                    Claim Group
                  </CardTitle>
                  <CardDescription>
                    Select a subject bundle to review.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3">
                    <Select
                      value={selectedPackage.normalizedSubject}
                      onValueChange={handlePackageChange}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {packages.map((pkg) => (
                          <SelectItem
                            key={pkg.normalizedSubject}
                            value={pkg.normalizedSubject}
                          >
                            {pkg.subject} - {pkg.claimCount} claims
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="grid gap-1.5">
                      <p className="font-mono text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                        Admit target
                      </p>
                      <Select
                        disabled={visibleTargetOptions.length === 0}
                        value={selectedAdmitTargetId}
                        onValueChange={handleAdmitTargetChange}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select canon subject" />
                        </SelectTrigger>
                        <SelectContent>
                          {visibleTargetOptions.map((target) => (
                            <SelectItem key={target.id} value={target.id}>
                              {target.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {visibleTargetLoadError ? (
                        <p className="text-xs text-destructive">
                          {visibleTargetLoadError}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-[var(--radius)]" size="sm">
                <CardHeader>
                  <CardTitle className="font-heading text-sm">Decision</CardTitle>
                  <CardDescription>
                    Mark what happened to this extracted claim.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2">
                  <Button
                    disabled={!selectedClaim}
                    onClick={() =>
                      openCreateDialog("claim", {
                        markProcessedOnCreate: true,
                      })
                    }
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Admit
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      className="min-w-0"
                      onClick={() => openCreateDialog("subject")}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Plus />
                      Subject
                    </Button>
                    <Button
                      className="min-w-0"
                      disabled={!selectedClaim}
                      onClick={() => openCreateDialog("claim")}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Link2 />
                      Claim
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      disabled={!selectedClaim || isPending}
                      onClick={handleDuplicate}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <CopyCheck />
                      Duplicate
                    </Button>
                    <Button
                      disabled={!selectedClaim || isPending}
                      onClick={handleSplit}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Scissors />
                      Split
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      disabled={!selectedClaim || isPending}
                      onClick={handleDeferred}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Clock3 />
                      Defer
                    </Button>
                    <Button
                      disabled={!selectedClaim || isPending}
                      onClick={handleRejected}
                      size="sm"
                      type="button"
                      variant="destructive"
                    >
                      <X />
                      Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
              {message ? (
                <p className="text-sm text-destructive" role="alert">
                  {message}
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <Card className="rounded-[var(--radius)]" size="sm">
            <CardHeader>
              <CardTitle className="font-heading text-base">
                No claim groups ready
              </CardTitle>
              <CardDescription>
                Extraction claim groups will appear here when they need review.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </section>
  );
}

function findSelectedClaim(
  packages: WorkshopSubjectPackage[],
  selectedClaimId: string | null
):
  | {
      claim: WorkshopPackageClaim;
      packageSubject: string;
    }
  | null {
  if (!selectedClaimId) {
    return null;
  }

  for (const pkg of packages) {
    const claim = pkg.claims.find((candidate) => candidate.id === selectedClaimId);

    if (claim) {
      return {
        claim,
        packageSubject: pkg.subject,
      };
    }
  }

  return null;
}
